# PackageTruth v0.1.0 release readiness

**Status:** locally verified release candidate. Hosted GitHub Actions and the repository owner's publication review are pending.

## GitHub repository description

Verify npm release integrity, signatures and Sigstore provenance. Compare artifacts and enforce dependency policy with a CLI, local dashboard and GitHub Actions.

## Verification evidence

| Check | Local result |
| --- | --- |
| `npm.cmd ci --ignore-scripts` | Passed on Windows with Node.js 26.13.0 and npm 11.20.0. The npm install audit reported zero known vulnerabilities. |
| `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` | Passed. |
| `npm.cmd test` with `PACKAGETRUTH_LIVE_NPM=1` | 108 passed on Node.js 26.13.0, including three live npm provenance checks and two new offline lockfile policy cases. The same 108 passed on Node.js 24.15.0 via `node node_modules/vitest/vitest.mjs run` with the same flag. |
| `npm.cmd exec -- playwright install chromium`, `npm.cmd run test:e2e` | Passed. All five production-browser tests passed and captured the landing and verified `semver@7.7.2` screenshots. |
| Git Bash `npm run build:core` and `npm exec -- packagetruth --help` | Passed on Windows. The lockfile includes Windows, Linux and macOS native dependency variants. Native Linux and macOS installations remain unverified in this release pass. |
| Workflow YAML structure and `bash -n` | Passed for both workflows and the shared Bash entry point. Read-only permissions, full action pins, base checkout and disabled credential persistence were checked. |
| Shared workflow script against public npm | The allow fixture exited 0 with verified lock integrity. The block fixture exited 1 after the CLI returned its policy exit and reported critical `PT-LOCK-001`. The script rejected an unknown scenario with exit 2. |
| Proposed root lockfile smoke test in a disposable local clone | Adding `is-number@7.0.0` using the runbook's npm command produced CLI exit 0. A synthetic checksum change produced CLI exit 3 and `PT-LOCK-001`. |
| Gitleaks 8.30.1 and Git ignore audit | Default rules reported no findings in reachable Git history or the staged release changes. Secret-bearing file patterns, custom SQLite files and browser artifacts were checked against `.gitignore`. The tracked `.env.example` is a template. |

The screenshots show [the production landing page](screenshots/landing.png) and [a verified public release](screenshots/scan-report.png). The latter includes the attested repository, commit, signing workflow and SHA-512. The rollout does not require publishing the workspace packages to npm.

## Before public upload

1. Review Git authorship metadata. The existing reachable commits include an author email outside GitHub's noreply domain, and the configured author name is a placeholder. Publication would expose existing author metadata. Changing the configured email now affects only future commits. Choose whether to publish the existing history or prepare an explicitly approved privacy-clean history before the first push. [GitHub commit email settings](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address)
2. After authorizing an upload, publish the reviewed branch as the default branch of a public repository, enable private vulnerability reporting, and run both manual scenarios and the real draft-PR checks in [the hosted validation runbook](github-actions.md). This checkout has no remote and hosted runs were unavailable under the local-only release scope.
3. Review the hosted evidence and use [the v0.1.0 changelog](../CHANGELOG.md) as the release notes once the owner approves publication.

## Remaining risks

- The actual hosted runner, upload action and PR event path require hosted sign-off. The dependency check uses public GitHub API requests, which may be rate limited. Apply repository review controls to workflow and CI-script changes before making the check a required gate.
- Provenance reports incomplete verification at **2027-02-21 00:00 UTC** until the trust snapshot is reviewed and refreshed. A provenance availability change alone does not meet the finding threshold. See [trust maintenance](provenance.md).
- The dashboard is local and accessible to other processes on the machine. Static findings and verified provenance have the constraints in [the threat model](threat-model.md).
