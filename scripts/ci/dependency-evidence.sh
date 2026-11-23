#!/usr/bin/env bash
set -euo pipefail

export EVIDENCE_FILE="$RUNNER_TEMP/packagetruth-evidence.json"

incomplete() {
  echo "::warning::Dependency evidence is incomplete. $1"
  printf '\n%s\n' "$1" >> "$GITHUB_STEP_SUMMARY"
  if [[ "$FAIL_INCOMPLETE" == true ]]; then exit 1; fi
  exit 0
}

copy_base_lock() {
  local mode size
  mode="$(git ls-tree HEAD -- package-lock.json | cut -d' ' -f1)"
  [[ "$mode" == 100644 || "$mode" == 100755 ]] || return 1
  size="$(git cat-file -s HEAD:package-lock.json)" || return 1
  [[ "$size" =~ ^[0-9]+$ ]] && (( size <= 4194304 )) || return 1
  git cat-file blob HEAD:package-lock.json > "$1"
}

case "$GITHUB_EVENT_NAME" in
  workflow_dispatch)
    FAIL_ON=critical
    FAIL_INCOMPLETE=true
    base=fixtures/dependency-policy/base.lock.json
    case "$POLICY_SCENARIO" in
      allow) head=fixtures/dependency-policy/allow.lock.json ;;
      block) head=fixtures/dependency-policy/block.lock.json ;;
      *) echo "::error::Unknown dependency policy demo scenario."; exit 2 ;;
    esac
    ;;
  pull_request)
    if [[ ! "$FAIL_ON" =~ ^(info|low|medium|high|critical|off)$ ||
          ! "$FAIL_INCOMPLETE" =~ ^(true|false)$ ]]; then
      echo "::error::PackageTruth dependency policy settings are invalid."
      exit 2
    fi
    work="$(mktemp -d "$RUNNER_TEMP/packagetruth.XXXXXX")"
    trap 'rm -f -- "$work/base.json" "$work/head.json"; rmdir -- "$work"' EXIT
    base="$work/base.json"
    head="$work/head.json"
    copy_base_lock "$base" || incomplete 'The base lockfile is absent, oversized or unsupported.'
    node scripts/read-pr-lock.mjs "$head" || incomplete 'The proposed lockfile could not be read.'
    ;;
  *) echo "::error::Unsupported dependency evidence event."; exit 2 ;;
esac

status=0
node packages/cli/dist/index.js lock-check "$base" "$head" --fail-on "$FAIL_ON" > "$EVIDENCE_FILE" || status=$?
if [[ ! -s "$EVIDENCE_FILE" ]]; then incomplete 'The lockfile checker could not produce evidence.'; fi

node --input-type=module - <<'JS' >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.env.EVIDENCE_FILE, 'utf8'));
const scenario = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? process.env.POLICY_SCENARIO : undefined;
console.log('## PackageTruth dependency evidence');
console.log('');
if (scenario) console.log('- Demo scenario: ' + scenario);
console.log('- Changed locations evaluated: ' + report.results.length);
console.log('- Unique release scans: ' + Object.keys(report.evidence).length);
console.log('- Incomplete coverage: ' + report.incomplete);
console.log('- Policy threshold met: ' + report.policyFailed);
console.log('');
console.log('Download the JSON artifact for checks, findings and review actions.');

if (scenario === 'allow' && (report.incomplete || report.policyFailed || report.results.length !== 1 ||
    report.results[0].lockIntegrity?.status !== 'verified')) {
  console.error('The allow demo did not produce complete, passing evidence.');
  process.exitCode = 1;
}
if (scenario === 'block' && (!report.policyFailed || report.results.length !== 1 ||
    report.results[0].finding?.ruleId !== 'PT-LOCK-001')) {
  console.error('The block demo did not produce the expected lockfile digest finding.');
  process.exitCode = 1;
}
JS
if [[ "$status" == 3 ]]; then
  echo "::error::PackageTruth reached the configured finding severity threshold."
  exit 1
fi
if [[ "$status" != 0 ]]; then incomplete 'One or more proposed dependency changes could not be fully inspected.'; fi
