// SPDX-License-Identifier: Apache-2.0
// Build the distributable Kungfu artifact from source in one command:
// dependency sync -> core rebuild -> freeze -> all declared first-party kfx ->
// artifact assembly -> TUI/GUI build -> electron-builder output under artifact/dist.
// Run through the repo entrypoint so Node is pinned:
//   ./kungfu-code dist

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(ARTIFACT_DIR, '..');
const GUI_DIR = path.join(ROOT, 'framework', 'gui');
const CORE_DIST = path.join(ROOT, 'framework', 'core', 'dist', 'kungfu');
const EXTENSIONS_ROOT = path.join(ROOT, 'extensions');
const ASSEMBLED_EXTENSIONS = path.join(ARTIFACT_DIR, 'extensions');
const isWin = process.platform === 'win32';

const builderArgs = process.argv.slice(2);

function rel(p) {
  return path.relative(ROOT, p) || '.';
}

function exitLabel(status, signal) {
  return status == null ? `signal ${signal}` : String(status);
}

function run(label, cmd, args, options = {}) {
  console.log(`\n[artifact] ${label}`);
  console.log(`[artifact] $ ${[cmd, ...args].join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    stdio: 'inherit',
    shell: isWin,
  });
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (exit ${exitLabel(result.status, result.signal)})`,
    );
  }
}

function runPnpm(label, args, options = {}) {
  run(label, 'pnpm', args, options);
}

function installArgs() {
  const args = ['install', '--frozen-lockfile'];
  if (process.env.KUNGFU_BUILDCHAIN_NO_OPTIONAL === '1') {
    args.push('--no-optional');
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function listKfxPackages() {
  const packages = [];
  const visit = (dir, depth) => {
    if (depth > 2 || !fs.existsSync(dir)) return;
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = readJson(pkgPath);
      if (pkg?.name && pkg?.kungfuConfig) {
        packages.push({
          name: pkg.name,
          dir,
          relDir: path.relative(EXTENSIONS_ROOT, dir),
          config: pkg.kungfuConfig,
          scripts: pkg.scripts || {},
        });
      }
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      visit(path.join(dir, entry.name), depth + 1);
    }
  };
  visit(EXTENSIONS_ROOT, 0);
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

function artifactKfxDependencies() {
  const pkg = readJson(path.join(ARTIFACT_DIR, 'package.json'));
  return new Set(
    Object.keys(pkg.dependencies || {}).filter((name) =>
      name.startsWith('@kungfu-tech/kfx-'),
    ),
  );
}

function assertDeclaredKfx(packages) {
  const declared = artifactKfxDependencies();
  const actual = new Set(packages.map((pkg) => pkg.name));
  const missing = [...actual].filter((name) => !declared.has(name)).sort();
  const stale = [...declared].filter((name) => !actual.has(name)).sort();
  if (missing.length || stale.length) {
    throw new Error(
      [
        'artifact/package.json must declare every first-party kfx dependency',
        missing.length ? `missing: ${missing.join(', ')}` : '',
        stale.length ? `stale: ${stale.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  console.log(`[artifact] declared kfx dependencies: ${packages.length}`);
}

function assertSafeGeneratedDir(dir) {
  const resolved = path.resolve(dir);
  if (
    !resolved.startsWith(`${ARTIFACT_DIR}${path.sep}`) ||
    path.basename(resolved) !== 'extensions'
  ) {
    throw new Error(`refusing to clean unexpected directory: ${resolved}`);
  }
}

function copyPackageDir(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, {
    recursive: true,
    dereference: false,
    filter: (src) => {
      const base = path.basename(src);
      if (
        base === 'node_modules' ||
        base === 'build' ||
        base === '.venv' ||
        base === '__pycache__' ||
        base === '.DS_Store'
      ) {
        return false;
      }
      return true;
    },
  });
}

function buildKfx(packages) {
  const env = {
    ...process.env,
    PATH: `${CORE_DIST}${path.delimiter}${process.env.PATH || ''}`,
  };
  for (const pkg of packages) {
    if (!pkg.scripts.build) {
      console.log(`[artifact] skip ${pkg.name}: no build script`);
      continue;
    }
    runPnpm(`build kfx ${pkg.name}`, ['--filter', pkg.name, 'run', 'build'], {
      env,
    });
    if (pkg.config?.config?.view) {
      const entry = pkg.config.config.view.entry || 'dist/view/index.js';
      const bundlePath = path.join(pkg.dir, entry);
      if (!fs.existsSync(bundlePath)) {
        throw new Error(`${pkg.name} build did not produce ${rel(bundlePath)}`);
      }
    }
  }
}

function assembleKfx(packages) {
  assertSafeGeneratedDir(ASSEMBLED_EXTENSIONS);
  fs.rmSync(ASSEMBLED_EXTENSIONS, { recursive: true, force: true });
  fs.mkdirSync(ASSEMBLED_EXTENSIONS, { recursive: true });
  for (const pkg of packages) {
    copyPackageDir(pkg.dir, path.join(ASSEMBLED_EXTENSIONS, pkg.relDir));
  }
  console.log(
    `[artifact] assembled kfx packages -> ${rel(ASSEMBLED_EXTENSIONS)}`,
  );
}

function assertCoreFrozen() {
  const kungfuBin = path.join(CORE_DIST, isWin ? 'kungfu.exe' : 'kungfu');
  if (!fs.existsSync(kungfuBin)) {
    throw new Error(`freeze did not produce ${rel(kungfuBin)}`);
  }
}

function main() {
  const kfxPackages = listKfxPackages();
  assertDeclaredKfx(kfxPackages);

  runPnpm('sync dependencies', installArgs());
  runPnpm('rebuild core', ['--filter', '@kungfu-tech/core', 'run', 'rebuild']);
  runPnpm('freeze core runtime', [
    '--filter',
    '@kungfu-tech/core',
    'run',
    'freeze',
  ]);
  assertCoreFrozen();

  buildKfx(kfxPackages);
  assembleKfx(kfxPackages);

  runPnpm('bundle tui', ['--filter', '@kungfu-tech/tui', 'run', 'bundle']);
  runPnpm('ensure electron', [
    '--filter',
    '@kungfu-tech/gui',
    'run',
    'ensure-electron',
  ]);
  runPnpm('build gui', ['--filter', '@kungfu-tech/gui', 'run', 'build']);
  run(
    'electron-builder artifact',
    process.execPath,
    [
      path.join(GUI_DIR, 'scripts', 'run-electron-builder.mjs'),
      `--config=${path.join(ARTIFACT_DIR, 'electron-builder.yml')}`,
      ...builderArgs,
    ],
    {
      cwd: GUI_DIR,
      env: {
        ...process.env,
        KF_FIRST_PARTY_SOURCE_ROOT: ASSEMBLED_EXTENSIONS,
      },
    },
  );

  console.log(`\n[artifact] output -> ${rel(path.join(ARTIFACT_DIR, 'dist'))}`);
}

try {
  main();
} catch (error) {
  console.error(
    `[artifact] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
