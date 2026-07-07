#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);

function envPathKey(env) {
  if (process.platform === 'win32' && Object.hasOwn(env, 'Path')) {
    return 'Path';
  }
  return 'PATH';
}

function existingDirs(dirs) {
  return dirs.filter((dir) => dir && fs.existsSync(dir));
}

function windowsUserToolPathDirs() {
  const usersRoot = 'C:\\Users';
  if (!fs.existsSync(usersRoot)) {
    return [];
  }
  return fs
    .readdirSync(usersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const home = path.join(usersRoot, entry.name);
      return [
        path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links'),
        path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'),
        path.join(home, '.local', 'bin'),
        path.join(home, '.cargo', 'bin'),
        path.join(home, 'scoop', 'shims'),
      ];
    });
}

function findExecutableDirs(roots, executableNames, options = {}) {
  const maxDepth = options.maxDepth ?? 4;
  const maxMatches = options.maxMatches ?? 16;
  const matches = new Set();
  const wanted = new Set(executableNames.map((name) => name.toLowerCase()));
  const skipDirs = new Set([
    '.git',
    'node_modules',
    'Package Cache',
    'Temp',
    'tmp',
  ]);
  const queue = roots
    .filter((root) => root && fs.existsSync(root))
    .map((root) => ({ dir: root, depth: 0 }));

  while (queue.length && matches.size < maxMatches) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && wanted.has(entry.name.toLowerCase())) {
        matches.add(dir);
        if (matches.size >= maxMatches) break;
      } else if (
        entry.isDirectory() &&
        depth < maxDepth &&
        !skipDirs.has(entry.name)
      ) {
        queue.push({ dir: fullPath, depth: depth + 1 });
      }
    }
  }

  return [...matches];
}

function windowsToolPathDirs(env) {
  if (process.platform !== 'win32') {
    return [];
  }
  const home = env.USERPROFILE || env.HOME;
  const localAppData = env.LOCALAPPDATA;
  const candidateDirs = [
    localAppData && path.join(localAppData, 'Microsoft', 'WinGet', 'Links'),
    localAppData && path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'),
    home && path.join(home, '.local', 'bin'),
    home && path.join(home, '.cargo', 'bin'),
    home && path.join(home, 'scoop', 'shims'),
    ...windowsUserToolPathDirs(),
  ];
  return [
    ...existingDirs(candidateDirs),
    ...findExecutableDirs(candidateDirs, ['uv.exe', 'uvx.exe']),
  ];
}

function withPathPrefixes(env, dirs) {
  const pathKey = envPathKey(env);
  return {
    ...env,
    [pathKey]: [...dirs, env[pathKey] || env.PATH || env.Path || '']
      .filter(Boolean)
      .join(path.delimiter),
  };
}

function createPnpmShimDir() {
  const shimDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'kungfu-buildchain-pnpm-'),
  );

  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(shimDir, 'pnpm.cmd'),
      '@echo off\r\ncorepack.cmd pnpm %*\r\n',
      'utf8',
    );
  } else {
    const shimPath = path.join(shimDir, 'pnpm');
    fs.writeFileSync(shimPath, '#!/bin/sh\nexec corepack pnpm "$@"\n', {
      encoding: 'utf8',
      mode: 0o755,
    });
  }

  return shimDir;
}

const env = withPathPrefixes(process.env, [
  createPnpmShimDir(),
  ...windowsToolPathDirs(process.env),
]);
env.KUNGFU_BUILDCHAIN_NO_OPTIONAL = '1';
env.KUNGFU_BUILDCHAIN_SOURCE_BUILD = '1';
const result =
  process.platform === 'win32'
    ? spawnSync('corepack.cmd', ['pnpm', ...argv], {
        cwd: repoRoot,
        env,
        stdio: 'inherit',
        shell: true,
      })
    : spawnSync(path.join(repoRoot, 'kungfu-code'), argv, {
        cwd: repoRoot,
        env,
        stdio: 'inherit',
      });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`kungfu-code terminated by signal ${result.signal}`);
  process.exit(1);
}

process.exit(result.status ?? 0);
