#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function lifecycleEnvironment(env = process.env) {
  return { ...env };
}

function cmdCommand(shim, args) {
  const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
  return `call ${[shim, ...args].map(quote).join(' ')}`;
}

/** Run the canonical repository shim without assuming bash exists on Windows. */
export function runShifu(args, options = {}) {
  const platform = options.platform || process.platform;
  const root = options.root || ROOT;
  const env = options.env || lifecycleEnvironment();
  let result;
  if (platform === 'win32') {
    const command = options.comspec || env.ComSpec || env.COMSPEC || 'cmd.exe';
    const shim = path.join(root, 'shifu.cmd');
    result = spawnSync(command, ['/d', '/s', '/c', cmdCommand(shim, args)], {
      cwd: root,
      env,
      stdio: options.stdio || 'inherit',
    });
  } else {
    result = spawnSync(path.join(root, 'shifu'), args, {
      cwd: root,
      env,
      stdio: options.stdio || 'inherit',
    });
  }
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function main() {
  if (process.argv.length < 3) {
    console.error(
      'usage: node scripts/run-shifu-lifecycle.mjs <task> [args...]',
    );
    process.exit(2);
  }
  process.exitCode = runShifu(process.argv.slice(2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
