# Security policy

Report suspected PackageTruth vulnerabilities privately using the repository’s GitHub private vulnerability reporting feature when available. Share the affected version, impact and a minimal inert example. Keep credentials and private package data out of reports.

PackageTruth analyzes npm tarballs without installing, importing or executing them. It makes direct requests to the public npm registry. The local dashboard binds to loopback and has no accounts or authentication. Avoid exposing it through a public reverse proxy.

Findings are review evidence. Matching published digests establish byte consistency, and supported signatures verify signed registry metadata. Static checks cannot establish whether a package is safe. See [the threat model](docs/threat-model.md).
