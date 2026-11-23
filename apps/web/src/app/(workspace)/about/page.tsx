import { Heading } from '@/components/heading';

export const metadata = { title: 'Methodology' };
export default function AboutPage() {
  return <><Heading label="ABOUT PACKAGETRUTH" title="Methodology"
    description="PackageTruth inspects public npm release artifacts and records what each check can establish." />
    <div className="methodology">
      <section className="subsection"><h2>Registry and byte integrity</h2><p>The scanner looks up an exact release on the public npm registry, downloads its bounded tarball and compares the bytes with the published digest. Supported npm ECDSA signatures bind the release name, version and integrity value using a registry signing key.</p></section>
      <section className="subsection"><h2>Archive and static analysis</h2><p>The scanner decompresses supported tar archives within hard limits. It hashes files, records manifest data and applies rules for install hooks, executables and selected text patterns. Inspected package code is never executed.</p></section>
      <section className="subsection"><h2>Provenance and coverage</h2><p>For supported GitHub Actions builds, PackageTruth verifies the Sigstore bundle, matches the attested SHA-512 to the npm tarball, and checks the source repository, commit and workflow identity against the signing certificate. Compare the verified identity with the source you expect. These checks cannot establish that an npm package is safe.</p></section>
      <section className="subsection"><h2>Local storage</h2><p>Reports and dashboard preferences are stored in SQLite. History keeps up to 40 recent reports within a 64 MiB report data budget. Download JSON to retain evidence independently of local history.</p></section>
    </div>
  </>;
}
