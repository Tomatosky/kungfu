// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function git(cwd, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: options.encoding,
    stdio: options.stdio,
  });
  if (result.error) throw result.error;
  return result;
}

function recoverCompleteLocalHistory(cwd) {
  const shallowPathResult = git(cwd, ['rev-parse', '--git-path', 'shallow'], {
    encoding: 'utf8',
  });
  if (shallowPathResult.status !== 0) return false;
  const reportedShallowPath = shallowPathResult.stdout.trim();
  if (!reportedShallowPath) return false;
  const shallowPath = path.resolve(cwd, reportedShallowPath);
  if (!fs.existsSync(shallowPath)) return false;

  const backupPath = `${shallowPath}.gate-measurement-${process.pid}`;
  fs.renameSync(shallowPath, backupPath);
  const connectivity = git(
    cwd,
    ['fsck', '--connectivity-only', '--no-dangling'],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
  if (connectivity.status === 0) {
    fs.unlinkSync(backupPath);
    return true;
  }
  fs.renameSync(backupPath, shallowPath);
  return false;
}

export function prepareGateMeasurementHistory(cwd = process.cwd()) {
  const shallow = git(cwd, ['rev-parse', '--is-shallow-repository'], {
    encoding: 'utf8',
  });
  if (shallow.status !== 0) {
    throw new Error(
      'cannot determine whether the measurement source is shallow',
    );
  }
  if (shallow.stdout.trim() === 'false') return 'already-complete';

  // Self-hosted Actions checkouts are often marked shallow again even though a
  // previous source-locked run left the complete object graph in the local Git
  // store. Prove connectivity without the shallow boundary before reaching out
  // to GitHub; restore the marker unchanged when that proof fails.
  if (recoverCompleteLocalHistory(cwd)) return 'recovered-local';

  const fetched = git(
    cwd,
    [
      'fetch',
      '--unshallow',
      '--no-tags',
      'origin',
      '+refs/heads/*:refs/remotes/origin/*',
    ],
    { stdio: 'inherit' },
  );
  if (fetched.status !== 0) {
    throw new Error('cannot fetch complete measurement source history');
  }
  return 'fetched-origin';
}
