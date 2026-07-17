#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const XINFA_ROOT = path.join(ROOT, 'xinfa');
const XINFA_MANIFEST = path.join(XINFA_ROOT, 'Cargo.toml');
const XINFA_BINARY = path.join(
  XINFA_ROOT,
  'target',
  'debug',
  process.platform === 'win32' ? 'xinfa.exe' : 'xinfa',
);
const KFD_ROOT = path.dirname(
  fileURLToPath(import.meta.resolve('@kungfu-tech/kfd/package.json')),
);
const KFD_BIN = path.join(KFD_ROOT, 'bin', 'kfd.mjs');

function run(command, args, cwd = ROOT) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function verify(kind, objectPath) {
  const report = JSON.parse(
    run(process.execPath, [KFD_BIN, 'verify', kind, objectPath, '--json']),
  );
  if (report.valid !== true) {
    throw new Error(
      `KFD rejected Kungfu-owned ${kind}: ${JSON.stringify(report.issues)}`,
    );
  }
  return report.profile;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kungfu-kfd-drift-'));
try {
  run('cargo', ['build', '--locked', '--manifest-path', XINFA_MANIFEST]);

  const fixture = path.join(XINFA_ROOT, 'fixtures', 'repository-small');
  const project = path.join(fixture, 'project.json');
  const packOutput = path.join(temporary, 'pack');
  run(XINFA_BINARY, [
    'compile',
    '--project',
    project,
    '--output',
    packOutput,
    '--json',
  ]);

  const atlasOutput = path.join(temporary, 'atlas');
  run(XINFA_BINARY, [
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
