# Detection rules

Rules are static checks. Evidence is bounded. Review severity is a policy input and cannot establish malicious intent.

| ID | Severity | Evidence |
| --- | --- | --- |
| PT-INTEGRITY-001 | Critical | Download differs from the strongest supported published digest |
| PT-INTEGRITY-002 | Medium | No usable published digest |
| PT-SIGNATURE-001 | High | Signature does not match the release tuple with an applicable supported npm key |
| PT-PROVENANCE-001 | High | Advertised provenance fails format, authenticity, digest or source identity checks |
| PT-ARCHIVE-001 | High | Archive format, limits or structure prevent inspection |
| PT-MANIFEST-001 | High | Manifest cannot be validated against the requested release |
| PT-SCRIPT-001 | Medium | Install-related lifecycle hook or potential npm default node-gyp hook |
| PT-CODE-001 | Medium | Possible process execution API in sampled source text |
| PT-CODE-002 | Low | Dynamic evaluation indicator in sampled source text |
| PT-CODE-003 | High | Download-to-shell pattern in sampled source text |
| PT-NATIVE-001 | Medium | Native or WebAssembly file extension or recognized executable header |
| PT-EXEC-001 | Medium | Executable mode or shebang outside declared npm bin paths |
| PT-DIFF-001 | Medium | Changed install lifecycle hook |
| PT-DIFF-002 | Medium | New executable file, execute mode or shebang |
| PT-DIFF-003 | Low | Added, removed or changed dependency declaration |
| PT-DIFF-004 | Low | Changed selected manifest field or bin mapping |
| PT-LOCK-001 | Critical | Lockfile digest differs from a registry-verified artifact |

Comparisons include target release indicators and baseline integrity, signature, provenance, archive or manifest issues. Both underlying release reports are included. The comparison records file contents and executable status. Selected manifest object values preserve key order because order can affect npm export resolution.
