# Security policy

Report suspected PackageTruth vulnerabilities privately using the repository’s GitHub private vulnerability reporting feature when available. Share the affected version, impact and a minimal inert example. Keep credentials and private package data out of reports.

PackageTruth analyzes npm tarballs in memory without installing, importing, extracting or executing them. The scanner makes bounded, deadline-controlled HTTPS requests to the public npm registry and rejects redirects and incomplete responses. The dashboard binds to loopback and restricts both API calls and stored-report pages to local Host values. Dashboard data is accessible to other processes on the same machine. Keep the listener private.

Findings are review evidence. Matching published digests establish byte consistency, supported registry signatures verify signed metadata, and verified provenance authenticates the attested build identity. Compare that identity with the expected source. Static checks cannot establish whether a package is safe. See [the threat model](docs/threat-model.md) and [provenance limitations](docs/provenance.md).

The dependency review workflow checks out the base revision and reads the proposed lockfile as bounded data. The separate quality workflow builds and tests pull-request code with read-only repository access. Review workflow changes before using a pull-request check as a required security gate.

See the [adversarial security audit](docs/security-audit.md) for the fixes, regression coverage and verification results.
