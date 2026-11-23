#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { compare, parseSpec, scan, ScanError } from '@packagetruth/scanner';
import { defaultPolicy, displayEvidence, meetsPolicy, provenanceEvidenceLabels, provenanceLabels,
  severities, verificationLabels } from '@packagetruth/shared';
import type { ProvenanceEvidence, Report, Severity } from '@packagetruth/shared';
import { checkLock } from './lock.js';

const help = `PackageTruth · npm release evidence

Usage
  packagetruth scan <package>@<version> [--json] [--fail-on <severity>]
  packagetruth compare <package> <old> <new> [--json] [--fail-on <severity>]
  packagetruth lock-check <base-lockfile> <head-lockfile> [--fail-on <severity>]
  packagetruth --help

Severity: info, low, medium, high, critical (default), off
Exit codes: 0 completed, 1 operational error or incomplete lock coverage,
            2 invalid input, 3 configured policy threshold reached.
`;

function printReport(report: Report): void {
  const versions = report.kind === 'scan' ? report.version : `${report.before.version} → ${report.after.version}`;
  console.log(`PackageTruth · ${report.package} ${versions}`);
  for (const scanned of report.kind === 'scan' ? [report] : [report.before, report.after]) {
    for (const [key, check] of Object.entries(scanned.checks)) {
      const labels = key === 'provenance' ? provenanceLabels : verificationLabels;
      console.log(`  ${scanned.version} ${key}: ${labels[check.status]} · ${displayEvidence(check.detail)}`);
    }
    if (scanned.checks.provenance.evidence) {
      for (const [key, value] of Object.entries(scanned.checks.provenance.evidence)) {
        if (value !== undefined) {
          console.log(`    ${provenanceEvidenceLabels[key as keyof ProvenanceEvidence]}: ${displayEvidence(value)}`);
        }
      }
    }
  }
  if (report.kind === 'comparison' && report.changes) {
    const { added, removed, modified } = report.changes;
    console.log(`Files: +${added.length} −${removed.length} ~${modified.length}`);
  }
  for (const item of report.findings) {
    console.log(`${item.severity.toUpperCase()} ${item.ruleId} ${displayEvidence(item.path)} · ${displayEvidence(item.evidence)}`);
    console.log(`  ${item.explanation} ${item.action}`);
  }
  console.log(`${report.findings.length} findings. ${report.limitations[0]}`);
}

async function main(): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs({ options: { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
      'fail-on': { type: 'string' } }, allowPositionals: true });
  } catch (error) {
    throw new ScanError('INPUT', error instanceof Error ? error.message : 'Invalid arguments.');
  }
  const [command, ...parameters] = args.positionals;
  if (args.values.help || !command) {
    console.log(help);
    return 0;
  }
  const threshold = args.values['fail-on'] ?? defaultPolicy.failOn;
  if (typeof threshold !== 'string' || (threshold !== 'off' && !severities.includes(threshold as Severity))) {
    throw new ScanError('INPUT', 'Choose a valid --fail-on severity or off.');
  }
  const policy = threshold as Severity | 'off';
  let report: Report;
  if (command === 'scan' && parameters.length === 1) {
    const { name, version } = parseSpec(parameters[0]);
    report = await scan(name, version);
  } else if (command === 'compare' && parameters.length === 3) {
    report = await compare(parameters[0], parameters[1], parameters[2]);
  } else if (command === 'lock-check' && parameters.length === 2) {
    const result = await checkLock(parameters[0], parameters[1], policy);
    console.log(JSON.stringify(result, null, 2));
    return result.policyFailed ? 3 : result.incomplete ? 1 : 0;
  } else {
    throw new ScanError('INPUT', 'Invalid command or arguments. Run packagetruth --help.');
  }
  if (args.values.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  return meetsPolicy(report.findings, policy) ? 3 : 0;
}

main().then(code => { process.exitCode = code; }).catch(error => {
  const message = error instanceof Error ? error.message : 'The operation failed.';
  if (process.argv.includes('--json')) console.error(JSON.stringify({ error: message, code: error instanceof ScanError ? error.code : 'ERROR' }));
  else console.error(`packagetruth: ${displayEvidence(message)}`);
  process.exitCode = error instanceof ScanError && error.code === 'INPUT' ? 2 : 1;
});
