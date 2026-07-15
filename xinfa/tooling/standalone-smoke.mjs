#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// @ts-check

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'xinfa-standalone-';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${result.error?.message || result.stderr || result.status}`,
    );
  }
  return result.stdout.trim();
}

function resolveCargo() {
  const separator = path.delimiter;
  const executable = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
  const directories = [
    ...(process.env.SHIFU_ORIGINAL_PATH || '').split(separator),
    ...(process.env.PATH || '').split(separator),
    process.env.HOME ? path.join(process.env.HOME, '.cargo', 'bin') : '',
  ].filter(
    (directory, index, values) =>
      directory &&
      !directory.includes('shifu-cache-overlay-') &&
      values.indexOf(directory) === index,
  );
  for (const directory of directories) {
    const cargo = path.join(directory, executable);
    try {
      fs.accessSync(cargo, fs.constants.X_OK);
      return { cargo, originalPath: directories.join(separator) };
    } catch {
      // Continue until a real, non-overlay Cargo executable is found.
    }
  }
  throw new Error('cargo is not available outside the Shifu cache overlay');
}

function cleanEnvironment(targetRoot, originalPath) {
  const env = {
    ...process.env,
    PATH: originalPath,
    CARGO_TARGET_DIR: path.join(targetRoot, 'target'),
  };
  let removed = 0;
  for (const key of Object.keys(env)) {
    if (key.startsWith('SHIFU_') || key.startsWith('KUNGFU_')) {
      delete env[key];
      removed += 1;
    }
  }
  env.XINFA_STATE_HOME = undefined;
  env.XINFA_CACHE_HOME = undefined;
  return { env, removed };
}

function copyExtraction(targetRoot) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'extraction-manifest.json'), 'utf8'),
  );
  for (const relative of manifest.files) {
    if (path.isAbsolute(relative) || relative.split('/').includes('..')) {
      throw new Error(`unsafe extraction path: ${relative}`);
    }
    const source = path.join(ROOT, relative);
    if (!fs.lstatSync(source).isFile()) {
      throw new Error(`extraction source must be a regular file: ${relative}`);
    }
    const target = path.join(targetRoot, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  return manifest.files;
}

function safeCleanup(targetRoot) {
  const parent = fs.realpathSync(path.dirname(targetRoot));
  const expectedParent = fs.realpathSync(os.tmpdir());
  if (
    parent !== expectedParent ||
    !path.basename(targetRoot).startsWith(PREFIX)
  ) {
    throw new Error(`refusing to clean unowned path: ${targetRoot}`);
  }
  fs.rmSync(targetRoot, { recursive: true });
}

function main() {
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX));
  try {
    const canonicalTargetRoot = fs.realpathSync(targetRoot);
    const extractedFiles = copyExtraction(targetRoot);
    const { cargo, originalPath } = resolveCargo();
    const { env, removed } = cleanEnvironment(targetRoot, originalPath);
    const manifest = path.join(targetRoot, 'Cargo.toml');
    run(cargo, ['build', '--locked', '--manifest-path', manifest], {
      cwd: targetRoot,
      env,
    });
    run(cargo, ['test', '--locked', '--manifest-path', manifest], {
      cwd: targetRoot,
      env,
    });

    const binary = path.join(
      targetRoot,
      'target',
      'debug',
      process.platform === 'win32' ? 'xinfa.exe' : 'xinfa',
    );
    const version = run(binary, ['--version'], { cwd: targetRoot, env });
    const contractA = run(binary, ['contract', '--json'], {
      cwd: targetRoot,
      env,
    });
    const contractB = run(binary, ['contract', '--json'], {
      cwd: targetRoot,
      env,
    });
    if (contractA !== contractB)
      throw new Error('contract output is not stable');

    const diagnostic = JSON.parse(
      run(binary, ['diagnose', '--json'], { cwd: targetRoot, env }),
    );
    if (
      diagnostic.stateHome !== path.join(canonicalTargetRoot, '.xinfa') ||
      diagnostic.cacheHome !==
        path.join(canonicalTargetRoot, '.xinfa', 'cache') ||
      diagnostic.writesState !== false
    ) {
      throw new Error(
        'default state diagnostic violates the standalone contract',
      );
    }

    const overrideEnv = {
      ...env,
      XINFA_STATE_HOME: path.join(targetRoot, 'state-override'),
      XINFA_CACHE_HOME: path.join(targetRoot, 'cache-override'),
    };
    const overrideDiagnostic = JSON.parse(
      run(binary, ['diagnose', '--json'], {
        cwd: targetRoot,
        env: overrideEnv,
      }),
    );
    if (
      overrideDiagnostic.stateSource !== 'environment' ||
      overrideDiagnostic.cacheSource !== 'environment' ||
      overrideDiagnostic.writesState !== false
    ) {
      throw new Error('state overrides violate the standalone contract');
    }
    if (
      fs.existsSync(diagnostic.stateHome) ||
      fs.existsSync(overrideDiagnostic.stateHome) ||
      fs.existsSync(overrideDiagnostic.cacheHome)
    ) {
      throw new Error(
        'read-only diagnostics created state or cache directories',
      );
    }

    const receipt = {
      schema: 'xinfa.standalone-smoke-receipt/v1',
      verdict: 'pass',
      product: 'xinfa',
      version,
      extractedFiles: [...extractedFiles].sort(),
      contractSha256: crypto
        .createHash('sha256')
        .update(contractA)
        .digest('hex'),
      contractDeterministic: true,
      cargoBuild: 'pass',
      cargoTest: 'pass',
      stateDefault: '.xinfa',
      stateOverride: 'XINFA_STATE_HOME',
      cacheOverride: 'XINFA_CACHE_HOME',
      diagnosticsWriteState: false,
      scrubbedEnvironmentPrefixes: ['KUNGFU_', 'SHIFU_'],
      scrubbedEnvironmentVariables: removed,
    };
    console.log(JSON.stringify(receipt, null, 2));
  } finally {
    safeCleanup(targetRoot);
  }
}

try {
  main();
} catch (error) {
  console.error(
    `[xinfa-standalone] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
