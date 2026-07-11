// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findOne, installerKind } from './installer.mjs';

test('recognizes every supported desktop installer family', () => {
  assert.equal(installerKind('Kungfu.dmg'), 'dmg');
  assert.equal(installerKind('Kungfu.AppImage'), 'appimage');
  assert.equal(installerKind('Kungfu Setup.exe'), 'nsis');
  assert.throws(() => installerKind('Kungfu.zip'), /unsupported/);
});

test('DMG discovery stops below the matched application bundle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kungfu-installer-find-'));
  try {
    const app = path.join(root, 'Kungfu Episodes.app');
    fs.mkdirSync(
      path.join(app, 'Contents', 'Frameworks', 'Kungfu Episodes Helper.app'),
      { recursive: true },
    );
    assert.equal(
      findOne(
        root,
        (target, entry) => entry.isDirectory() && target.endsWith('.app'),
        'DMG application',
      ),
      app,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
