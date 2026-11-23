# Dependency policy fixtures

These are input documents for `lock-check`. The checked-in npm lockfile remains at the repository root.

| Scenario | Proposed change | Expected under the critical threshold |
| --- | --- | --- |
| allow | Add the published tarball and SHA-512 for `semver@7.7.2` | Exit 0, complete coverage, no blocking finding |
| block | Add the same release with a deliberately incorrect SHA-512 | Exit 3, critical `PT-LOCK-001` finding, incomplete coverage |

The inputs are fixed. The offline regression uses the captured public tarball in [the provenance fixtures](../provenance/README.md). The CLI and hosted demo fetch the exact release from npm. The incorrect checksum is synthetic, and the fixtures contain no package code.
