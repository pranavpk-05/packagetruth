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
