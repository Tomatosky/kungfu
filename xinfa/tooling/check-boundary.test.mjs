// SPDX-License-Identifier: Apache-2.0
// @ts-check

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  XINFA_ROOT,
  scanSourceFiles,
  validateBoundary,
} from './check-boundary.mjs';

test('current Xinfa source satisfies the standalone boundary', () => {
  assert.deepEqual(validateBoundary(), []);
});
test('private host-product imports are rejected', () => {
  const boundary = {
    core: {
      forbiddenRustNamespaces: ['shifu', 'kungfu', 'libkungfu'],
      forbiddenPackagePrefixes: ['@kungfu-tech/'],
      forbiddenRelativeRoots: ['../crates', '../framework'],
    },
  };
  const fixture = path.join(
    XINFA_ROOT,
    'tooling',
    'fixtures',
    'private-runtime-import.rs',
  );
  assert.deepEqual(scanSourceFiles([fixture], boundary), [
    'tooling/fixtures/private-runtime-import.rs: forbidden Rust namespace shifu',
    'tooling/fixtures/private-runtime-import.rs: forbidden Rust namespace kungfu',
    'tooling/fixtures/private-runtime-import.rs: forbidden monorepo-relative root ../framework',
  ]);
});
