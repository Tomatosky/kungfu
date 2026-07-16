#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
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

test('focused measurement job budget covers the heaviest Gate with headroom', () => {
  const registry = JSON.parse(
    fs.readFileSync(new URL('../shifu.gates.json', import.meta.url), 'utf8'),
  );
  const workflow = fs.readFileSync(
    new URL('../.github/workflows/gate-measurement.yml', import.meta.url),
    'utf8',
  );
  const focusedJob = workflow.match(
    /\n {2}focused:\n([\s\S]*?)(?=\n {2}[a-zA-Z0-9_-]+:\n|$)/,
  );
  assert.ok(focusedJob, 'focused measurement job must exist');
  const timeout = focusedJob[1].match(/(?:^|\n) {4}timeout-minutes: (\d+)\n/);
  assert.ok(timeout, 'focused measurement job must declare timeout-minutes');
  const jobBudgetSeconds = Number(timeout[1]) * 60;
  const heaviestGateSeconds = Math.max(
    ...registry.gates.map((gate) => gate.cost.timeoutSeconds),
  );
  assert.ok(
    jobBudgetSeconds >= heaviestGateSeconds + 2 * 60 * 60,
    'focused measurement job must leave at least two hours beyond the heaviest Gate action',
  );
});
