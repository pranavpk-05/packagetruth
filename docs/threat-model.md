# Threat model

Registry metadata, tarballs, manifest strings, archive paths and proposed lockfiles are untrusted inputs. The application trusts the public npm registry and its HTTPS identity for metadata and signing keys. GitHub workflows also trust the checked-out base, the runner and pinned actions.

| Threat | Control |
| --- | --- |
| Package execution | No production scanner shell, imports, installation, lifecycle execution or extraction |
| Network redirection | Direct HTTPS to the canonical public npm host and exact tarball path, with redirects rejected |
| Resource exhaustion | 15-second deadline per registry request, 1 MiB registry JSON, 512 KiB attestation response with bounds on bundle fields, 16 MiB compressed archive, 64 MiB expanded bytes, 16 MiB individual file, 256 KiB manifest, 3,000 tar entries |
| Attestation substitution | Permit only the exact npm attestation endpoint, verify against a reviewed public Sigstore trust snapshot, bind the logged certificate and signed subject to the bundle and tarball, and reconcile source claims with Fulcio extensions |
| Archive ambiguity | Header checksums, one accepted root, regular files and directories only, rejection of links, traversal, duplicate paths, invalid padding and conflicting file/directory paths |
| HTML and terminal injection | React text escaping, JSON attachments with a fixed filename format, and terminal escaping for control and bidi characters |
| Local browser abuse | Loopback listener, Host and Origin restrictions on APIs, JSON size and body deadline, scan concurrency and submission limits |
| Pull request code execution | The read-only dependency workflow checks out base code. It uses bounded public GitHub API requests for the proposed commit and tree metadata and the single regular lockfile blob. It passes no repository secrets. |
| Persistent data growth | Logical report retention by row count and cumulative serialized bytes |

## Residual risk

- Matching a published digest proves the downloaded bytes match that metadata. Legacy SHA-1 is weak and identified in the report. Registry signatures do not attest to package behavior or establish build provenance.
- Provenance verification assumes the integrity of the reviewed public Sigstore trust snapshot, Fulcio, the OIDC issuer, certificate transparency, and the accepted Rekor log. Trust updates require a reviewed snapshot refresh. Verified provenance authenticates the build identity and package bytes under this policy. Operators must independently decide whether that identity is expected. See [provenance scope and trust maintenance](provenance.md).
- Unknown, expired or unavailable npm registry keys can prevent the independent registry signature check.
- Supported archive formats are a constrained subset of tar. PAX extensions, GNU long names, links and other complex formats are rejected. Static analysis uses limited text samples and selected heuristics.
- A lockfile check covers up to 200 changed locations and 12 unique reachable releases. Non-public registry resolutions and missing evidence are reported as incomplete. Configure the workflow to fail on incomplete coverage when needed.
- The pull request can propose changes to the workflow definition itself. Review workflow changes through repository controls before relying on the job as a mandatory gate.
- The local web application has no authentication, tenant isolation or distributed rate limits. The server owner and other local processes can access it.
