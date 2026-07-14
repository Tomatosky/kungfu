// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cacheAppliedArgs,
  cacheAwareArgs,
  cmdCommand,
  lifecycleEnvironment,
  runShifu,
} from './run-shifu-lifecycle.mjs';

test('an active cache projection is reused without acquiring a second partition', () => {
  assert.deepEqual(
    cacheAwareArgs(['pack:spec'], { env: { SHIFU_CACHE_ACTIVE: '1' } }),
    ['pack:spec'],
  );
});

test('an inactive lifecycle enters the cache projection exactly once', () => {
  assert.deepEqual(
    cacheAwareArgs(['pack:spec'], {
      env: {},
      node: '/node',
      script: '/repo/scripts/run-shifu-lifecycle.mjs',
    }),
    [
      'cache',
      'apply',
      '--',
      '/node',
      '/repo/scripts/run-shifu-lifecycle.mjs',
      'direct',
      'pack:spec',
    ],
  );
});

test('copies the lifecycle environment without mutating the caller', () => {
  const env = lifecycleEnvironment(process.env);
  assert.equal(env.PATH, process.env.PATH);
  assert.notEqual(env, process.env);
});

test('wraps a lifecycle task in cache apply without a shell command', () => {
  assert.deepEqual(
    cacheAppliedArgs(['verify', '--fuzz'], {
      node: '/node path/node',
      script: '/repo path/run-shifu-lifecycle.mjs',
    }),
    [
      'cache',
      'apply',
      '--',
      '/node path/node',
      '/repo path/run-shifu-lifecycle.mjs',
      'direct',
      'verify',
      '--fuzz',
    ],
  );
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
