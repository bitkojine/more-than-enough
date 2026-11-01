import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdsPicture, poseShape, stillPose, IDLE_FPS } from '../../src/game/render/rig-hold.js';

const still = (time, extra = {}) => ({
  facing: { x: 0, y: 1 },
  walking: false,
  action: null,
  time,
  wiki: { look: { x: 1, y: -1 }, fold: 0, talk: 3, focus: { x: 1, y: 2, at: time } },
  ...extra
});
const frame = 1000 / 30;

test('a still pose differing only by its clocks has the same shape', () => {
  assert.equal(poseShape(still(1)), poseShape(still(1.5)));
  assert.notEqual(poseShape(still(1)), poseShape(still(1, { facing: { x: 1, y: 0 } })));
  assert.notEqual(poseShape(still(1)), poseShape(still(1, { lantern: true })));
});

test('a still Mica is held for one frame in two at the game pace', () => {
  const shape = poseShape(still(1));
  assert.ok(holdsPicture(shape, poseShape(still(1.03)), still(1.03), frame));
  assert.ok(!holdsPicture(shape, poseShape(still(1.07)), still(1.07), 2 * frame + 1));
  assert.ok(1000 / IDLE_FPS > frame && 1000 / IDLE_FPS < 2 * frame + 1);
});

test('walking, working, Wiki talking or a new shape always render', () => {
  const shape = poseShape(still(1));
  for (const options of [
    still(1.03, { walking: true }),
    still(1.03, { action: 'pick' }),
    { ...still(1.03), wiki: { ...still(1.03).wiki, talk: 0.4 } },
    still(1.03, { pickaxe: 2 })
  ])
    assert.ok(!holdsPicture(shape, poseShape(options), options, frame), JSON.stringify(options));
  assert.ok(!holdsPicture(null, shape, still(1), frame), 'nothing rendered yet');
  assert.ok(!holdsPicture(shape, shape, still(1), -5), 'a clock that went back');
});

test('Wiki done talking is still again', () => {
  assert.ok(stillPose({ ...still(1), wiki: { talk: 1.6 } }));
  assert.ok(stillPose({ ...still(1), wiki: { talk: null } }));
  assert.ok(stillPose({ ...still(1), wiki: null }));
});
