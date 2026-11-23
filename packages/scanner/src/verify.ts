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
  if (published === null) {
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
  if (!Array.isArray(signatures) || signatures.length > 16) {
    return { status: 'failed', detail: 'The advertised npm signature list is malformed.' };
  }
  const entries = signatures.map(record);
  if (entries.some(entry => typeof entry.keyid !== 'string' || entry.keyid.length === 0 || entry.keyid.length > 128 ||
      /[^\x21-\x7e]/.test(entry.keyid) ||
      typeof entry.sig !== 'string' || !/^[A-Za-z0-9+/]{1,128}={0,2}$/.test(entry.sig) ||
      Buffer.from(entry.sig, 'base64').toString('base64') !== entry.sig)) {
    return { status: 'failed', detail: 'The advertised npm signature is malformed.' };
  }
  if (!integrity) return { status: 'unsupported', detail: 'npm did not publish a signed integrity value.' };
  let keys: unknown;
  try {
    keys = record(await readJson(transport, registryKeysUrl)).keys;
  } catch {
    return { status: 'not-tested', detail: 'The npm signing keys could not be retrieved.' };
  }
  if (!Array.isArray(keys) || keys.length > 64) {
    return { status: 'not-tested', detail: 'The npm key response has an unsupported shape.' };
  }
  const trustedKeys = keys.map(record);
  let matchedKey: string | undefined;
  let invalidKey = false;
  for (const { keyid, sig } of entries as { keyid: string; sig: string }[]) {
    const matching = trustedKeys.filter(candidate => candidate.keyid === keyid);
    if (matching.length === 0) continue;
    const [key] = matching;
    if (matching.length !== 1) { invalidKey = true; continue; }
    if (key.scheme !== 'ecdsa-sha2-nistp256' || key.keytype !== 'ecdsa-sha2-nistp256') continue;
    const expiry = key.expires === null ? Infinity : typeof key.expires === 'string' ? Date.parse(key.expires) : NaN;
    if (Number.isNaN(expiry) || typeof key.key !== 'string' || key.key.length > 256) { invalidKey = true; continue; }
    if (expiry <= Date.now()) continue;
    let publicKey;
    try {
      publicKey = createPublicKey({ key: Buffer.from(key.key, 'base64'), type: 'spki', format: 'der' });
    } catch {
      invalidKey = true;
      continue;
    }
    if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      invalidKey = true;
      continue;
    }
    try {
      if (verify('sha256', Buffer.from(`${name}@${version}:${integrity}`), publicKey, Buffer.from(sig, 'base64'))) {
        matchedKey ??= keyid;
        continue;
      }
    } catch {
      // A matching key was available, so a verification error is a failed check.
    }
    return { status: 'failed', detail: 'An advertised signature failed verification with an applicable npm key.' };
  }
  if (invalidKey) return { status: 'not-tested', detail: 'A matching npm signing key could not be validated.' };
  if (matchedKey) return { status: 'verified', detail: `ECDSA P-256 registry signature matched npm key ${matchedKey}.` };
  return { status: 'unsupported', detail: 'No supported, currently valid npm signing key matched this release.' };
}
