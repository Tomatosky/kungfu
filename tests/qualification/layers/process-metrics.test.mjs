// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';
import { runMeasured } from './process-metrics.mjs';

test('records peak resident memory for a short-lived cross-platform process', async () => {
  const result = await runMeasured(process.execPath, [
    '-e',
    'const data = Buffer.alloc(4 * 1024 * 1024); setTimeout(() => console.log(data.length), 150)',
  ]);
  assert.match(result.stdout, /4194304/);
  assert.ok(result.durationMs >= 100);
  assert.ok(result.peakResidentBytes > 4 * 1024 * 1024);
});
