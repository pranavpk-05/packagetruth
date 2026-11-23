#!/usr/bin/env node
import { existsSync } from 'node:fs';

const cli = new URL('../dist/index.js', import.meta.url);
if (existsSync(cli)) {
  await import(cli.href);
} else {
  console.error('packagetruth: Build the CLI first with npm run build:core.');
  process.exitCode = 1;
}
