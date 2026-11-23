import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { ComparisonReport, ScanReport } from '@packagetruth/shared';

test('scan, browse files, download evidence, and reopen the report in history', async ({ page, request }) => {
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'No reports yet' })).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /know what’s in your packages/i })).toBeVisible();
  if (process.env.PACKAGETRUTH_CAPTURE === '1') {
    mkdirSync('docs/screenshots', { recursive: true });
    await page.screenshot({ path: 'docs/screenshots/landing.png', animations: 'disabled' });
  }
  await page.getByRole('link', { name: 'Scan a package' }).click();
  await page.getByRole('button', { name: 'Fill example' }).click();
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/scan') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run scan' }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const result: { id: string; report: ScanReport } = await response.json();
  await expect(page.getByRole('heading', { name: 'lodash', exact: true })).toBeVisible();
  await expect(page.getByText('Artifact integrity')).toBeVisible();
  expect(result.report.checks.integrity.status).toBe('verified');

  const cli: ScanReport = JSON.parse(execFileSync(process.execPath, ['packages/cli/dist/index.js', 'scan', 'lodash@4.17.21', '--json'],
    { encoding: 'utf8', timeout: 45_000 }));
  expect(result.report.findings).toEqual(cli.findings);
  expect(result.report.artifact.sha256).toBe(cli.artifact.sha256);
  await expect(page.getByRole('heading', { name: `Findings ${cli.findings.length}` })).toBeVisible();
  await expect(page.getByText(/are not a safety verdict/).first()).toBeVisible();
  if (process.env.PACKAGETRUTH_CAPTURE === '1') {
    await page.screenshot({ path: 'docs/screenshots/scan-report.png', animations: 'disabled', fullPage: true });
  }
  const evidence = await request.get(`/api/reports/${result.id}`);
  expect(evidence.headers()['content-disposition']).toContain('attachment');
  expect(await evidence.json()).toEqual(result.report);

  await page.getByRole('link', { name: 'Explore artifact evidence' }).click();
  await page.getByRole('textbox', { name: 'Filter file paths' }).fill('package.json');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.file-list summary').filter({ hasText: 'package.json' })).toHaveCount(1);
  await page.locator('.file-list summary').filter({ hasText: 'package.json' }).click();
  await expect(page.locator('.file-list').getByText(/SHA-256/)).toBeVisible();
  await page.getByRole('link', { name: 'Scan history', exact: true }).click();
  await expect(page.getByRole('link', { name: /lodash.*4.17.21/ })).toBeVisible();
});

test('compare releases and persist a policy used by the report', async ({ page }) => {
  await page.goto('/policies');
  await page.getByLabel('Review threshold').selectOption('low');
  await page.getByRole('button', { name: 'Save policy' }).click();
  await expect(page.getByRole('status')).toHaveText('Policy saved.');
  await page.reload();
  await expect(page.getByLabel('Review threshold')).toHaveValue('low');
  await page.getByRole('link', { name: 'Version comparison' }).click();
  await page.getByRole('button', { name: 'Fill example' }).click();
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/compare') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Compare versions' }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const result: { id: string; report: ComparisonReport } = await response.json();
  expect(result.report.changes?.modified.length).toBeGreaterThan(0);
  const cli: ComparisonReport = JSON.parse(execFileSync(process.execPath,
    ['packages/cli/dist/index.js', 'compare', 'is-number', '6.0.0', '7.0.0', '--json'], { encoding: 'utf8', timeout: 75_000 }));
  expect(result.report.findings).toEqual(cli.findings);
  expect(result.report.changes).toEqual(cli.changes);
  await expect(page.getByText('Policy threshold met')).toBeVisible();
  await expect(page.getByText('PT-DIFF-003').first()).toBeVisible();
  await page.getByRole('link', { name: 'View changes' }).click();
  await expect(page.getByRole('heading', { name: /Changed files/ })).toBeVisible();
  await expect(page.locator('.file-list summary').filter({ hasText: 'package.json' })).toBeVisible();
});

test('shows validation errors and rejects hostile API requests', async ({ page, request }) => {
  await page.goto('/scan');
  await page.getByLabel('Package name').fill('lodash');
  await page.getByLabel('Exact version').fill('latest');
  await page.getByRole('button', { name: 'Run scan' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'exact SemVer' })).toBeVisible();
  const foreign = await request.post('/api/scan', {
    headers: { Origin: 'https://example.invalid' }, data: { name: 'lodash', version: '4.17.21' },
  });
  expect(foreign.status()).toBe(403);
  expect((await request.post('/api/scan', { data: { name: 'x'.repeat(4200) } })).status()).toBe(413);
  expect((await request.get('/api/reports/invalid')).status()).toBe(404);
});

test('mobile navigation and workspace fit without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Scan a package' }).click();
  await expect(page.getByRole('heading', { name: 'Scan a package' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.getByRole('link', { name: 'Evidence explorer' }).click();
  await expect(page.getByRole('heading', { name: 'Browse evidence' })).toBeVisible();
});

test('shows verified build identity from npm with matching CLI and downloaded JSON evidence', async ({ page, request }) => {
  await page.goto('/scan');
  await page.getByLabel('Package name').fill('semver');
  await page.getByLabel('Exact version').fill('7.7.2');
  const submitted = page.waitForResponse(response => response.url().endsWith('/api/scan') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run scan' }).click();
  const response = await submitted;
  expect(response.status()).toBe(201);
  const result: { id: string; report: ScanReport } = await response.json();
  const check = result.report.checks.provenance;
  expect(check).toMatchObject({ status: 'verified', evidence: { repository: 'https://github.com/npm/node-semver',
    commit: '281055e7716ef0415a8826972471331989ede58c' } });
  await expect(page.getByText('Verified provenance', { exact: true })).toBeVisible();
  await page.getByText('Verified build identity', { exact: true }).click();
  await expect(page.getByText('Source repository', { exact: true })).toBeVisible();
  await expect(page.getByText('https://github.com/npm/node-semver', { exact: true })).toBeVisible();
  await expect(page.getByText('Signing workflow', { exact: true })).toBeVisible();
  const cli: ScanReport = JSON.parse(execFileSync(process.execPath, ['packages/cli/dist/index.js', 'scan', 'semver@7.7.2', '--json'],
    { encoding: 'utf8', timeout: 45_000 }));
  expect(cli.checks.provenance).toEqual(check);
  const download = await request.get('/api/reports/' + result.id);
  expect((await download.json()).checks.provenance).toEqual(check);
});
