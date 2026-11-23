import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { Report, Severity } from '@packagetruth/shared';
import { defaultPolicy, severities } from '@packagetruth/shared';

const reportCount = 40;
const maxStoredBytes = 64 * 1024 * 1024;
let singleton: DatabaseSync | undefined;
function database() {
  if (singleton) return singleton;
  const path = process.env.PACKAGETRUTH_DB || resolve(process.cwd(), '../../.data/packagetruth.sqlite');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, kind TEXT NOT NULL, package TEXT NOT NULL, version TEXT NOT NULL,
      completed_at TEXT NOT NULL, findings INTEGER NOT NULL, bytes INTEGER NOT NULL, body TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reports_recent ON reports(completed_at DESC);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  singleton = db;
  return db;
}

export type HistoryItem = { id: string; kind: Report['kind']; package: string; version: string; completed_at: string; findings: number };
export function saveReport(report: Report): string {
  const db = database();
  const id = randomUUID();
  const body = JSON.stringify(report);
  const size = Buffer.byteLength(body);
  const version = report.kind === 'scan' ? report.version : `${report.before.version} → ${report.after.version}`;
  if (size > maxStoredBytes) throw new Error('Report exceeds the persistence limit.');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, report.kind, report.package, version, report.completedAt, report.findings.length, size, body);
    db.prepare(`DELETE FROM reports WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER recent AS position, SUM(bytes) OVER recent AS total
        FROM reports WINDOW recent AS (ORDER BY rowid DESC ROWS UNBOUNDED PRECEDING)
      ) WHERE position > ? OR total > ?
    )`).run(reportCount, maxStoredBytes);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return id;
}

export function isReportId(id: string) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
}
export function getReport(id: string): Report | null {
  if (!isReportId(id)) return null;
  const row = database().prepare('SELECT body FROM reports WHERE id = ?').get(id);
  return row ? JSON.parse(String(row.body)) as Report : null;
}

export function history(): HistoryItem[] {
  return database().prepare('SELECT id, kind, package, version, completed_at, findings FROM reports ORDER BY rowid DESC LIMIT ?')
    .all(reportCount) as HistoryItem[];
}

export function getPolicy(): Severity | 'off' {
  const value = database().prepare('SELECT value FROM settings WHERE key = ?').get('fail-on')?.value;
  return value === 'off' || severities.includes(value as Severity) ? value as Severity | 'off' : defaultPolicy.failOn;
}
export function setPolicy(value: Severity | 'off'): void {
  database().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run('fail-on', value);
}
