import '@fontsource-variable/space-grotesk';
import './styles.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Boxes } from 'lucide-react';

export const metadata: Metadata = {
  title: { default: 'PackageTruth — npm release evidence', template: '%s | PackageTruth' },
  description: 'Verify npm artifact integrity, compare releases, and review evidence before installing.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <a href="#main" className="skip">Skip to content</a>
    <header className="topbar">
      <div className="top-inner">
        <Link href="/" className="brand" aria-label="PackageTruth home"><span className="brand-mark"><Boxes size={20} /></span>Package<span>Truth</span></Link>
        <nav aria-label="Main navigation" className="top-nav">
          <Link href="/scan">Scanner</Link>
          <Link href="/compare">Compare</Link>
          <Link href="/history">History</Link>
        </nav>
        <Link href="/about" className="top-link">Methodology <ArrowUpRight size={15} /></Link>
      </div>
    </header>
    {children}
    <footer className="footer">
      <div className="footer-inner"><span>PackageTruth <span className="faint">/</span> npm release evidence</span>
        <nav aria-label="Footer"><Link href="/policies">Policies</Link><Link href="/about">Methodology</Link></nav>
      </div>
    </footer>
  </body></html>;
}
