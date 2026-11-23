import { ScanError } from '@packagetruth/scanner';
import { isLoopbackHost } from './local-host';

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function assertLocal(request: Request): void {
  const host = (request.headers.get('host') ?? '').toLowerCase();
  const origin = request.headers.get('origin');
  if (!isLoopbackHost(host) || request.headers.get('sec-fetch-site') === 'cross-site' ||
      (origin !== null && origin !== `http://${host}` && origin !== `https://${host}`)) {
    throw new RequestError(403, 'This API is available to the local dashboard and local clients.');
  }
}

// Route handlers can be bundled separately in Next. Keep one budget per process.
const processState = globalThis as typeof globalThis & {
  packageTruthBudget?: { readers: number; scans: number; attempts: number[] };
};
const budget = processState.packageTruthBudget ??= { readers: 0, scans: 0, attempts: [] };

export async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new RequestError(415, 'Use application/json for this request.');
  }
  const limit = 4096;
  if (Number(request.headers.get('content-length')) > limit) throw new RequestError(413, 'Request too large.');
  if (budget.readers >= 16) throw new RequestError(429, 'Request capacity reached. Try again shortly.');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const deadline = AbortSignal.timeout(5000);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  budget.readers++;
  deadline.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      if (!item.value.length) continue;
      bytes += item.value.length;
      if (bytes > limit) {
        cancel();
        throw new RequestError(413, 'Request too large.');
      }
      chunks.push(item.value);
    }
  } catch (error) {
    if (deadline.aborted) throw new RequestError(408, 'Request body timed out.');
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'The request body was interrupted.');
  } finally {
    budget.readers--;
    deadline.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  if (deadline.aborted) throw new RequestError(408, 'Request body timed out.');
  try {
    const result: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks, bytes)));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid JSON object');
    return result as Record<string, unknown>;
  } catch {
    throw new RequestError(400, 'Provide a valid JSON object.');
  }
}

export async function boundedScan<T>(operation: () => Promise<T>): Promise<T> {
  const now = performance.now();
  budget.attempts = budget.attempts.filter(attempt => attempt > now - 60_000);
  if (budget.scans >= 2 || budget.attempts.length >= 12) throw new RequestError(429, 'Scan capacity reached. Try again shortly.');
  budget.scans++;
  budget.attempts.push(now);
  try {
    return await operation();
  } finally {
    budget.scans--;
  }
}

export function apiError(error: unknown): Response {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ScanError) {
    const status = error.code === 'INPUT' ? 400 : error.code === 'NOT_FOUND' ? 404 : 502;
    return Response.json({ error: error.message, code: error.code }, { status });
  }
  return Response.json({ error: 'PackageTruth could not complete the operation.' }, { status: 500 });
}
