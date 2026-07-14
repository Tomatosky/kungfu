// SPDX-License-Identifier: Apache-2.0

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  auditPackagedApp,
  repairNodePtySpawnHelpers,
} = require('./bundle-core-audit.cjs');

function packagedAppFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kungfu-bundle-audit-'));
  const app = path.join(root, 'Kungfu Episodes.app');
  const resources = path.join(app, 'Contents', 'Resources');
  const runtime = path.join(resources, 'kungfu');
  const helper = path.join(
    resources,
    'app',
    'node_modules',
    'node-pty',
    'prebuilds',
    'darwin-arm64',
    'spawn-helper',
  );
  fs.mkdirSync(runtime, { recursive: true });
  for (const name of [
    'kungfu',
    'kungfu_electron.node',
    'libkungfu.dylib',
    'profile-kfd3.json',
  ]) {
    fs.writeFileSync(path.join(runtime, name), 'fixture');
  }
  fs.mkdirSync(path.dirname(helper), { recursive: true });
  fs.writeFileSync(helper, 'fixture', { mode: 0o644 });
  return { root, app, helper };
}

test('repairs and audits the packaged node-pty Darwin spawn helper', (t) => {
  const fixture = packagedAppFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  assert.throws(
    () => auditPackagedApp(fixture.app),
    /non-executable node-pty Darwin spawn-helper/,
  );
  repairNodePtySpawnHelpers(fixture.app);
  assert.notEqual(fs.statSync(fixture.helper).mode & 0o111, 0);
  assert.doesNotThrow(() => auditPackagedApp(fixture.app));
});
