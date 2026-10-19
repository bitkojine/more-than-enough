/* Flyers (src/game/effects.js): what you gather floats home to the stockpile
 * slowly enough to follow, bundles up instead of flickering, and stays in
 * budget. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_SPEED } from '../../src/core/index.js';
import { createEffects } from '../../src/game/effects.js';

const look = { color: () => '#fff' };
const home = { x: 0.5, y: 0.5 };
// The screen: 9 x 17 tiles around `you`, as on a phone held upright.
const fresh = (you = { x: 15, y: 5 }) => createEffects(look, () => home, (x, y) => Math.abs(x - you.x) < 4.5 && Math.abs(y - you.y) < 8.5, () => 40);

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

test('effects: a run of gains from one spot rides on one flyer', () => {
  const fx = fresh();
  for (let i = 0; i < 6; i++) { fx.flyersFrom(10, 4, 'ore', 3); run(fx, 0.25); }
  assert.equal(fx.flyers.length, 1);
  assert.equal(fx.flyers[0].amount, 18);
  fx.flyersFrom(10, 4, 'crystal', 1);
  fx.flyersFrom(11, 5, 'ore', 1);
  assert.equal(fx.flyers.length, 2, 'a building next door shares it');
  fx.flyersFrom(12, 4, 'ore', 1);
  assert.equal(fx.flyers.length, 3, 'another resource or spot gets its own');
  run(fx, 1);
  fx.flyersFrom(10, 4, 'ore', 1);
  assert.equal(fx.flyers.length, 4, 'a steady stream leaves a trail of bundles');
});

test('effects: over budget, flyers on their way keep going and still land', () => {
  // Many busy buildings near spawn: replacing the oldest restarted every
  // trail, so none ever reached the stockpile and they flickered (v0.112.0).
  // Here all of it is on screen (zoomed out), so nothing may make way.
  const fx = createEffects(look, () => home, () => true, () => 40);
  const busy = () => { for (let i = 0; i < 100; i++) fx.flyersFrom(10 + (i % 10) * 2, (i / 10 | 0) * 2, 'stone', 1); };
  busy();
  assert.equal(fx.flyers.length, 40);
  const first = [...fx.flyers];
  for (let t = 0; t < 10; t += 0.5) { busy(); run(fx, 0.5); }
  assert.ok(first.every((f) => !fx.flyers.includes(f) && Math.hypot(f.x - f.x1, f.y - f.y1) < 1), 'every first flyer made it home');
  assert.ok(fx.flyers.length > 0 && fx.flyers.length <= 40);
  fx.clear();
  assert.equal(fx.flyers.length, 0);
});

test('effects: far from spawn, what is around you always shows', () => {
  // 78 m out with 40 buildings around: every slot filled with bundles
  // drifting off screen toward spawn, and a new quarry showed nothing.
  const you = { x: 80, y: 0 };
  const fx = fresh(you);
  for (let i = 0; i < 40; i++) fx.flyersFrom(72 + (i % 8) * 2, -5 + (i / 8 | 0) * 2, 'mycelium', 1);
  run(fx, 4); // most now on their way home, off screen
  for (let i = 0; i < 40; i++) fx.flyersFrom(72 + (i % 8) * 2, -5 + (i / 8 | 0) * 2, 'mycelium', 1);
  const near = () => fx.flyers.filter((f) => Math.abs(f.x - you.x) < 4.5).length;
  assert.equal(fx.flyers.length, 40);
  assert.ok(near() >= 30, 'fresh bundles by you took the far ones\' place (' + near() + ')');
  run(fx, 0.5);
  fx.flyersFrom(81, 1, 'stone', 2);
  assert.ok(fx.flyers.some((f) => f.res === 'stone'), 'a new building shows at once');
});

test('effects: at a full spawn, the first of a new resource still shows', () => {
  const fx = fresh({ x: 5, y: 0 });
  for (let i = 0; i < 40; i++) fx.flyersFrom(3 + (i % 10) * 2, (i / 10 | 0) * 2, 'stone', 1);
  fx.flyersFrom(6, 1, 'crystal', 1);
  assert.equal(fx.flyers.length, 40);
  assert.ok(fx.flyers.some((f) => f.res === 'crystal'));
});

test('effects: the budget follows the device, and a smaller one sheds what is off screen', () => {
  let budget = 80;
  const fx = createEffects(look, () => home, (x) => x > 50, () => budget);
  for (let i = 0; i < 100; i++) fx.flyersFrom(i * 3, 0, 'stone', 1);
  assert.equal(fx.flyers.length, 80);
  budget = 20;
  fx.flyersFrom(300, 0, 'ore', 1);
  assert.equal(fx.flyers.length, 20);
  assert.ok(fx.flyers.every((f) => f.x > 50), 'what went was off screen');
});
