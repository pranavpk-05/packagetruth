'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Save } from 'lucide-react';
import { severities } from '@packagetruth/shared';
import type { Severity } from '@packagetruth/shared';

export function PolicyForm({ initial }: { initial: Severity | 'off' }) {
  const [value, setValue] = useState<Severity | 'off'>(initial);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch('/api/policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ threshold: value }),
      });
      if (!response.ok) throw new Error('Could not save.');
      setSaved(value);
      setStatus('Policy saved.');
    } catch {
      setError('Could not save the policy. Try again.');
    } finally {
      setBusy(false);
    }
  }
  return <form className="operation policy-form" onSubmit={submit} aria-busy={busy}>
    <label>Review threshold<select value={value} onChange={event => setValue(event.target.value as Severity | 'off')} disabled={busy}>
      {severities.slice().reverse().map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)} and above</option>)}
      <option value="off">Off</option>
    </select></label>
    <p className="field-hint">Saved threshold <strong>{saved}</strong></p>
    <button className="button primary" type="submit" disabled={busy || saved === value}><Save size={17} /> {busy ? 'Saving…' : 'Save policy'}</button>
    <p className="field-hint" role="status">{status}</p>{error && <p className="error-text" role="alert">{error}</p>}
  </form>;
}
