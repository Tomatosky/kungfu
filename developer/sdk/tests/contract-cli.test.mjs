import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sdk = join(repoRoot, 'developer', 'sdk', 'src', 'sdk.js');

function runJson(args) {
  const result = spawnSync(process.execPath, [sdk, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

for (const [surface, source] of [
  ['config', 'framework/config/kungfu-config.contract.json'],
  ['kfx', 'framework/kfx/kungfu-kfx.contract.json'],
  ['skill', 'framework/skill/kungfu-skill.contract.json'],
]) {
  test(`adopts the registered ${surface} source contract file`, () => {
    const data = runJson([
      'contract',
      'adopt',
      surface,
      '--source',
      source,
      '--json',
    ]);
    assert.equal(data.schema, 'kungfu.sdk.contract-adopt/v1');
    assert.equal(data.ok, true);
    assert.equal(data.surface, surface);
    assert.equal(data.source, source);
    assert.match(data.contract.hash, /^sha256:[0-9a-f]{64}$/);
  });

  test(`renders the registered ${surface} contract as canonical JSON`, () => {
    const data = runJson(['contract', 'render', surface, '--check', '--json']);
    assert.equal(data.schema, 'kungfu.sdk.contract-render-check/v1');
    assert.equal(data.ok, true);
    assert.equal(data.surface, surface);
    assert.equal(data.source, source);
    assert.equal(data.mode, 'canonical-json');
    assert.equal(typeof data.byteForByte, 'boolean');
    assert.match(data.hash, /^sha256:[0-9a-f]{64}$/);
    assert.match(data.renderedHash, /^sha256:[0-9a-f]{64}$/);
  });
}

test('adopt refuses a source path that does not match the registry', () => {
  const result = spawnSync(
    process.execPath,
    [
      sdk,
      'contract',
      'adopt',
      'config',
      '--source',
      'framework/kfx/kungfu-kfx.contract.json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--source does not match registry source/);
});
