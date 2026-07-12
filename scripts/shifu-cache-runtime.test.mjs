// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

import {
  CacheProfileError,
  applyCacheProfile,
  resolveCacheProfile,
  sha256,
  validateProfileBytes,
} from './shifu-cache-runtime.mjs';

const platform =
  process.platform === 'darwin'
    ? `darwin-${process.arch}`
    : process.platform === 'win32'
      ? `windows-${process.arch}`
      : `${process.platform}-${process.arch}`;

function profile(overrides = {}) {
  return {
    $schema: 'https://libkungfu.dev/schemas/shifu/cache-profile-v1.schema.json',
    schema: 'shifu.cache-profile/v1',
    profileId: 'test.cache-profile',
    revision: 1,
    generatedAt: '2026-07-12T00:00:00Z',
    authority: {
      owner: 'test-inventory',
      sourceRef: 'test/inventory.json@revision-1',
      sourceDigest: `sha256:${'1'.repeat(64)}`,
    },
    subject: {
      principal: 'test:runner',
      platforms: [platform],
      scopes: ['development', 'self-hosted-runner', 'ci'],
    },
    policy: {
      mode: 'require',
      onUnavailable: 'fail',
      allowPublicFallback: false,
      secretPolicy: 'references-only',
    },
    services: {
      'npm-registry': {
        kind: 'package-registry',
        mode: 'require',
        endpoint: { type: 'http', url: 'http://cache.example.invalid/npm/' },
        bindings: [
          {
            kind: 'environment',
            key: 'COREPACK_NPM_REGISTRY',
            valueFrom: 'endpoint.url',
          },
        ],
        fallback: { mode: 'fail' },
        verification: { method: 'tool-native' },
      },
    },
    evidence: {
      enabled: true,
      redaction: 'credentials-userinfo-query-fragment',
    },
    ...overrides,
  };
}

function bytes(value = profile()) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function toolConfigProfile() {
  return profile({
    services: {
      'cargo-registry': {
        kind: 'source-index',
        mode: 'require',
        endpoint: {
          type: 'http',
          url: 'http://cache.example.invalid/cargo-index/',
        },
        bindings: [
          {
            kind: 'config-key',
            key: 'cargo.source.crates-io',
            name: 'workhub',
            valueFrom: 'endpoint.url',
          },
        ],
        fallback: { mode: 'fail' },
        verification: { method: 'tool-native' },
      },
      'conan-registry': {
        kind: 'package-registry',
        mode: 'require',
        endpoint: {
          type: 'http',
          url: 'http://cache.example.invalid/conan/',
        },
        bindings: [
          {
            kind: 'config-key',
            key: 'conan.remote.conancenter',
            name: 'workhub-conan',
            valueFrom: 'endpoint.url',
          },
        ],
        fallback: { mode: 'fail' },
        verification: { method: 'tool-native' },
      },
    },
  });
}

test('validates exact bytes and applies only environment bindings', () => {
  const raw = bytes();
  const digest = sha256(raw);
  const resolved = validateProfileBytes(raw, {
    expectedDigest: digest,
    platform,
    scope: 'self-hosted-runner',
  });
  assert.equal(resolved.digest, digest);
  assert.deepEqual(resolved.bindings, {
    COREPACK_NPM_REGISTRY: 'http://cache.example.invalid/npm/',
  });
});

test('fails closed on digest mismatch and secret-like environment keys', () => {
  assert.throws(
    () =>
      validateProfileBytes(bytes(), {
        expectedDigest: `sha256:${'0'.repeat(64)}`,
      }),
    /digest mismatch/,
  );
  const unsafe = profile();
  unsafe.services['npm-registry'].bindings[0].key = 'CACHE_AUTH_TOKEN';
  assert.throws(() => validateProfileBytes(bytes(unsafe)), /secret-like/);
});

test('rejects endpoint credentials, query strings, and unknown fields', () => {
  for (const url of [
    'https://user:pass@cache.example.invalid/npm/',
    'https://cache.example.invalid/npm/?token=redacted',
    'https://cache.example.invalid/npm/#fragment',
  ]) {
    const unsafe = profile();
    unsafe.services['npm-registry'].endpoint.url = url;
    assert.throws(() => validateProfileBytes(bytes(unsafe)), CacheProfileError);
  }
  const unknown = profile({ unexpected: true });
  assert.throws(() => validateProfileBytes(bytes(unknown)), /not supported/);
  const unsupportedConfig = toolConfigProfile();
  unsupportedConfig.services['cargo-registry'].bindings[0].key =
    'cargo.credentials';
  assert.throws(
    () => validateProfileBytes(bytes(unsupportedConfig)),
    /config-key is not supported/,
  );
  const unsafeAlias = toolConfigProfile();
  unsafeAlias.services['cargo-registry'].bindings[0].name = 'workhub.bad';
  assert.throws(
    () => validateProfileBytes(bytes(unsafeAlias)),
    /config-key name is invalid/,
  );
});

test('resolves an HTTP reference and emits a redacted schema receipt', async (t) => {
  const raw = bytes();
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(raw);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const address = server.address();
  const reference = `http://127.0.0.1:${address.port}/profile.json`;
  const resolved = await resolveCacheProfile({
    reference,
    expectedDigest: sha256(raw),
    scope: 'self-hosted-runner',
  });
  assert.equal(resolved.receipt.schema, 'shifu.cache-resolution/v1');
  assert.equal(
    resolved.receipt.redaction,
    'credentials-userinfo-query-fragment',
  );
  assert.equal(
    resolved.receipt.services['npm-registry'].selected.url,
    'http://cache.example.invalid/npm/',
  );
  const schema = JSON.parse(
    fs.readFileSync(
      new URL(
        '../docs/shifu/schema/cache-resolution-v1.schema.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  const ajv = new Ajv2020({ strict: false });
  ajv.addFormat('date-time', (value) => Number.isFinite(Date.parse(value)));
  ajv.addFormat('uri-reference', () => true);
  const validate = ajv.compile(schema);
  assert.equal(
    validate(resolved.receipt),
    true,
    JSON.stringify(validate.errors),
  );
});

test('cache apply injects bindings and writes a receipt', async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'shifu-cache-apply-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const raw = bytes();
  const profilePath = path.join(directory, 'profile.json');
  const outputPath = path.join(directory, 'child.json');
  const receiptPath = path.join(directory, 'receipt.json');
  fs.writeFileSync(profilePath, raw);
  const script = `require('node:fs').writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({value: process.env.COREPACK_NPM_REGISTRY, active: process.env.SHIFU_CACHE_ACTIVE}))`;
  const status = await applyCacheProfile({
    reference: profilePath,
    expectedDigest: sha256(raw),
    scope: 'development',
    receiptPath,
    command: process.execPath,
    args: ['-e', script],
  });
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, 'utf8')), {
    value: 'http://cache.example.invalid/npm/',
    active: '1',
  });
  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  assert.equal(receipt.profile.digest, sha256(raw));
  assert.match(receipt.execution.id, /^run:/);
});

test('cache apply overrides Cargo and isolates Conan without mutating persistent config', async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'shifu-cache-config-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const persistentCargo = path.join(directory, 'persistent-cargo');
  const persistentConan = path.join(directory, 'persistent-conan');
  fs.mkdirSync(persistentCargo);
  fs.mkdirSync(persistentConan);
  const cargoSentinel = '[sentinel]\nvalue = "persistent-cargo"\n';
  const conanSentinel = '{"sentinel":"persistent-conan"}\n';
  fs.writeFileSync(path.join(persistentCargo, 'config.toml'), cargoSentinel);
  fs.writeFileSync(path.join(persistentConan, 'remotes.json'), conanSentinel);

  const raw = bytes(toolConfigProfile());
  const profilePath = path.join(directory, 'profile.json');
  const outputPath = path.join(directory, 'child.json');
  const receiptPath = path.join(directory, 'receipt.json');
  const fakeCargoArgsPath = path.join(directory, 'fake-cargo-args.json');
  const fakeBin = path.join(directory, 'fake-bin');
  fs.mkdirSync(fakeBin);
  const fakeCargoModule = path.join(fakeBin, 'fake-cargo.mjs');
  fs.writeFileSync(
    fakeCargoModule,
    `import fs from 'node:fs'; fs.writeFileSync(process.env.FAKE_CARGO_ARGS, JSON.stringify(process.argv.slice(2)));\n`,
  );
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(fakeBin, 'cargo.cmd'),
      '@node "%~dp0fake-cargo.mjs" %*\r\n',
    );
  } else {
    fs.writeFileSync(
      path.join(fakeBin, 'cargo'),
      "#!/usr/bin/env node\nimport './fake-cargo.mjs';\n",
      { mode: 0o700 },
    );
  }
  fs.writeFileSync(profilePath, raw);
  const script = [
    "const cp = require('node:child_process');",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const result = cp.spawnSync('cargo', ['metadata'], {stdio: 'inherit'});",
    'if (result.status !== 0) process.exit(result.status || 1);',
    `fs.writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({`,
    'cargoHome: process.env.CARGO_HOME,',
    'conanHome: process.env.CONAN_HOME,',
    'wrapperDir: process.env.PATH.split(path.delimiter)[0],',
    "conanRemotes: JSON.parse(fs.readFileSync(path.join(process.env.CONAN_HOME, 'remotes.json'), 'utf8')),",
    'managedConan: process.env.SHIFU_CACHE_MANAGED_CONAN,',
    '}));',
  ].join('');
  const status = await applyCacheProfile({
    reference: profilePath,
    expectedDigest: sha256(raw),
    scope: 'development',
    receiptPath,
    command: process.execPath,
    args: ['-e', script],
    env: {
      ...process.env,
      CARGO_HOME: persistentCargo,
      CONAN_HOME: persistentConan,
      FAKE_CARGO_ARGS: fakeCargoArgsPath,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
    },
  });
  assert.equal(status, 0);
  const child = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(child.cargoHome, persistentCargo);
  assert.notEqual(child.conanHome, persistentConan);
  assert.deepEqual(JSON.parse(fs.readFileSync(fakeCargoArgsPath, 'utf8')), [
    '--config',
    'source.crates-io.replace-with="workhub"',
    '--config',
    'source.workhub.registry="sparse+http://cache.example.invalid/cargo-index/"',
    'metadata',
  ]);
  assert.deepEqual(child.conanRemotes, {
    remotes: [
      {
        name: 'workhub-conan',
        url: 'http://cache.example.invalid/conan/',
        verify_ssl: false,
      },
    ],
  });
  assert.equal(child.managedConan, '1');
  assert.equal(
    fs.readFileSync(path.join(persistentCargo, 'config.toml'), 'utf8'),
    cargoSentinel,
  );
  assert.equal(
    fs.readFileSync(path.join(persistentConan, 'remotes.json'), 'utf8'),
    conanSentinel,
  );
  assert.equal(fs.existsSync(child.wrapperDir), false);
  assert.equal(fs.existsSync(child.conanHome), false);

  const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  for (const service of Object.values(receipt.services)) {
    assert.deepEqual(service.application.bindingKinds, ['config-key']);
    assert.equal(service.application.scope, 'child-process');
    assert.equal(
      service.application.persistentConfig,
      'not-read-or-written-by-shifu',
    );
    assert.equal(service.application.overlayCleanup, 'completed');
  }
  assert.doesNotMatch(
    JSON.stringify(receipt),
    /persistent-cargo|persistent-conan/,
  );
  assert.doesNotMatch(JSON.stringify(receipt), /shifu-cache-overlay-/);
});

test('cache apply cleans config overlays after a failing child', async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'shifu-cache-failure-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const raw = bytes(toolConfigProfile());
  const profilePath = path.join(directory, 'profile.json');
  const outputPath = path.join(directory, 'child.json');
  fs.writeFileSync(profilePath, raw);
  const script = `const path = require('node:path'); require('node:fs').writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify({wrapperDir: process.env.PATH.split(path.delimiter)[0], conanHome: process.env.CONAN_HOME})); process.exit(17)`;
  const status = await applyCacheProfile({
    reference: profilePath,
    expectedDigest: sha256(raw),
    scope: 'development',
    command: process.execPath,
    args: ['-e', script],
  });
  assert.equal(status, 17);
  const child = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(fs.existsSync(child.wrapperDir), false);
  assert.equal(fs.existsSync(child.conanHome), false);
});

test('cache apply is a transparent pass-through when no profile is configured', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shifu-cache-pass-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, 'ran');
  const status = await applyCacheProfile({
    command: process.execPath,
    args: [
      '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(outputPath)}, 'yes')`,
    ],
  });
  assert.equal(status, 0);
  assert.equal(fs.readFileSync(outputPath, 'utf8'), 'yes');
});
