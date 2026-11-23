import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3187';
const database = process.env.PACKAGETRUTH_E2E_DB;
if (!database) throw new Error('Run npm run test:e2e to create an isolated test database.');
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 45_000 },
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run start -w @packagetruth/web -- --port 3187', url: baseURL, timeout: 45_000,
    env: { PACKAGETRUTH_DB: database, NEXT_TELEMETRY_DISABLED: '1' } },
});
