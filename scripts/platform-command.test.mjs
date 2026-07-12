// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import test from 'node:test';
import { platformCommand } from './platform-command.mjs';

test('resolves package-manager shims on Windows only', () => {
  assert.equal(platformCommand('npm', 'win32'), 'npm.cmd');
  assert.equal(platformCommand('npx', 'win32'), 'npx.cmd');
  assert.equal(platformCommand('pnpm', 'win32'), 'pnpm.cmd');
  assert.equal(platformCommand('cargo', 'win32'), 'cargo');
  assert.equal(platformCommand('npm', 'linux'), 'npm');
});
