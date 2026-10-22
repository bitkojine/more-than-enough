/* Gear: tool levels open things, not only bigger numbers. Rock too hard for
 * your Pickaxe, the shafts to the deep layers, rare mushrooms and the water
 * all wait for the right level (GEAR in content.js). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, findNear, standOn, away } from './helpers.js';

// Stands the player next to tile t, without caring what they stand on.
const beside = (s, t) => { s.player.x = t.x - 0.5; s.player.y = t.y + 0.5; };

test('crystal waits for Pickaxe III, and holding Gather passes it by', () => {
  const s = C.createState(12345);
  s.tools.pickaxe = 2;
  const crystal = findNear(s, (st, x, y) => typeAt(st, x, y) === T.CRYSTAL, 400);
  beside(s, crystal);
  assert.equal(C.harvestable(s, crystal.x, crystal.y), true, 'there is crystal to see');
  assert.deepEqual(C.gearNeeded(s, crystal.x, crystal.y), { tool: 'pickaxe', level: 3 });
  assert.equal(C.harvestAt(s, crystal.x, crystal.y), null);
  s.tools.pickaxe = 3;
  assert.equal(C.gearNeeded(s, crystal.x, crystal.y), null);
  assert.equal(C.harvestAt(s, crystal.x, crystal.y).res, 'crystal');
});

test('the shafts below layer 3 wait for Pickaxe IV, deeper ones for V and VI', () => {
  const s = away(C.createState(31415));
  s.tools.pickaxe = 1; // explicit legacy basic pick
  const shaftOn = (layer) => {
    s.player.z = C.SURFACE - layer;
    const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 60);
    beside(s, shaft);
    return C.gearNeeded(s, shaft.x, shaft.y);
  };
  assert.equal(shaftOn(1), null, 'the first shafts open with a basic pick');
  assert.equal(shaftOn(2), null);
  assert.deepEqual(shaftOn(3), { tool: 'pickaxe', level: 4 });
  assert.deepEqual(shaftOn(7), { tool: 'pickaxe', level: 5 });
  assert.deepEqual(shaftOn(12), { tool: 'pickaxe', level: 6 });
  s.tools.pickaxe = 6;
  assert.equal(shaftOn(12), null);
});

test('rare mushrooms wait for Basket IV and pay three times over', () => {
  const s = C.createState(12345);
  const rare = findNear(s, (st, x, y) => {
    const k = C.mushroomAt(st.seed, typeAt(st, x, y), x, y, 0);
    return !!(k && C.MUSHROOMS[k].magic) && C.richness(st.world, x, y, 0) > 0;
  }, 400);
  standOn(s, rare);
  assert.deepEqual(C.gearNeeded(s, rare.x, rare.y), { tool: 'basket', level: 4 });
  assert.equal(C.harvestAt(s, rare.x, rare.y), null);
  s.tools.basket = 4;
  const got = C.harvestAt(s, rare.x, rare.y);
  assert.equal(got.amount, C.gatherYield(s, 'mycelium') * C.RARE_PAYS);
});

test('without Boots II you stop at the shore; in the water you can always get out', () => {
  const s = C.createState(12345);
  const water = findNear(s, (st, x, y) => typeAt(st, x, y) === T.WATER &&
    C.walkable(st.world, x - 1, y, 0) && typeAt(st, x - 1, y) !== T.WATER, 400);
  s.player.x = water.x - 0.5; s.player.y = water.y + 0.5;
  assert.equal(C.waterAhead(s, 1, 0), true);
  for (let i = 0; i < 10; i++) C.move(s, 1, 0, 0.1);
  assert.ok(s.player.x < water.x, 'the shore stops you');

  standOn(s, water);
  const x0 = s.player.x;
  C.move(s, -1, 0, 0.1);
  assert.ok(s.player.x < x0, 'out of the water');

  s.player.x = water.x - 0.5;
  s.tools.boots = 2;
  assert.equal(C.waterAhead(s, 1, 0), false);
  for (let i = 0; i < 10; i++) C.move(s, 1, 0, 0.1);
  assert.ok(s.player.x > water.x, 'Boots II take you onto the water');
});

test('each door opens at exactly one tool level', () => {
  const doors = (tool) => C.TOOLS[tool].levels.map((_, i) => C.toolOpens(tool, i + 1).map((d) => d.id + (d.layer || '')));
  assert.deepEqual(doors('pickaxe'), [[], ['ore'], ['crystal'], ['deep3'], ['deep6'], ['deep9']]);
  assert.deepEqual(doors('basket'), [[], [], [], ['rare'], [], []]);
  assert.deepEqual(doors('boots'), [[], ['water'], [], [], []]);
});
