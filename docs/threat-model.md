# Threat model

Registry metadata, tarballs, manifest strings, archive paths and proposed lockfiles are untrusted inputs. The application trusts the public npm registry and its HTTPS identity for metadata and signing keys. GitHub workflows also trust the checked-out base, the runner and pinned actions.

| Threat | Control |
| --- | --- |
| Package execution | No production scanner shell, imports, installation, lifecycle execution or extraction |
| Network redirection or truncation | Direct HTTPS to the canonical public npm host and exact artifact paths. Reject redirects, encoded HTTP responses, parser-aborted responses and contradictory content lengths. |
| Resource exhaustion | 15-second deadline per registry request, bounded collectors independent of chunk count, 1 MiB registry JSON, 512 KiB attestation response with bounds on bundle fields, 16 MiB compressed archive, 64 MiB expanded bytes, 16 MiB individual file, 256 KiB manifest, 3,000 tar entries. The scanner rechecks response byte limits at the transport interface. |
| Digest or signature downgrade | Legacy SHA-1 is used only when npm omits its integrity field. Malformed signature metadata or any signature that fails against an applicable current npm key makes the signature check fail. Unavailable key material remains distinct. |
| Attestation substitution | Check the bundled trust snapshot against its reviewed digest. Authenticate the checkpoint, reject conflicting proof fields, bind the logged certificate and subject to the bundle and tarball, and reconcile source claims with Fulcio extensions. |
| Archive ambiguity | Header checksums, one accepted root, regular files and directories only. Reject links, traversal, duplicate paths, conflicting file/directory paths, invisible path controls, and invalid padding or partial blocks. |
| HTML and terminal injection | React text escaping, JSON attachments with a fixed filename format, and terminal escaping for control and bidi characters |
| Local browser abuse | Loopback listener, Host checks on stored-report pages and APIs, Origin and Fetch Metadata checks on APIs, strict UTF-8 and 4 KiB request bodies, up to 16 concurrent JSON readers with a five-second body deadline, and one process-wide scan budget. |
| Pull request code execution | The read-only dependency workflow checks out base code and gets one unambiguous regular lockfile blob from bounded, redirect-free public GitHub requests. It validates policy configuration before review, persists no checkout credentials, and passes no repository secrets. The separate quality workflow intentionally executes pull-request tests on GitHub-hosted runners with read-only repository access. |
| Persistent data growth | Logical report retention by row count and cumulative serialized bytes |

## Residual risk

- Matching a published digest proves the downloaded bytes match that metadata. Legacy SHA-1 is weak and identified in the report. Registry signatures do not attest to package behavior or establish build provenance. The scanner relies on the platform DNS and TLS trust configuration for the fixed npm hostname.
- Provenance verification assumes the integrity of the reviewed public Sigstore trust snapshot, Fulcio, the OIDC issuer, certificate transparency, and the accepted Rekor log. Trust updates require a reviewed snapshot refresh. Verified provenance authenticates the build identity and package bytes under this policy. Operators must independently decide whether that identity is expected. See [provenance scope and trust maintenance](provenance.md).
- Unknown, expired or unavailable npm registry keys can prevent the independent registry signature check.
- Supported archive formats are a constrained subset of tar. PAX extensions, GNU long names, links and other complex formats are rejected. Static analysis uses limited text samples and selected heuristics.
- A lockfile check covers up to 200 changed locations and 12 unique reachable releases. Linked, bundled and non-public registry resolutions are outside independent artifact coverage. Configure the workflow to fail on incomplete coverage when needed.
- The pull request can propose changes to the workflow definition itself. Review workflow changes through repository controls before relying on the job as a mandatory gate.
- The local web application has no authentication, tenant isolation or distributed rate limits. OS-local processes can access it, and the process limits cannot constrain every idle TCP connection. A reverse proxy that rewrites Host changes the trust boundary.
