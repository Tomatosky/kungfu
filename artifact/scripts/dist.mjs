// SPDX-License-Identifier: Apache-2.0
// Build the distributable Kungfu artifact from source in one command:
// dependency sync -> core rebuild -> freeze -> all declared first-party kfx ->
// artifact assembly -> TUI/GUI build -> electron-builder output under artifact/dist.
// Run through the repo entrypoint so Node is pinned:
//   ./kungfu-code dist

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBuildchainLogger,
  verifyBuildchainLogEvents,
} from '@kungfu-tech/buildchain/logging';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(ARTIFACT_DIR, '..');
const GUI_DIR = path.join(ROOT, 'framework', 'gui');
const CORE_DIST = path.join(ROOT, 'framework', 'core', 'dist', 'kungfu');
const EXTENSIONS_ROOT = path.join(ROOT, 'extensions');
const ASSEMBLED_EXTENSIONS = path.join(ARTIFACT_DIR, 'extensions');
const isWin = process.platform === 'win32';
const require = createRequire(import.meta.url);
const buildchainLogger = createBuildchainLogger({
  source: 'user',
  component: 'kungfu-artifact',
  attributes: {
    package: '@kungfu-tech/artifact-kungfu',
  },
});

const builderArgs = process.argv.slice(2);

function rel(p) {
  return path.relative(ROOT, p) || '.';
}

function exitLabel(status, signal) {
  return status == null ? `signal ${signal}` : String(status);
}

function run(label, cmd, args, options = {}) {
  const cwd = options.cwd || ROOT;
  const event = options.event || `artifact.command.${labelSlug(label)}`;
  return buildchainLogger.spanSync(
    event,
    {
      phase: options.phase || 'build',
      attributes: {
        label,
        command: cmd,
        cwd: rel(cwd),
        argCount: args.length,
        ...options.attributes,
      },
    },
    () => {
      console.log(`\n[artifact] ${label}`);
      console.log(`[artifact] $ ${[cmd, ...args].join(' ')}`);
      const result = spawnSync(cmd, args, {
        cwd,
        env: options.env || process.env,
        stdio: 'inherit',
        shell: isWin,
      });
      if (result.status !== 0) {
        throw new Error(
          `${label} failed (exit ${exitLabel(result.status, result.signal)})`,
        );
      }
      return result;
    },
  );
}

function runPnpm(label, args, options = {}) {
  run(label, 'pnpm', args, options);
}

function labelSlug(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function libnodePlatformPackageName() {
  const packages = {
    'darwin-arm64': '@kungfu-tech/libnode-darwin-arm64',
    'linux-x64': '@kungfu-tech/libnode-linux-x64',
    'win32-x64': '@kungfu-tech/libnode-win32-x64',
  };
  return packages[`${process.platform}-${process.arch}`];
}

function rollupPlatformPackageName() {
  const libc = linuxLibc();
  const packages = {
    'darwin-arm64': '@rollup/rollup-darwin-arm64',
    'darwin-x64': '@rollup/rollup-darwin-x64',
    [`linux-arm64-${libc}`]: `@rollup/rollup-linux-arm64-${libc}`,
    [`linux-x64-${libc}`]: `@rollup/rollup-linux-x64-${libc}`,
    'win32-arm64': '@rollup/rollup-win32-arm64-msvc',
    'win32-ia32': '@rollup/rollup-win32-ia32-msvc',
    'win32-x64': '@rollup/rollup-win32-x64-msvc',
  };
  return packages[
    `${process.platform}-${process.arch}${libc ? `-${libc}` : ''}`
  ];
}

function linuxLibc() {
  if (process.platform !== 'linux') {
    return '';
  }
  const report = process.report?.getReport?.();
  return report?.header?.glibcVersionRuntime ? 'gnu' : 'musl';
}

function installArgs() {
  const args = ['install', '--frozen-lockfile'];
  if (process.env.KUNGFU_BUILDCHAIN_NO_OPTIONAL === '1') {
    args.push('--no-optional');
  }
  return args;
}

function canResolve(packageName) {
  try {
    require.resolve(`${packageName}/package.json`);
    return true;
  } catch {
    return false;
  }
}

function canResolveFrom(packageName, paths) {
  try {
    require.resolve(`${packageName}/package.json`, { paths });
    return true;
  } catch {
    return false;
  }
}

function packageVersionFrom(packageName, paths) {
  return readJson(require.resolve(`${packageName}/package.json`, { paths }))
    .version;
}

function rollupPackagePathsFromGui() {
  const vitePackageJson = require.resolve('vite/package.json', {
    paths: [GUI_DIR],
  });
  const viteDir = path.dirname(vitePackageJson);
  const rollupPackageJson = require.resolve('rollup/package.json', {
    paths: [viteDir],
  });
  return [path.dirname(rollupPackageJson), viteDir];
}

function rollupVersionFromGui() {
  return packageVersionFrom('rollup', rollupPackagePathsFromGui());
}

function packageJsonPath(nodePath, packageName) {
  return path.join(nodePath, ...packageName.split('/'), 'package.json');
}

function appendNodePath(env, nodePaths) {
  const nextNodePath = [...nodePaths, env.NODE_PATH || '']
    .filter(Boolean)
    .join(path.delimiter);
  return nextNodePath ? { ...env, NODE_PATH: nextNodePath } : env;
}

function ensureNoOptionalPlatformPackage({
  kind,
  packageName,
  version,
  installRoot,
}) {
  const nodePath = path.join(installRoot, 'node_modules');
  const installedPackageJson = packageJsonPath(nodePath, packageName);
  if (!fs.existsSync(installedPackageJson)) {
    fs.rmSync(installRoot, { recursive: true, force: true });
    fs.mkdirSync(installRoot, { recursive: true });
    run(
      `install ${kind} platform package`,
      'npm',
      [
        'install',
        '--no-save',
        '--package-lock=false',
        '--ignore-scripts',
        '--prefer-offline',
        '--prefix',
        installRoot,
        `${packageName}@${version}`,
      ],
      {
        phase: 'dependencies',
        event: `artifact.${kind}.platform.install`,
        attributes: {
          packageName,
          version,
        },
      },
    );
  } else {
    buildchainLogger.mark(`artifact.${kind}.platform.cached`, {
      phase: 'dependencies',
      attributes: {
        packageName,
        version,
      },
    });
  }

  buildchainLogger.mark(`artifact.${kind}.platform.ready`, {
    phase: 'dependencies',
    attributes: {
      packageName,
      version,
    },
  });
  return nodePath;
}

function buildchainSourceBuildEnv() {
  if (process.env.KUNGFU_BUILDCHAIN_NO_OPTIONAL !== '1') {
    buildchainLogger.mark('artifact.libnode.platform.optional', {
      phase: 'dependencies',
      attributes: {
        noOptional: false,
      },
    });
    return process.env;
  }

  const packageName = libnodePlatformPackageName();
  if (!packageName) {
    throw new Error(
      `unsupported libnode platform: ${process.platform}-${process.arch}`,
    );
  }
  const nodePaths = [];
  if (canResolve(packageName)) {
    buildchainLogger.mark('artifact.libnode.platform.resolved', {
      phase: 'dependencies',
      attributes: {
        packageName,
        source: 'workspace-node-path',
      },
    });
  }

  const corePackage = readJson(
    path.join(ROOT, 'framework', 'core', 'package.json'),
  );
  const libnodeVersion = corePackage.devDependencies?.['@kungfu-tech/libnode'];
  if (!libnodeVersion) {
    throw new Error('framework/core must declare @kungfu-tech/libnode');
  }

  const installRoot = path.join(
    ROOT,
    '.buildchain',
    'libnode-platform',
    `${process.platform}-${process.arch}`,
  );
  if (!canResolve(packageName)) {
    nodePaths.push(
      ensureNoOptionalPlatformPackage({
        kind: 'libnode',
        packageName,
        version: libnodeVersion,
        installRoot,
      }),
    );
  }

  const rollupPackageName = rollupPlatformPackageName();
  if (!rollupPackageName) {
    throw new Error(
      `unsupported rollup platform: ${process.platform}-${process.arch}`,
    );
  }
  if (canResolveFrom(rollupPackageName, rollupPackagePathsFromGui())) {
    buildchainLogger.mark('artifact.rollup.platform.resolved', {
      phase: 'dependencies',
      attributes: {
        packageName: rollupPackageName,
        source: 'workspace-node-path',
      },
    });
  } else {
    nodePaths.push(
      ensureNoOptionalPlatformPackage({
        kind: 'rollup',
        packageName: rollupPackageName,
        version: rollupVersionFromGui(),
        installRoot: path.join(
          ROOT,
          '.buildchain',
          'rollup-platform',
          `${process.platform}-${process.arch}`,
        ),
      }),
    );
  }

  return appendNodePath(process.env, nodePaths);
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
  buildchainLogger.mark('artifact.kfx.dependencies.declared', {
    phase: 'prepare',
    attributes: {
      packageCount: packages.length,
    },
  });
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

function buildKfx(packages, baseEnv = process.env) {
  const env = {
    ...baseEnv,
    PATH: `${CORE_DIST}${path.delimiter}${baseEnv.PATH || process.env.PATH || ''}`,
  };
  for (const pkg of packages) {
    if (!pkg.scripts.build) {
      console.log(`[artifact] skip ${pkg.name}: no build script`);
      buildchainLogger.mark('artifact.kfx.build.skipped', {
        phase: 'extensions',
        attributes: {
          packageName: pkg.name,
          reason: 'no-build-script',
        },
      });
      continue;
    }
    runPnpm(`build kfx ${pkg.name}`, ['--filter', pkg.name, 'run', 'build'], {
      env,
      phase: 'extensions',
      event: 'artifact.kfx.build',
      attributes: {
        packageName: pkg.name,
      },
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
  buildchainLogger.spanSync(
    'artifact.kfx.assemble',
    {
      phase: 'extensions',
      attributes: {
        packageCount: packages.length,
        output: rel(ASSEMBLED_EXTENSIONS),
      },
    },
    () => {
      assertSafeGeneratedDir(ASSEMBLED_EXTENSIONS);
      fs.rmSync(ASSEMBLED_EXTENSIONS, { recursive: true, force: true });
      fs.mkdirSync(ASSEMBLED_EXTENSIONS, { recursive: true });
      for (const pkg of packages) {
        copyPackageDir(pkg.dir, path.join(ASSEMBLED_EXTENSIONS, pkg.relDir));
      }
      console.log(
        `[artifact] assembled kfx packages -> ${rel(ASSEMBLED_EXTENSIONS)}`,
      );
    },
  );
}

function assertCoreFrozen() {
  const kungfuBin = path.join(CORE_DIST, isWin ? 'kungfu.exe' : 'kungfu');
  if (!fs.existsSync(kungfuBin)) {
    throw new Error(`freeze did not produce ${rel(kungfuBin)}`);
  }
}

function main() {
  buildchainLogger.spanSync(
    'artifact.dist',
    {
      phase: 'package',
      attributes: {
        platform: process.platform,
        arch: process.arch,
        builderArgCount: builderArgs.length,
      },
    },
    () => {
      const kfxPackages = buildchainLogger.spanSync(
        'artifact.kfx.discover',
        {
          phase: 'prepare',
          attributes: {
            root: rel(EXTENSIONS_ROOT),
          },
        },
        () => listKfxPackages(),
      );
      assertDeclaredKfx(kfxPackages);

      const buildEnv = buildchainSourceBuildEnv();
      runPnpm('sync dependencies', installArgs(), {
        phase: 'dependencies',
        event: 'artifact.dependencies.sync',
      });
      runPnpm(
        'rebuild core',
        ['--filter', '@kungfu-tech/core', 'run', 'rebuild'],
        {
          env: buildEnv,
          phase: 'core',
          event: 'artifact.core.rebuild',
        },
      );
      runPnpm(
        'freeze core runtime',
        ['--filter', '@kungfu-tech/core', 'run', 'freeze'],
        {
          phase: 'core',
          event: 'artifact.core.freeze',
        },
      );
      assertCoreFrozen();

      buildKfx(kfxPackages, buildEnv);
      assembleKfx(kfxPackages);

      runPnpm('bundle tui', ['--filter', '@kungfu-tech/tui', 'run', 'bundle'], {
        env: buildEnv,
        phase: 'ui',
        event: 'artifact.tui.bundle',
      });
      runPnpm(
        'ensure electron',
        ['--filter', '@kungfu-tech/gui', 'run', 'ensure-electron'],
        {
          env: buildEnv,
          phase: 'ui',
          event: 'artifact.gui.ensure-electron',
        },
      );
      runPnpm('build gui', ['--filter', '@kungfu-tech/gui', 'run', 'build'], {
        env: buildEnv,
        phase: 'ui',
        event: 'artifact.gui.build',
      });
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
            ...buildEnv,
            KF_FIRST_PARTY_SOURCE_ROOT: ASSEMBLED_EXTENSIONS,
          },
          phase: 'package',
          event: 'artifact.electron-builder',
        },
      );

      console.log(
        `\n[artifact] output -> ${rel(path.join(ARTIFACT_DIR, 'dist'))}`,
      );
    },
  );
}

function verifyObservability() {
  if (!buildchainLogger.path) {
    return;
  }
  const report = verifyBuildchainLogEvents({
    path: buildchainLogger.path,
    minEvents: 12,
    requireComponents: ['kungfu-artifact'],
    requirePhases: [
      'prepare',
      'dependencies',
      'core',
      'extensions',
      'ui',
      'package',
    ],
    requireEvents: [
      'artifact.dist.start',
      'artifact.kfx.dependencies.declared',
      'artifact.dependencies.sync.start',
      'artifact.core.rebuild.start',
      'artifact.core.freeze.start',
      'artifact.electron-builder.start',
      'artifact.dist.end',
    ],
  });
  if (!report.ok) {
    throw new Error(
      `Buildchain observability verification failed: ${report.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }
  console.log(
    `[artifact] buildchain observability events: ${report.summary.components['kungfu-artifact']?.count ?? 0}`,
  );
}

try {
  main();
  verifyObservability();
} catch (error) {
  console.error(
    `[artifact] failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
