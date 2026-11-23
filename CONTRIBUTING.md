# Contributing

Use Node.js 24.15+ on the 24.x line or Node.js 26+, and npm. Install project dependencies with `npm ci --ignore-scripts`. Follow [AGENTS.md](AGENTS.md) for workspace conventions.

Keep scanner rules versioned through stable IDs and add inert fixtures for changes to detection or archive handling. Use the deterministic transport for unit and integration tests. Browser tests use the live public npm registry through the production server.

Run these checks before submitting a change.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm exec -- playwright install chromium
npm run test:e2e
```
