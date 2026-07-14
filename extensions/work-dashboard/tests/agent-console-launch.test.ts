import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ManagedProfile,
  Profile,
  ProfileManagerProjection,
} from '@kungfu-tech/api/capability';
import { resolveMissionControlProfileRoot } from '../src/view/agent-console-launch.ts';

const ROOT = `sha256:${'a'.repeat(64)}`;

function managedProfile(
  overrides: Partial<ManagedProfile> = {},
): ManagedProfile {
  return {
    profileId: 'kungfu.mission-control',
    profileVersion: '3.0.0',
    profileSuiteRoot: ROOT,
    profileRevision: 1,
    lifecycleState: 'activated',
    activated: true,
    removed: false,
    grantedPermissions: [],
    qualification: {},
    availableRoots: 1,
    source: '/tmp/mission-control.profile.json',
    health: 'active',
    catalog: {
      schema: 'kungfu.profile-composition/v1',
      profileId: 'kungfu.mission-control',
      profileVersion: '3.0.0',
      profileSuiteRoot: ROOT,
      profileRevision: 1,
      activeExactRoot: true,
      memberRoots: {},
      purposes: [],
      factSurfaces: [],
      claims: [],
      policies: [],
      views: [],
      diagnostics: [],
      catalogRoot: `sha256:${'b'.repeat(64)}`,
    },
    diagnostics: [],
    ...overrides,
  };
}

function profileWith(
  ...profiles: ManagedProfile[]
): Pick<Profile, 'managerAsync'> {
  const projection: ProfileManagerProjection = {
    schema: 'kungfu.profile-manager/v1',
    runtimeDir: '/tmp/profile-runtime',
    cutSystemTime: 1,
    profiles,
    count: profiles.length,
    knownLimits: [],
  };
  return { managerAsync: async () => projection };
}

test('Agent Console binds the current active exact Profile root without an assessment', async () => {
  assert.equal(
    await resolveMissionControlProfileRoot(profileWith(managedProfile())),
    ROOT,
  );
});

test('Agent Console keeps using the active lifecycle root while an upgrade waits for approval', async () => {
  const catalog = managedProfile().catalog;
  assert.ok(catalog);
  assert.equal(
    await resolveMissionControlProfileRoot(
      profileWith(
        managedProfile({
          health: 'inactive',
          catalog: {
            ...catalog,
            profileSuiteRoot: `sha256:${'c'.repeat(64)}`,
            activeExactRoot: false,
          },
        }),
      ),
    ),
    ROOT,
  );
});

test('Agent Console refuses a Profile without an active lifecycle root', async () => {
  await assert.rejects(
    resolveMissionControlProfileRoot(
      profileWith(
        managedProfile({
          lifecycleState: 'qualified',
          activated: false,
          health: 'inactive',
        }),
      ),
    ),
    /setup is not complete/,
  );
});

test('Agent Console reports missing Profile capability and installation', async () => {
  await assert.rejects(
    resolveMissionControlProfileRoot(undefined),
    /capability unavailable/,
  );
  await assert.rejects(
    resolveMissionControlProfileRoot(profileWith()),
    /not installed/,
  );
});
