import { notFound } from 'next/navigation';
import { getPolicy, getReport } from '@/lib/db';
import { ReportDetail } from '@/components/report-detail';

import { assertLocalPage } from '@/lib/local-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Evidence report' };

export default async function ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await assertLocalPage();
  const { id } = await params;
  const query = await searchParams;
  const report = getReport(id);
  if (!report) notFound();
  return <ReportDetail report={report} id={id} threshold={getPolicy()} requestedPage={query.page}
    filter={typeof query.severity === 'string' ? query.severity : undefined} />;
}
