// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  exposeGateMeasurementPython,
  gateMeasurementToolPath,
} from './gate-measurement-environment.mjs';

test('keeps the managed uv wrapper ahead of user tool directories', () => {
  const wrapper = path.join('cache', 'uv-wrapper');
  const cargo = path.join('home', '.cargo', 'bin');
  const local = path.join('home', '.local', 'bin');
  const system = path.join('usr', 'bin');
  assert.equal(
    gateMeasurementToolPath(
      [wrapper, system, cargo].join(path.delimiter),
      [cargo, local],
      { managedUv: true },
    ),
    [wrapper, cargo, local, system].join(path.delimiter),
  );
});

test('continues to expose user tools first without a managed uv wrapper', () => {
  const cargo = path.join('home', '.cargo', 'bin');
  const system = path.join('usr', 'bin');
  assert.equal(
    gateMeasurementToolPath(system, [cargo]),
    [cargo, system].join(path.delimiter),
  );
});

test('projects the materialized core environment from the strict uv manifest', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-measurement-env-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const core = path.join(root, 'repo', 'framework', 'core');
  const environment = path.join(root, 'overlay', 'environment');
  const manifestPath = path.join(root, 'manifest.json');
  fs.mkdirSync(core, { recursive: true });
  fs.mkdirSync(environment, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({
      schema: 'shifu.uv-cache-overlay/v1',
      projects: [
        { source: core, overlay: path.join(root, 'overlay'), environment },
      ],
    })}\n`,
  );
  const env = {};
  assert.equal(
    exposeGateMeasurementPython(core, { env, manifestPath }),
    environment,
  );
  assert.equal(env.UV_PROJECT_ENVIRONMENT, environment);
});

test('fails closed when the selected environment was not materialized', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-measurement-env-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const core = path.join(root, 'repo', 'framework', 'core');
  const manifestPath = path.join(root, 'manifest.json');
  fs.mkdirSync(core, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({
      schema: 'shifu.uv-cache-overlay/v1',
      projects: [
        {
          source: core,
          overlay: path.join(root, 'overlay'),
          environment: path.join(root, 'missing'),
        },
      ],
    })}\n`,
  );
  assert.throws(
    () => exposeGateMeasurementPython(core, { env: {}, manifestPath }),
    /not materialized/,
  );
});
