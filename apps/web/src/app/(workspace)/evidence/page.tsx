import type { Metadata } from 'next';
import { Heading } from '@/components/heading';
import { HistoryList } from '@/components/history-list';
import { history } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Evidence explorer' };
export default function EvidencePage() {
  return <><Heading label="EVIDENCE EXPLORER" title="Browse evidence" description="Choose a report to inspect artifact hashes, file inventories, manifest details and findings." />
    <HistoryList rows={history()} evidence /></>;
}
