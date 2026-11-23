import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { artifactUrl, scan, validateName, validateVersion, verifyIntegrity } from '@packagetruth/scanner';
import type { Check, Finding, ScanReport, Severity } from '@packagetruth/shared';
import { meetsPolicy } from '@packagetruth/shared';

const maxLockBytes = 4 * 1024 * 1024;
const maxReleases = 12;
const maxLocations = 200;
type Entry = { name: string; version: string; resolved: string; integrity: string; mode: 'registry' | 'linked' | 'bundled' };
type LockResult = { location: string; package: string; version: string; status: 'scanned' | 'incomplete';
  detail?: string; evidence?: string; lockIntegrity?: Check; finding?: Finding };

async function readLock(path: string): Promise<Map<string, Entry>> {
  const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxLockBytes) throw new Error('Lockfile must be a regular file of at most 4 MiB.');
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset !== stat.size) throw new Error('Lockfile changed during inspection.');
    const lock = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset)));
    if (![2, 3].includes(lock?.lockfileVersion) || !lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
      throw new Error('A package-lock.json with lockfile version 2 or 3 is required.');
    }
    const entries = new Map<string, Entry>();
    for (const [location, raw] of Object.entries(lock.packages)) {
      if (!/(^|\/)node_modules\//.test(location)) continue;
      const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const fromLocation = location.split('node_modules/').at(-1) ?? '';
      const string = (value: unknown) => typeof value === 'string' ? value : '';
      const mode = entry.link !== undefined && entry.link !== false ? 'linked'
        : entry.inBundle !== undefined && entry.inBundle !== false ? 'bundled' : 'registry';
      entries.set(location, { name: string(entry.name) || fromLocation,
        version: string(entry.version), resolved: string(entry.resolved), integrity: string(entry.integrity), mode });
    }
    return entries;
  } finally {
    await file.close();
  }
}

export async function checkLock(basePath: string, headPath: string, threshold: Severity | 'off', scanRelease = scan) {
  const before = await readLock(basePath);
  const after = await readLock(headPath);
  const results: LockResult[] = [];
  const releases = new Map<string, ScanReport | string>();
  const evidence: Record<string, Pick<ScanReport, 'checks' | 'findings'> & { artifactSha256: string }> = Object.create(null);
  let incomplete = false;
  let policyFailed = false;
  for (const [location, entry] of after) {
    const old = before.get(location);
    if (old && old.name === entry.name && old.version === entry.version &&
        old.resolved === entry.resolved && old.integrity === entry.integrity && old.mode === entry.mode) continue;
    if (results.length >= maxLocations) {
      incomplete = true;
      break;
    }
    const current = { location: location.slice(0, 512), package: entry.name.slice(0, 214), version: entry.version.slice(0, 100) };
    let detail: string | undefined;
    try {
      validateName(entry.name);
      validateVersion(entry.version);
    } catch {
      detail = 'Resolution does not identify a supported exact npm release.';
    }
    if (entry.mode !== 'registry') detail = 'Linked and bundled dependencies have no independently verified registry resolution.';
    if (!detail) {
      try { artifactUrl(entry.resolved, entry.name, entry.version); }
      catch { detail = 'Resolution is outside supported public npm registry artifacts.'; }
    }
    const key = `${entry.name}@${entry.version}`;
    let report: ScanReport | string | undefined;
    if (!detail) {
      if (!releases.has(key) && releases.size < maxReleases) {
        try {
          releases.set(key, await scanRelease(entry.name, entry.version));
        } catch (error) {
          releases.set(key, error instanceof Error ? error.message : 'Scan failed.');
        }
      }
      report = releases.get(key);
      if (!report || typeof report === 'string') detail = report ?? 'Unique release limit reached.';
    }
    if (detail || !report || typeof report === 'string') {
      incomplete = true;
      results.push({ ...current, status: 'incomplete', detail });
      continue;
    }
    const lockIntegrity: Check = report.checks.integrity.status === 'verified'
      ? verifyIntegrity(report.artifact.digests, entry.integrity || null)
      : { status: 'not-tested', detail: 'Registry artifact integrity could not be verified.' };
    let finding: Finding | undefined;
    if (lockIntegrity.status === 'failed') {
      finding = { ruleId: 'PT-LOCK-001', severity: 'critical', path: current.location,
        evidence: lockIntegrity.detail.replace('published npm', 'lockfile'),
        explanation: 'The lockfile checksum differs from the downloaded artifact whose registry integrity matched.',
        action: 'Investigate the lockfile change and regenerate the lockfile from trusted release metadata.' };
    }
    const complete = lockIntegrity.status === 'verified' && report.checks.archive.status === 'verified' && Boolean(report.manifest);
    if (!complete) incomplete = true;
    policyFailed ||= meetsPolicy(report.findings, threshold) || Boolean(finding && meetsPolicy([finding], threshold));
    evidence[key] ??= { artifactSha256: report.artifact.sha256, checks: report.checks, findings: report.findings };
    results.push({ ...current, status: complete ? 'scanned' : 'incomplete', evidence: key,
      lockIntegrity: { ...lockIntegrity, detail: lockIntegrity.detail.replace('published npm', 'lockfile') }, finding,
      detail: lockIntegrity.status !== 'verified' ? 'The lockfile checksum could not be verified.'
        : !complete ? 'The artifact could not be fully inspected.' : undefined });
  }
  const removed = [...before.keys()].filter(path => !after.has(path));
  return { schemaVersion: 1, kind: 'lock-check', threshold, policyFailed, incomplete,
    limits: { locations: maxLocations, releases: maxReleases }, omittedRemovals: Math.max(0, removed.length - maxLocations),
    removed: removed.slice(0, maxLocations).map(path => path.slice(0, 512)), results, evidence };
}
