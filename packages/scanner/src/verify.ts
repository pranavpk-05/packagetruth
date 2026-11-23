import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import type { ArtifactDigests, Check } from '@packagetruth/shared';
import { record } from './input.js';
import { readJson, registryKeysUrl } from './registry.js';
import type { Transport } from './registry.js';

const algorithms = { sha512: 64, sha384: 48, sha256: 32, sha1: 20 } as const;
export function artifactDigests(artifact: Buffer): ArtifactDigests {
  return {
    sha512: createHash('sha512').update(artifact).digest('hex'),
    sha384: createHash('sha384').update(artifact).digest('hex'),
    sha256: createHash('sha256').update(artifact).digest('hex'),
    sha1: createHash('sha1').update(artifact).digest('hex'),
  };
}

export function verifyIntegrity(digests: ArtifactDigests, published: string | null, legacy?: unknown): Check {
  if (!published) {
    if (typeof legacy !== 'string' || !/^[a-f0-9]{40}$/i.test(legacy)) {
      return { status: 'absent', detail: 'npm did not publish an integrity value or supported legacy checksum.' };
    }
    const matches = timingSafeEqual(Buffer.from(digests.sha1, 'hex'), Buffer.from(legacy, 'hex'));
    return matches
      ? { status: 'verified', detail: 'Matched the legacy npm SHA-1 checksum (weak legacy algorithm).' }
      : { status: 'failed', detail: 'The legacy npm SHA-1 checksum did not match.' };
  }
  if (published.length > 4096) return { status: 'unsupported', detail: 'The published integrity value exceeds the supported length.' };
  const tokens = published.trim().split(/\s+/);
  for (const algorithm of Object.keys(algorithms) as (keyof typeof algorithms)[]) {
    const prefix = `${algorithm}-`;
    const candidates = tokens.filter(token => token.startsWith(prefix)).map(token => token.slice(prefix.length));
    if (!candidates.length) continue;
    const valid = candidates
      .filter(value => /^[A-Za-z0-9+/]+={0,2}$/.test(value))
      .map(value => Buffer.from(value, 'base64'))
      .filter(decoded => decoded.length === algorithms[algorithm]);
    if (!valid.length) return { status: 'unsupported', detail: 'The strongest supported integrity entry has no valid digest.' };
    const actual = Buffer.from(digests[algorithm], 'hex');
    return valid.some(digest => timingSafeEqual(digest, actual))
      ? { status: 'verified', detail: `Matched the published npm ${algorithm.toUpperCase()} digest.` }
      : { status: 'failed', detail: `The published npm ${algorithm.toUpperCase()} digest did not match.` };
  }
  return { status: 'unsupported', detail: 'The registry did not supply an integrity algorithm supported by this scanner.' };
}

export async function verifyRegistrySignature(
  name: string, version: string, integrity: string | null, signatures: unknown, transport: Transport,
): Promise<Check> {
  if (signatures === undefined || (Array.isArray(signatures) && !signatures.length)) {
    return { status: 'absent', detail: 'The npm release metadata contains no registry signature.' };
  }
  if (!Array.isArray(signatures) || signatures.length > 16 || !integrity) {
    return { status: 'unsupported', detail: 'The signature metadata is malformed or lacks a signed integrity value.' };
  }
  let keys: unknown;
  try {
    keys = record(await readJson(transport, registryKeysUrl)).keys;
  } catch {
    return { status: 'not-tested', detail: 'The npm signing keys could not be retrieved.' };
  }
  if (!Array.isArray(keys) || keys.length > 64) {
    return { status: 'not-tested', detail: 'The npm key response has an unsupported shape.' };
  }
  let attempted = false;
  for (const item of signatures) {
    const entry = record(item);
    if (typeof entry.keyid !== 'string' || typeof entry.sig !== 'string' ||
        !/^[A-Za-z0-9+/]{1,128}={0,2}$/.test(entry.sig)) continue;
    const key = keys.map(record).find(candidate => candidate.keyid === entry.keyid);
    if (!key || key.scheme !== 'ecdsa-sha2-nistp256' || key.keytype !== 'ecdsa-sha2-nistp256' ||
        typeof key.key !== 'string' || key.key.length > 256) continue;
    if (key.expires !== null && (typeof key.expires !== 'string' || !(Date.parse(key.expires) > Date.now()))) continue;
    try {
      const publicKey = createPublicKey({ key: Buffer.from(key.key, 'base64'), type: 'spki', format: 'der' });
      if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') continue;
      attempted = true;
      if (verify('sha256', Buffer.from(`${name}@${version}:${integrity}`), publicKey, Buffer.from(entry.sig, 'base64'))) {
        return { status: 'verified', detail: `ECDSA P-256 registry signature matched npm key ${entry.keyid.slice(0, 100)}.` };
      }
    } catch {
      continue;
    }
  }
  return attempted
    ? { status: 'failed', detail: 'No signature matched the signed release tuple with the applicable npm key.' }
    : { status: 'unsupported', detail: 'No supported, currently valid npm signing key matched this release.' };
}

export function provenanceStatus(attestations: unknown): Check {
  return attestations === undefined || attestations === null
    ? { status: 'absent', detail: 'The npm release metadata advertises no provenance attestation.' }
    : { status: 'unsupported', detail: 'The registry advertises attestations. This scanner does not verify Sigstore bundles.' };
}
