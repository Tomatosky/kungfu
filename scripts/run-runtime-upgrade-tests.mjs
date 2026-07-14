#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimePins = fs.readFileSync(
  path.join(root, 'product', 'runtime-pins.env'),
  'utf8',
);
export const runtimeUvVersion = runtimePins.match(/^UV_VERSION=(.+)$/m)?.[1];
if (!runtimeUvVersion) {
  throw new Error('product/runtime-pins.env carries no UV_VERSION');
}

function commandAvailable(command) {
  return (
    spawnSync(process.platform === 'win32' ? 'where' : 'which', [command], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    }).status === 0
  );
}

export function runtimeUpgradeUvCommand(args, available = commandAvailable) {
  if (available('uv')) return { command: 'uv', args };
  if (available('uvx')) {
    return {
      command: 'uvx',
      args: ['--from', `uv==${runtimeUvVersion}`, 'uv', ...args],
    };
  }
  throw new Error('runtime upgrade tests require uv or uvx');
}

export function runRuntimeUpgradeTests() {
  const pythonPath = [
    path.join(root, 'framework', 'core', 'src', 'python'),
    process.env.PYTHONPATH,
  ]
    .filter(Boolean)
    .join(path.delimiter);
  const uv = runtimeUpgradeUvCommand([
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
      'test_runtime_upgrade.py',
    ),
    '-q',
  ]);
  const result = spawnSync(uv.command, uv.args, {
    cwd: root,
    env: { ...process.env, PYTHONPATH: pythonPath },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error(`[runtime-upgrade-test] ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(runRuntimeUpgradeTests());
}
