#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MINIMUM_CARGO = [1, 83, 0];
const FALLBACK_RUST_TOOLCHAIN = '1.85.1';

function commandVersion(command, args, env = process.env) {
  const result = spawnSync(command, args, { encoding: 'utf8', env });
  return result.status === 0 ? result.stdout.trim() : '';
}

function cargoVersion(text) {
  const match = String(text).match(/^cargo (\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(actual, minimum) {
  if (!actual) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

/** Ensure Cargo can read the workspace's version-4 lockfile. */
export function lifecycleEnvironment(env = process.env) {
  const prepared = { ...env };
  const current = cargoVersion(
    commandVersion('cargo', ['--version'], prepared),
  );
  if (versionAtLeast(current, MINIMUM_CARGO)) return prepared;

  const rustup = commandVersion('rustup', ['--version'], prepared);
  if (!rustup) {
    throw new Error(
      'Cargo >= 1.83 is required for crates/Cargo.lock v4, and rustup is unavailable',
    );
  }

  const toolchain = prepared.KUNGFU_RUST_TOOLCHAIN || FALLBACK_RUST_TOOLCHAIN;
  const install = spawnSync(
    'rustup',
    ['toolchain', 'install', toolchain, '--profile', 'minimal'],
    { stdio: 'inherit', env: prepared },
  );
  if (install.status !== 0)
    throw new Error(`failed to install Rust toolchain ${toolchain}`);

  const cargo = commandVersion(
    'rustup',
    ['which', '--toolchain', toolchain, 'cargo'],
    prepared,
  );
  if (!cargo)
    throw new Error(`rustup could not resolve Cargo for ${toolchain}`);
  prepared.PATH = `${path.dirname(cargo)}${path.delimiter}${prepared.PATH || ''}`;
  prepared.RUSTUP_TOOLCHAIN = toolchain;
  return prepared;
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
