#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('./run-focused-gate-measurement.mjs', import.meta.url),
);

function run(environment = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: {
      ...process.env,
      KUNGFU_GATE_MEASUREMENT_CAPABILITIES: '[]',
      KUNGFU_GATE_MEASUREMENT_FOCUS: '',
      ...environment,
    },
  });
}

test('focused measurement requires at least one Gate id', () => {
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /KUNGFU_GATE_MEASUREMENT_FOCUS is required/);
});

test('focused measurement rejects invalid Gate ids before execution', () => {
  const result = run({ KUNGFU_GATE_MEASUREMENT_FOCUS: 'not a gate' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical Gate id grammar/);
});

test('focused measurement rejects invalid capability JSON before execution', () => {
  const result = run({
    KUNGFU_GATE_MEASUREMENT_CAPABILITIES: '{',
    KUNGFU_GATE_MEASUREMENT_FOCUS: 'docs.contracts',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be JSON/);
});
