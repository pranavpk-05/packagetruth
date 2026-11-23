import type { Metadata } from 'next';
import { Archive, Fingerprint, ScanLine } from 'lucide-react';
import { Heading } from '@/components/heading';
import { ScanForm } from '@/components/scan-form';

export const metadata: Metadata = { title: 'Package scan' };
export default function ScanPage() {
  return <>
    <Heading label="PACKAGE SCANNER" title="Scan a package" description="Inspect an exact npm release and review the evidence in its published tarball." />
    <ScanForm mode="scan" />
    <section className="subsection">
      <h2>What the scan checks</h2>
      <ul className="detail-list">
        <li><Fingerprint size={20} /><div><strong>Integrity and registry signatures</strong><p>Match the published digest and verify supported npm registry signatures.</p></div></li>
        <li><Archive size={20} /><div><strong>Archive inventory</strong><p>Record the paths, sizes, SHA-256 digests and executable status of supported files.</p></div></li>
        <li><ScanLine size={20} /><div><strong>Review indicators</strong><p>Flag install hooks, unexpected executables and selected static patterns.</p></div></li>
      </ul>
    </section>
  </>;
}
