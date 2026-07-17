// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  nearestRank,
  report,
  selectedContext,
  summarize,
  validateBaseline,
} from './measure-dev-required-latency.mjs';

test('nearest-rank percentiles preserve the observed tail', () => {
  assert.equal(nearestRank([100, 200, 300, 400], 0.5), 200);
  assert.equal(nearestRank([100, 200, 300, 400], 0.95), 400);
  assert.equal(nearestRank([], 0.95), null);
});

test('an under-sized passing window remains non-qualifying', () => {
  const sample = {
    excluded: false,
    durationMs: 120000,
    classification: { kind: 'native' },
  };
  const value = report('owner/repo', 'dev', ['required'], [sample]);
  assert.equal(value.verdict.qualified, false);
  assert.match(value.verdict.reason, /insufficient/);
});

test('summary reports sample count and queue-inclusive distribution', () => {
  assert.deepEqual(
    summarize([
      { durationMs: 120000 },
      { durationMs: 300000 },
      { durationMs: 700000 },
    ]),
    { sampleCount: 3, p50Ms: 300000, p95Ms: 700000, maxMs: 700000 },
  );
});

test('context duration starts at the workflow run creation time', () => {
  const context = selectedContext(
    [
      {
        id: 7,
        name: 'required',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-07-17T00:03:00Z',
        completed_at: '2026-07-17T00:05:00Z',
        details_url: 'https://github.com/owner/repo/actions/runs/42/job/7',
      },
    ],
    [{ id: 42, created_at: '2026-07-17T00:00:00Z' }],
    'required',
  );
  assert.equal(context.startAuthority, 'workflow.created_at');
  assert.equal(context.durationMs, 300000);
  assert.equal(context.queueMs, 180000);
});

test('live required contexts must match the retained baseline authority', () => {
  const baseline = {
    $schema: 'kungfu.dev-required-latency-baseline/v1',
    requiredContexts: ['a', 'b'],
  };
  assert.equal(validateBaseline(baseline, ['b', 'a']), true);
  assert.throws(
    () => validateBaseline(baseline, ['a', 'c']),
    /live required contexts drifted/,
  );
});
