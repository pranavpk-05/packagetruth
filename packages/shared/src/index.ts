export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type VerificationStatus = 'verified' | 'failed' | 'absent' | 'unsupported' | 'not-tested';

export interface Check {
  status: VerificationStatus;
  detail: string;
}
export interface ProvenanceEvidence {
  predicateType: string;
  subject: string;
  sha512: string;
  issuer: string;
  repository: string;
  repositoryId?: string;
  commit: string;
  ref: string;
  buildWorkflow: string;
  buildWorkflowCommit?: string;
  signingWorkflow: string;
  signingWorkflowCommit?: string;
  trustRoot: string;
}
export interface ProvenanceCheck extends Check {
  evidence?: ProvenanceEvidence;
}
export interface Finding {
  ruleId: string;
  severity: Severity;
  path: string;
  evidence: string;
  explanation: string;
  action: string;
}
export interface ArtifactFile {
  path: string;
  size: number;
  sha256: string;
  executable: boolean;
}
export type DependencyGroup = 'dependencies' | 'optionalDependencies' | 'peerDependencies' | 'devDependencies';
export interface Manifest {
  name: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: Record<DependencyGroup, Record<string, string>>;
  bin: Record<string, string>;
  fields: Record<string, string>;
}
export type ArtifactDigests = Record<'sha512' | 'sha384' | 'sha256' | 'sha1', string>;
export interface ScanReport {
  schemaVersion: 1;
  kind: 'scan';
  package: string;
  version: string;
  startedAt: string;
  completedAt: string;
  artifact: { url: string; bytes: number; sha256: string; digests: ArtifactDigests; expectedIntegrity: string | null };
  checks: { integrity: Check; registrySignature: Check; provenance: ProvenanceCheck; archive: Check; manifest: Check };
  manifest: Manifest | null;
  files: ArtifactFile[];
  findings: Finding[];
  limitations: string[];
}
export interface FileChanges {
  added: ArtifactFile[];
  removed: ArtifactFile[];
  modified: { before: ArtifactFile; after: ArtifactFile }[];
}
export interface ComparisonReport {
  schemaVersion: 1;
  kind: 'comparison';
  package: string;
  startedAt: string;
  completedAt: string;
  before: ScanReport;
  after: ScanReport;
  changes: FileChanges | null;
  findings: Finding[];
  limitations: string[];
}
export type Report = ScanReport | ComparisonReport;
export const severities: readonly Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
export const verificationLabels: Record<VerificationStatus, string> = {
  verified: 'Verified', failed: 'Failed', absent: 'Not available',
  unsupported: 'Unsupported', 'not-tested': 'Not tested',
};
export const provenanceLabels: Record<VerificationStatus, string> = {
  verified: 'Verified provenance', failed: 'Invalid provenance', absent: 'Provenance unavailable',
  unsupported: 'Unsupported attestation', 'not-tested': 'Verification incomplete',
};
export const provenanceEvidenceLabels: Record<keyof ProvenanceEvidence, string> = {
  repository: 'Source repository', repositoryId: 'Repository ID', commit: 'Source commit', ref: 'Source ref',
  buildWorkflow: 'Build workflow', buildWorkflowCommit: 'Build workflow commit',
  signingWorkflow: 'Signing workflow', signingWorkflowCommit: 'Signing workflow commit', issuer: 'OIDC issuer',
  subject: 'Attested package', sha512: 'Attested SHA-512', predicateType: 'Predicate type', trustRoot: 'Trust snapshot',
};
export const dependencyGroups: readonly DependencyGroup[] = [
  'dependencies', 'optionalDependencies', 'peerDependencies', 'devDependencies',
];
export const defaultPolicy = { failOn: 'critical' } as const;

export function meetsPolicy(findings: Finding[], threshold: Severity | 'off'): boolean {
  return threshold !== 'off' && findings.some(item => severities.indexOf(item.severity) >= severities.indexOf(threshold));
}

export function displayEvidence(value: string, multiline = false): string {
  return Array.from(value, char => {
    const code = char.codePointAt(0)!;
    if (multiline && char === '\n') return char;
    if (code < 32 || (code >= 127 && code <= 159) || code === 0x061c || code === 0x200e || code === 0x200f ||
        (code >= 0x2028 && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      return '\\u' + code.toString(16).padStart(4, '0');
    }
    return char;
  }).join('');
}
