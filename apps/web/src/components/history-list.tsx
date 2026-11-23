import Link from 'next/link';
import { ArrowRight, Archive, GitCompareArrows, ScanSearch } from 'lucide-react';
import type { HistoryItem } from '@/lib/db';

export function HistoryList({ rows, evidence }: { rows: HistoryItem[]; evidence?: boolean }) {
  if (!rows.length) return <div className="empty"><Archive size={28} /><h2>No reports yet</h2>
    <p>Run an npm scan or comparison to create your first evidence report.</p>
    <Link className="button primary" href="/scan">Scan a package <ArrowRight size={16} /></Link>
  </div>;
  return <ul className="history-list">
    {rows.map(row => {
      const Icon = row.kind === 'scan' ? ScanSearch : GitCompareArrows;
      return <li key={row.id}><Link href={`${evidence ? '/evidence' : '/reports'}/${row.id}`}>
        <span className="row-icon"><Icon size={19} /></span>
        <span className="history-name"><strong>{row.package}</strong><code>{row.version}</code></span>
        <span className="history-findings">{row.findings} {row.findings === 1 ? 'finding' : 'findings'}</span>
        <time dateTime={row.completed_at}>{row.completed_at.slice(0, 10)} <span>UTC</span></time>
        <ArrowRight size={17} className="history-arrow" />
      </Link></li>;
    })}
  </ul>;
}
