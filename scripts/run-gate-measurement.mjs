#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const node = process.execPath;
const shifu = fileURLToPath(new URL('../shifu.mjs', import.meta.url));
const lifecycle = fileURLToPath(
  new URL('./run-shifu-lifecycle.mjs', import.meta.url),
);

function spawn(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: options.stdio ?? 'inherit',
    encoding: options.encoding,
  });
  if (result.error) throw result.error;
  if (result.signal) {
    process.kill(process.pid, result.signal);
    return result;
  }
  process.exitCode = result.status ?? 1;
  return result;
}

function runNativeGate(args) {
  return spawn(node, [shifu, ...args]);
}

function prepareWorkspace() {
  const result = spawnSync(node, [lifecycle, 'direct', 'check:gate-catalog'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  process.exitCode = result.status ?? 1;
}

function prepareHistory() {
  const shallow = spawn('git', ['rev-parse', '--is-shallow-repository'], {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (process.exitCode) process.exit(process.exitCode);
  const args = ['fetch'];
  if (shallow.stdout.trim() === 'true') args.push('--unshallow');
  args.push('--no-tags', 'origin', '+refs/heads/*:refs/remotes/origin/*');
  spawn('git', args);
  if (process.exitCode) process.exit(process.exitCode);
}

// Dependency installation and catalog bootstrap are runner preparation, not a
// Gate observation. Keeping them outside the profile run prevents a cold
// checkout from consuming gate.catalog's own timeout or duration measurement.
prepareHistory();
prepareWorkspace();
if (process.exitCode) process.exit(process.exitCode);
runNativeGate(process.argv.slice(2));
