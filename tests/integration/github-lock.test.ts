import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { readPrLock } from '../../scripts/read-pr-lock.mjs';

const commitSha = 'a'.repeat(40);
const treeSha = 'b'.repeat(40);
const bytes = Buffer.from('{"lockfileVersion":3,"packages":{}}');
const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function transport(mode = '100644', size = bytes.length, data = bytes) {
  return vi.fn(async (url: string) => {
    if (url.endsWith(commitSha)) return Response.json({ sha: commitSha, tree: { sha: treeSha } });
    if (url.endsWith(treeSha)) return Response.json({ sha: treeSha, truncated: false, tree: [
      { path: 'package-lock.json', type: 'blob', mode, size, sha },
    ] });
    return Response.json({ sha, size: bytes.length, encoding: 'base64', content: data.toString('base64') });
  });
}

it('uses only bounded GitHub object requests and checks the lockfile bytes', async () => {
  const request = transport();
  expect(await readPrLock('owner/repo', commitSha, request)).toEqual(bytes);
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    `https://api.github.com/repos/owner/repo/git/commits/${commitSha}`,
    `https://api.github.com/repos/owner/repo/git/trees/${treeSha}`,
    `https://api.github.com/repos/owner/repo/git/blobs/${sha}`,
  ]);
});

it.each([['120000', 32], ['100644', 4 * 1024 * 1024 + 1]])('rejects a nonregular or oversized lockfile before download', async (mode, size) => {
  const request = transport(mode, size);
  await expect(readPrLock('owner/repo', commitSha, request)).rejects.toThrow(/absent, oversized or unsupported/);
  expect(request).toHaveBeenCalledTimes(2);
});

it('rejects unexpected Git blob content', async () => {
  await expect(readPrLock('owner/repo', commitSha, transport('100644', bytes.length, Buffer.alloc(bytes.length))))
    .rejects.toThrow(/did not match/);
});

it('rejects a malformed repository or commit before issuing requests', async () => {
  const request = transport();
  for (const [repo, ref] of [['owner/repo\n', commitSha], ['owner/repo', commitSha + '\n']]) {
    await expect(readPrLock(repo, ref, request)).rejects.toThrow(/Invalid pull request/);
  }
  expect(request).not.toHaveBeenCalled();
});

it('requires a unique regular lockfile and rejects ambiguous tree entries', async () => {
  const entry = { path: 'package-lock.json', type: 'blob', mode: '100644', size: bytes.length, sha };
  const request = transport();
  request.mockImplementationOnce(async () => Response.json({ sha: commitSha, tree: { sha: treeSha } }));
  request.mockImplementationOnce(async () => Response.json({ sha: treeSha, truncated: false, tree: [entry, entry] }));
  await expect(readPrLock('owner/repo', commitSha, request)).rejects.toThrow(/absent, oversized or unsupported/);
  expect(request).toHaveBeenCalledTimes(2);
});

it('rejects malformed GitHub blob encoding while accepting normal folded base64', async () => {
  for (const malformed of [false, true]) {
    const request = transport();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async url => {
      if (!url.endsWith(sha)) return original(url);
      const base64 = bytes.toString('base64');
      const content = base64.slice(0, 8) + (malformed ? '!' : '\n') + base64.slice(8);
      return Response.json({ sha, size: bytes.length, encoding: 'base64', content });
    });
    if (malformed) await expect(readPrLock('owner/repo', commitSha, request)).rejects.toThrow(/malformed blob encoding/);
    else expect(await readPrLock('owner/repo', commitSha, request)).toEqual(bytes);
  }
});
