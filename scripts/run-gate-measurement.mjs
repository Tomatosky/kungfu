#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareGateMeasurementHistory } from './prepare-gate-measurement-history.mjs';

const node = process.execPath;
const root = fileURLToPath(new URL('..', import.meta.url));
const shifuLauncher = path.join(
  root,
  process.platform === 'win32' ? 'shifu.cmd' : 'shifu',
);
const lifecycle = fileURLToPath(
  new URL('./run-shifu-lifecycle.mjs', import.meta.url),
);

function exposeUserToolchain() {
  const pathKey =
    Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ||
    'PATH';
  const current = process.env[pathKey] || '';
  const candidates = [
    path.join(os.homedir(), '.cargo', 'bin'),
    path.join(os.homedir(), '.local', 'bin'),
  ].filter((directory) => fs.existsSync(directory));
  process.env[pathKey] = [...candidates, current]
    .filter(Boolean)
    .join(path.delimiter);
}

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
  return spawn(node, [lifecycle, 'cache-apply', ...args]);
}

function runPreparation(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: options.shell ?? false,
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  process.exitCode = result.status ?? 1;
}

function assertCleanSource() {
  const result = spawnSync(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `cannot verify measurement source: ${result.stderr.trim()}`,
    );
  }
  if (result.stdout.trim()) {
    throw new Error(
      `measurement preparation dirtied the locked source:\n${result.stdout.trim()}`,
    );
  }
}

function prepareWorkspace() {
  runPreparation(shifuLauncher, ['install', '--frozen-lockfile'], {
    shell: process.platform === 'win32',
  });
  if (process.exitCode) return;
  runPreparation('uv', ['sync', '--project', 'framework/core', '--frozen']);
  if (process.exitCode) return;
  runPreparation(
    shifuLauncher,
    ['--filter', '@kungfu-tech/core', 'run', 'configure'],
    { shell: process.platform === 'win32' },
  );
  if (process.exitCode) return;
  runPreparation(node, [lifecycle, 'direct', 'check:gate-catalog']);
  if (process.exitCode) return;
  assertCleanSource();
}

function prepareHistory() {
  prepareGateMeasurementHistory(process.cwd());
}

// Dependency installation, catalog bootstrap, and managed Python materialization
// are runner preparation, not Gate observations. Keeping them outside the
// profile run prevents a cold checkout from consuming a Gate's own timeout or
// duration measurement.
exposeUserToolchain();
prepareHistory();
prepareWorkspace();
if (process.exitCode) process.exit(process.exitCode);
runNativeGate(process.argv.slice(2));
