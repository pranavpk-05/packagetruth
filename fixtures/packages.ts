import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createScanner } from '@packagetruth/scanner';

export const fixtureName = 'pt-fixture';
export interface FixtureEntry { path: string; data?: Buffer | string; mode?: number; type?: '0' | '2' | '5' }

export function fixtureTar(entries: FixtureEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const { path, data = '', mode = 0o644, type = '0' } of entries) {
    const body = Buffer.from(data);
    const header = Buffer.alloc(512);
    header.write(path, 0, 100);
    header.write(mode.toString(8).padStart(7, '0'), 100);
    header.write(body.length.toString(8).padStart(11, '0'), 124);
    header.write('00000000000', 136);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write('ustar\x00' + '00', 257);
    const checksum = header.reduce((total, byte) => total + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\x00 ', 148);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

export function makeRelease(version: string, extra: FixtureEntry[] = [], fields: object = {}) {
  return fixtureTar([{
    path: 'package/package.json', data: JSON.stringify({ name: fixtureName, version, main: 'index.js', ...fields }),
  }, { path: 'package/index.js', data: 'export default "fixture";\n' }, ...extra]);
}

export const releases = {
  '1.0.0': makeRelease('1.0.0', [{ path: 'package/old.txt', data: 'old file' }], {
    dependencies: { removed: '1.0.0', updated: '1.0.0' },
  }),
  '1.1.0': makeRelease('1.1.0', [
    { path: 'package/postinstall.js', data: 'console.log("harmless fixture");\n' },
    { path: 'package/unexpected.sh', mode: 0o755, data: '#!/bin/sh\nprintf "harmless fixture"\n' },
  ], { scripts: { postinstall: 'node postinstall.js' }, dependencies: { added: '1.0.0', updated: '2.0.0' }, main: 'postinstall.js' }),
  '2.0.0': makeRelease('2.0.0', [{ path: 'package/../outside.txt', data: 'fixture' }]),
  '2.0.1': makeRelease('2.0.1', [{ path: 'package/large.txt', data: Buffer.alloc(16 * 1024 * 1024 + 1) }]),
  '2.0.2': makeRelease('2.0.2', [{ path: 'package/link', type: '2' }]),
};

const keyBytes = Buffer.alloc(32);
keyBytes[31] = 1;
const fixtureKey = createPrivateKey({ format: 'der', type: 'sec1',
  key: Buffer.concat([Buffer.from('30310201010420', 'hex'), keyBytes, Buffer.from('a00a06082a8648ce3d030107', 'hex')]) });

export function fixtureScanner(options: { corrupt?: boolean; badSignature?: boolean; attestations?: boolean;
  tarball?: string; integrity?: string; archive?: Buffer; signatures?: boolean } = {}) {
  return createScanner(async (url, limit) => {
    const version = url.split('/').at(-1)?.replace(/^pt-fixture-/, '').replace(/\.tgz$/, '');
    const archive = options.archive ?? releases[version as keyof typeof releases];
    if (url.endsWith('/keys')) return Buffer.from(JSON.stringify({ keys: [{
      keyid: 'test-key', expires: null, keytype: 'ecdsa-sha2-nistp256', scheme: 'ecdsa-sha2-nistp256',
      key: createPublicKey(fixtureKey).export({ format: 'der', type: 'spki' }).toString('base64'),
    }] }));
    if (!archive || !version) throw new Error('Fixture not found');
    if (url.endsWith('.tgz')) {
      if (archive.length > limit) throw new Error('Fixture overflow');
      return options.corrupt ? Buffer.concat([archive, Buffer.from([1])]) : archive;
    }
    const integrity = options.integrity ?? `sha512-${createHash('sha512').update(archive).digest('base64')}`;
    const payload = options.badSignature ? 'different release tuple' : `${fixtureName}@${version}:${integrity}`;
    return Buffer.from(JSON.stringify({ name: fixtureName, version, dist: {
      integrity, tarball: options.tarball ?? `https://registry.npmjs.org/${fixtureName}/-/${fixtureName}-${version}.tgz`,
      signatures: options.signatures === false ? undefined : [{ keyid: 'test-key', sig: sign('sha256', Buffer.from(payload), fixtureKey).toString('base64') }],
      attestations: options.attestations ? { url: 'https://example.invalid/attestations' } : undefined,
    } }));
  });
}
