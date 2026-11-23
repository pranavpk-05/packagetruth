import type { ArtifactDigests, ProvenanceCheck } from '@packagetruth/shared';
import { record, ScanError } from './input.js';
import { parseAttestationJson, ProvenanceError, trustRootId, verifyBundle } from './provenance-bundle.js';
import { githubBuildType, verifyGithubIdentity } from './provenance-identity.js';
import { attestationUrl, limits } from './registry.js';
import type { Transport } from './registry.js';

const slsaV1 = 'https://slsa.dev/provenance/v1';
const statementV1 = 'https://in-toto.io/Statement/v1';

export function pendingProvenance(descriptor: unknown): ProvenanceCheck {
  return descriptor === undefined || descriptor === null
    ? { status: 'absent', detail: 'The npm release metadata advertises no attestations.' }
    : { status: 'not-tested', detail: 'Provenance verification requires a matching published artifact checksum.' };
}

export async function verifyProvenance(
  name: string, version: string, digests: ArtifactDigests, descriptor: unknown, transport: Transport,
): Promise<ProvenanceCheck> {
  if (descriptor === undefined || descriptor === null) return pendingProvenance(descriptor);
  const metadata = record(descriptor);
  const url = attestationUrl(metadata.url, name, version);
  if (!url) return { status: 'failed', detail: 'The advertised attestation URL does not identify the exact public npm release.' };
  let bytes: Buffer;
  try {
    bytes = await transport(url, limits.attestations);
    if (bytes.length > limits.attestations) throw new ScanError('LIMIT', 'Attestation response too large.');
  } catch (error) {
    return { status: 'not-tested', detail: error instanceof ScanError && error.code === 'LIMIT'
      ? 'The npm attestation response exceeded its download limit.'
      : 'The advertised attestations could not be retrieved from the npm registry.' };
  }

  try {
    const entries = record(parseAttestationJson(bytes)).attestations;
    if (!Array.isArray(entries) || entries.length > 8) {
      throw new ProvenanceError('failed', 'The npm attestation response has an invalid or oversized attestation list.');
    }
    const candidates = entries.map(record);
    if (candidates.some(entry => typeof entry.predicateType !== 'string')) {
      throw new ProvenanceError('failed', 'The npm attestation response has a malformed predicate type.');
    }
    const supported = candidates.filter(entry => entry.predicateType === slsaV1);
    if (!supported.length) {
      const advertised = record(metadata.provenance).predicateType;
      if (candidates.some(entry => String(entry.predicateType).startsWith('https://slsa.dev/provenance/') ||
          entry.predicateType === advertised)) {
        return { status: 'unsupported', detail: 'The registry returned a provenance predicate outside the supported SLSA v1 profile.' };
      }
      return metadata.provenance !== undefined && metadata.provenance !== null
        ? { status: 'not-tested', detail: 'The registry response omits the advertised provenance attestation.' }
        : { status: 'absent', detail: 'The npm attestation response contains no SLSA provenance statement.' };
    }
    if (supported.length !== 1) {
      throw new ProvenanceError('failed', 'The npm attestation response contains ambiguous SLSA v1 provenance statements.');
    }
    const { statement, signer } = verifyBundle(record(supported[0].bundle));
    if (statement._type !== statementV1 || statement.predicateType !== slsaV1) {
      throw new ProvenanceError('failed', 'The authenticated in-toto statement does not match the advertised SLSA v1 type.');
    }
    const subjects = statement.subject;
    const expectedSubject = 'pkg:npm/' + name.replace(/^@/, '%40') + '@' + version;
    if (!Array.isArray(subjects) || subjects.length !== 1 || record(subjects[0]).name !== expectedSubject) {
      throw new ProvenanceError('failed', 'The authenticated subject does not uniquely match this exact npm package and version.');
    }
    if (record(record(subjects[0]).digest).sha512 !== digests.sha512) {
      throw new ProvenanceError('failed', 'The authenticated subject SHA-512 does not match the downloaded npm tarball.');
    }
    const build = record(record(statement.predicate).buildDefinition);
    if (typeof build.buildType !== 'string') {
      throw new ProvenanceError('failed', 'The authenticated SLSA v1 statement is missing the build type.');
    }
    if (build.buildType !== githubBuildType) {
      return { status: 'unsupported', detail: 'The authenticated build type is outside the supported GitHub Actions profile.' };
    }
    const result = verifyGithubIdentity(build, signer.identity);
    if (!('identity' in result)) return result;
    return { status: 'verified',
      detail: 'Verified the Sigstore bundle, tarball SHA-512 and GitHub Actions certificate identity.',
      evidence: { ...result.identity, subject: expectedSubject, sha512: digests.sha512, predicateType: slsaV1,
        trustRoot: trustRootId } };
  } catch (error) {
    if (error instanceof ProvenanceError) return { status: error.status, detail: error.message };
    return { status: 'failed', detail: 'Sigstore could not verify the bundle signature, certificate, transparency evidence or payload.' };
  }
}
