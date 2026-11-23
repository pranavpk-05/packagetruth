# Validate GitHub Actions

The workflow has two lanes. The **pull request** lane reads a proposed root lockfile through the public GitHub API and checks out only the PR base revision. The **manual** lane runs the same CLI and policy handling on checked-in fixture inputs. The quality workflow separately tests pull-request code on GitHub-hosted runners with read-only repository access. See [the threat model](threat-model.md).

## 1. Set up the public repository

Review [release readiness](release-readiness.md), including the Git author metadata, before uploading. When the repository owner authorizes publication, create an empty public GitHub repository, upload the reviewed branch as its default branch, and enable Actions and private vulnerability reporting. Wait for the first **Quality** workflow to pass. Keep the checkout and workflow permissions as declared. For a required security gate, protect workflow and CI-script changes with repository review controls. [Manual workflow trigger requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) · [Private vulnerability reporting setup](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)

## 2. Run the two hosted demonstrations

In **Actions → Dependency evidence → Run workflow**, select the default branch. Run once with **allow** and once with **block**. With an already authenticated `gh` from the published checkout, the equivalent commands are:

```sh
gh workflow run dependency-evidence.yml --ref YOUR_DEFAULT_BRANCH -f scenario=allow
gh workflow run dependency-evidence.yml --ref YOUR_DEFAULT_BRANCH -f scenario=block
gh run list --workflow dependency-evidence.yml --event workflow_dispatch --limit 5
```

| Scenario | Expected hosted result | Required evidence |
| --- | --- | --- |
| allow | Success | `policyFailed: false`, `incomplete: false`, and one verified lock digest |
| block | Failure due to the policy threshold | `policyFailed: true` and a critical `PT-LOCK-001` with a failed lock digest against a registry-verified artifact |

Inspect each job summary and download `packagetruth-evidence` from its run. The block scenario requires the exact digest finding. A network or setup failure does not demonstrate blocking. The manual lane uses `critical` and treats incomplete coverage as a failed demo regardless of repository variables.

## 3. Validate the actual pull-request lane

Set repository Actions variables `PACKAGETRUTH_FAIL_ON=critical` and `PACKAGETRUTH_FAIL_ON_INCOMPLETE=true` for the smoke test. The following commands are for Bash or Git Bash and start from a clean clone with `origin` configured. Run them only when authorized to push test branches and open draft pull requests.

```bash
base=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
git fetch origin "$base"
git switch -c release-check/allow "origin/$base"
npm install --save-dev --save-exact is-number@7.0.0 --package-lock-only --ignore-scripts --no-audit
git add package.json package-lock.json
git commit -m "Test dependency evidence with a valid npm lockfile entry"
git push -u origin release-check/allow
gh pr create --draft --base "$base" --title "Dependency evidence smoke test (allow)" --body "Temporary integration validation. Close after collecting evidence."

git switch -c release-check/block
node -e "const fs = require('node:fs'); const lock = require('./package-lock.json'); lock.packages['node_modules/is-number'].integrity = 'sha512-' + Buffer.alloc(64).toString('base64'); fs.writeFileSync('package-lock.json', JSON.stringify(lock, null, 2) + '\n')"
git add package-lock.json
git commit -m "Test dependency evidence with a synthetic lockfile digest mismatch"
git push -u origin release-check/block
gh pr create --draft --base "$base" --title "Dependency evidence smoke test (block)" --body "Temporary digest mismatch validation. Never merge this lockfile."
```

Check **Dependency evidence** on both PRs and download the reports. The allow PR must have a verified lock digest for `is-number`. The block PR must contain `PT-LOCK-001`. The separate **Quality** job can also fail its install on the deliberate bad checksum. Check the dependency job's evidence specifically. Record both run URLs, then close both draft PRs without merging. If fork PRs are in scope, repeat the allow scenario from a public fork and follow the repository's contributor approval rules.

The live PR lane uses unauthenticated public GitHub object requests. Private repository objects and rate limiting can produce incomplete coverage. A pull request can propose changes to the workflow itself, so protect those files before relying on it as a required gate. [GitHub workflow security guidance](https://docs.github.com/en/actions/reference/security/secure-use)
