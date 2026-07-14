import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CONTEXTUAL_COMPANION_WIDTH,
  contextualViewLayout,
} from './src/contextual-view-layout.ts';

test('ordinary contextual views remain right-side overlays', () => {
  assert.deepEqual(contextualViewLayout({}), {
    placement: 'overlay-right',
    companionWidth: null,
    left: 'auto',
    right: 0,
    width: 'min(760px, 68vw)',
    minWidth: 480,
    borderLeft: '1px solid #3c3c3c',
    borderRight: 'none',
    boxShadow: '-18px 0 46px rgba(0, 0, 0, 0.48)',
  });
});

test('a Go Console docks to the left of its reserved detail companion', () => {
  const layout = contextualViewLayout({
    contextPlacement: 'left-of-companion',
    contextCompanionWidth: 'min(520px, 50%)',
  });
  assert.equal(layout.placement, 'left-of-companion');
  assert.equal(layout.left, 0);
  assert.equal(layout.right, 'min(520px, 50%)');
  assert.equal(layout.width, 'auto');
  assert.equal(layout.companionWidth, 'min(520px, 50%)');
});

test('side-by-side contextual views have a stable companion fallback', () => {
  assert.equal(
    contextualViewLayout({ contextPlacement: 'left-of-companion' })
      .companionWidth,
    DEFAULT_CONTEXTUAL_COMPANION_WIDTH,
  );
});
