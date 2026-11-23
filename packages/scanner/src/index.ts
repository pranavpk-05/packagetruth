import { dependencyGroups } from '@packagetruth/shared';
import type { Check, ComparisonReport, Finding, ScanReport } from '@packagetruth/shared';
import { inspectArchive } from './archive.js';
import { record, ScanError, validateName, validateVersion } from './input.js';
import { parseManifest } from './manifest.js';
import { pendingProvenance, verifyProvenance } from './provenance.js';
import { artifactUrl, download, limits, metadataUrl, readJson } from './registry.js';
import type { Transport } from './registry.js';
import { finding, lifecycle } from './rules.js';
import { artifactDigests, verifyIntegrity, verifyRegistrySignature } from './verify.js';

export { parseSpec, ScanError, validateName, validateVersion } from './input.js';
export { artifactUrl } from './registry.js';
export { verifyIntegrity } from './verify.js';

const limitations = [
  'Static indicators can miss harmful behavior and can match legitimate code. Findings and their absence are not a safety verdict.',
  'Code indicators inspect only the first 128 KiB of supported source files. No code is executed.',
  'Provenance verifies the attested GitHub build identity against the public Sigstore trust snapshot. Compare that identity with the repository and workflow you expect.',
  'Archive limits and unsupported formats can prevent inspection.',
];

const skipped: Check = { status: 'not-tested', detail: 'Inspection requires a matching published checksum.' };

function sortFindings(items: Finding[]): Finding[] {
  return items.sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.ruleId.localeCompare(b.ruleId, 'en') || a.evidence.localeCompare(b.evidence, 'en'));
}

export function createScanner(transport: Transport = download) {
  async function scan(name: string, version: string): Promise<ScanReport> {
    validateName(name);
    validateVersion(version);
    const startedAt = new Date().toISOString();
    const metadata = record(await readJson(transport, metadataUrl(name, version)));
    if (metadata.name !== name || metadata.version !== version) {
      throw new ScanError('REGISTRY', 'npm registry metadata did not match the requested release.');
    }
    const dist = record(metadata.dist);
    const url = artifactUrl(dist.tarball, name, version);
    const artifact = await transport(url, limits.compressed);
    const published = typeof dist.integrity === 'string' ? dist.integrity : null;
    const digests = artifactDigests(artifact);
    const integrity = verifyIntegrity(digests, published, dist.shasum);
    const checks: ScanReport['checks'] = {
      integrity, registrySignature: skipped, provenance: pendingProvenance(dist.attestations), archive: skipped,
      manifest: { status: 'not-tested', detail: 'Manifest validation requires a completed archive inspection.' },
    };
    const report: ScanReport = {
      schemaVersion: 1, kind: 'scan', package: name, version, startedAt, completedAt: startedAt,
      artifact: { url, bytes: artifact.length, sha256: digests.sha256, digests,
        expectedIntegrity: published?.slice(0, 4096) ?? (typeof dist.shasum === 'string' && /^[a-f0-9]{40}$/i.test(dist.shasum) ? `sha1-hex:${dist.shasum}` : null) },
      checks, manifest: null, files: [], findings: [], limitations,
    };
    if (integrity.status !== 'verified') {
      report.findings.push(finding(integrity.status === 'failed' ? 'PT-INTEGRITY-001' : 'PT-INTEGRITY-002', '(tarball)', integrity.detail));
    } else {
      [checks.registrySignature, checks.provenance] = await Promise.all([
        verifyRegistrySignature(name, version, published, dist.signatures, transport),
        verifyProvenance(name, version, digests, dist.attestations, transport),
      ]);
      if (checks.provenance.status === 'failed') {
        report.findings.push(finding('PT-PROVENANCE-001', '(provenance)', checks.provenance.detail));
      }
      if (checks.registrySignature.status === 'failed') {
        report.findings.push(finding('PT-SIGNATURE-001', '(registry)', checks.registrySignature.detail));
      }
      try {
        const inspected = await inspectArchive(artifact, name);
        report.files = inspected.files;
        report.findings.push(...inspected.findings);
        checks.archive = { status: 'verified', detail: `Inspected ${report.files.length} files under configured limits.` };
        try {
          const manifest = parseManifest(inspected.manifestBytes, name, version);
          report.manifest = manifest;
          checks.manifest = { status: 'verified', detail: 'The manifest identity matches the requested release.' };
          for (const hook of lifecycle) {
            if (Object.hasOwn(manifest.scripts, hook) && manifest.scripts[hook]) {
              report.findings.push(finding('PT-SCRIPT-001', 'package.json', `${hook}: ${manifest.scripts[hook]}`));
            }
          }
          if (!manifest.scripts.install && !manifest.scripts.preinstall && report.files.some(file => file.path === 'binding.gyp')) {
            report.findings.push(finding('PT-SCRIPT-001', 'binding.gyp', 'npm may use its default node-gyp rebuild install hook.'));
          }
          const bins = new Set(Object.values(manifest.bin).map(path => path.replace(/^\.\//, '')));
          for (const file of report.files) {
            if (file.executable && !bins.has(file.path)) {
              report.findings.push(finding('PT-EXEC-001', file.path, 'Execute mode or a shebang with no matching npm bin target'));
            }
          }
        } catch (error) {
          if (!(error instanceof ScanError)) throw error;
          checks.manifest = { status: 'failed', detail: error.message };
          report.findings.push(finding('PT-MANIFEST-001', 'package.json', error.message));
        }
      } catch (error) {
        if (!(error instanceof ScanError)) throw error;
        checks.archive = { status: 'failed', detail: error.message };
        report.findings.push(finding('PT-ARCHIVE-001', '(tarball)', error.message));
      }
    }
    report.completedAt = new Date().toISOString();
    report.findings = sortFindings(report.findings);
    return report;
  }

  async function compare(name: string, oldVersion: string, newVersion: string): Promise<ComparisonReport> {
    validateName(name);
    validateVersion(oldVersion);
    validateVersion(newVersion);
    if (oldVersion === newVersion) throw new ScanError('INPUT', 'Choose two different versions.');
    const startedAt = new Date().toISOString();
    const before = await scan(name, oldVersion);
    const after = await scan(name, newVersion);
    const findings = [
      ...before.findings.filter(item => /^(PT-INTEGRITY|PT-ARCHIVE|PT-SIGNATURE|PT-PROVENANCE|PT-MANIFEST)-/.test(item.ruleId))
        .map(item => ({ ...item, evidence: `[${oldVersion}] ${item.evidence}` })),
      ...after.findings,
    ];
    let changes: ComparisonReport['changes'] = null;
    if (before.checks.archive.status === 'verified' && after.checks.archive.status === 'verified') {
      const oldFiles = new Map(before.files.map(file => [file.path, file]));
      const newFiles = new Map(after.files.map(file => [file.path, file]));
      changes = { added: [], removed: [], modified: [] };
      for (const file of after.files) {
        const old = oldFiles.get(file.path);
        if (!old) changes.added.push(file);
        else if (old.sha256 !== file.sha256 || old.executable !== file.executable) changes.modified.push({ before: old, after: file });
        if (file.executable && !old?.executable) {
          findings.push(finding('PT-DIFF-002', file.path, old ? 'Execute mode or shebang added' : 'New executable file'));
        }
      }
      changes.removed = before.files.filter(file => !newFiles.has(file.path));
    }
    if (before.manifest && after.manifest) {
      for (const hook of lifecycle) {
        const old = Object.hasOwn(before.manifest.scripts, hook) ? before.manifest.scripts[hook] : undefined;
        const updated = Object.hasOwn(after.manifest.scripts, hook) ? after.manifest.scripts[hook] : undefined;
        if (old !== updated) findings.push(finding('PT-DIFF-001', 'package.json', describeChange(hook, old, updated)));
      }
      for (const group of dependencyGroups) {
        mappingChanges(before.manifest.dependencies[group], after.manifest.dependencies[group], group, 'PT-DIFF-003', findings);
      }
      mappingChanges(before.manifest.fields, after.manifest.fields, '', 'PT-DIFF-004', findings);
      mappingChanges(before.manifest.bin, after.manifest.bin, 'bin', 'PT-DIFF-004', findings);
    }
    return { schemaVersion: 1, kind: 'comparison', package: name, startedAt, completedAt: new Date().toISOString(),
      before, after, changes, findings: sortFindings(findings), limitations };
  }
  return { scan, compare };
}

function describeChange(name: string, before: string | undefined, after: string | undefined): string {
  const display = (value: string | undefined) => value === undefined ? '(absent)' : JSON.stringify(value).slice(0, 120);
  return `${name.slice(0, 125)}: ${display(before)} → ${display(after)}`;
}

function mappingChanges(
  before: Record<string, string>, after: Record<string, string>, prefix: string,
  rule: 'PT-DIFF-003' | 'PT-DIFF-004', findings: Finding[],
): void {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const old = Object.hasOwn(before, key) ? before[key] : undefined;
    const updated = Object.hasOwn(after, key) ? after[key] : undefined;
    if (old !== updated) findings.push(finding(rule, 'package.json', describeChange(prefix ? `${prefix}.${key}` : key, old, updated)));
  }
}

export const { scan, compare } = createScanner();
