import Link from 'next/link';
import { ArrowDown, ArrowRight, Archive, Fingerprint, GitCompareArrows, ShieldCheck, Terminal } from 'lucide-react';

const capabilities = [
  { icon: Fingerprint, title: 'Artifact integrity', description: 'Match the downloaded tarball against the exact release’s published npm digest.' },
  { icon: GitCompareArrows, title: 'Release comparison', description: 'Track added, modified and removed files, install hooks, and dependency changes.' },
  { icon: ShieldCheck, title: 'Verification status', description: 'See registry signature verification and the availability of provenance evidence.' },
];

export default function Home() {
  return <main id="main">
    <section className="hero">
      <div className="hero-art" aria-hidden="true" />
      <div className="site-width hero-inner">
        <div className="hero-copy">
          <p className="eyebrow"><span className="signal" /> SOFTWARE SUPPLY CHAIN SECURITY</p>
          <h1>Know what’s in<br />your <em>packages.</em></h1>
          <p className="hero-description">Verify npm artifacts, compare releases, and inspect the evidence before adding a dependency.</p>
          <div className="actions">
            <Link className="button primary" href="/scan">Scan a package <ArrowRight size={18} /></Link>
            <Link className="button secondary" href="/compare">Compare releases</Link>
          </div>
        </div>
        <div className="hero-caption" aria-hidden="true"><Archive size={15} /> npm artifact inspection</div>
      </div>
    </section>
    <section className="capabilities site-width" aria-label="Scanner capabilities">
      {capabilities.map(({ icon: Icon, title, description }) => <article key={title}>
        <Icon size={22} className="accent" aria-hidden="true" /><h2>{title}</h2><p>{description}</p>
      </article>)}
    </section>
    <section className="workflow site-width">
      <div><p className="eyebrow"><Terminal size={15} /> COMMAND LINE</p>
        <h2>Use the same scanner<br />from your terminal.</h2>
        <Link href="/about" className="text-link">Read the methodology <ArrowRight size={16} /></Link>
      </div>
      <div className="code-example">
        <div><Terminal size={15} /> packagetruth</div>
        <pre><span>$</span> packagetruth scan lodash@4.17.21 --json{'\n'}<span>$</span> packagetruth compare is-number 6.0.0 7.0.0</pre>
        <Link href="/scan" className="text-link">Open scanner <ArrowDown size={15} /></Link>
      </div>
    </section>
  </main>;
}
