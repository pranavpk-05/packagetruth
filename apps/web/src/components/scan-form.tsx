'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, LoaderCircle, ScanSearch } from 'lucide-react';

export function ScanForm({ mode }: { mode: 'scan' | 'compare' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [after, setAfter] = useState('');
  const isScan = mode === 'scan';
  const working = isScan ? 'Scanning package…' : 'Comparing releases…';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const payload = isScan ? { name: name.trim(), version: version.trim() } :
        { name: name.trim(), before: version.trim(), after: after.trim() };
      const response = await fetch(`/api/${mode}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === 'string' ? result.error : 'The request could not be completed.');
        setBusy(false);
        return;
      }
      router.push(`/reports/${result.id}`);
      router.refresh();
    } catch {
      setError('The local server could not be reached. Try again.');
      setBusy(false);
    }
  }

  function example() {
    setName(isScan ? 'lodash' : 'is-number');
    setVersion(isScan ? '4.17.21' : '6.0.0');
    setAfter('7.0.0');
    setError('');
  }

  return <form className="operation" onSubmit={submit} aria-busy={busy}>
    <div className="operation-head"><ScanSearch size={20} /><h2>{isScan ? 'Release details' : 'Versions to compare'}</h2></div>
    <div className={isScan ? 'form-grid' : 'form-grid compare-grid'}>
      <label>Package name<input name="name" required maxLength={214} autoCapitalize="none" autoComplete="off" spellCheck={false}
        placeholder="e.g. lodash or @types/node" value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
      <label>{isScan ? 'Exact version' : 'Baseline version'}<input name="version" required maxLength={100} autoComplete="off"
        placeholder={isScan ? 'e.g. 4.17.21' : 'e.g. 6.0.0'} value={version} onChange={event => setVersion(event.target.value)} disabled={busy} /></label>
      {!isScan && <label>Target version<input name="after" required maxLength={100} autoComplete="off"
        placeholder="e.g. 7.0.0" value={after} onChange={event => setAfter(event.target.value)} disabled={busy} /></label>}
    </div>
    <p className="field-hint">Use an exact version from the public npm registry.</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="form-actions">
      <button className="button primary" disabled={busy} type="submit">
        {busy ? <><LoaderCircle className="spin" size={18} />{working}</> :
          <>{isScan ? 'Run scan' : 'Compare versions'} <ArrowRight size={17} /></>}
      </button>
      <button className="button bare" disabled={busy} type="button" onClick={example}>Fill example</button>
    </div>
    <p className="sr-only" role="status">{busy ? working : ''}</p>
  </form>;
}
