import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScanner, ScanError } from '@packagetruth/scanner';
import { verifyBundle } from '../../packages/scanner/src/provenance-bundle';
import { verifyGithubIdentity } from '../../packages/scanner/src/provenance-identity';
import { record } from '../../packages/scanner/src/input';

const registry = 'https://registry.npmjs.org';
const version = '7.7.2';
const predicate = 'https://slsa.dev/provenance/v1';
const fixtureRoot = new URL('../../fixtures/provenance/', import.meta.url);
const tarball = readFileSync(new URL('semver-7.7.2.tgz', fixtureRoot));
const response = readFileSync(new URL('semver-7.7.2.attestations.json', fixtureRoot));
const sourceCommit = '281055e7716ef0415a8826972471331989ede58c';
const checksum = (bytes: Buffer) => 'sha512-' + createHash('sha512').update(bytes).digest('base64');

type FixtureBundle = Record<string, unknown> & {
  dsseEnvelope: { payload: string; signatures: { sig: string }[] };
  verificationMaterial: {
    certificate: { rawBytes: string };
    tlogEntries: { inclusionProof?: { hashes: string[] }; canonicalizedBody: string;
      kindVersion: { kind: string; version: string } }[];
  };
};

function mutate(change: (bundle: FixtureBundle) => void): Buffer {
  const envelope: { attestations: { predicateType: string; bundle: FixtureBundle }[] } = JSON.parse(response.toString('utf8'));
  const provenance = envelope.attestations.find(item => item.predicateType === predicate)!;
  change(provenance.bundle);
  return Buffer.from(JSON.stringify(envelope));
}

function fixture(options: {
  name?: string; actual?: Buffer; integrity?: string; response?: Buffer; advertisedUrl?: string;
  withoutAttestations?: boolean; publishOnly?: boolean; fetchError?: ScanError;
} = {}) {
  const name = options.name ?? 'semver';
  const archive = options.actual ?? tarball;
  const attestation = registry + '/-/npm/v1/attestations/' + name.replace('/', '%2f') + '@' + version;
  const artifact = registry + '/' + name + '/-/' + name.split('/').at(-1) + '-' + version + '.tgz';
  const transport = vi.fn(async (url: string) => {
    if (url === attestation) {
      if (options.fetchError) throw options.fetchError;
      return options.response ?? response;
    }
    if (url === artifact) return archive;
    if (url === registry + '/' + encodeURIComponent(name) + '/' + version) {
      return Buffer.from(JSON.stringify({
        name, version, repository: { url: 'https://github.com/wrong/metadata-only' },
        dist: { tarball: artifact, integrity: options.integrity ?? checksum(archive),
          attestations: options.withoutAttestations ? undefined : {
            url: options.advertisedUrl ?? attestation,
            provenance: options.publishOnly ? undefined : { predicateType: predicate },
          } },
      }));
    }
    throw new Error('Unexpected request: ' + url);
  });
  return { inspect: () => createScanner(transport).scan(name, version), transport, attestation };
}

describe('npm provenance against a captured signed release', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-11-23T00:00:00Z')));
  afterEach(() => vi.useRealTimers());

  it('verifies the signed bundle, downloaded tarball and calling and signing workflow identities offline', async () => {
    const { inspect, transport, attestation } = fixture();
    const result = await inspect();
    expect(result.checks.archive.status).toBe('verified');
    expect(result.checks.provenance).toMatchObject({
      status: 'verified',
      evidence: {
        subject: 'pkg:npm/semver@7.7.2', sha512: result.artifact.digests.sha512,
        repository: 'https://github.com/npm/node-semver', repositoryId: '1357199',
        commit: sourceCommit, ref: 'refs/heads/main',
        issuer: 'https://token.actions.githubusercontent.com',
        buildWorkflow: 'https://github.com/npm/node-semver/.github/workflows/release.yml@refs/heads/main',
        signingWorkflow: 'https://github.com/npm/node-semver/.github/workflows/release-integration.yml@refs/heads/main',
      },
    });
    expect(transport).toHaveBeenCalledWith(attestation, 512 * 1024);
    expect(result.findings.some(item => item.ruleId === 'PT-PROVENANCE-001')).toBe(false);
  });

  it('rejects replay of a genuine bundle under a different exact package identifier', async () => {
    const result = await fixture({ name: 'other-package' }).inspect();
    expect(result.checks.provenance).toMatchObject({ status: 'failed', detail: expect.stringContaining('exact npm package') });
    expect(result.checks.provenance.evidence).toBeUndefined();
  });

  it('rejects a genuine bundle when the downloaded tarball matches registry metadata but differs from the attested digest', async () => {
    const actual = Buffer.concat([tarball, Buffer.from([0])]);
    const result = await fixture({ actual }).inspect();
    expect(result.checks.integrity.status).toBe('verified');
    expect(result.checks.provenance).toMatchObject({ status: 'failed', detail: expect.stringContaining('subject SHA-512') });
    expect(result.findings).toContainEqual(expect.objectContaining({ ruleId: 'PT-PROVENANCE-001', severity: 'high' }));
  });

  it('preserves the integrity gate and skips even advertised provenance after a registry checksum mismatch', async () => {
    const { transport, attestation, inspect } = fixture({ actual: Buffer.from('different bytes'), integrity: checksum(tarball) });
    const result = await inspect();
    expect(result.checks.integrity.status).toBe('failed');
    expect(result.checks.archive.status).toBe('not-tested');
    expect(result.checks.provenance.status).toBe('not-tested');
    expect(transport).not.toHaveBeenCalledWith(attestation, expect.anything());
  });

  it('rejects a changed signature in an otherwise genuine bundle', async () => {
    const body = mutate(bundle => {
      const bytes = Buffer.from(bundle.dsseEnvelope.signatures[0].sig, 'base64');
      bytes[bytes.length - 1] ^= 1;
      bundle.dsseEnvelope.signatures[0].sig = bytes.toString('base64');
    });
    expect((await fixture({ response: body }).inspect()).checks.provenance.status).toBe('failed');
  });

  it('rejects a changed but structurally valid Merkle proof', async () => {
    const body = mutate(bundle => {
      bundle.verificationMaterial.tlogEntries[0].inclusionProof!.hashes[0] = Buffer.alloc(32).toString('base64');
    });
    expect((await fixture({ response: body }).inspect()).checks.provenance.status).toBe('failed');
  });

  it('rejects a bundle with no inclusion proof even if its signed entry timestamp is present', async () => {
    const body = mutate(bundle => { delete bundle.verificationMaterial.tlogEntries[0].inclusionProof; });
    const result = await fixture({ response: body }).inspect();
    expect(result.checks.provenance).toMatchObject({ status: 'failed', detail: expect.stringContaining('inclusion proof') });
  });

  it('checks that the authenticated log record carries the exact selected certificate', async () => {
    const body = mutate(bundle => {
      const bytes = Buffer.from(bundle.verificationMaterial.certificate.rawBytes, 'base64');
      bytes[bytes.length - 1] ^= 1;
      bundle.verificationMaterial.certificate.rawBytes = bytes.toString('base64');
    });
    const result = await fixture({ response: body }).inspect();
    expect(result.checks.provenance).toMatchObject({ status: 'failed', detail: expect.stringContaining('different certificate') });
  });

  it('classifies malformed response JSON and malformed signed-envelope fields as invalid', async () => {
    const envelope = mutate(bundle => { bundle.dsseEnvelope.payload = '%%%'; });
    for (const body of [Buffer.from('{"attestations":'), Buffer.from('{"attestations":{}}'), envelope]) {
      expect((await fixture({ response: body }).inspect()).checks.provenance.status).toBe('failed');
    }
  });

  it.each(['https://example.invalid/fake', registry + '/-/npm/v1/attestations/semver@7.7.1',
    registry + '/-/npm/v1/attestations/semver@7.7.2?other=yes'])('refuses a noncanonical advertised URL %s', async url => {
    const { inspect, transport } = fixture({ advertisedUrl: url });
    expect((await inspect()).checks.provenance.status).toBe('failed');
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('distinguishes missing provenance, publish-only attestations and an unsupported predicate', async () => {
    expect((await fixture({ withoutAttestations: true }).inspect()).checks.provenance.status).toBe('absent');
    const raw: { attestations: { predicateType: string }[] } = JSON.parse(response.toString('utf8'));
    raw.attestations = raw.attestations.filter(item => item.predicateType !== predicate);
    expect(raw.attestations).toHaveLength(1);
    const publishOnly = Buffer.from(JSON.stringify(raw));
    expect((await fixture({ response: publishOnly, publishOnly: true }).inspect()).checks.provenance.status).toBe('absent');
    expect((await fixture({ response: publishOnly }).inspect()).checks.provenance.status).toBe('not-tested');
    const unsupported = Buffer.from(JSON.stringify({ attestations: [{ predicateType: 'https://slsa.dev/provenance/v0.2' }] }));
    expect((await fixture({ response: unsupported }).inspect()).checks.provenance.status).toBe('unsupported');
  });

  it('distinguishes an unsupported Sigstore bundle format', async () => {
    const body = mutate(bundle => { bundle.mediaType = 'application/vnd.dev.sigstore.bundle.v99+json'; });
    expect((await fixture({ response: body }).inspect()).checks.provenance.status).toBe('unsupported');
  });

  it('reports an unsupported log profile before applying legacy proof-field validation', async () => {
    const body = mutate(bundle => {
      const log = bundle.verificationMaterial.tlogEntries[0];
      log.kindVersion.version = '0.0.2';
      delete log.inclusionProof;
    });
    expect((await fixture({ response: body }).inspect()).checks.provenance.status).toBe('unsupported');
  });

  it('reports interrupted and oversized downloads as incomplete while preserving archive coverage', async () => {
    for (const options of [
      { fetchError: new ScanError('REGISTRY', 'timed out') },
      { response: Buffer.alloc(512 * 1024 + 1) },
    ]) {
      const result = await fixture(options).inspect();
      expect(result.checks.provenance.status).toBe('not-tested');
      expect(result.checks.archive.status).toBe('verified');
    }
  });

  it('reports the trust snapshot review deadline as incomplete', async () => {
    vi.setSystemTime(new Date('2027-02-21T00:00:00Z'));
    expect((await fixture().inspect()).checks.provenance).toMatchObject({
      status: 'not-tested', detail: expect.stringContaining('past its review deadline'),
    });
  });

  it('rejects source, commit, caller workflow or issuer claims that disagree with a verified certificate', () => {
    const entries = JSON.parse(response.toString('utf8')).attestations as { predicateType: string; bundle: FixtureBundle }[];
    const { statement, signer } = verifyBundle(entries.find(item => item.predicateType === predicate)!.bundle);
    const build = record(record(statement.predicate).buildDefinition);
    const externalParameters = record(build.externalParameters);
    const workflow = record(externalParameters.workflow);
    const issuer = signer.identity!.extensions!;
    const againstWorkflow = (fields: object) => ({ ...build, externalParameters: { workflow: { ...workflow, ...fields } } });
    expect(verifyGithubIdentity(againstWorkflow({ repository: 'https://github.com/other/repo' }), signer.identity))
      .toMatchObject({ status: 'failed', detail: expect.stringContaining('source identity') });
    expect(verifyGithubIdentity(againstWorkflow({ path: '.github/workflows/other.yml' }), signer.identity))
      .toMatchObject({ status: 'failed', detail: expect.stringContaining('workflow') });
    expect(verifyGithubIdentity({ ...build, resolvedDependencies: [{ uri: 'git+https://github.com/npm/node-semver@refs/heads/main',
      digest: { gitCommit: '0'.repeat(40) } }] }, signer.identity)).toMatchObject({ status: 'failed' });
    expect(verifyGithubIdentity(build, { ...signer.identity, extensions: { ...issuer, issuer: 'https://evil.invalid' } }))
      .toMatchObject({ status: 'failed', detail: expect.stringContaining('issuer') });
    const issuerOids = signer.identity!.oids?.filter(oid => oid.oid?.id.join('.') === '1.3.6.1.4.1.57264.1.8');
    expect(verifyGithubIdentity(build, { ...signer.identity, oids: issuerOids }))
      .toMatchObject({ status: 'not-tested' });
  });
});
