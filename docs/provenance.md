# npm provenance verification

PackageTruth retrieves attestations only when npm advertises an attestation endpoint for the exact release and the downloaded tarball matches a published registry checksum. It derives the permitted URL from the package and version and checks the advertised URL against it. Requests use the scanner’s direct HTTPS transport, reject redirects, time out after 15 seconds and enforce a 512 KiB response cap.

## Supported profile

- SLSA v1, in-toto Statement v1, one DSSE signature and one subject. The subject must be the exact npm package URL and its SHA-512 must match the compressed bytes PackageTruth downloaded.
- The npm GitHub Actions build type, public Fulcio, and the GitHub Actions OIDC issuer. Sigstore bundle versions 0.1, 0.2 and 0.3 are supported with Rekor v1 **intoto 0.0.2** or **dsse 0.0.1** entries. Each entry needs an inclusion proof with a signed checkpoint. The verifier also requires a certificate transparency SCT and an authenticated signing time.
- The upstream Sigstore JS verifier checks the DSSE signature, certificate path and validity at the authenticated timestamp, certificate transparency evidence, and the Rekor inclusion proof and entry. PackageTruth also matches the exact certificate in the authenticated log entry to the bundle signer.
- The certificate’s OIDC issuer, source repository, ref and source SHA must agree with the authenticated statement and its resolved source dependency. The certificate SAN identifies the signing workflow. When Fulcio includes a build config URI, it must match the statement’s caller workflow. This supports reusable workflows with distinct caller and signer identities. Stable repository ID and workflow commit fields are reported when the certificate supplies them.

| Report status | Meaning |
| --- | --- |
| `verified` | Verified provenance. The cryptographic checks, tarball binding and GitHub identity checks passed. |
| `failed` | Invalid provenance. The data is malformed, ambiguous, untrusted under the current snapshot, or failed a signature, digest or identity check. This produces `PT-PROVENANCE-001`. |
| `absent` | Provenance unavailable. npm advertised no attestations or the response contained no provenance. |
| `unsupported` | Unsupported attestation. The predicate, build type, bundle or log profile is outside the supported scope. |
| `not-tested` | Verification incomplete. A prerequisite, download, current trust snapshot or required identity is unavailable. |

The structured `checks.provenance.evidence` object appears only after successful verification. Existing reports keep their original recorded status. Rescan to apply the new checks to an older report.

## Trust and interpretation

Verified provenance establishes which GitHub Actions identity attested to the bytes. PackageTruth has no administrator-provided source allowlist, so compare the reported repository, workflow and commit with the expected release process. The verifier derives no authority from npm's or the manifest's repository field. This check does not verify npm's separate publish receipt, retrieve repository content, establish current repository ownership or visibility, or check reproducibility. It does not provide a safety verdict. A registry that withholds metadata can suppress evidence of an attestation.

The scanner uses a checked-in snapshot of the Sigstore public `trusted_root.json` authenticated by upstream `@sigstore/tuf@5.0.1` on 2026-11-23 against the official [Sigstore TUF mirror](https://tuf-repo-cdn.sigstore.dev). It used TUF root version 16, targets version 14 and snapshot version 166. The SHA-256 of the unmodified target is `6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66`. The scan path performs no trust-root networking. It reports incomplete verification on or after **2027-02-21 UTC** until the snapshot is reviewed and refreshed. Key rotations or revocations between reviews may require an earlier update.

To refresh the trust snapshot, use a maintained `@sigstore/tuf` release in a disposable environment. Call `initTUF()` against the default public mirror, then use `getTarget('trusted_root.json')` on the refreshed client. Record the verified metadata versions and target SHA-256, review trust changes, update the bundled JSON, snapshot identifier and review deadline, and run offline and live tests. Do not use a trust root supplied by a package or an unsigned copy from a bundle.

- [npm provenance verification design](https://github.com/npm/provenance)
- [Sigstore JS verifier](https://github.com/sigstore/sigstore-js/tree/main/packages/verify)
- [Fulcio identity extensions](https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md)
