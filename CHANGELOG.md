# Changelog

## Unreleased

- Verify supported npm SLSA v1 Sigstore attestations against the downloaded tarball and Fulcio-authenticated GitHub source and workflow identities.
- Add provenance evidence and explicit unavailable, unsupported, incomplete and invalid results to the CLI, API and dashboard.
- Add offline signed-release fixtures and an opt-in live verification matrix. The Sigstore verifier requires Node.js 24.15+ on the 24.x line or Node.js 26+.

## 0.1.0

- Added npm artifact verification, bounded archive inspection, release diffs and structured evidence.
- Added registry ECDSA signature verification and explicit provenance availability and verification status.
- Added an executable CLI, local Next.js dashboard, SQLite history and configurable review thresholds.
- Added read-only dependency review and quality workflows, deterministic scanner tests and production-browser coverage.
