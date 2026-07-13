// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { sourceAcceptancePlan } from './source-acceptance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('source plan covers representative source-only checks', () => {
  const plan = sourceAcceptancePlan([
    'scripts/example.mjs',
    'framework/core/src/python/example.py',
    'framework/core/src/example.cpp',
  ]);
  const labels = plan.map((step) => step.label);
  assert.ok(labels.includes('changed web source format and lint'));
  assert.ok(labels.includes('changed Python format'));
  assert.ok(labels.includes('Python type baseline'));
  assert.ok(labels.includes('changed C/C++ format'));
  assert.ok(labels.includes('documentation contracts'));
});

test('source plan cannot enter build, compiler, artifact, or release lifecycles', () => {
  const plan = sourceAcceptancePlan(['scripts/example.mjs']);
  const commands = plan
    .map((step) => [step.command, ...step.args].join(' '))
    .join('\n');
  assert.doesNotMatch(
    commands,
    /(?:^|\s)(?:cargo|rustc|cc|c\+\+|gcc|g\+\+|clang|cmake|conan|ninja)(?:\s|$)/im,
  );
  assert.doesNotMatch(
    commands,
    /(?:^|[\s:])(?:build|dist|package|freeze|verify|publish|release)(?:\s|$)/im,
  );
});

test('reusable workflow is bound to source mode and the review train', () => {
  const workflow = fs.readFileSync(
    path.join(ROOT, '.github/workflows/source-acceptance.yml'),
    'utf8',
  );
  assert.match(workflow, /mode: source/);
  assert.match(workflow, /train\/v2\/v2\.3\/source-check-mode-env/);
  assert.doesNotMatch(workflow, /self-hosted/);
});
