# PackageTruth repository instructions

- Use npm workspaces and Node.js 24.15+ on the 24.x line or Node.js 26+. Install with `npm ci --ignore-scripts`.
- Keep evidence types and policy in shared, registry and artifact logic in scanner, and CLI and web as consumers.
- Treat artifacts, registry metadata and lockfiles as untrusted. Never execute inspected code, install inspected dependencies, extract archives to disk, follow redirects or accept custom registry destinations.
- Retain structured findings with stable rule IDs and separate byte integrity, registry signatures, provenance and heuristics.
- Verify npm provenance with upstream Sigstore libraries and the reviewed public trust snapshot. Treat bundle, registry and manifest identity strings as untrusted until verified.
- Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` before reporting a complete change.
- Use inert fixture data and a local test transport for deterministic verification. Keep credentials, caches and scan databases out of Git.
