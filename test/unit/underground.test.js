import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, findNear, standOn, run, lumberCamp } from './helpers.js';

const { SURFACE } = C;

function neighbours(s) {
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: px + dx, y: py + dy, dx, dy }));
}

test('entering the mine drops straight down, into a cleared chamber', () => {
  const s = C.createState(31415);
  const fx = Math.floor(s.player.x), fy = Math.floor(s.player.y);
  assert.equal(C.enterMine(s), true);
  assert.equal(s.player.z, -1);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y)], [fx, fy], 'directly beneath the forest spot');
  assert.ok(C.walkable(s.world, fx, fy, -1));
  assert.equal(C.enterMine(s), false, 'already underground');
});

test('tunnels must be dug before they can be walked', () => {
  const s = C.createState(31415);
  C.enterMine(s);
  const n = neighbours(s).find((t) => typeAt(s, t.x, t.y) !== T.BEDROCK && typeAt(s, t.x, t.y) !== T.SHAFT);
  const start = { ...s.player };
  C.move(s, n.dx, n.dy, 0.3);
  assert.deepEqual([s.player.x, s.player.y], [start.x, start.y], 'solid rock blocks movement');
  const dug = C.harvestAt(s, n.x, n.y);
  assert.ok(dug, 'nearby rock can be dug');
  assert.equal(typeAt(s, n.x, n.y), T.TUNNEL);
  C.move(s, n.dx, n.dy, 0.3);
  assert.ok((s.player.x - start.x) * n.dx + (s.player.y - start.y) * n.dy > 0.1, 'the new tunnel is walkable');
});

test('digging a seam yields its resource; soil and bedrock behave', () => {
  const s = C.createState(5);
  C.enterMine(s);
  const seam = findNear(s, (st, x, y) => typeAt(st, x, y) === T.ORE_SEAM, 30);
  C.setRichness(s.world, seam.x, seam.y - 1, -1, 0); // open a spot beside it
  standOn(s, { x: seam.x, y: seam.y - 1 });
  const got = C.harvestAt(s, seam.x, seam.y);
  assert.deepEqual([got.res, got.amount, got.now], ['ore', 1, T.TUNNEL]);
  assert.equal(s.inv.ore, 1);

  const bedrock = findNear(s, (st, x, y) => typeAt(st, x, y) === T.BEDROCK, 30);
  standOn(s, { x: bedrock.x, y: bedrock.y + 1 });
  assert.equal(C.harvestAt(s, bedrock.x, bedrock.y), null, 'bedrock cannot be dug');
});

test('holding Gather never auto-digs; digging is a deliberate choice', () => {
  const s = C.createState(31415);
  C.enterMine(s);
  assert.equal(C.harvestTarget(s), null);
  assert.equal(C.harvest(s), null);
});

test('a Trail digs the rock it crosses but never opens a shaft', () => {
  const s = C.createState(31415);
  C.enterMine(s);
  const p = s.player;
  const stroke = [{ x: p.x - 1.5, y: p.y }, { x: p.x + 1.5, y: p.y }];
  const targets = C.sweepTargets(s, stroke);
  for (const t of targets) assert.notEqual(typeAt(s, t.x, t.y), T.SHAFT);
  assert.ok(targets.length > 0);
});

test('shafts open with one dig and take the player down one layer', () => {
  const s = C.createState(31415);
  C.enterMine(s);
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  C.setRichness(s.world, shaft.x + 1, shaft.y, -1, 0);
  standOn(s, { x: shaft.x + 1, y: shaft.y });
  assert.equal(C.descendAt(s, shaft.x, shaft.y), false, 'a closed shaft cannot be used');
  assert.equal(C.harvestAt(s, shaft.x, shaft.y).now, T.SHAFT_OPEN);
  assert.equal(s.player.z, -1, 'opening the shaft does not descend');
  assert.equal(C.descendAt(s, shaft.x + 1, shaft.y), false, 'only the shaft tile works');
  assert.equal(C.descendAt(s, shaft.x, shaft.y), true);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y), s.player.z], [shaft.x, shaft.y, -2], 'arrives directly below the shaft');
  assert.equal(s.underground.deepest, -2);
  assert.ok(C.walkable(s.world, shaft.x, shaft.y, -2));
});

test('an open shaft must be within reach to use it', () => {
  const s = C.createState(31415);
  C.enterMine(s);
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  C.setRichness(s.world, shaft.x, shaft.y, -1, 0);
  standOn(s, { x: shaft.x + 6, y: shaft.y });
  assert.equal(C.descendAt(s, shaft.x, shaft.y), false);
  assert.equal(s.player.z, -1);
});

test('leaving returns to the forest spot; re-entering goes to the deepest layer', () => {
  const s = C.createState(31415);
  const forest = { ...s.player };
  C.enterMine(s);
  s.underground.deepest = -3;
  standOn(s, { x: 40, y: 40 });
  assert.equal(C.leaveMine(s), true);
  assert.deepEqual(s.player, forest);
  assert.equal(C.leaveMine(s), false);
  C.enterMine(s);
  assert.equal(s.player.z, -3);
});

test('tunnels persist per layer and never leak onto the surface', () => {
  const s = C.createState(31415);
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  const surfaceBefore = C.tileAt(s.world, px, py, SURFACE);
  C.enterMine(s);
  assert.equal(C.tileAt(s.world, px, py, SURFACE), surfaceBefore);
  C.leaveMine(s);
  C.enterMine(s);
  assert.ok(C.walkable(s.world, px, py, -1), 'the chamber is still there');
});

/* Regressions: rules that must only apply on the player's own layer. */

test('logistics does not collect from surface camps while underground', () => {
  const s = C.createState(31415);
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  s.unlocks.logistics = true;
  s.extractors.push(lumberCamp(px, py, 20));
  C.enterMine(s); // standing right beneath the camp
  run(s, 2);
  assert.equal(s.inv.wood, 0);
  assert.equal(s.events.length, 0);
  assert.equal(C.collectTarget(s), null, 'nor by hand');
  C.leaveMine(s);
  C.step(s, 0.1);
  assert.ok(s.inv.wood >= 20, 'back on the surface it collects again');
});

test('fog and discoveries are not touched by moving underground', () => {
  const s = C.createState(31415);
  C.enterMine(s);
  const exploredBefore = s.world.explored.size;
  standOn(s, { x: 5000, y: 5000 });
  C.revealAround(s, 40);
  assert.equal(s.world.explored.size, exploredBefore);
  assert.deepEqual(s.discovered, { ore: false, crystal: false });
});

test('surface regrowth is unaffected by underground position', () => {
  const s = C.createState(31415);
  const forest = findNear(s, (st, x, y) => typeAt(st, x, y) === T.FOREST);
  C.setRichness(s.world, forest.x, forest.y, SURFACE, 0);
  C.enterMine(s);
  standOn(s, { x: forest.x, y: forest.y });
  run(s, 200);
  assert.equal(C.richness(s.world, forest.x, forest.y, SURFACE), 0, 'nothing regrows on a layer you are not on');
});

test('extractors cannot be built underground', () => {
  const s = C.createState(31415);
  Object.assign(s.inv, { wood: 1e4, stone: 1e4, ore: 1e4 });
  s.unlocks.sapling = true;
  C.enterMine(s);
  assert.equal(C.place(s, 'sapling').ok, false);
});

test('surface movement still swims and blocks on rock', () => {
  const s = C.createState(12345);
  const rock = findNear(s, (st, x, y) => typeAt(st, x, y) === T.ROCK && C.walkable(st.world, x - 1, y, 0));
  s.player.x = rock.x - 0.5; s.player.y = rock.y + 0.5;
  C.move(s, 1, 0, 0.5);
  assert.ok(Math.floor(s.player.x) < rock.x, 'mountains block');
  const water = findNear(s, (st, x, y) => typeAt(st, x, y) === T.WATER &&
    [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => C.walkable(st.world, x + dx, y + dy, 0)));
  standOn(s, water);
  assert.equal(C.onWater(s), true);
  const x0 = s.player.x;
  C.move(s, 1, 0, 0.2);
  assert.ok(s.player.x > x0, 'water is swimmable');
});
