// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, 'run.mjs');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const VERSION = '4.0.0-alpha.1';
const DIMENSIONS = [
  'dependency_count',
  'installed_size_bytes',
  'cold_start_ms',
  'resident_runtime_count',
  'resident_memory_bytes',
  'onboarding_concept_count',
];
const PLATFORMS = [
  ['darwin', 'arm64'],
  ['linux', 'x64'],
  ['win32', 'x64'],
];

function measurements() {
  return Object.fromEntries(DIMENSIONS.map((key, index) => [key, index + 1]));
}

function write(root, name, value) {
  const file = path.join(root, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function fixture(root) {
  const source = { commit: COMMIT, tree_dirty: false };
  const format = write(root, 'format.json', {
    schema: 'kungfu.layer-qualification.format-report/v1',
    status: 'passing',
    platform: 'portable',
    architecture: 'any',
    source,
    qualification: {
      id: 'format-spec',
      status: 'passing',
      exact_artifact_sha256: 'format-digest',
      measurements: measurements(),
    },
  });
  const sdk = PLATFORMS.map(([platform, architecture]) =>
    write(root, `sdk-${platform}.json`, {
      schema: 'kungfu.layer-qualification.sdk-report/v1',
      status: 'passing',
      platform,
      architecture,
      source,
      qualifications: ['pypi-sdk', 'npm-sdk', 'cargo-sdk'].map((id) => ({
        id,
        status: 'passing',
        exact_artifact_sha256: `${id}-${platform}`,
        measurements: measurements(),
      })),
    }),
  );
  const surface = PLATFORMS.map(([platform, architecture]) =>
    write(root, `surface-${platform}.json`, {
      schema: 'kungfu.surface-qualification.report/v1',
      status: 'passing',
      platform,
      architecture,
      source,
      qualifications: Object.fromEntries(
        ['cli-tui', 'gui', 'assembled-distribution'].map((id) => [
          id,
          {
            status: 'passing',
            exact_artifact_sha256: `${id}-${platform}`,
            measurements: measurements(),
            installer_uninstall: { status: 'passing' },
          },
        ]),
      ),
    }),
  );
  const registries = {
    'format-spec': 'npm',
    'pypi-sdk': 'pypi',
    'npm-sdk': 'npm',
    'cargo-sdk': 'crates.io',
    'cli-tui': 'github-release',
    gui: 'github-release',
    'assembled-distribution': 'github-release',
  };
  const publication = write(root, 'publication.json', {
    schema: 'kungfu.layer-qualification.publication-report/v1',
    status: 'passing',
    source: { commit: COMMIT },
    release: { version: VERSION },
    artifacts: Object.fromEntries(
      Object.entries(registries).map(([id, registry]) => [
        id,
        {
          status: 'passing',
          registry,
          coordinate: id,
          version: VERSION,
          digest: `${id}-published-digest`,
          url: `https://example.invalid/${id}`,
        },
      ]),
    ),
  });
  return { format, sdk, surface, publication };
}

function run(evidence) {
  const args = [RUNNER, '--format-report', evidence.format];
  for (const file of evidence.sdk) args.push('--sdk-report', file);
  for (const file of evidence.surface) args.push('--surface-report', file);
  args.push('--publication-report', evidence.publication);
  return spawnSync(process.execPath, args, { encoding: 'utf8' });
}

test('promotes all seven staged artifacts only from complete release evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kungfu-release-test-'));
  try {
    const result = run(fixture(root));
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /passing; artifacts=7/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a missing platform report', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kungfu-release-test-'));
  try {
    const evidence = fixture(root);
    evidence.sdk.pop();
    const result = run(evidence);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /lacks win32-x64 sdk report/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects an unverifiable resident-memory budget', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kungfu-release-test-'));
  try {
    const evidence = fixture(root);
    const report = JSON.parse(fs.readFileSync(evidence.sdk[0], 'utf8'));
    report.qualifications[0].measurements.resident_memory_bytes = {
      status: 'unverifiable',
    };
    fs.writeFileSync(evidence.sdk[0], `${JSON.stringify(report, null, 2)}\n`);
    const result = run(evidence);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /lacks exact numeric resident_memory_bytes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a surface without installer-uninstall proof', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kungfu-release-test-'));
  try {
    const evidence = fixture(root);
    const report = JSON.parse(fs.readFileSync(evidence.surface[0], 'utf8'));
    report.qualifications.gui.installer_uninstall = undefined;
    fs.writeFileSync(
      evidence.surface[0],
      `${JSON.stringify(report, null, 2)}\n`,
    );
    const result = run(evidence);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /lacks installer-uninstall evidence/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
