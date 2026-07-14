import type { AgentRuntimeProfile } from '@kungfu-tech/api/capability';

export type WorkConsoleAutoLaunch = {
  key: string;
  profile: AgentRuntimeProfile;
};

export function workConsoleAutoLaunch(input: {
  enabled: boolean;
  requestedConsoleId: string | null;
  workspaceHydrated: boolean;
  catalogBusy: boolean;
  profiles: readonly AgentRuntimeProfile[];
  hasBoundPane: boolean;
  attemptedKeys: ReadonlySet<string>;
}): WorkConsoleAutoLaunch | null {
  if (
    !input.enabled ||
    !input.requestedConsoleId ||
    !input.workspaceHydrated ||
    input.catalogBusy ||
    input.hasBoundPane
  ) {
    return null;
  }
  const profile = input.profiles[0];
  if (!profile) return null;
  const key = `${input.requestedConsoleId}:${profile.id}`;
  return input.attemptedKeys.has(key) ? null : { key, profile };
}
