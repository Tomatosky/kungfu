import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardPresentationMatches,
  readDashboardPresentation,
  writeDashboardPresentation,
} from '../src/view/dashboard-presentation.ts';

test('dashboard presentation round-trips Mission, Go, filter and display mode', () => {
  const state = {
    selectedMission: 'mission-kungfu',
    selectedGoal: 'go-contextual-console',
    statusFilter: 'active',
    displayMode: 'visual' as const,
  };
  const settings = writeDashboardPresentation({ existing: 'kept' }, state);
  assert.equal(settings.existing, 'kept');
  assert.deepEqual(readDashboardPresentation(settings), state);
  assert.equal(dashboardPresentationMatches(settings, state), true);
});

test('invalid display modes degrade without blocking dashboard boot', () => {
  assert.deepEqual(
    readDashboardPresentation({
      'work-dashboard.presentation.selectedMission': 'mission-kungfu',
      'work-dashboard.presentation.displayMode': 'broken',
    }),
    {
      selectedMission: 'mission-kungfu',
      selectedGoal: null,
      statusFilter: undefined,
      displayMode: undefined,
    },
  );
});
