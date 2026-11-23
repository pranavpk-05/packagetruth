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

export const download: Transport = async (url, maxBytes) => {
  if (!url.startsWith(registry + '/') || /[\\\s\x00-\x1f\x7f]/.test(url) ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > limits.compressed) {
    return Promise.reject(new ScanError('REGISTRY', 'Only direct public npm registry requests are allowed.'));
  }
  const destination = new URL(url);
  if (destination.origin !== registry || destination.search || destination.hash || /[?#]/.test(url)) {
    throw new ScanError('REGISTRY', 'Only direct public npm registry requests are allowed.');
  }
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.timeout(limits.requestMs);
    const interrupted = () => reject(new ScanError('REGISTRY',
      signal.aborted ? 'The npm registry request timed out.' : 'The registry response was interrupted.'));
    const req = get(destination, {
      agent: false,
      signal,
      headers: { 'accept-encoding': 'identity', 'user-agent': 'PackageTruth/0.1' },
    }, response => {
      response.on('error', interrupted);
      if (response.statusCode !== 200 || (response.headers['content-encoding'] ?? 'identity') !== 'identity') {
        response.destroy();
        reject(new ScanError(response.statusCode === 404 ? 'NOT_FOUND' : 'REGISTRY',
          `npm registry returned HTTP ${response.statusCode ?? 'unknown'} or an unsupported encoding.`));
        return;
      }
      const length = response.headers['content-length'];
      const expected = length === undefined ? undefined : Number(length);
      if (expected !== undefined && (!/^\d+$/.test(length!) || !Number.isSafeInteger(expected))) {
        reject(new ScanError('REGISTRY', 'The registry supplied an invalid Content-Length.'));
        response.destroy();
        return;
      }
      if (expected !== undefined && expected > maxBytes) {
        response.destroy();
        reject(new ScanError('LIMIT', 'The registry response exceeds the download limit.'));
        return;
      }
      let bytes = Buffer.alloc(0);
      let total = 0;
      let ended = false;
      response.on('data', (chunk: Buffer) => {
        const size = total + chunk.length;
        if (size > maxBytes) {
          reject(new ScanError('LIMIT', 'The registry response exceeds the download limit.'));
          response.destroy();
          return;
        }
        if (expected !== undefined && size > expected) {
          interrupted();
          response.destroy();
          return;
        }
        if (size > bytes.length) {
          const grown = Buffer.allocUnsafe(Math.min(maxBytes, Math.max(4096, size, bytes.length * 2)));
          bytes.copy(grown, 0, 0, total);
          bytes = grown;
        }
        chunk.copy(bytes, total);
        total = size;
      });
      response.on('aborted', interrupted);
      response.on('close', () => { if (!ended) interrupted(); });
      response.on('end', () => {
        ended = true;
        if (!response.complete || (expected !== undefined && total !== expected)) {
          interrupted();
          return;
        }
        resolve(bytes.subarray(0, total));
      });
    });
    req.on('error', () => reject(new ScanError('REGISTRY',
      signal.aborted ? 'The npm registry request timed out.' : 'Could not connect to the npm registry.')));
  });
};

export async function readBounded(transport: Transport, url: string, limit: number): Promise<Buffer> {
  const bytes = await transport(url, limit);
  if (!Buffer.isBuffer(bytes)) throw new ScanError('REGISTRY', 'The registry transport did not return bytes.');
  if (bytes.length > limit) throw new ScanError('LIMIT', 'The registry response exceeds the download limit.');
  return bytes;
}

export async function readJson(transport: Transport, url: string): Promise<unknown> {
  const bytes = await readBounded(transport, url, limits.metadata);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    throw new ScanError('REGISTRY', 'The npm registry returned invalid JSON.');
  }
}
