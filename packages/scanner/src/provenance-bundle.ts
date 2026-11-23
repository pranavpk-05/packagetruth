import { X509Certificate } from 'node:crypto';
import {
  BUNDLE_V01_MEDIA_TYPE, BUNDLE_V02_MEDIA_TYPE, BUNDLE_V03_LEGACY_MEDIA_TYPE, BUNDLE_V03_MEDIA_TYPE,
  bundleFromJSON,
} from '@sigstore/bundle';
import type { SerializedBundle } from '@sigstore/bundle';
import { TrustedRoot } from '@sigstore/protobuf-specs';
import { toSignedEntity, toTrustMaterial, Verifier } from '@sigstore/verify';
import { record } from './input.js';
import root from './sigstore-trusted-root.json' with { type: 'json' };

export const trustRootId = 'sigstore-public-tuf-targets-14';
const reviewDeadline = Date.parse('2027-02-21T00:00:00Z');
const mediaTypes = new Set([BUNDLE_V01_MEDIA_TYPE, BUNDLE_V02_MEDIA_TYPE, BUNDLE_V03_LEGACY_MEDIA_TYPE, BUNDLE_V03_MEDIA_TYPE]);
const payloadType = 'application/vnd.in-toto+json';
const decimal = /^(?:0|[1-9][0-9]{0,19})$/;
let verifier: Verifier | undefined;

export class ProvenanceError extends Error {
  constructor(public readonly status: 'failed' | 'unsupported' | 'not-tested', message: string) {
    super(message);
  }
}

function invalid(detail: string): never {
  throw new ProvenanceError('failed', detail);
}

function isDecimal(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && decimal.test(value);
}

function base64(value: unknown, limit: number): Buffer {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(limit / 3) * 4 ||
      /[^a-zA-Z0-9+/=]/.test(value)) invalid('The bundle contains malformed or oversized binary fields.');
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > limit || bytes.toString('base64') !== value) {
    invalid('The bundle contains malformed or oversized binary fields.');
  }
  return bytes;
}

export function parseAttestationJson(bytes: Buffer): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
}

function logCertificate(entry: Record<string, unknown>): Buffer {
  const kind = record(entry.kindVersion);
  if (typeof kind.kind !== 'string' || typeof kind.version !== 'string') {
    invalid('The transparency log entry is missing its kind or version.');
  }
  const isDsse = kind.kind === 'dsse' && kind.version === '0.0.1';
  const isIntoto = kind.kind === 'intoto' && kind.version === '0.0.2';
  if (!isDsse && !isIntoto) {
    throw new ProvenanceError('unsupported', 'The bundle uses a transparency log entry format outside the supported npm profile.');
  }
  const body = record(parseAttestationJson(base64(entry.canonicalizedBody, 128 * 1024)));
  if (kind.kind !== body.kind || kind.version !== body.apiVersion) {
    invalid('The transparency log entry type does not match its contents.');
  }
  const spec = record(body.spec);
  let loggedKey: unknown;
  if (isDsse) {
    if (Array.isArray(spec.signatures) && spec.signatures.length === 1) loggedKey = record(spec.signatures[0]).verifier;
  } else {
    const signatures = record(record(spec.content).envelope).signatures;
    if (Array.isArray(signatures) && signatures.length === 1) loggedKey = record(signatures[0]).publicKey;
  }
  const pem = base64(loggedKey, 16 * 1024).toString('latin1');
  if (!/^-----BEGIN CERTIFICATE-----\r?\n[a-zA-Z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(pem)) {
    invalid('The transparency log verifier is not a single signing certificate.');
  }
  return new X509Certificate(pem).raw;
}

function certificate(material: Record<string, unknown>): Buffer {
  const chain = record(material.x509CertificateChain).certificates;
  if (material.publicKey !== undefined || (material.certificate !== undefined && material.x509CertificateChain !== undefined)) {
    invalid('The provenance bundle does not uniquely identify a Fulcio signing certificate.');
  }
  if (material.x509CertificateChain !== undefined) {
    if (!Array.isArray(chain) || chain.length === 0 || chain.length > 4) invalid('Invalid bundle certificate chain.');
    for (const entry of chain) base64(record(entry).rawBytes, 16 * 1024);
    return base64(record(chain[0]).rawBytes, 16 * 1024);
  }
  return base64(record(material.certificate).rawBytes, 16 * 1024);
}

function checkLogs(material: Record<string, unknown>, leaf: Buffer): void {
  const entries = material.tlogEntries;
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > 4) {
    invalid('The bundle does not contain a bounded nonempty transparency log entry list.');
  }
  for (const value of entries) {
    const entry = record(value);
    const loggedCertificate = logCertificate(entry);
    const proof = record(entry.inclusionProof);
    if (!isDecimal(entry.logIndex) || !isDecimal(entry.integratedTime) ||
        !isDecimal(proof.logIndex) || !isDecimal(proof.treeSize) ||
        !Array.isArray(proof.hashes) || proof.hashes.length > 64 ||
        typeof record(proof.checkpoint).envelope !== 'string' ||
        String(record(proof.checkpoint).envelope).length > 16 * 1024) {
      invalid('The bundle has a missing or malformed transparency log inclusion proof.');
    }
    if (base64(record(entry.logId).keyId, 32).length !== 32) invalid('The transparency log identifier is malformed.');
    for (const hash of [proof.rootHash, ...proof.hashes]) {
      if (base64(hash, 32).length !== 32) invalid('The transparency log inclusion proof has an invalid hash.');
    }
    if (entry.inclusionPromise !== undefined) {
      base64(record(entry.inclusionPromise).signedEntryTimestamp, 1024);
      const time = Number(entry.integratedTime) * 1000;
      if (!Number.isSafeInteger(time) || time === 0 || time > Date.now() + 300_000) {
        invalid('The transparency log timestamp is out of range.');
      }
    }
    // Bind the authenticated log record to this exact certificate, including its identity.
    if (!loggedCertificate.equals(leaf)) {
      invalid('The transparency log entry records a different certificate from the bundle signer.');
    }
  }
  const timestamps = record(material.timestampVerificationData).rfc3161Timestamps;
  if (timestamps !== undefined) {
    if (!Array.isArray(timestamps) || timestamps.length > 4) invalid('Invalid RFC 3161 timestamp list.');
    for (const timestamp of timestamps) base64(record(timestamp).signedTimestamp, 16 * 1024);
  }
}

export function verifyBundle(bundle: Record<string, unknown>) {
  if (typeof bundle.mediaType !== 'string') invalid('The provenance bundle media type is missing.');
  if (!mediaTypes.has(bundle.mediaType)) {
    throw new ProvenanceError('unsupported', 'The provenance bundle version is outside the supported Sigstore profile.');
  }
  const envelope = record(bundle.dsseEnvelope);
  if (envelope.payloadType !== payloadType || bundle.messageSignature !== undefined ||
      !Array.isArray(envelope.signatures) || envelope.signatures.length !== 1) {
    invalid('The supported provenance format requires one in-toto DSSE signature.');
  }
  const signature = record(envelope.signatures[0]);
  if (signature.keyid !== undefined && signature.keyid !== '') {
    invalid('The supported provenance format requires a keyless Fulcio signature.');
  }
  base64(signature.sig, 1024);
  const payload = base64(envelope.payload, 128 * 1024);
  const material = record(bundle.verificationMaterial);
  checkLogs(material, certificate(material));

  if (Date.now() >= reviewDeadline) {
    throw new ProvenanceError('not-tested', 'The bundled public Sigstore trust snapshot is past its review deadline.');
  }
  try {
    verifier ??= new Verifier(toTrustMaterial(TrustedRoot.fromJSON(root)),
      { ctlogThreshold: 1, tlogThreshold: 1, timestampThreshold: 1 });
  } catch {
    throw new ProvenanceError('not-tested', 'The bundled public Sigstore trust snapshot could not be loaded.');
  }

  const entity = toSignedEntity(bundleFromJSON(bundle as unknown as SerializedBundle));
  const signer = verifier.verify(entity);
  return { statement: record(parseAttestationJson(payload)), signer };
}
