// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..', '..', '..');
const authority = fs.readFileSync(
  path.join(root, 'framework/core/src/libkungfu/src/runtime/durability.cpp'),
  'utf8',
);

const evidence = [
  {
    path: 'docs/qualification/evidence/durability/12dd26e899/README.md',
    sha256: '5582d21b3ae0222e0220c956013d86fe562308be968927be9d64f43da1ece732',
  },
  {
    path: 'docs/qualification/evidence/durability/c7c0c680e/single-host-institutional-profile-v1.json',
    sha256: 'a957606deb75644c5b038f067fcabcbb8d128a7015123f818eeccbbd18794f50',
  },
  {
    path: 'docs/qualification/evidence/durability/987201493/aggregate-report.json',
    sha256: '4034b2653c1acd5f1b1608d7e68c3328f91fa501c04f180252c4f22e232bc574',
  },
];

function sha256(pathname) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(pathname))
    .digest('hex');
}

test('product capability authority is bound to retained evidence', () => {
  for (const reference of evidence) {
    assert.equal(sha256(path.join(root, reference.path)), reference.sha256);
    assert.match(authority, new RegExp(reference.path.replaceAll('/', '\\/')));
    assert.match(authority, new RegExp(reference.sha256));
  }
});

test('product capability fails closed outside its named envelope', () => {
  assert.match(authority, /"qualified-test-only"/);
  assert.match(authority, /"test-fixture-only"/);
  assert.match(authority, /"physical power loss"/);
  assert.match(authority, /"same-office-agent120-to-ubuntu222"/);
  assert.match(authority, /"independent backup failure domain"/);
  assert.match(authority, /"production profile eligibility"/);
});
