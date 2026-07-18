#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// @ts-check

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const XINFA = path.join(
  ROOT,
  'xinfa',
  'target',
  'debug',
  process.platform === 'win32' ? 'xinfa.exe' : 'xinfa',
);
const QUALIFIER = path.join(
  ROOT,
  'xinfa',
  'tooling',
  'qualify-context-quality.mjs',
);
const CORPUS = path.join(
  ROOT,
  'xinfa',
  'fixtures',
  'golden',
  'context-quality-corpus-v1.json',
);
const RETAINED = path.join(
  ROOT,
  'xinfa',
  'qualification',
  'context-quality-v1.json',
);

/** @param {string} command @param {string[]} args */
function runJson(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32' && /\.cmd$/i.test(command),
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${path.basename(command)} failed: ${result.error?.message || result.stderr || result.status}`,
    );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${path.basename(command)} did not emit JSON`);
  }
}

function main() {
  const write = process.argv.includes('--write');
  const check = process.argv.includes('--check') || !write;
  if (
    process.argv.slice(2).some((arg) => !['--write', '--check'].includes(arg))
  )
    throw new Error(
      'usage: qualify-xinfa-context-quality.mjs [--check|--write]',
    );
  if (!fs.existsSync(XINFA))
    throw new Error(
      `Xinfa executable is required: ${path.relative(ROOT, XINFA)}`,
    );

  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'xinfa-context-quality-'),
  );
  try {
    const atlas = path.join(temporary, 'atlas');
    const graph = runJson(
      path.join(ROOT, process.platform === 'win32' ? 'shifu.cmd' : 'shifu'),
      ['docs', 'graph', '--output', atlas, '--xinfa', XINFA, '--json'],
    );
    if (
      graph.verdict !== 'pass' ||
      graph.xinfa?.verify?.valid !== true ||
      graph.closure?.unclassified !== 0
    )
      throw new Error(
        'repository Documentation Atlas is not closed and verified',
      );

    const generated = path.join(temporary, 'context-quality-v1.json');
    const receipt = runJson(process.execPath, [
      QUALIFIER,
      '--xinfa',
      XINFA,
      '--atlas',
      atlas,
      '--corpus',
      CORPUS,
      '--actor',
      'context-quality-v1',
      '--output',
      generated,
    ]);
    if (receipt.verdict !== 'pass')
      throw new Error('context-quality qualification failed');
    const expected = fs.readFileSync(generated);
    if (write) fs.writeFileSync(RETAINED, expected);
    if (
      check &&
      (!fs.existsSync(RETAINED) || !fs.readFileSync(RETAINED).equals(expected))
    )
      throw new Error(
        'retained context-quality receipt drifted; run with --write',
      );
    process.stdout.write(
      `[xinfa-quality] cases=${receipt.metrics.cases} routes=${receipt.metrics.route_families} atlas=${receipt.atlas_root} root=${receipt.qualification_root}\n`,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[xinfa-quality] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
