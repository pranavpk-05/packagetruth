import { createHash } from 'node:crypto';
import { dependencyGroups } from '@packagetruth/shared';
import type { Manifest } from '@packagetruth/shared';
import { record, ScanError } from './input.js';

const manifestFields = ['main', 'module', 'exports', 'imports', 'type', 'files', 'browser', 'engines',
  'os', 'cpu', 'libc', 'bundledDependencies', 'bundleDependencies', 'gypfile', 'publishConfig', 'repository', 'license'];

function stringMap(input: unknown): Record<string, string> {
  if (input !== undefined && input !== null && (typeof input !== 'object' || Array.isArray(input))) {
    throw new ScanError('ARCHIVE', 'A manifest mapping is not a JSON object.');
  }
  const pairs = Object.entries(record(input));
  if (pairs.length > 512 || pairs.some(([key, value]) =>
    key.length > 256 || typeof value !== 'string' || value.length > 4096)) {
    throw new ScanError('ARCHIVE', 'A manifest mapping contains invalid or oversized values.');
  }
  return Object.fromEntries(pairs) as Record<string, string>;
}

export function parseManifest(bytes: Buffer, name: string, version: string): Manifest {
  let input: Record<string, unknown>;
  try {
    input = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw new ScanError('ARCHIVE', 'package.json is not valid UTF-8 JSON.');
  }
  if (input.name !== name || input.version !== version) {
    throw new ScanError('ARCHIVE', 'The manifest identity differs from the requested package or version.');
  }
  const dependencies: Manifest['dependencies'] = {
    dependencies: {}, optionalDependencies: {}, peerDependencies: {}, devDependencies: {},
  };
  for (const group of dependencyGroups) dependencies[group] = stringMap(input[group]);
  const bin = stringMap(typeof input.bin === 'string' ? { [name.split('/').at(-1)!]: input.bin } : input.bin);
  const fields = Object.fromEntries(manifestFields.filter(field => Object.hasOwn(input, field)).map(field => {
    let encoded: string;
    try {
      encoded = JSON.stringify(input[field]);
    } catch {
      throw new ScanError('ARCHIVE', 'A manifest field exceeds the supported nesting depth.');
    }
    return [field, encoded.length > 1600 ? `sha256:${createHash('sha256').update(encoded).digest('hex')}` : encoded];
  }));
  return { name, version, scripts: stringMap(input.scripts), dependencies, bin, fields };
}
