import { ASN1Obj } from '@sigstore/core';
import type { Signer } from '@sigstore/verify';
import type { ProvenanceEvidence } from '@packagetruth/shared';
import { record } from './input.js';

export const githubIssuer = 'https://token.actions.githubusercontent.com';
export const githubBuildType = 'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1';
const repositoryPattern = /^https:\/\/github\.com\/[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/;
const workflowPath = /^\.github\/workflows\/[a-zA-Z0-9_.-]{1,160}\.ya?ml$/;
const sourceRefPattern = /^refs\/[a-zA-Z0-9._/+-]{1,240}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const oidPrefix = '1.3.6.1.4.1.57264.1.';

type GithubIdentity = Pick<ProvenanceEvidence, 'issuer' | 'repository' | 'repositoryId' | 'commit' | 'ref' |
  'buildWorkflow' | 'signingWorkflow' | 'signingWorkflowCommit' | 'buildWorkflowCommit'>;
type IdentityResult = { identity: GithubIdentity } | { status: 'failed' | 'not-tested'; detail: string };

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && !/\s/.test(value) && pattern.test(value);
}

function isWorkflowUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 600) return false;
  const separator = value.indexOf('/.github/workflows/');
  const at = value.lastIndexOf('@');
  if (separator === -1 || at <= separator) return false;
  const ref = value.slice(at + 1);
  return matches(value.slice(0, separator), repositoryPattern) &&
    matches(value.slice(separator + 1, at), workflowPath) &&
    (matches(ref, sourceRefPattern) || matches(ref, commitPattern));
}

function claim(identity: NonNullable<Signer['identity']>, number: number): string | undefined {
  const entries = identity.oids?.filter(oid => oid.oid?.id.join('.') === oidPrefix + number) ?? [];
  if (entries.length === 0) return undefined;
  if (entries.length !== 1 || !entries[0].value.length || entries[0].value.length > 1024) {
    throw new Error('Unexpected Fulcio identity extension.');
  }
  const bytes = Buffer.from(entries[0].value);
  if (number < 8) return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const encoded = ASN1Obj.parseBuffer(bytes);
  if (!encoded.tag.isUniversal() || encoded.tag.number !== 12 || encoded.tag.constructed || !encoded.toDER().equals(bytes)) {
    throw new Error('Invalid Fulcio identity extension encoding.');
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(encoded.value);
}

export function verifyGithubIdentity(build: Record<string, unknown>, signer: Signer['identity']): IdentityResult {
  if (!signer?.extensions?.issuer) {
    return { status: 'not-tested', detail: 'The verified signing certificate does not expose an OIDC issuer.' };
  }
  const modernIssuer = claim(signer, 8);
  const legacyIssuer = claim(signer, 1);
  if ((modernIssuer ?? legacyIssuer) !== githubIssuer || signer.extensions.issuer !== githubIssuer ||
      (legacyIssuer !== undefined && legacyIssuer !== githubIssuer)) {
    return { status: 'failed', detail: 'The signing certificate issuer does not match the GitHub Actions provenance profile.' };
  }

  const workflow = record(record(build.externalParameters).workflow);
  const { repository, path, ref: workflowRef } = workflow;
  if (!matches(repository, repositoryPattern) || !matches(path, workflowPath) ||
      !(matches(workflowRef, sourceRefPattern) || matches(workflowRef, commitPattern))) {
    return { status: 'failed', detail: 'The signed GitHub Actions workflow claims are malformed.' };
  }
  const buildWorkflow = repository + '/' + path + '@' + workflowRef;

  const repositoryClaim = claim(signer, 12);
  const legacyRepository = claim(signer, 5);
  const certificateRepository = repositoryClaim ?? (legacyRepository && 'https://github.com/' + legacyRepository);
  const modernCommit = claim(signer, 13);
  const legacyCommit = claim(signer, 3);
  const certificateCommit = modernCommit ?? legacyCommit;
  const modernRef = claim(signer, 14);
  const legacyRef = claim(signer, 6);
  const certificateRef = modernRef ?? legacyRef;
  const signingWorkflow = signer.subjectAlternativeName;
  const buildConfig = claim(signer, 18);
  const signingClaim = claim(signer, 9);
  const signingWorkflowCommit = claim(signer, 10);
  const buildWorkflowCommit = claim(signer, 19);
  const repositoryId = claim(signer, 15);
  const github = record(record(build.internalParameters).github);
  const certificateOwnerId = claim(signer, 17);

  if (!certificateRepository || !certificateCommit || !certificateRef || !signingWorkflow) {
    return { status: 'not-tested', detail: 'The verified signing certificate lacks repository, commit, ref or workflow identity.' };
  }
  if (certificateRepository !== repository ||
      (legacyRepository !== undefined && 'https://github.com/' + legacyRepository !== repository) ||
      (legacyCommit !== undefined && legacyCommit !== certificateCommit) ||
      (legacyRef !== undefined && legacyRef !== certificateRef)) {
    return { status: 'failed', detail: 'The signed source identity conflicts with the Fulcio certificate.' };
  }
  if (!matches(certificateCommit, commitPattern) || !matches(certificateRef, sourceRefPattern) ||
      !isWorkflowUri(signingWorkflow) || (signingClaim !== undefined && signingClaim !== signingWorkflow) ||
      (buildConfig ?? signingWorkflow) !== buildWorkflow ||
      (signingWorkflowCommit !== undefined && !matches(signingWorkflowCommit, commitPattern)) ||
      (buildWorkflowCommit !== undefined && !matches(buildWorkflowCommit, commitPattern))) {
    return { status: 'failed', detail: 'The signed GitHub workflow or source ref disagrees with the certificate identity.' };
  }
  if ((repositoryId !== undefined && !matches(repositoryId, /^[0-9]{1,24}$/)) ||
      (repositoryId !== undefined && github.repository_id !== undefined && github.repository_id !== repositoryId) ||
      (certificateOwnerId !== undefined && github.repository_owner_id !== undefined &&
        github.repository_owner_id !== certificateOwnerId)) {
    return { status: 'failed', detail: 'The signed repository identifiers disagree with the certificate identity.' };
  }

  const dependencies = build.resolvedDependencies;
  if (!Array.isArray(dependencies) || dependencies.length === 0 || dependencies.length > 64) {
    return { status: 'failed', detail: 'The signed build statement lacks a usable source dependency list.' };
  }
  const sourceUri = 'git+' + repository + '@' + certificateRef;
  const sources = dependencies.map(record).filter(dependency => dependency.uri === sourceUri);
  if (sources.length !== 1 || record(sources[0].digest).gitCommit !== certificateCommit) {
    return { status: 'failed', detail: 'The signed source dependency does not match the certificate repository, ref and commit.' };
  }
  return { identity: { issuer: githubIssuer, repository, repositoryId, commit: certificateCommit, ref: certificateRef,
    buildWorkflow, signingWorkflow, signingWorkflowCommit, buildWorkflowCommit } };
}
