import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sdk = join(repoRoot, 'developer', 'sdk', 'src', 'sdk.js');

function runJson(args, cwd = repoRoot) {
  const result = spawnSync(process.execPath, [sdk, ...args], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function makeContractRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'kungfu-sdk-contract-'));
  const contractDir = join(root, 'framework', 'contract');
  mkdirSync(contractDir, { recursive: true });
  writeFileSync(
    join(contractDir, 'kungfu-contracts.registry.json'),
    `${JSON.stringify(
      {
        schema: 'kungfu.contract-registry/v1',
        id: 'kungfu-contract-registry',
        version: 1,
        description: 'test registry',
        contracts: [],
      },
      null,
      2,
    )}\n`,
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
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

test('adds a new contract source and registry entry in a repo fixture', (t) => {
  const root = makeContractRepo(t);
  const data = runJson(['contract', 'add', 'demo-surface', '--json'], root);
  assert.equal(data.schema, 'kungfu.sdk.contract-add/v1');
  assert.equal(data.ok, true);
  assert.equal(data.surface, 'demo-surface');
  assert.equal(data.source, 'framework/contract/demo-surface.contract.json');
  assert.equal(data.artifact, 'config/demo-surface.contract.json');
  assert.equal(data.env, 'KUNGFU_DEMO_SURFACE_CONTRACT');
  assert.match(data.next.versioning, /docs\/versioning\.md/);
  assert.match(data.next.knownLimits, /docs\/known-limits\.md/);
  assert.match(data.contract.hash, /^sha256:[0-9a-f]{64}$/);

  const sourcePath = join(root, data.source);
  assert.equal(existsSync(sourcePath), true);
  const registry = JSON.parse(
    readFileSync(
      join(root, 'framework', 'contract', 'kungfu-contracts.registry.json'),
      'utf8',
    ),
  );
  assert.equal(registry.contracts.length, 1);
  assert.equal(registry.contracts[0].surface, 'demo-surface');

  const adopt = runJson(
    ['contract', 'adopt', 'demo-surface', '--source', data.source, '--json'],
    root,
  );
  assert.equal(adopt.ok, true);
});

test('add refuses an already registered surface', (t) => {
  const root = makeContractRepo(t);
  runJson(['contract', 'add', 'demo-surface', '--json'], root);
  const result = spawnSync(
    process.execPath,
    [sdk, 'contract', 'add', 'demo-surface'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /already registered/);
});

test('render --write canonicalizes only when explicitly requested', (t) => {
  const root = makeContractRepo(t);
  const added = runJson(['contract', 'add', 'demo-surface', '--json'], root);
  const sourcePath = join(root, added.source);
  const contract = JSON.parse(readFileSync(sourcePath, 'utf8'));
  writeFileSync(sourcePath, JSON.stringify(contract));

  const check = runJson(
    ['contract', 'render', 'demo-surface', '--check', '--json'],
    root,
  );
  assert.equal(check.ok, true);
  assert.equal(check.byteForByte, false);

  const written = runJson(
    ['contract', 'render', 'demo-surface', '--write', '--json'],
    root,
  );
  assert.equal(written.schema, 'kungfu.sdk.contract-render-write/v1');
  assert.equal(written.ok, true);
  assert.equal(written.changed, true);
  assert.match(written.previousHash, /^sha256:[0-9a-f]{64}$/);
  assert.match(written.hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(
    readFileSync(sourcePath, 'utf8'),
    `${JSON.stringify(contract, null, 2)}\n`,
  );

  const after = runJson(
    ['contract', 'render', 'demo-surface', '--check', '--json'],
    root,
  );
  assert.equal(after.ok, true);
  assert.equal(after.byteForByte, true);
});
