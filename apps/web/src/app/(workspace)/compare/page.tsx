import type { Metadata } from 'next';
import { Heading } from '@/components/heading';
import { ScanForm } from '@/components/scan-form';

export const metadata: Metadata = { title: 'Version comparison' };
export default function ComparePage() {
  return <>
    <Heading label="RELEASE DIFF" title="Compare versions" description="Review changes between two exact releases of the same npm package." />
    <ScanForm mode="compare" />
    <section className="subsection">
      <h2>Comparison evidence</h2>
      <p>PackageTruth checks both artifacts independently, then identifies added, removed and modified files, changes to install hooks, executable files, dependency declarations and selected manifest fields.</p>
    </section>
  </>;
}
