import assert from 'node:assert/strict';
import test from 'node:test';

import { openAtlas } from '../src/capability/atlas.ts';

function atlasWithOutput(output: string) {
  return openAtlas({
    runtimeDir: '/tmp/kungfu-atlas-test',
    bin: 'kungfu',
    execFileSync: () => output,
  });
}

test('Atlas capability accepts JSON after native stdout diagnostics', () => {
  const atlas = atlasWithOutput(
    [
      '[2026-07-11 22:28:04.508] [error] no page for current journal',
      '[2026-07-11 22:28:04.508] [critical] no page for current journal',
      '[',
      '  {"mission_id":"kungfu-tech","title":"Kungfu Tech"}',
      ']',
      '',
    ].join('\n'),
  );

  assert.deepEqual(atlas.missions(), [
    { mission_id: 'kungfu-tech', title: 'Kungfu Tech' },
  ]);
});

test('Atlas capability still rejects output without a valid JSON suffix', () => {
  const atlas = atlasWithOutput('[native diagnostic]\n[not-json]');

  assert.throws(() => atlas.missions(), SyntaxError);
});
