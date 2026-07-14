export type DashboardPresentation = {
  selectedMission: string;
  selectedGoal: string | null;
  statusFilter: string;
  displayMode: 'visual' | 'audit';
};

const PREFIX = 'work-dashboard.presentation.';

export function readDashboardPresentation(
  settings: Record<string, string>,
): Partial<DashboardPresentation> {
  const displayMode = settings[`${PREFIX}displayMode`];
  return {
    selectedMission: settings[`${PREFIX}selectedMission`] || undefined,
    selectedGoal: settings[`${PREFIX}selectedGoal`] || null,
    statusFilter: settings[`${PREFIX}statusFilter`] || undefined,
    displayMode:
      displayMode === 'visual' || displayMode === 'audit'
        ? displayMode
        : undefined,
  };
}

export function writeDashboardPresentation(
  settings: Record<string, string>,
  presentation: DashboardPresentation,
): Record<string, string> {
  return {
    ...settings,
    [`${PREFIX}selectedMission`]: presentation.selectedMission,
    [`${PREFIX}selectedGoal`]: presentation.selectedGoal ?? '',
    [`${PREFIX}statusFilter`]: presentation.statusFilter,
    [`${PREFIX}displayMode`]: presentation.displayMode,
  };
}

export function dashboardPresentationMatches(
  settings: Record<string, string>,
  presentation: DashboardPresentation,
): boolean {
  const current = readDashboardPresentation(settings);
  return (
    current.selectedMission === presentation.selectedMission &&
    (current.selectedGoal ?? null) === presentation.selectedGoal &&
    current.statusFilter === presentation.statusFilter &&
    current.displayMode === presentation.displayMode
  );
}
