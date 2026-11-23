import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { download, limits, readJson } from '../../packages/scanner/src/registry';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('node:https', () => ({ get }));

const url = 'https://registry.npmjs.org/pkg/1.0.0';
beforeEach(() => get.mockReset());
afterEach(() => vi.restoreAllMocks());

function connection(headers: Record<string, string> = {}, statusCode = 200) {
  const response = Object.assign(new EventEmitter(), { statusCode, headers, complete: false, destroy: vi.fn() });
  const request = new EventEmitter();
  get.mockImplementationOnce((_url, _options, callback) => {
    queueMicrotask(() => callback(response));
    return request;
  });
  return { response, request };
}

it.each([301, 307, 308])('rejects redirect HTTP %s after one request', async status => {
  const { response } = connection({ location: 'https://example.invalid/fixture' }, status);
  await expect(download(url, 32)).rejects.toMatchObject({ code: 'REGISTRY' });
  expect(get).toHaveBeenCalledOnce();
  expect(response.destroy).toHaveBeenCalledOnce();
});

it.each(['http://registry.npmjs.org/a', 'https://registry.npmjs.org.example.invalid/a',
  'https://registry.npmjs.org@example.invalid/a', 'https://registry.npmjs.org/a?other=yes',
  'https://registry.npmjs.org/a#note', 'https://registry.npmjs.org/a\\b'])('rejects an untrusted URL before network I/O', async target => {
  await expect(download(target, 32)).rejects.toMatchObject({ code: 'REGISTRY' });
  expect(get).not.toHaveBeenCalled();
});

it('reassembles a successful response delivered in small chunks', async () => {
  const { response } = connection({ 'content-length': '5000' });
  const result = download(url, 5000);
  await Promise.resolve();
  for (let i = 0; i < 5000; i++) response.emit('data', Buffer.from([i % 256]));
  response.complete = true;
  response.emit('end');
  response.emit('close');
  expect(await result).toEqual(Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256)));
});

it('rejects declared and streaming size overruns and compressed HTTP responses', async () => {
  const declared = connection({ 'content-length': '11' });
  await expect(download(url, 10)).rejects.toMatchObject({ code: 'LIMIT' });
  expect(declared.response.destroy).toHaveBeenCalledOnce();
  const streamed = connection();
  const result = download(url, 10);
  await Promise.resolve();
  streamed.response.emit('data', Buffer.alloc(8));
  streamed.response.emit('data', Buffer.alloc(3));
  await expect(result).rejects.toMatchObject({ code: 'LIMIT' });
  expect(streamed.response.destroy).toHaveBeenCalledOnce();
  connection({ 'content-encoding': 'gzip' });
  await expect(download(url, 10)).rejects.toMatchObject({ code: 'REGISTRY' });
});

it.each(['aborted', 'close', 'end'])('rejects an interrupted registry response on %s', async event => {
  const { response } = connection({ 'content-length': '4' });
  const result = download(url, 10);
  await Promise.resolve();
  response.emit('data', Buffer.from('ok'));
  // Even a clean parser completion cannot override a contradictory declared length.
  response.complete = event === 'end';
  response.emit(event);
  await expect(result).rejects.toThrow(/interrupted/);
});

it('propagates a fixed deadline to the HTTPS request and reports a timeout', async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
  let requestSignal: AbortSignal | undefined;
  get.mockImplementationOnce((_url, options) => {
    const request = new EventEmitter();
    requestSignal = options.signal;
    requestSignal!.addEventListener('abort', () => request.emit('error', new Error('aborted')));
    return request;
  });
  const result = download(url, 32);
  expect(timeout).toHaveBeenCalledWith(limits.requestMs);
  expect(requestSignal).toBe(controller.signal);
  controller.abort();
  await expect(result).rejects.toThrow(/timed out/);
});

it('enforces metadata size and UTF-8 even when a custom transport is used', async () => {
  await expect(readJson(async () => Buffer.alloc(limits.metadata + 1), url)).rejects.toMatchObject({ code: 'LIMIT' });
  const bytes = Buffer.concat([Buffer.from('{"title":"'), Buffer.from([0xff]), Buffer.from('"}')]);
  await expect(readJson(async () => bytes, url)).rejects.toThrow(/invalid JSON/);
});
