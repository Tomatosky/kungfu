// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { releaseQualificationStages } from './run-release-qualification.mjs';

const names = (platform) =>
  releaseQualificationStages(platform).map(([name]) => name);

test('canonical Episode release evidence runs once on the Linux release leg', () => {
  assert.ok(names('linux').includes('episode:qualify:release'));
  assert.ok(!names('darwin').includes('episode:qualify:release'));
  assert.ok(!names('win32').includes('episode:qualify:release'));
});

test('ADR admission follows Episode evidence only on the Linux release leg', () => {
  const linux = names('linux');
  assert.equal(
    linux.indexOf('adr:release:gate'),
    linux.indexOf('episode:qualify:release') + 1,
  );
  assert.ok(!names('darwin').includes('adr:release:gate'));
  assert.ok(!names('win32').includes('adr:release:gate'));
});

test('every platform retains exact artifact qualification stages', () => {
  const required = [
    'verify',
    'pack:spec',
    'layers:qualify:format',
    'pack:sdk',
    'layers:qualify:sdk',
    'layers:qualify:surfaces',
  ];
  for (const platform of ['linux', 'darwin', 'win32'])
    assert.deepEqual(
      names(platform).filter(
        (name) =>
          name !== 'episode:qualify:release' && name !== 'adr:release:gate',
      ),
      required,
    );
});
