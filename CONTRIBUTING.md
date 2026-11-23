# Contributing

Use Node.js 24.15+ on the 24.x line or Node.js 26+, and npm. From the repository root, run `npm ci --ignore-scripts`. Use `npm.cmd` in Windows PowerShell if execution policy blocks the npm shim. See [AGENTS.md](AGENTS.md) for workspace conventions.

Keep rule IDs stable. Add inert fixtures when changing archive, network or policy behavior. Avoid committing real credentials, local databases, Playwright storage state or generated test runs. The public tarball and related signed statement under [fixtures/provenance](fixtures/provenance/README.md) are intentional test data.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm exec -- playwright install chromium
npm run test:e2e
```

For Ubuntu or Debian, Playwright can install Chromium system packages with `npm exec -- playwright install --with-deps chromium`. The browser suite starts a production server on the loopback interface and uses a temporary SQLite database. It requires public npm access and port 3187. The default Vitest suite runs offline after setup.

### Live provenance and screenshots

Bash or zsh:

```sh
PACKAGETRUTH_LIVE_NPM=1 npm run test:integration
PACKAGETRUTH_CAPTURE=1 npm run test:e2e
```

PowerShell:

```powershell
$env:PACKAGETRUTH_LIVE_NPM = '1'
npm run test:integration
Remove-Item Env:PACKAGETRUTH_LIVE_NPM

$env:PACKAGETRUTH_CAPTURE = '1'
npm run test:e2e
Remove-Item Env:PACKAGETRUTH_CAPTURE
```

Capture mode updates the landing and verified provenance report images in `docs/screenshots`. Run `npm run build` before capturing. Use [the GitHub Actions runbook](docs/github-actions.md) for workflow validation, and report vulnerabilities through [the private disclosure process](SECURITY.md).
