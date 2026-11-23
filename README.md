# PackageTruth

PackageTruth verifies the bytes of an exact npm release and shows what changed between versions. Use the CLI for scriptable evidence, the local dashboard for review, and GitHub Actions to check changes in `package-lock.json`.

![PackageTruth landing page, captured from the production build](docs/screenshots/landing.png)

## Quick start

Use Node.js **24.15+ on the 24.x line**, or **26+**, with npm. Run these commands from the repository root in PowerShell, Command Prompt, Bash, or zsh. If PowerShell blocks the npm script shim, use `npm.cmd` in place of `npm`.

```sh
npm ci --ignore-scripts
npm run build:core
npm exec -- packagetruth --help
npm exec -- packagetruth scan "semver@7.7.2" --json
npm exec -- packagetruth compare is-number 6.0.0 7.0.0 --json
```

The `semver` scan demonstrates verified Sigstore provenance, including the source repository, commit, calling workflow and signing workflow. The comparison shows inventory, install hook, dependency and selected manifest changes. Use `node packages/cli/dist/index.js` to invoke the CLI directly.

| Exit code | Meaning |
| --- | --- |
| 0 | Completed under the configured policy |
| 1 | Operational error or incomplete lockfile coverage |
| 2 | Invalid arguments or scan input |
| 3 | A finding met the configured severity threshold |

JSON reports go to stdout. Errors go to stderr. The default threshold is `critical`. Set `--fail-on off` to disable severity-based exits.

## Local dashboard

```sh
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). For the production build, run `npm run build` followed by `npm start`.

Open **Package scan**, enter **semver** and **7.7.2**, then expand **Verified build identity**. The dashboard also provides release comparison, filtering, JSON downloads, scan history and policy settings. The [verified scan screenshot](docs/screenshots/scan-report.png) shows this flow against the public npm registry. Both screenshots were captured from the production build during the browser suite.

The dashboard stores reports in `.data/packagetruth.sqlite` by default. Set `PACKAGETRUTH_DB` in your shell or in `apps/web/.env.local` to choose an absolute path. History retains up to 40 reports within a 64 MiB serialized report budget. See [.env.example](.env.example).

## Dependency policy

Try the same two lockfile inputs used by the manual GitHub Actions demo:

```sh
npm exec -- packagetruth lock-check fixtures/dependency-policy/base.lock.json fixtures/dependency-policy/allow.lock.json
npm exec -- packagetruth lock-check fixtures/dependency-policy/base.lock.json fixtures/dependency-policy/block.lock.json
```

The first command exits **0**. The second exits **3** with `PT-LOCK-001` because its synthetic lockfile checksum differs from the public release. Both scan the same npm artifact. See the [fixture inputs](fixtures/dependency-policy/README.md) and [hosted validation runbook](docs/github-actions.md).

On pull requests that change the root `package-lock.json`, **Dependency evidence** checks out the base commit, verifies one bounded lockfile blob from the proposed revision, and uploads JSON evidence. It uses read-only repository access and installs only the base revision's tooling with scripts disabled. Configure the repository variables `PACKAGETRUTH_FAIL_ON` and `PACKAGETRUTH_FAIL_ON_INCOMPLETE` to set the policy. The defaults are `critical` and `false`. The dashboard policy applies only to local reports.

## Security and supported scope

- Bad artifact digests, failed signatures, missing attestations, and static indicators have separate results. The scanner uses direct public npm HTTPS requests, bounds archive handling and performs no package installation, execution or disk extraction during inspection.
- Sigstore verification covers supported GitHub Actions SLSA v1 attestations. Check the authenticated source identity against your expectations. Provenance and static findings are evidence for review. They cannot establish package safety.
- At **2027-02-21 00:00 UTC**, the reviewed trust snapshot reaches its verification deadline. Supported attestations that reach the trust check then report incomplete verification until the snapshot is refreshed. Other scan checks retain their separate results.
- The dashboard is for loopback access. The current lockfile checker targets public npm artifact resolutions, and archive and static analysis have documented limits.

Read the [architecture](docs/architecture.md), [threat model](docs/threat-model.md), [provenance and trust maintenance](docs/provenance.md), and [detection rules](docs/detection-rules.md).

## Development checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm exec -- playwright install chromium
npm run test:e2e
```

On supported Linux runners, use `npm exec -- playwright install --with-deps chromium` to install browser system dependencies. The default Vitest suite uses local fixtures. The browser suite exercises the production server and requires public npm access. See [Contributing](CONTRIBUTING.md) for live provenance and screenshot commands.

Planned work includes expected-source policies, bounded PAX archive support, and per-dependency release comparisons during lockfile review.

[Release readiness](docs/release-readiness.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security reporting](SECURITY.md) · [MIT license](LICENSE)
