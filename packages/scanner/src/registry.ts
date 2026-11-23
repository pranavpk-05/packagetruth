import { get } from 'node:https';
import { ScanError } from './input.js';

const registry = 'https://registry.npmjs.org';
export const registryKeysUrl = `${registry}/-/npm/v1/keys`;
export const limits = {
  metadata: 1_048_576, attestations: 512 * 1024, compressed: 16 * 1_048_576, expanded: 64 * 1_048_576,
  file: 16 * 1_048_576, files: 3000, manifest: 256 * 1024, text: 128 * 1024,
  requestMs: 15_000,
} as const;

export type Transport = (url: string, maxBytes: number) => Promise<Buffer>;

export function metadataUrl(name: string, version: string): string {
  return `${registry}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
}

export function attestationUrl(raw: unknown, name: string, version: string): string | undefined {
  const base = registry + '/-/npm/v1/attestations/';
  const release = name.replace('/', '%2f') + '@' + version;
  if (typeof raw !== 'string' || ![
    release, release.replace('%2f', '%2F'), release.replaceAll('+', '%2B'),
    release.replace('%2f', '%2F').replaceAll('+', '%2B'),
  ].some(path => raw === base + path)) return undefined;
  return base + release;
}

export function artifactUrl(raw: unknown, name: string, version: string): string {
  const unscoped = name.split('/').at(-1);
  const path = `/${name}/-/${unscoped}-${version}.tgz`;
  if (typeof raw !== 'string' || (raw !== registry + path && raw !== registry + path.replaceAll('+', '%2B'))) {
    throw new ScanError('REGISTRY', 'The tarball URL does not match the expected public npm registry artifact.');
  }
  return raw;
}

export const download: Transport = (url, maxBytes) => {
  const destination = new URL(url);
  if (destination.origin !== registry || destination.username || destination.password || destination.search || destination.hash) {
    return Promise.reject(new ScanError('REGISTRY', 'Only direct public npm registry requests are allowed.'));
  }
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(limits.requestMs);
    const req = get(destination, {
      agent: false,
      signal,
      headers: { 'accept-encoding': 'identity', 'user-agent': 'PackageTruth/0.1' },
    }, response => {
      if (response.statusCode !== 200 || (response.headers['content-encoding'] ?? 'identity') !== 'identity') {
        response.destroy();
        reject(new ScanError(response.statusCode === 404 ? 'NOT_FOUND' : 'REGISTRY',
          `npm registry returned HTTP ${response.statusCode ?? 'unknown'} or an unsupported encoding.`));
        return;
      }
      if (Number(response.headers['content-length']) > maxBytes) {
        response.destroy();
        reject(new ScanError('LIMIT', 'The registry response exceeds the download limit.'));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          reject(new ScanError('LIMIT', 'The registry response exceeds the download limit.'));
          response.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', () => reject(new ScanError('REGISTRY', 'The registry response was interrupted.')));
      response.on('end', () => resolve(Buffer.concat(chunks, total)));
    });
    req.on('error', () => reject(new ScanError('REGISTRY',
      signal.aborted ? 'The npm registry request timed out.' : 'Could not connect to the npm registry.')));
  });
};

export async function readJson(transport: Transport, url: string): Promise<unknown> {
  const bytes = await transport(url, limits.metadata);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new ScanError('REGISTRY', 'The npm registry returned invalid JSON.');
  }
}
