/* Flyers (src/game/effects.js): what you gather floats home to the stockpile
 * slowly enough to follow, bundles up instead of flickering, and stays in
 * budget. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_SPEED } from '../../src/core/index.js';
import { createEffects } from '../../src/game/effects.js';

const look = { color: () => '#fff' };
const home = { x: 0.5, y: 0.5 };
const fresh = () => createEffects(look, () => home);

function run(fx, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) fx.update(dt);
}

test('effects: flyers drift home slower than you walk, and land there', () => {
  const fx = fresh();
  fx.flyersFrom(20, 0, 'stone', 5);
  assert.equal(fx.flyers.length, 1);
  const f = fx.flyers[0];
  const dist = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
  assert.ok(dist / f.dur < BASE_SPEED, 'a walking player can keep up');
  run(fx, f.dur * 0.5);
  assert.equal(fx.flyers.length, 1, 'still on its way halfway');
  assert.ok(f.y < (f.y0 + f.y1) / 2, 'floats above the ground');
  run(fx, f.dur * 0.5 + 0.1);
  assert.equal(fx.flyers.length, 0, 'landed');
});

test('effects: a run of gains from one tile rides on one flyer', () => {
  const fx = fresh();
  for (let i = 0; i < 6; i++) { fx.flyersFrom(10, 4, 'ore', 3); run(fx, 0.25); }
  assert.equal(fx.flyers.length, 1);
  assert.equal(fx.flyers[0].amount, 18);
  fx.flyersFrom(10, 4, 'crystal', 1);
  fx.flyersFrom(11, 4, 'ore', 1);
  assert.equal(fx.flyers.length, 3, 'another resource or tile gets its own');
  run(fx, 1);
  fx.flyersFrom(10, 4, 'ore', 1);
  assert.equal(fx.flyers.length, 4, 'a steady stream leaves a trail of bundles');
});

test('effects: over budget, the oldest flyer makes way for the newest', () => {
  const fx = fresh();
  for (let i = 0; i < 100; i++) fx.flyersFrom(i * 3, 50, 'stone', 1);
  assert.equal(fx.flyers.length, 40);
  assert.equal(fx.flyers.at(-1).tx, 297, 'the latest gain is shown');
  fx.clear();
  assert.equal(fx.flyers.length, 0);
});
