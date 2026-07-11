// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lifecycleEnvironment, runShifu } from './run-shifu-lifecycle.mjs';

test('keeps a Cargo environment that already supports lockfile v4', () => {
  const env = lifecycleEnvironment(process.env);
  assert.equal(env.PATH, process.env.PATH);
});

test('runs the Unix shim without a shell', () => {
  const status = runShifu(['--help'], {
    platform: process.platform,
    env: process.env,
    stdio: 'ignore',
  });
  assert.equal(status, 0);
});
