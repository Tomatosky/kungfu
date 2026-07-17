#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const XINFA_ROOT = path.join(ROOT, 'xinfa');
const XINFA_MANIFEST = path.join(XINFA_ROOT, 'Cargo.toml');
const KFD_ROOT = path.dirname(
  fileURLToPath(import.meta.resolve('@kungfu-tech/kfd/package.json')),
);
const KFD_BIN = path.join(KFD_ROOT, 'bin', 'kfd.mjs');

function run(command, args, cwd = ROOT, env = process.env) {
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function verify(kind, objectPath) {
  const result = spawnSync(
    process.execPath,
    [KFD_BIN, 'verify', kind, objectPath, '--json'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  const report = JSON.parse(result.stdout);
  if (result.status !== 0 || report.valid !== true) {
    const observed =
      kind === 'atlas'
        ? JSON.parse(
            fs.readFileSync(path.join(objectPath, 'atlas.json'), 'utf8'),
          ).roots
        : undefined;
    throw new Error(
      `KFD rejected Kungfu-owned ${kind}: ${JSON.stringify({ status: result.status, issues: report.issues, observed })}`,
    );
  }
  return report.profile;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kungfu-kfd-drift-'));
try {
  const cargoTarget = path.join(temporary, 'cargo-target');
  run('cargo', ['build', '--locked', '--manifest-path', XINFA_MANIFEST], ROOT, {
    ...process.env,
    CARGO_TARGET_DIR: cargoTarget,
  });
  const xinfaBinary = path.join(
    cargoTarget,
    'debug',
    process.platform === 'win32' ? 'xinfa.exe' : 'xinfa',
  );

  const fixture = path.join(XINFA_ROOT, 'fixtures', 'repository-small');
  const project = path.join(fixture, 'project.json');
  const packOutput = path.join(temporary, 'pack');
  run(xinfaBinary, [
    'compile',
    '--project',
    project,
    '--output',
    packOutput,
    '--json',
  ]);

  const atlasOutput = path.join(temporary, 'atlas');
  run(xinfaBinary, [
    'atlas',
    'compile',
    '--project',
    project,
    '--output',
    atlasOutput,
    '--json',
  ]);

  const episodeOutput = path.join(
    fixture,
    '.kungfu',
    'episodes',
    'sealed',
    'sha256',
    'aa',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
  const profiles = {
    pack: verify('pack', packOutput),
    atlas: verify('atlas', atlasOutput),
    episode: verify('episode', episodeOutput),
  };
  console.log(
    `[kfd-verifier-drift] Kungfu-owned Pack, Atlas, and Episode accepted: ${JSON.stringify(profiles)}`,
  );
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
