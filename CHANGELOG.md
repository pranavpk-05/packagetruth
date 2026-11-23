# Changelog

## v0.1.0

Initial public release candidate. Publication is pending.

### Added

- Verify exact public npm artifacts against published integrity digests and supported npm ECDSA signatures.
- Inspect bounded tar streams, report per-file digests and manifest evidence, and compare file, install hook and dependency changes between versions.
- Verify supported Sigstore SLSA v1 provenance, including tarball identity and Fulcio-authenticated GitHub source and workflow claims.
- Provide human-readable and JSON CLI reports, severity thresholds, and lockfile evidence.
- Provide a loopback dashboard with artifact evidence, release comparisons, SQLite history, JSON export and local review policy.
- Add read-only dependency evidence and quality workflows, plus manual policy demonstration scenarios with fixture-backed regressions.

### Security and compatibility

- Apply registry destination and size limits, reject ambiguous archives and contradictory transparency proof fields, and check the trust snapshot digest and review deadline.
- Distinguish invalid, absent, unsupported and incomplete verification. Keep linked and bundled lockfile resolutions visible as incomplete coverage.
- Support Node.js 24.15+ on the 24.x line or Node.js 26+. See [release readiness](docs/release-readiness.md) for tested environments and pending hosted checks.
