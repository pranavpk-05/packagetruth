import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { getReport } from '@/lib/db';
import { Heading } from '@/components/heading';
import { DownloadLink, Pager, pageNumber, releaseLabel } from '@/components/report-detail';
import type { ArtifactFile, Manifest } from '@packagetruth/shared';
import { displayEvidence } from '@packagetruth/shared';

import { assertLocalPage } from '@/lib/local-page';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Artifact evidence' };

function manifestText(manifest: Manifest) {
  return displayEvidence(JSON.stringify(manifest, null, 2), true);
}

export default async function EvidenceDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await assertLocalPage();
  const { id } = await params;
  const report = getReport(id);
  if (!report) notFound();
  const search = await searchParams;
  const comparison = report.kind === 'comparison';
  const view = comparison && (search.view === 'before' || search.view === 'changes') ? search.view : 'after';
  const scanned = comparison ? (view === 'before' ? report.before : report.after) : report;
  const query = typeof search.q === 'string' ? search.q.slice(0, 160) : '';
  const path = `/evidence/${id}`;
  const files: { file: ArtifactFile; change?: string; beforeHash?: string }[] = view === 'changes' && comparison
    ? [
      ...(report.changes?.added ?? []).map(file => ({ file, change: 'Added' })),
      ...(report.changes?.removed ?? []).map(file => ({ file, change: 'Removed' })),
      ...(report.changes?.modified ?? []).map(({ before, after }) => ({ file: after, change: 'Modified', beforeHash: before.sha256 })),
    ]
    : scanned.files.map(file => ({ file }));
  const filtered = files.filter(({ file }) => file.path.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const page = pageNumber(search.page, pages);
  return <>
    <div className="report-header"><Heading label="ARTIFACT EVIDENCE" title={report.package} /><DownloadLink id={id} /></div>
    <p className="release-meta"><code>{releaseLabel(report)}</code></p>
    <div className="report-toolbar"><Link href={`/reports/${id}`} className="text-link"><ArrowLeft size={16} /> Back to report</Link></div>
    {comparison && <nav className="filters" aria-label="Evidence view">
      <Link aria-current={view === 'after' ? 'true' : undefined} href={`${path}?view=after`}>Target</Link>
      <Link aria-current={view === 'before' ? 'true' : undefined} href={`${path}?view=before`}>Baseline</Link>
      <Link aria-current={view === 'changes' ? 'true' : undefined} href={`${path}?view=changes`}>Changed files</Link>
    </nav>}
    {view !== 'changes' && <>
      <section className="subsection">
        <h2>Published artifact</h2>
        <dl className="artifact-data">
          <div><dt>Registry URL</dt><dd><code>{scanned.artifact.url}</code></dd></div>
          <div><dt>Artifact SHA-256</dt><dd><code>{scanned.artifact.sha256}</code></dd></div>
          <div><dt>Published checksum</dt><dd><code>{displayEvidence(scanned.artifact.expectedIntegrity ?? 'Unavailable')}</code></dd></div>
          <div><dt>Compressed size</dt><dd>{scanned.artifact.bytes.toLocaleString('en-US')} bytes</dd></div>
        </dl>
      </section>
      <section className="subsection"><h2>Manifest metadata</h2>
        {scanned.manifest ? <details className="manifest"><summary>Inspect manifest fields</summary><pre>{manifestText(scanned.manifest)}</pre></details>
          : <p>A validated manifest is unavailable.</p>}
      </section>
    </>}
    <section className="subsection">
      <h2>{view === 'changes' ? 'Changed files' : 'File inventory'} <span className="count">{files.length}</span></h2>
      <form action={path} className="file-filter">
        <input type="hidden" name="view" value={view} />
        <label><span className="sr-only">Filter file paths</span><input name="q" placeholder="Filter file paths" maxLength={160} defaultValue={query} /></label>
        <button className="button secondary compact" type="submit"><Search size={16} /> Search</button>
      </form>
      {!filtered.length ? <p className="inline-empty">{query ? 'No files match the filter.' : 'No file evidence is available for this view.'}</p> :
        <ul className="file-list">{filtered.slice((page - 1) * 30, page * 30).map(({ file, change, beforeHash }) =>
          <li key={file.path}><details><summary>
            <code>{displayEvidence(file.path)}</code><span>{change ?? (file.executable ? 'Executable' : '')}</span><span>{file.size.toLocaleString('en-US')} B</span>
          </summary><p>SHA-256 <code>{file.sha256}</code></p>{beforeHash && <p>Baseline SHA-256 <code>{beforeHash}</code></p>}</details></li>)}</ul>}
      <Pager path={path} pages={pages} page={page} query={{ view, q: query }} />
    </section>
  </>;
}
