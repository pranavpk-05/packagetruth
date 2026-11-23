import type { Metadata } from 'next';
import { Heading } from '@/components/heading';
import { HistoryList } from '@/components/history-list';
import { history } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Scan history' };
export default function HistoryPage() {
  return <><Heading label="LOCAL HISTORY" title="Scan history" description="Open a recent scan or release comparison saved on this machine." />
    <HistoryList rows={history()} /></>;
}
