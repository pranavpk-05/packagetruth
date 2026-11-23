# PackageTruth adversarial security audit

Baseline `2c3a249`. Review scope covered npm transport and metadata, integrity and registry signatures, Sigstore and source identity, the archive reader, CLI lockfile classification, dashboard inputs and stored evidence, SQLite access, and the two GitHub Actions workflows.

## Findings and remediation

| Finding | Fix and regression evidence |
| --- | --- |
| A valid npm signature could mask a failing second signature. Malformed signature fields could be reported as unsupported. | Validate the advertised list before using it and check every signature with an applicable key. Malformed key material remains incomplete, and expired keys remain unsupported. Tests cover valid plus invalid, malformed signatures, and expired or broken keys. |
| An explicitly malformed npm integrity field could fall back to legacy SHA-1. | Use SHA-1 only when npm omits the integrity field. The regression covers absent, empty, null and nonstring integrity values. |
| The Sigstore verifier authenticated the Rekor checkpoint but ignored contradictory tree size and root hash copies in the proof. The local trust snapshot also lacked a runtime integrity check. | Require the proof copies to agree with the authenticated checkpoint and pin the reviewed local trust metadata digest. Tests cover contradictory proof fields, damaged checkpoints, absent authenticated time, invalid signatures, elapsed certificate validity, modified trust metadata and the review deadline. |
| Registry response buffering retained a separate buffer per chunk. The scanner also depended on custom transports honoring byte limits and had no explicit aborted-response guard. | Bound retained buffering, require a completed HTTP message with consistent length, reject redirects and encoded bodies, and recheck byte limits at the scanner boundary. Tests simulate fixed deadlines, interruption, truncation, fragmented delivery and oversize bodies. |
| The tar parser could strip a leading UTF-8 BOM from a path or accept partial trailing zero blocks. | Reject invisible path controls and require complete trailing tar blocks. Tests also cover link and sparse entries, duplicate and conflicting paths, entry and expanded-byte limits, and an inert lifecycle fixture whose execution marker must remain absent. |
| Stored-report pages lacked the local Host check applied to the API. Request readers had a size and deadline but no shared concurrency cap. | Guard report, history, evidence and policy pages. Add one process-wide scan budget and cap concurrent request readers. Tests exercise invalid authority, cross-site API requests, timed-out and interrupted bodies, and separate route module evaluations. |
| The lockfile checker ignored changes to linked or bundled resolution flags. GitHub intake could select the first duplicate root lockfile entry and accept ambiguous encodings. An invalid policy variable could look like nonblocking incomplete coverage. | Track linked and bundled modes as incomplete, require one regular lockfile with exact Git digest and canonical encoding, and reject invalid workflow policy variables before scanning. Tests cover the helper and lockfile classification. |

## Verification

- `npm run typecheck`, `npm run lint`, and `npm run build` passed on Windows with Node.js 26.13.0.
- `npm test` with `PACKAGETRUTH_LIVE_NPM=1` passed all 106 tests in eight files. This includes 47 new deterministic cases and the three existing live npm provenance cases.
- `npm run test:e2e` passed five Chromium tests against the production build, including stored-report Host checks and end-to-end evidence parity.
- `npm audit --audit-level=low` reported zero known vulnerabilities. `git diff --check` passed.
- Local PyYAML and Bash checks passed on both workflows. They covered read-only permissions, pinned actions, credential persistence, checkout ref, shell syntax and accepted and rejected policy values.
- The production GitHub helper retrieved a public npm CLI lockfile and validated its Git blob digest. The verified response contained 437,638 bytes and lockfile version 3.

## Residual risk

- The dashboard is a local application without user accounts or tenant isolation. Processes on the same host can access it. Browser protections assume direct loopback access, and a reverse proxy changes that boundary.
- Registries can omit evidence. The scanner depends on platform DNS and TLS and the configured npm and Sigstore authorities. Provenance authenticates the attested identity, which still needs to be compared with the expected source. The trust snapshot requires periodic review.
- Archive and source coverage remain bounded. Static findings can miss behavior, and supported tar entries are inventoried as logical paths. Linked and bundled lockfile entries are outside independent registry-artifact coverage.
- The dependency review checks out trusted base code and reads a bounded proposed lockfile blob. The separately isolated quality job runs pull-request code with read-only permissions. Changes to the workflow definition itself require repository review controls. Hosted Actions execution is outside this local audit.
