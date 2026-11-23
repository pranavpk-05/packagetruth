import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { checkLock } from '../../packages/cli/src/lock';
import { fixtureName, fixtureScanner, releases } from '../../fixtures/packages';

let folder: string;
beforeEach(async () => { folder = await mkdtemp(join(tmpdir(), 'packagetruth-lock-')); });
afterEach(async () => { await rm(folder, { recursive: true, force: true }); });

async function lock(name: string, packages: Record<string, unknown>) {
  const path = join(folder, name);
  await writeFile(path, JSON.stringify({ lockfileVersion: 3, packages }));
  return path;
}

const version = '1.1.0';
const release = {
  version, resolved: `https://registry.npmjs.org/${fixtureName}/-/${fixtureName}-${version}.tgz`,
  integrity: `sha384-${createHash('sha384').update(releases[version]).digest('base64')}`,
};

it('checks added releases once, validates the lockfile digest independently and honors the policy', async () => {
  const old = await lock('base.json', { 'node_modules/removed': { version: '1.0.0' } });
  const current = await lock('head.json', {
    [`node_modules/${fixtureName}`]: release,
    [`node_modules/nested/node_modules/${fixtureName}`]: release,
  });
  const scan = vi.fn(fixtureScanner().scan);
  const result = await checkLock(old, current, 'medium', scan);
  expect(scan).toHaveBeenCalledOnce();
  expect(result.incomplete).toBe(false);
  expect(result.policyFailed).toBe(true);
  expect(result.removed).toEqual(['node_modules/removed']);
  expect(Object.keys(result.evidence)).toHaveLength(1);
  expect(result.results[0].lockIntegrity?.status).toBe('verified');
});

it('reports a distinct critical finding for a changed lockfile digest', async () => {
  const old = await lock('base.json', {});
  const current = await lock('head.json', {
    [`node_modules/${fixtureName}`]: { ...release, integrity: `sha384-${Buffer.alloc(48).toString('base64')}` },
  });
  const result = await checkLock(old, current, 'critical', fixtureScanner().scan);
  expect(result.incomplete).toBe(true);
  expect(result.policyFailed).toBe(true);
  expect(result.results[0].finding?.ruleId).toBe('PT-LOCK-001');
});

it('records nonregistry resolutions without scanning them', async () => {
  const old = await lock('base.json', {});
  const current = await lock('head.json', {
    [`node_modules/${fixtureName}`]: { ...release, resolved: 'https://example.invalid/fixture.tgz' },
  });
  const scan = vi.fn(fixtureScanner().scan);
  const result = await checkLock(old, current, 'critical', scan);
  expect(scan).not.toHaveBeenCalled();
  expect(result.incomplete).toBe(true);
  expect(result.policyFailed).toBe(false);
  expect(result.results[0].detail).toMatch(/outside supported/);
});

it.each(['link', 'inBundle'])('treats a changed %s resolution as incomplete even if registry fields are unchanged', async flag => {
  const key = 'node_modules/' + fixtureName;
  const old = await lock('base.json', { [key]: release });
  const current = await lock('head.json', { [key]: { ...release, [flag]: true } });
  const scan = vi.fn(fixtureScanner().scan);
  const result = await checkLock(old, current, 'critical', scan);
  expect(scan).not.toHaveBeenCalled();
  expect(result.results).toMatchObject([{ status: 'incomplete', detail: expect.stringContaining('Linked and bundled') }]);
});
