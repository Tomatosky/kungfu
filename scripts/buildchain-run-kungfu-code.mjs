#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);

function quoteCmdArg(arg) {
  return `"${String(arg).replace(/"/g, '""')}"`;
}

const result =
  process.platform === 'win32'
    ? spawnSync(
        process.env.ComSpec || 'cmd.exe',
        [
          '/d',
          '/s',
          '/c',
          [
            quoteCmdArg(path.join(repoRoot, 'kungfu-code.cmd')),
            ...argv.map(quoteCmdArg),
          ].join(' '),
        ],
        { cwd: repoRoot, env: process.env, stdio: 'inherit' },
      )
    : spawnSync(path.join(repoRoot, 'kungfu-code'), argv, {
        cwd: repoRoot,
        env: process.env,
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
