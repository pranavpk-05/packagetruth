import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import type { ArtifactFile, Finding } from '@packagetruth/shared';
import { ScanError } from './input.js';
import { limits } from './registry.js';
import { finding } from './rules.js';

const block = 512;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function invalid(detail: string): never {
  throw new ScanError('ARCHIVE', detail);
}
function octal(bytes: Buffer): number {
  const value = bytes.toString('latin1').replace(/^[ ]+|[\0 ]+$/g, '');
  if (!/^[0-7]+$/.test(value)) invalid('The archive contains an invalid numeric field.');
  return Number.parseInt(value, 8);
}
function string(bytes: Buffer): string {
  const nul = bytes.indexOf(0);
  if (nul !== -1 && bytes.subarray(nul).some(byte => byte !== 0)) invalid('Invalid archive string padding.');
  return utf8.decode(nul === -1 ? bytes : bytes.subarray(0, nul));
}

function entryPath(header: Buffer, directory: boolean, roots: Set<string>): string {
  const name = string(header.subarray(0, 100));
  // Older node-tar headers use the last 24 prefix bytes for atime and ctime.
  const legacyTimes = header[475] === 0 && /^[0-7]{11}\0[0-7]{11}\0$/.test(header.subarray(476, 500).toString('latin1'));
  const prefix = string(header.subarray(345, legacyTimes ? 475 : 500));
  const joined = prefix ? `${prefix}/${name}` : name;
  const full = directory && joined.endsWith('/') ? joined.slice(0, -1) : joined;
  const parts = full.split('/');
  if (!roots.has(parts[0]) || (parts.length === 1 && !directory) || full.length > 512 ||
      /[\\:\x00-\x1f\x7f-\x9f\u061c\u200e-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/u.test(full) ||
      parts.some(part => !part || part === '.' || part === '..')) {
    invalid('An archive path is outside the accepted package directory or uses unsafe characters.');
  }
  for (const root of roots) if (root !== parts[0]) roots.delete(root);
  return parts.slice(1).join('/');
}

function indicators(path: string, sample: Buffer): Finding[] {
  const result: Finding[] = [];
  if (sample.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      sample.subarray(0, 2).toString() === 'MZ' ||
      ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'cafebabf'].includes(sample.subarray(0, 4).toString('hex')) ||
      /\.(?:exe|dll|so|dylib|node|wasm)$/i.test(path)) {
    result.push(finding('PT-NATIVE-001', path, 'Executable header or native/WebAssembly file extension'));
  }
  if (!/\.(?:[cm]?js|tsx?|sh|ps1|bat|cmd)$/i.test(path) && sample.subarray(0, 2).toString() !== '#!') return result;
  const source = sample.toString('utf8');
  const patterns = [
    ['PT-CODE-001', /\b(?:node:)?child_process\b|\b(?:execSync|spawnSync)\s*\(/],
    ['PT-CODE-002', /\b(?:eval|new\s+Function)\s*\(/],
    ['PT-CODE-003', /\b(?:curl|wget)\b[^\r\n|]{0,256}\|\s*(?:ba)?sh\b/],
  ] as const;
  for (const [rule, pattern] of patterns) {
    const match = pattern.exec(source);
    if (match) result.push(finding(rule, path, `Line ${source.slice(0, match.index).split('\n').length}: ${match[0]}`));
  }
  return result;
}

export async function inspectArchive(artifact: Buffer, packageName: string): Promise<{
  manifestBytes: Buffer; files: ArtifactFile[]; findings: Finding[];
}> {
  const gunzip = createGunzip();
  const source = Readable.from([artifact]);
  source.pipe(gunzip);
  const iterator = gunzip[Symbol.asyncIterator]();
  let chunk = Buffer.alloc(0);
  let expanded = 0;
  let entries = 0;
  let manifestBytes: Buffer | undefined;
  const files: ArtifactFile[] = [];
  const findings: Finding[] = [];
  const paths = new Map<string, boolean>();
  const roots = new Set(['package', packageName.split('/').at(-1)!]);

  async function nextChunk(): Promise<boolean> {
    const next = await iterator.next();
    if (next.done) return false;
    chunk = Buffer.from(next.value);
    expanded += chunk.length;
    if (expanded > limits.expanded) throw new ScanError('LIMIT', 'The decompressed archive exceeds the byte limit.');
    return true;
  }

  async function read(length: number, consume: (bytes: Buffer) => void): Promise<void> {
    while (length > 0) {
      if (!chunk.length && !await nextChunk()) invalid('The archive ended before the expected boundary.');
      const count = Math.min(length, chunk.length);
      consume(chunk.subarray(0, count));
      chunk = chunk.subarray(count);
      length -= count;
    }
  }

  function requireZeros(bytes: Buffer): void {
    if (bytes.some(byte => byte !== 0)) invalid('The archive contains unexpected nonzero padding or trailing data.');
  }

  try {
    while (true) {
      const header = Buffer.alloc(block);
      let offset = 0;
      await read(block, bytes => { offset += bytes.copy(header, offset); });
      if (header.every(byte => byte === 0)) {
        await read(block, requireZeros);
        requireZeros(chunk);
        while (await nextChunk()) requireZeros(chunk);
        if (expanded % block !== 0) invalid('The archive ends outside a complete tar block.');
        break;
      }
      if (++entries > limits.files) throw new ScanError('LIMIT', 'The archive exceeds the entry limit.');
      let sum = 0;
      for (let i = 0; i < block; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
      if (sum !== octal(header.subarray(148, 156))) invalid('An archive header checksum failed.');
      const magic = header.subarray(257, 265).toString('latin1');
      if (magic !== 'ustar\0' + '00' && magic !== 'ustar  \0') invalid('The tar header format is unsupported.');
      const type = header[156];
      const directory = type === 53;
      if (type !== 0 && type !== 48 && !directory) invalid('Links, special files and extended tar headers are unsupported.');
      const path = entryPath(header, directory, roots);
      if (paths.has(path)) invalid('The archive contains duplicate paths.');
      paths.set(path, directory);
      const size = octal(header.subarray(124, 136));
      const mode = octal(header.subarray(100, 108));
      if (directory && size !== 0) invalid('An archive directory unexpectedly contains data.');
      if (size > limits.file || (path === 'package.json' && size > limits.manifest)) {
        throw new ScanError('LIMIT', 'An archive entry exceeds the permitted file size.');
      }
      if (directory) continue;
      const hash = createHash('sha256');
      const sample = Buffer.alloc(Math.min(size, path === 'package.json' ? limits.manifest : limits.text));
      let sampleLength = 0;
      await read(size, bytes => {
        hash.update(bytes);
        sampleLength += bytes.copy(sample, sampleLength, 0, Math.min(bytes.length, sample.length - sampleLength));
      });
      await read((block - size % block) % block, requireZeros);
      if (path === 'package.json') manifestBytes = sample;
      const executable = Boolean(mode & 0o111) || sample.subarray(0, 2).toString() === '#!';
      files.push({ path, size, sha256: hash.digest('hex'), executable });
      findings.push(...indicators(path, sample));
    }
    for (const path of paths.keys()) {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) {
        if (paths.get(parts.slice(0, i).join('/')) === false) invalid('An archive file is also used as a directory.');
      }
    }
    if (!manifestBytes) invalid('The archive is missing package/package.json.');
    files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    return { files, manifestBytes, findings };
  } catch (error) {
    if (error instanceof ScanError) throw error;
    throw new ScanError('ARCHIVE', 'The gzip stream or archive path encoding is invalid.');
  } finally {
    source.destroy();
    gunzip.destroy();
  }
}
