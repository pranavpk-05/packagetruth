import { describe, expect, it } from 'vitest';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScanner } from '@packagetruth/scanner';
import { createHash } from 'node:crypto';
import { fixtureName, fixtureScanner, makeRelease } from '../../fixtures/packages';

describe('release inspection with deterministic npm responses', () => {
  it.each(['invalid', 'malformed'] as const)('fails a %s registry signature even after a valid signature', async additionalSignature => {
    const result = await fixtureScanner({ additionalSignature }).scan(fixtureName, '1.0.0');
    expect(result.checks.registrySignature.status).toBe('failed');
    expect(result.checks.archive.status).toBe('verified');
  });

  it('reports expired signing keys as unsupported and broken trust material as incomplete', async () => {
    expect((await fixtureScanner({ keyExpires: '2000-01-01T00:00:00Z' }).scan(fixtureName, '1.0.0'))
      .checks.registrySignature.status).toBe('unsupported');
    for (const options of [{ keyExpires: 'not a date' }, { malformedKey: true }]) {
      expect((await fixtureScanner(options).scan(fixtureName, '1.0.0')).checks.registrySignature.status).toBe('not-tested');
    }
  });

  it('enforces compressed artifact limits even when a custom transport ignores them', async () => {
    const version = '1.0.0';
    const tarball = 'https://registry.npmjs.org/pt-fixture/-/pt-fixture-1.0.0.tgz';
    const scanner = createScanner(async url => url === tarball ? Buffer.alloc(16 * 1024 * 1024 + 1)
      : Buffer.from(JSON.stringify({ name: fixtureName, version, dist: { tarball } })));
    await expect(scanner.scan(fixtureName, version)).rejects.toMatchObject({ code: 'LIMIT' });
  });

  it('uses legacy SHA-1 only when the published integrity field is absent', async () => {
    const version = '1.0.0';
    const archive = makeRelease(version);
    const tarball = 'https://registry.npmjs.org/pt-fixture/-/pt-fixture-1.0.0.tgz';
    const shasum = createHash('sha1').update(archive).digest('hex');
    for (const value of [undefined, '', null, {}]) {
      const scanner = createScanner(async url => url === tarball ? archive
        : Buffer.from(JSON.stringify({ name: fixtureName, version, dist: { tarball, shasum, integrity: value } })));
      const report = await scanner.scan(fixtureName, version);
      expect(report.checks.integrity.status).toBe(value === undefined ? 'verified' : 'unsupported');
      expect(report.checks.archive.status).toBe(value === undefined ? 'verified' : 'not-tested');
    }
  });

  it.each([
    [{ path: 'package/conflict' }, { path: 'package/conflict/child.txt' }],
    [{ path: 'package/duplicate.txt' }, { path: 'package/duplicate.txt' }],
    [{ path: 'package/solid-link', type: '1' }],
    [{ path: 'package/sparse', type: 'S' }],
    [{ path: '\ufeffpackage/ambiguous.txt' }],
    [{ path: 'package/direction\u200f.txt' }],
  ] as const)('rejects ambiguous or special archive entries %j', async (...entries) => {
    const archive = makeRelease('1.0.0', [...entries]);
    const result = await fixtureScanner({ archive }).scan(fixtureName, '1.0.0');
    expect(result.checks.archive.status).toBe('failed');
    expect(result.files).toEqual([]);
  });

  it('rejects a partial trailing tar block', async () => {
    const archive = gzipSync(Buffer.concat([gunzipSync(makeRelease('1.0.0')), Buffer.alloc(1)]));
    const result = await fixtureScanner({ archive }).scan(fixtureName, '1.0.0');
    expect(result.checks.archive).toMatchObject({ status: 'failed', detail: expect.stringContaining('complete tar block') });
  });

  it('rejects an archive that exceeds the entry budget', async () => {
    const entries = Array.from({ length: 3000 }, (_, index) => ({ path: 'package/empty-' + index }));
    const result = await fixtureScanner({ archive: makeRelease('1.0.0', entries) }).scan(fixtureName, '1.0.0');
    expect(result.checks.archive).toMatchObject({ status: 'failed', detail: expect.stringContaining('entry limit') });
  });

  it('inspects a package with lifecycle and entry point code without running either', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'packagetruth-no-execution-'));
    try {
      const marker = JSON.stringify(join(folder, 'ran.txt'));
      const archive = makeRelease('1.0.0', [{ path: 'package/lifecycle.cjs',
        data: 'require("node:fs").writeFileSync(' + marker + ', "fixture");' }],
      { main: './lifecycle.cjs', scripts: { postinstall: 'node lifecycle.cjs' } });
      const result = await fixtureScanner({ archive }).scan(fixtureName, '1.0.0');
      expect(result.checks.manifest.status).toBe('verified');
      expect(result.files.some(item => item.path === 'lifecycle.cjs')).toBe(true);
      expect(result.findings.some(item => item.ruleId === 'PT-SCRIPT-001')).toBe(true);
      expect(await readdir(folder)).toEqual([]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  it('verifies exact bytes and cryptographic registry signature and records absent provenance', async () => {
    const result = await fixtureScanner().scan(fixtureName, '1.0.0');
    expect(result.checks.integrity.status).toBe('verified');
    expect(result.checks.registrySignature.status).toBe('verified');
    expect(result.checks.provenance.status).toBe('absent');
    expect(result.checks.archive.status).toBe('verified');
    expect(result.checks.manifest.status).toBe('verified');
    expect(result.files.map(file => file.path)).toEqual(['index.js', 'old.txt', 'package.json']);
    expect(result.findings).toEqual([]);
  });
  it('skips archive parsing for a checksum mismatch', async () => {
    const result = await fixtureScanner({ corrupt: true }).scan(fixtureName, '1.0.0');
    expect(result.checks.integrity.status).toBe('failed');
    expect(result.checks.archive.status).toBe('not-tested');
    expect(result.manifest).toBeNull();
    expect(result.findings[0]).toMatchObject({ severity: 'critical', ruleId: 'PT-INTEGRITY-001' });
  });
  it('reports a bad registry signature and an invalid attestation location separately', async () => {
    const result = await fixtureScanner({ badSignature: true, attestations: true }).scan(fixtureName, '1.0.0');
    expect(result.checks.registrySignature.status).toBe('failed');
    expect(result.checks.provenance).toMatchObject({ status: 'failed', detail: expect.stringContaining('attestation URL') });
    expect(result.checks.integrity.status).toBe('verified');
  });
  it('distinguishes an absent registry signature and unsupported published checksum', async () => {
    expect((await fixtureScanner({ signatures: false }).scan(fixtureName, '1.0.0')).checks.registrySignature.status).toBe('absent');
    const result = await fixtureScanner({ integrity: 'unknown-ZA==' }).scan(fixtureName, '1.0.0');
    expect(result.checks.integrity.status).toBe('unsupported');
    expect(result.checks.archive.status).toBe('not-tested');
  });
  it('reports file, executable, lifecycle, dependency and entry point changes', async () => {
    const result = await fixtureScanner().compare(fixtureName, '1.0.0', '1.1.0');
    expect(result.changes?.added.map(file => file.path)).toEqual(['postinstall.js', 'unexpected.sh']);
    expect(result.changes?.removed.map(file => file.path)).toEqual(['old.txt']);
    expect(result.changes?.modified[0].after.path).toBe('package.json');
    expect(result.findings.map(item => item.ruleId)).toEqual(expect.arrayContaining([
      'PT-SCRIPT-001', 'PT-EXEC-001', 'PT-DIFF-001', 'PT-DIFF-002', 'PT-DIFF-003', 'PT-DIFF-004',
    ]));
    expect(result.findings.filter(item => item.ruleId === 'PT-DIFF-003')).toHaveLength(3);
  });
  it.each(['2.0.0', '2.0.1', '2.0.2'])('rejects unsafe archive %s without losing integrity evidence', async version => {
    const result = await fixtureScanner().scan(fixtureName, version);
    expect(result.checks.integrity.status).toBe('verified');
    expect(result.checks.archive.status).toBe('failed');
    expect(result.findings[0].ruleId).toBe('PT-ARCHIVE-001');
    expect(result.files).toHaveLength(0);
  });
  it('does not report a file diff if an archive was rejected', async () => {
    const result = await fixtureScanner().compare(fixtureName, '1.0.0', '2.0.0');
    expect(result.changes).toBeNull();
  });
  it('enforces the expanded byte budget even after the archive end markers', async () => {
    const archive = gzipSync(Buffer.alloc(64 * 1024 * 1024 + 1));
    const result = await fixtureScanner({ archive }).scan(fixtureName, '1.0.0');
    expect(result.checks.archive).toMatchObject({ status: 'failed', detail: expect.stringContaining('decompressed archive') });
    expect(result.files).toHaveLength(0);
  });
  it('reports a misleading manifest identity separately from archive structure', async () => {
    const archive = makeRelease('1.0.0', [], { name: 'different-package' });
    const result = await fixtureScanner({ archive }).scan(fixtureName, '1.0.0');
    expect(result.checks.integrity.status).toBe('verified');
    expect(result.checks.archive.status).toBe('verified');
    expect(result.checks.manifest.status).toBe('failed');
    expect(result.findings[0].ruleId).toBe('PT-MANIFEST-001');
  });
  it('refuses destination and path variations before downloading the artifact', async () => {
    for (const tarball of ['https://example.invalid/pkg.tgz', 'https://registry.npmjs.org/a/../pkg.tgz',
      'https://registry.npmjs.org/pt-fixture/-/pt-fixture-1.0.0.tgz?x=1']) {
      await expect(fixtureScanner({ tarball }).scan(fixtureName, '1.0.0')).rejects.toThrow(/expected public npm registry/);
    }
  });
  it('finds static text and binary indicators in inert archive entries', async () => {
    const archive = makeRelease('1.0.0', [
      { path: 'package/sample.js', data: '// docs say child_process and eval(value)' },
      { path: 'package/sample.wasm', data: 'fixture contents' },
    ]);
    const result = await fixtureScanner({ archive }).scan(fixtureName, '1.0.0');
    expect(result.findings.map(item => item.ruleId)).toEqual(['PT-CODE-001', 'PT-CODE-002', 'PT-NATIVE-001']);
  });
});
