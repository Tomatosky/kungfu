// SPDX-License-Identifier: Apache-2.0
// Repo-local dogfood product entry. The SDK owns the generic external-project
// `kungfu sdk product` verbs; this wrapper maps the same vocabulary to Kungfu's
// artifact-level assembly so `./kungfu-code product gui build` does not silently
// regress to a GUI-only build.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');
const isWin = process.platform === 'win32';

function usage(code) {
  process.stdout.write(
    [
      'usage: ./kungfu-code product gui dev|build|pack|dist [--dry-run]',
      '       ./kungfu-code product tui dev|build|bundle|dist [--dry-run]',
      '',
      'gui build/pack  -> artifact-level unpacked app under artifact/dist',
      'gui dist        -> artifact-level DMG/zip under artifact/dist',
      'tui bundle/dist -> bundled TUI under framework/tui/dist',
      '',
    ].join('\n'),
  );
  process.exit(code);
}

function fail(message) {
  process.stderr.write(`kungfu-code product: ${message}\n`);
  process.exit(1);
}

function exitLabel(result) {
  return result.status == null
    ? `signal ${result.signal}`
    : String(result.status);
}

function run(label, cmd, args, options = {}) {
  if (options.dryRun) {
    process.stdout.write(`[dry-run] ${label}: ${[cmd, ...args].join(' ')}\n`);
    return;
  }
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWin,
  });
  if (result.status !== 0) fail(`${label} failed (${exitLabel(result)})`);
}

function pnpm(label, args, options) {
  run(label, 'pnpm', args, options);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) usage(0);
const dryRun = args.includes('--dry-run');
const positional = args.filter((arg) => arg !== '--dry-run');
const [surface, verb] = positional;

if (!surface || !verb) usage(1);

if (surface === 'gui') {
  if (verb === 'dev') {
    pnpm('gui dev', ['--filter', '@kungfu-tech/gui', 'run', 'dev'], { dryRun });
  } else if (verb === 'build' || verb === 'pack') {
    run(
      'artifact dir build',
      process.execPath,
      ['artifact/scripts/dist.mjs', '--dir'],
      {
        dryRun,
      },
    );
  } else if (verb === 'dist') {
    run(
      'artifact dist build',
      process.execPath,
      ['artifact/scripts/dist.mjs'],
      {
        dryRun,
      },
    );
  } else {
    fail('unknown gui command (supported: dev, build, pack, dist)');
  }
} else if (surface === 'tui') {
  if (verb === 'dev') {
    pnpm('tui dev', ['--filter', '@kungfu-tech/tui', 'run', 'dev'], { dryRun });
  } else if (verb === 'build') {
    pnpm('tui build', ['--filter', '@kungfu-tech/tui', 'run', 'build'], {
      dryRun,
    });
  } else if (verb === 'bundle' || verb === 'dist') {
    pnpm('tui bundle', ['--filter', '@kungfu-tech/tui', 'run', 'bundle'], {
      dryRun,
    });
  } else {
    fail('unknown tui command (supported: dev, build, bundle, dist)');
  }
} else {
  fail('unknown product target (supported: gui, tui)');
}
