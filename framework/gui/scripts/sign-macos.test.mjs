// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  resolveMacSigningIdentity,
  resolveMacSigningIgnore,
} from './sign-macos.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');

test('preserves an explicit certificate hash for duplicate named identities', () => {
  assert.equal(
    resolveMacSigningIdentity(
      { identity: 'Developer ID Application: Example (TEAMID)' },
      { CSC_NAME: '0123456789abcdef0123456789abcdef01234567' },
    ),
    '0123456789abcdef0123456789abcdef01234567',
  );
});

test('falls back to the identity resolved by electron-builder', () => {
  assert.equal(
    resolveMacSigningIdentity(
      { identity: 'Developer ID Application: Example (TEAMID)' },
      { CSC_NAME: 'Example' },
    ),
    'Developer ID Application: Example (TEAMID)',
  );
});

test('skips Python bytecode without skipping native runtime code', () => {
  const shouldIgnore = resolveMacSigningIgnore();

  assert.equal(shouldIgnore('/app/runtime/pkg/module.pyc'), true);
  assert.equal(shouldIgnore('C:\\app\\runtime\\pkg\\module.pyo'), true);
  assert.equal(shouldIgnore('/app/runtime/pkg/__pycache__/module.data'), true);
  assert.equal(shouldIgnore('/app/runtime/pkg/native.so'), false);
  assert.equal(shouldIgnore('/app/runtime/pkg/native.dylib'), false);
  assert.equal(shouldIgnore('/app/runtime/kungfu'), false);
});

test('preserves existing string, array, and function ignore rules', () => {
  const existingFunction = (filePath) => filePath.endsWith('.map');

  assert.equal(
    resolveMacSigningIgnore('existing-pattern')('/app/existing-pattern'),
    true,
  );
  assert.equal(
    resolveMacSigningIgnore(['first-pattern', 'second-pattern'])(
      '/app/second-pattern',
    ),
    true,
  );
  assert.equal(
    resolveMacSigningIgnore(existingFunction)('/app/source.map'),
    true,
  );
});

test('returns one function so osx-sign does not discard the ignore option', () => {
  assert.equal(
    typeof resolveMacSigningIgnore(['existing-pattern']),
    'function',
  );
});

test('both desktop builders resolve the signing hook from the GUI project', () => {
  for (const config of [
    'framework/gui/electron-builder.yml',
    'product/electron-builder.yml',
  ]) {
    assert.match(
      fs.readFileSync(path.join(ROOT, config), 'utf8'),
      /^\s+sign: \.\/scripts\/sign-macos\.mjs$/m,
      config,
    );
  }
});
