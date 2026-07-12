// SPDX-License-Identifier: Apache-2.0

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { beforePackArgs } = require('./before-pack.cjs');

test('passes the tsx ESM loader as a file URL', () => {
  const loader = path.resolve('node_modules', 'tsx', 'dist', 'loader.mjs');
  const generator = path.resolve(
    'framework',
    'gui',
    'scripts',
    'gen-first-party-manifest.mjs',
  );

  const args = beforePackArgs(loader, generator);

  assert.equal(args[0], '--import');
  assert.equal(new URL(args[1]).protocol, 'file:');
  assert.equal(args[2], generator);
});
