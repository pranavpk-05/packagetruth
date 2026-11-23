import Link from 'next/link';
import { ArrowLeft, ArrowRight, Download, FileSearch, ShieldAlert } from 'lucide-react';
import { displayEvidence, meetsPolicy, provenanceEvidenceLabels, provenanceLabels, severities,
  verificationLabels } from '@packagetruth/shared';
import type { Check, ProvenanceEvidence, Report, ScanReport, Severity } from '@packagetruth/shared';
import { Heading } from './heading';

export const labels = { integrity: 'Artifact integrity', registrySignature: 'Registry signature', provenance: 'Provenance',
  archive: 'Archive inspection', manifest: 'Manifest identity' };
export const releaseLabel = (report: Report) => report.kind === 'scan' ? report.version : `${report.before.version} → ${report.after.version}`;

export function DownloadLink({ id }: { id: string }) {
  return <a className="button secondary compact" href={`/api/reports/${id}`}><Download size={16} /> Download JSON</a>;
}

export function CheckList({ report }: { report: ScanReport }) {
  const { provenance } = report.checks;
  return <div className="check-panel">
    <h3><code>{report.version}</code></h3>
    <dl>{(Object.entries(report.checks) as [keyof typeof labels, Check][]).map(([key, check]) => {
      const statusLabels = key === 'provenance' ? provenanceLabels : verificationLabels;
      return <div key={key}><dt>{labels[key]}<span className={`status status-${check.status}`}>{statusLabels[check.status]}</span></dt>
        <dd>{displayEvidence(check.detail)}
          {key === 'provenance' && provenance.status === 'verified' && provenance.evidence &&
            <details className="provenance-identity">
              <summary>Verified build identity</summary>
              <dl>{(Object.entries(provenanceEvidenceLabels) as [keyof ProvenanceEvidence, string][]).map(([field, label]) => {
                const value = provenance.evidence?.[field];
                return value ? <div key={field}><dt>{label}</dt><dd><code>{displayEvidence(value)}</code></dd></div> : null;
              })}</dl>
            </details>}
        </dd></div>;
    })}</dl>
  </div>;
}

export function Pager({ path, page, pages, query }: { path: string; page: number; pages: number; query?: Record<string, string> }) {
  if (pages < 2) return null;
  const link = (target: number) => `${path}?${new URLSearchParams({ ...query, page: String(target) })}`;
  return <nav className="pager" aria-label="Pagination">
    {page > 1 && <Link href={link(page - 1)}><ArrowLeft size={15} /> Previous</Link>}
    <span>Page {page} of {pages}</span>
    {page < pages && <Link href={link(page + 1)}>Next <ArrowRight size={15} /></Link>}
  </nav>;
}

export function pageNumber(value: string | string[] | undefined, pages: number) {
  return typeof value === 'string' && /^\d{1,6}$/.test(value) ? Math.min(pages, Math.max(1, Number(value))) : 1;
}

export function ReportDetail({ id, report, threshold, filter, requestedPage }: {
  id: string; report: Report; threshold: Severity | 'off'; filter: string | undefined; requestedPage: string | string[] | undefined;
}) {
  const selected = severities.includes(filter as Severity) ? filter! : 'all';
  const filtered = selected === 'all' ? report.findings : report.findings.filter(item => item.severity === selected);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const page = pageNumber(requestedPage, pages);
  const path = `/reports/${id}`;
  const scans = report.kind === 'comparison' ? [report.before, report.after] : [report];
  const failed = meetsPolicy(report.findings, threshold);
  return <>
    <div className="report-header">
      <Heading label={report.kind === 'scan' ? 'SCAN REPORT' : 'COMPARISON REPORT'} title={report.package} />
      <DownloadLink id={id} />
    </div>
    <p className="release-meta"><code>{releaseLabel(report)}</code><span>Completed <time dateTime={report.completedAt}>{report.completedAt.slice(0, 16).replace('T', ' ')} UTC</time></span></p>
    <div className="report-toolbar">
      <Link className="text-link" href={`/evidence/${id}`}><FileSearch size={17} /> Explore artifact evidence <ArrowRight size={15} /></Link>
      <span className={`status ${failed ? 'status-failed' : 'status-neutral'}`}>{threshold === 'off' ? 'Policy off' : failed ? 'Policy threshold met' : 'Below policy threshold'}</span>
    </div>
    <section className="subsection">
      <h2>Verification checks</h2>
      <div className={scans.length === 2 ? 'checks comparison' : 'checks'}>{scans.map(scan => <CheckList report={scan} key={scan.version} />)}</div>
    </section>
    {report.kind === 'comparison' && <section className="subsection">
      <h2>File changes</h2>
      {report.changes ? <div className="counts">
        <span><strong>{report.changes.added.length}</strong> Added</span>
        <span><strong>{report.changes.removed.length}</strong> Removed</span>
        <span><strong>{report.changes.modified.length}</strong> Modified</span>
        <Link href={`/evidence/${id}?view=changes`} className="text-link">View changes <ArrowRight size={15} /></Link>
      </div> : <p>File comparison unavailable because one or both archive inspections did not complete.</p>}
    </section>}
    <section className="subsection" id="findings">
      <h2>Findings <span className="count">{report.findings.length}</span></h2>
      <p className="caveat"><ShieldAlert size={18} /> {report.limitations[0]}</p>
      {report.findings.length > 0 && <nav className="filters" aria-label="Filter findings by severity">
        {['all', ...severities.slice().reverse()].map(severity => <Link key={severity}
          aria-current={severity === selected ? 'true' : undefined} href={`${path}?severity=${severity}#findings`}>{severity}</Link>)}
      </nav>}
      {filtered.length === 0 ? <p className="inline-empty">No findings {selected === 'all' ? 'were recorded' : 'match this severity'}.</p> :
        <ul className="findings">{filtered.slice((page - 1) * 20, page * 20).map((item, index) =>
          <li key={`${item.ruleId}:${item.path}:${index}`}>
            <div className="finding-label"><span className={`status severity-${item.severity}`}>{item.severity}</span><code>{item.ruleId}</code></div>
            <code className="finding-path">{displayEvidence(item.path)}</code>
            <p>{item.explanation}</p>
            <pre dir="ltr">{displayEvidence(item.evidence)}</pre>
            <p className="review-action"><strong>Review action</strong> {item.action}</p>
          </li>)}</ul>}
      <Pager path={path} page={page} pages={pages} query={{ severity: selected }} />
    </section>
    <section className="subsection">
      <h2>Scope and limitations</h2><ul className="prose-list">{report.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
  </>;
}
