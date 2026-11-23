import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const folder = await mkdtemp(join(tmpdir(), 'packagetruth-browser-'));
try {
  const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, PACKAGETRUTH_E2E_DB: join(folder, 'test.sqlite') },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(folder, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
}
