#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);

function withPathPrefix(env, dir) {
  return {
    ...env,
    PATH: [dir, env.PATH || env.Path || '']
      .filter(Boolean)
      .join(path.delimiter),
  };
}

function createPnpmShimDir() {
  const shimDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kungfu-buildchain-pnpm-'),
  );

  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(shimDir, 'pnpm.cmd'),
      '@echo off\r\ncorepack.cmd pnpm %*\r\n',
      'utf8',
    );
  } else {
    const shimPath = path.join(shimDir, 'pnpm');
    fs.writeFileSync(shimPath, '#!/bin/sh\nexec corepack pnpm "$@"\n', {
      encoding: 'utf8',
      mode: 0o755,
    });
  }

  return shimDir;
}

const env = withPathPrefix(process.env, createPnpmShimDir());
env.KUNGFU_BUILDCHAIN_NO_OPTIONAL = '1';
const result =
  process.platform === 'win32'
    ? spawnSync('corepack.cmd', ['pnpm', ...argv], {
        cwd: repoRoot,
        env,
        stdio: 'inherit',
        shell: true,
      })
    : spawnSync(path.join(repoRoot, 'kungfu-code'), argv, {
        cwd: repoRoot,
        env,
        stdio: 'inherit',
      });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`kungfu-code terminated by signal ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 0);
