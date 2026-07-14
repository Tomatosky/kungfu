import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assistantConsoleId,
  consoleScopeId,
  workConsoleId,
} from '../src/view/console-scope.ts';

test('the main Agent Console defaults to the workspace assistant', () => {
  assert.equal(assistantConsoleId('atlas'), 'assistant:atlas');
  assert.equal(consoleScopeId('atlas', {}), 'assistant:atlas');
});

test('a contextual Go drawer selects only its stable work console', () => {
  const params = {
    workProfileId: 'kungfu.mission-control',
    workEntityType: 'go',
    workEntityId: 'go-contextual-console',
  };
  assert.equal(
    workConsoleId(params),
    'work:kungfu.mission-control:go:go-contextual-console',
  );
  assert.equal(consoleScopeId('atlas', params), workConsoleId(params));
});
