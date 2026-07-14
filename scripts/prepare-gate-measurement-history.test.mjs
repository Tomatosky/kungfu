// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { prepareGateMeasurementHistory } from './prepare-gate-measurement-history.mjs';

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeRepository(root) {
  const repository = path.join(root, 'origin');
  fs.mkdirSync(repository);
  git(repository, 'init');
  git(repository, 'config', 'user.name', 'Gate History Test');
  git(repository, 'config', 'user.email', 'gate-history@example.invalid');
  fs.writeFileSync(path.join(repository, 'fixture.txt'), 'one\n');
  git(repository, 'add', 'fixture.txt');
  git(repository, 'commit', '-m', 'first');
  fs.appendFileSync(path.join(repository, 'fixture.txt'), 'two\n');
  git(repository, 'commit', '-am', 'second');
  return repository;
}

test('recovers a complete local object graph without fetching origin', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-history-local-'));
  try {
    const repository = makeRepository(root);
    const head = git(repository, 'rev-parse', 'HEAD');
    const shallowPath = path.resolve(
      repository,
      git(repository, 'rev-parse', '--git-path', 'shallow'),
    );
    fs.writeFileSync(shallowPath, `${head}\n`);
    assert.equal(
      git(repository, 'rev-parse', '--is-shallow-repository'),
      'true',
    );

    assert.equal(prepareGateMeasurementHistory(repository), 'recovered-local');
    assert.equal(
      git(repository, 'rev-parse', '--is-shallow-repository'),
      'false',
    );
    assert.equal(git(repository, 'rev-list', '--count', 'HEAD'), '2');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('falls back to an unshallow fetch when objects are genuinely absent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-history-fetch-'));
  try {
    const origin = makeRepository(root);
    const checkout = path.join(root, 'checkout');
    execFileSync('git', ['clone', '--depth=1', `file://${origin}`, checkout], {
      stdio: 'ignore',
    });
    assert.equal(git(checkout, 'rev-parse', '--is-shallow-repository'), 'true');

    assert.equal(prepareGateMeasurementHistory(checkout), 'fetched-origin');
    assert.equal(
      git(checkout, 'rev-parse', '--is-shallow-repository'),
      'false',
    );
    assert.equal(git(checkout, 'rev-list', '--count', 'HEAD'), '2');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
