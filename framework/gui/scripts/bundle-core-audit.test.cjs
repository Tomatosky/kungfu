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
  const agentSessionPackage = path.join(
    resources,
    'app',
    'node_modules',
    '@kungfu-tech',
    'agent-session',
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
  for (const required of [
    'package.json',
    path.join('src', 'product-client.mjs'),
    path.join('src', 'product-worker.mjs'),
  ]) {
    const requiredPath = path.join(agentSessionPackage, required);
    fs.mkdirSync(path.dirname(requiredPath), { recursive: true });
    fs.writeFileSync(requiredPath, 'fixture');
  }
  return { root, app, helper, agentSessionPackage };
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

test('rejects an app without the detached Agent Session worker', (t) => {
  const fixture = packagedAppFixture();
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }));

  repairNodePtySpawnHelpers(fixture.app);
  fs.rmSync(
    path.join(fixture.agentSessionPackage, 'src', 'product-worker.mjs'),
  );
  assert.throws(
    () => auditPackagedApp(fixture.app),
    /missing packaged Agent Session runtime file/,
  );
});
