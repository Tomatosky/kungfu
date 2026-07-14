import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentRuntimeProfile } from '@kungfu-tech/api/capability';
import { workConsoleAutoLaunch } from '../src/view/auto-launch.ts';

const profile = {
  id: 'codex-default',
  label: 'Codex',
} as AgentRuntimeProfile;

const base = {
  enabled: true,
  requestedConsoleId: 'work:kungfu.mission-control:go:go-1',
  workspaceHydrated: true,
  catalogBusy: false,
  profiles: [profile],
  hasBoundPane: false,
  attemptedKeys: new Set<string>(),
};

test('a bound Go Console selects the preferred Agent for immediate launch', () => {
  assert.deepEqual(workConsoleAutoLaunch(base), {
    key: 'work:kungfu.mission-control:go:go-1:codex-default',
    profile,
  });
});

test('auto launch waits for persistence and Agent discovery', () => {
  assert.equal(
    workConsoleAutoLaunch({ ...base, workspaceHydrated: false }),
    null,
  );
  assert.equal(workConsoleAutoLaunch({ ...base, catalogBusy: true }), null);
});

test('auto launch never duplicates an existing or attempted Go session', () => {
  assert.equal(workConsoleAutoLaunch({ ...base, hasBoundPane: true }), null);
  assert.equal(
    workConsoleAutoLaunch({
      ...base,
      attemptedKeys: new Set([
        'work:kungfu.mission-control:go:go-1:codex-default',
      ]),
    }),
    null,
  );
});

test('the global assistant remains explicitly launched by the user', () => {
  assert.equal(
    workConsoleAutoLaunch({ ...base, requestedConsoleId: null }),
    null,
  );
  assert.equal(workConsoleAutoLaunch({ ...base, enabled: false }), null);
});
