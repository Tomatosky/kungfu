// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cmdCommand,
  lifecycleEnvironment,
  runShifu,
} from './run-shifu-lifecycle.mjs';

test('copies the lifecycle environment without mutating the caller', () => {
  const env = lifecycleEnvironment(process.env);
  assert.equal(env.PATH, process.env.PATH);
  assert.notEqual(env, process.env);
});

test('runs the Unix shim without a shell', () => {
  const status = runShifu(['--help'], {
    platform: process.platform,
    env: process.env,
    stdio: 'ignore',
  });
  assert.equal(status, 0);
});

test('quotes a Windows shim payload and rejects expansion syntax', () => {
  assert.equal(
    cmdCommand('C:\\repo path\\shifu.cmd', ['install', '--frozen-lockfile']),
    '"C:\\repo path\\shifu.cmd" "install" "--frozen-lockfile"',
  );
  assert.throws(
    () => cmdCommand('C:\\repo\\shifu.cmd', ['task%PATH%']),
    /unsafe cmd syntax/,
  );
});
