import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const maxBytes = 4 * 1024 * 1024;
const shaPattern = /^[a-f0-9]{40}$/;
const isSha = value => typeof value === 'string' && value.length === 40 && shaPattern.test(value);

async function read(url, limit, request) {
  const response = await request(url, {
    redirect: 'error', signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
  });
  if (!response.ok || !response.body) throw new Error('The public GitHub API could not provide the requested Git object.');
  if (Number(response.headers.get('content-length')) > limit) throw new Error('A GitHub API object exceeded the allowed size.');
  const reader = response.body.getReader();
  const bytes = Buffer.allocUnsafe(limit);
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.length > limit) throw new Error('A GitHub API object exceeded the allowed size.');
      bytes.set(chunk.value, size);
      size += chunk.value.length;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, size)));
}

/** @param {(url: string, init: RequestInit) => Promise<Response>} request */
export async function readPrLock(repo, sha, request = fetch) {
  if (typeof repo !== 'string' || repo !== repo.trim() || !/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,99}$/.test(repo) ||
      !isSha(sha)) throw new Error('Invalid pull request repository or commit.');
  const api = `https://api.github.com/repos/${repo}/git`;
  const commit = await read(`${api}/commits/${sha}`, 128 * 1024, request);
  if (commit?.sha !== sha || !isSha(commit.tree?.sha)) throw new Error('GitHub returned an unexpected commit.');
  const tree = await read(`${api}/trees/${commit.tree.sha}`, 2 * 1024 * 1024, request);
  if (tree?.sha !== commit.tree.sha || tree.truncated !== false || !Array.isArray(tree.tree)) {
    throw new Error('The pull request root tree is incomplete.');
  }
  const entries = tree.tree.filter(item => item?.path === 'package-lock.json');
  const [entry] = entries;
  if (entries.length !== 1 || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) ||
      !isSha(entry.sha) || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > maxBytes) {
    throw new Error('The proposed lockfile is absent, oversized or unsupported.');
  }
  const blob = await read(`${api}/blobs/${entry.sha}`, 6 * 1024 * 1024, request);
  if (blob?.sha !== entry.sha || blob.size !== entry.size || blob.encoding !== 'base64' || typeof blob.content !== 'string') {
    throw new Error('GitHub returned unexpected lockfile metadata.');
  }
  const encoded = blob.content.replace(/\r?\n/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) throw new Error('GitHub returned malformed blob encoding.');
  const digest = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (bytes.length !== entry.size || digest !== entry.sha) throw new Error('The lockfile bytes did not match the expected Git object.');
  return bytes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const bytes = await readPrLock(process.env.HEAD_REPOSITORY, process.env.HEAD_SHA);
    await writeFile(process.argv[2], bytes, { flag: 'wx', mode: 0o600 });
  } catch {
    console.error('Unable to read a bounded lockfile from the pull request commit.');
    process.exitCode = 1;
  }
}
