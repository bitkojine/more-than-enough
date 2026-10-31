import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterFrame } from '../../src/game/render/character-sprite.js';

test('the fallback figure stays planted when still, on a boat or not stepping', () => {
  const clip = { pics: [0, 1, 2, 3], fps: 8 };
  for (const time of [0, 10, 1e8]) {
    assert.equal(
      characterFrame(clip, { stride: 0.3, walking: true }, { moving: true, time }),
      1,
      'stride picks the frame, not game time'
    );
    assert.equal(
      characterFrame(clip, { stride: 0.7, walking: true }, { moving: true, water: true, time }),
      0
    );
    assert.equal(characterFrame(clip, { stride: 0.7, walking: false }, { moving: true, time }), 0);
    assert.equal(characterFrame(clip, { stride: 0.7 }, { moving: false, time }), 0);
  }
  assert.equal(
    characterFrame({ pics: [0] }, { stride: 0.7 }, { moving: true }),
    0,
    'a one-picture pack never steps'
  );
});

test('without a stride sample the walk cycles through the stepping frames only', () => {
  const clip = { pics: [0, 1, 2, 3], fps: 8 },
    seen = new Set();
  for (let i = 0; i < 100; i++) seen.add(characterFrame(clip, {}, { moving: true, time: i / 37 }));
  assert.deepEqual([...seen].sort(), [1, 2, 3]);
});
