import { ScanError } from '@packagetruth/scanner';

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function assertLocal(request: Request): void {
  const host = request.headers.get('host') ?? '';
  const origin = request.headers.get('origin');
  if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host) ||
      (origin && origin !== `http://${host}` && origin !== `https://${host}`)) {
    throw new RequestError(403, 'This API is available to the local dashboard and local clients.');
  }
}

export async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new RequestError(415, 'Use application/json for this request.');
  }
  const limit = 4096;
  if (Number(request.headers.get('content-length')) > limit) throw new RequestError(413, 'Request too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'A JSON body is required.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const deadline = AbortSignal.timeout(5000);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  deadline.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > limit) {
        cancel();
        throw new RequestError(413, 'Request too large.');
      }
      chunks.push(item.value);
    }
  } finally {
    deadline.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  if (deadline.aborted) throw new RequestError(408, 'Request body timed out.');
  try {
    const result: unknown = JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid JSON object');
    return result as Record<string, unknown>;
  } catch {
    throw new RequestError(400, 'Provide a valid JSON object.');
  }
}

let active = 0;
let attempts: number[] = [];
export async function boundedScan<T>(operation: () => Promise<T>): Promise<T> {
  const now = Date.now();
  attempts = attempts.filter(attempt => attempt > now - 60_000);
  if (active >= 2 || attempts.length >= 12) throw new RequestError(429, 'Scan capacity reached. Try again shortly.');
  active++;
  attempts.push(now);
  try {
    return await operation();
  } finally {
    active--;
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
