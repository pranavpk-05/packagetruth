import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { createScanner } from '@packagetruth/scanner';
import { checkLock } from '../../packages/cli/src/lock';

const location = new URL('../../fixtures/dependency-policy/', import.meta.url);
const lock = (scenario: string) => fileURLToPath(new URL(scenario + '.lock.json', location));
const tarball = 'https://registry.npmjs.org/semver/-/semver-7.7.2.tgz';
const archive = readFileSync(new URL('../../fixtures/provenance/semver-7.7.2.tgz', import.meta.url));
const scanner = createScanner(async url => {
  if (url === tarball) return archive;
  if (url !== 'https://registry.npmjs.org/semver/7.7.2') throw new Error('Unexpected fixture request.');
  const integrity = 'sha512-' + createHash('sha512').update(archive).digest('base64');
  return Buffer.from(JSON.stringify({ name: 'semver', version: '7.7.2', dist: { tarball, integrity } }));
});

it('allows the published fixture digest under the critical policy', async () => {
  const report = await checkLock(lock('base'), lock('allow'), 'critical', scanner.scan);
  expect(report).toMatchObject({ policyFailed: false, incomplete: false,
    results: [{ package: 'semver', status: 'scanned', lockIntegrity: { status: 'verified' } }] });
});

it('blocks the synthetic mismatch and keeps the artifact and lock checks distinct', async () => {
  const report = await checkLock(lock('base'), lock('block'), 'critical', scanner.scan);
  expect(report).toMatchObject({ policyFailed: true, incomplete: true,
    results: [{ package: 'semver', status: 'incomplete', lockIntegrity: { status: 'failed' },
      finding: { ruleId: 'PT-LOCK-001', severity: 'critical' } }],
    evidence: { 'semver@7.7.2': { checks: { integrity: { status: 'verified' } } } } });
});
