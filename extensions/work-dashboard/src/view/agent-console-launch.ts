import type { Profile } from '@kungfu-tech/api/capability';

const MISSION_CONTROL_PROFILE_ID = 'kungfu.mission-control';

export async function resolveMissionControlProfileRoot(
  profile: Pick<Profile, 'managerAsync'> | undefined,
): Promise<string> {
  if (!profile) {
    throw new Error('Profile capability unavailable');
  }

  const manager = await profile.managerAsync();
  const current = manager.profiles.find(
    (candidate) => candidate.profileId === MISSION_CONTROL_PROFILE_ID,
  );
  if (!current) {
    throw new Error('Mission Control Profile is not installed');
  }
  // The lifecycle root remains the active authority while a newer packaged
  // source waits for explicit upgrade approval. catalog.activeExactRoot
  // compares that available source with the lifecycle root; it must not make
  // existing Go-bound Consoles unusable during the approval window.
  if (
    current.lifecycleState !== 'activated' ||
    !current.activated ||
    current.removed ||
    !current.profileSuiteRoot
  ) {
    throw new Error('Mission Control Profile setup is not complete');
  }
  return current.profileSuiteRoot;
}
