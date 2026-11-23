import type { Finding, Severity } from '@packagetruth/shared';

const rules = {
  'PT-PROVENANCE-001': ['high', 'The advertised npm provenance failed authenticity, format or identity checks.', 'Investigate the release and independently confirm the expected repository, revision and workflow.'],
  'PT-INTEGRITY-001': ['critical', 'The downloaded artifact differs from the published checksum.', 'Reject these bytes and verify registry metadata through a trusted connection.'],
  'PT-INTEGRITY-002': ['medium', 'A supported published checksum was unavailable.', 'Review the release manually before relying on the artifact.'],
  'PT-SIGNATURE-001': ['high', 'The npm registry signature failed verification.', 'Investigate the registry signing keys and the release before use.'],
  'PT-ARCHIVE-001': ['high', 'The scanner rejected or could not fully inspect this artifact.', 'Inspect the archive format and limits in an isolated analysis environment.'],
  'PT-MANIFEST-001': ['high', 'The manifest could not be validated against the requested release.', 'Check the published tarball and version metadata.'],
  'PT-SCRIPT-001': ['medium', 'An install lifecycle hook can run during a normal npm install.', 'Read the hook and all files it invokes before enabling install scripts.'],
  'PT-CODE-001': ['medium', 'The inspected text references a process execution API.', 'Review which command is invoked and where its arguments originate.'],
  'PT-CODE-002': ['low', 'The inspected text references dynamic code evaluation.', 'Review the input to the evaluation and when it is reached.'],
  'PT-CODE-003': ['high', 'The inspected text resembles downloading content into a shell.', 'Review the origin and digest of the downloaded content and inspect the invocation.'],
  'PT-NATIVE-001': ['medium', 'The archive includes a possible executable or native module.', 'Verify the binary source, expected platform and build process.'],
  'PT-EXEC-001': ['medium', 'An executable file is outside the declared npm bin targets.', 'Review the file content and the code paths that can invoke it.'],
  'PT-DIFF-001': ['medium', 'An install lifecycle hook changed between releases.', 'Review the old and new hook and all files it calls.'],
  'PT-DIFF-002': ['medium', 'The release introduced an executable file or executable mode.', 'Review the new executable and its intended entry point.'],
  'PT-DIFF-003': ['low', 'A declared dependency was added, removed or changed.', 'Review the declared version and any resulting lockfile changes.'],
  'PT-DIFF-004': ['low', 'A security-relevant manifest field or bin mapping changed.', 'Confirm the change against the release notes and entry points.'],
} satisfies Record<string, [Severity, string, string]>;

export function finding(ruleId: keyof typeof rules, path: string, evidence: string): Finding {
  const [severity, explanation, action] = rules[ruleId];
  return { ruleId, severity, path, evidence: evidence.slice(0, 400), explanation, action };
}

export const lifecycle = ['preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare'] as const;
