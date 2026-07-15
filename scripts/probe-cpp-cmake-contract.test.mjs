// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the C++ probe searches the Windows libkungfu archive output directory', () => {
  const cmake = fs.readFileSync(
    path.join(ROOT, 'examples/probe-cpp/cmake/kungfu.cmake'),
    'utf8',
  );

  assert.match(
    cmake,
    /PATHS\s+"\$\{KF_CORE_DIR\}\/build\/Release"\s+"\$\{KF_CORE_DIR\}\/build"/,
  );
});
