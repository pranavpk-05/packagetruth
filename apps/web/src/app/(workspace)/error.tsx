'use client';

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <div className="empty" role="alert"><h1>Workspace unavailable</h1><p>The local workspace could not be loaded.</p>
    <button className="button primary" onClick={reset}>Try again</button></div>;
}
