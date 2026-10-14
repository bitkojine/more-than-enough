import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuality, LEVELS } from '../../src/game/quality.js';

// Feeds `seconds` of frames `ms` apart.
function run(q, ms, seconds) {
  for (let t = 0; t < seconds * 1000; t += ms) q.frame(ms);
}

test('a device that keeps up keeps full quality', () => {
  let steps = 0;
  const q = createQuality(0, 3, () => steps++);
  run(q, 1000 / 60, 30);
  assert.equal(q.level, 0);
  assert.equal(q.dpr, 2);
  assert.ok(q.glass);
  assert.equal(steps, 0);
});

test('a slow device steps down a level at a time, to the last and no further', () => {
  let steps = 0;
  const q = createQuality(0, 3, () => steps++);
  run(q, 1000 / 20, 6);
  assert.equal(q.level, 1, 'one step after a few slow seconds');
  assert.ok(!q.glass, 'the frosted glass goes first');
  run(q, 1000 / 20, 60);
  assert.equal(q.level, LEVELS.length - 1);
  assert.equal(steps, LEVELS.length - 1);
  run(q, 1000 / 60, 60);
  assert.equal(q.level, LEVELS.length - 1, 'never steps back up within a visit');
});

test('pauses and the first seconds are not judged', () => {
  const q = createQuality(0, 2, () => {});
  run(q, 1000 / 20, 2.5);
  assert.equal(q.level, 0, 'the first seconds after starting are a grace period');
  for (let i = 0; i < 100; i++) q.frame(1000);
  assert.equal(q.level, 0, 'long gaps are pauses (a hidden tab), not the pace');
});

test('levels that look the same on this screen are skipped', () => {
  const q = createQuality(0, 1, () => {});
  run(q, 1000 / 20, 6);
  assert.equal(q.level, 1, 'glass off');
  run(q, 1000 / 20, 6);
  assert.equal(q.level, 3, 'a 1x screen draws 1.5x and 1x the same, so straight to fewer pixels');
});

test('a visit starts one level better than the last one settled on', () => {
  assert.equal(createQuality(2, 2, () => {}).level, 1);
  assert.equal(createQuality(0, 2, () => {}).level, 0);
  assert.equal(createQuality(99, 2, () => {}).level, LEVELS.length - 1);
  assert.equal(createQuality(undefined, 2, () => {}).level, 0);
});
