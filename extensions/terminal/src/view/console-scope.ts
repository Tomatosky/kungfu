export function assistantConsoleId(workspaceId: string): string {
  return `assistant:${workspaceId}`;
}

export function workConsoleId(params: Record<string, string>): string | null {
  if (!params.workEntityId) return null;
  return `work:${params.workProfileId || 'kungfu.mission-control'}:${params.workEntityType || 'work'}:${params.workEntityId}`;
}

export function consoleScopeId(
  workspaceId: string,
  params: Record<string, string>,
): string {
  return workConsoleId(params) ?? assistantConsoleId(workspaceId);
}
