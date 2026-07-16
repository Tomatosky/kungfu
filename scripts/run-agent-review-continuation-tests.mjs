#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function run(label, command, args, options = {}) {
  process.stdout.write(`[agent-review-continuation] ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error)
    console.error(`[agent-review-continuation] ${result.error.message}`);
  if (result.error || result.status !== 0) process.exit(result.status ?? 1);
}

run('Work Dashboard shared review and continuation API', 'pnpm', [
  '--filter',
  '@kungfu-tech/kfx-view-work-dashboard',
  'test',
]);

const pythonPath = [
  path.join(root, 'framework', 'core', 'build', 'Release'),
  path.join(root, 'framework', 'core', 'src', 'python'),
  process.env.PYTHONPATH,
]
  .filter(Boolean)
  .join(path.delimiter);

run(
  'independent review and exact continuation domain',
  'uv',
  [
    'run',
    '--project',
    path.join(root, 'framework', 'core'),
    '--frozen',
    'pytest',
    path.join(
      root,
      'framework',
      'core',
      'tests',
      'python',
      'test_atlas_storage.py',
    ),
    '-k',
    'independent_completion_review_and_exact_continuation',
    '-q',
  ],
  { env: { ...process.env, PYTHONPATH: pythonPath } },
);
