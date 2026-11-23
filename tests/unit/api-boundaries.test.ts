import { afterEach, expect, it, vi } from 'vitest';
import { apiError, assertLocal, body, boundedScan } from '../../apps/web/src/lib/api';

afterEach(() => vi.restoreAllMocks());

const url = 'http://127.0.0.1:3187/api/scan';
function request(stream: ReadableStream<Uint8Array>): Request {
  const init = { method: 'POST', body: stream, headers: { 'Content-Type': 'application/json' }, duplex: 'half' };
  return new Request(url, init);
}

it.each([['Host', 'example.invalid'], ['Origin', 'null'], ['Sec-Fetch-Site', 'cross-site']])(
  'rejects a nonlocal browser boundary %s', (header, value) => {
    expect(() => assertLocal(new Request(url, { headers: { Host: '127.0.0.1:3187', [header]: value } }))).toThrow(/local dashboard/);
  },
);

it('caps concurrent request readers and frees them after interruption', async () => {
  const pending = Array.from({ length: 16 }, () => {
    const stream = new TransformStream<Uint8Array>();
    const read = body(request(stream.readable)).catch(apiError);
    return { read, writer: stream.writable.getWriter() };
  });
  const extra = new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
  expect((await body(request(extra)).catch(apiError) as Response).status).toBe(429);
  await Promise.all(pending.map(item => item.writer.abort('fixture interruption')));
  for (const item of pending) expect((await item.read as Response).status).toBe(400);
  const result = await body(new Request(url, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }));
  expect(result).toEqual({});
});

it('cancels a stalled body at the request deadline', async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  const cancel = vi.fn();
  const pending = body(request(new ReadableStream({ cancel }))).catch(apiError);
  expect(timeout).toHaveBeenCalledWith(5000);
  controller.abort();
  expect((await pending as Response).status).toBe(408);
  expect(cancel).toHaveBeenCalledOnce();
});

it('shares one active scan limit across independently evaluated modules', async () => {
  let release = () => {};
  const active = new Promise<void>(resolve => { release = resolve; });
  const first = boundedScan(() => active);
  const second = boundedScan(() => active);
  try {
    vi.resetModules();
    const otherRoute = await import('../../apps/web/src/lib/api');
    expect((await otherRoute.boundedScan(async () => 'excess').catch(otherRoute.apiError) as Response).status).toBe(429);
  } finally {
    release();
    await Promise.all([first, second]);
  }
});
