import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, findNear, standOn, run, lumberCamp } from './helpers.js';

const { SURFACE } = C;

function neighbours(s) {
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: px + dx, y: py + dy, dx, dy }));
}

test('going down digs a hole at your feet and drops into a cleared chamber', () => {
  const s = C.createState(31415);
  const fx = Math.floor(s.player.x), fy = Math.floor(s.player.y);
  assert.equal(C.goDown(s), true);
  assert.equal(s.player.z, -1);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y)], [fx, fy], 'directly beneath the forest spot');
  assert.ok(C.walkable(s.world, fx, fy, -1));
  assert.ok(C.holeBelow(s.world, fx, fy, SURFACE), 'the forest keeps a hole where you went down');
  assert.ok(C.holeAbove(s.world, fx, fy, -1), 'and the chamber has an opening above it');
  assert.equal(C.goDown(s), false, 'already underground');
});

test('tunnels must be dug before they can be walked', () => {
  const s = C.createState(31415);
  C.goDown(s);
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
  C.goDown(s);
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
  C.goDown(s);
  assert.equal(C.harvestTarget(s), null);
  assert.equal(C.harvest(s), null);
});

test('a Trail digs the rock it crosses but never opens a shaft', () => {
  const s = C.createState(31415);
  C.goDown(s);
  const p = s.player;
  const stroke = [{ x: p.x - 1.5, y: p.y }, { x: p.x + 1.5, y: p.y }];
  const targets = C.sweepTargets(s, stroke);
  for (const t of targets) assert.notEqual(typeAt(s, t.x, t.y), T.SHAFT);
  assert.ok(targets.length > 0);
});

test('shafts open with one dig and take the player down one layer', () => {
  const s = C.createState(31415);
  C.goDown(s);
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
  C.goDown(s);
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  C.setRichness(s.world, shaft.x, shaft.y, -1, 0);
  standOn(s, { x: shaft.x + 6, y: shaft.y });
  assert.equal(C.descendAt(s, shaft.x, shaft.y), false);
  assert.equal(s.player.z, -1);
});

test('climbing up digs through the ceiling where you stand and leaves a hole', () => {
  const s = C.createState(31415);
  C.goDown(s);
  const shaft = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SHAFT, 40);
  C.setRichness(s.world, shaft.x, shaft.y, -1, 0);
  standOn(s, { x: shaft.x + 1, y: shaft.y });
  C.descendAt(s, shaft.x, shaft.y);
  assert.equal(s.player.z, -2);
  // Walk off somewhere else on layer -2 and climb up through solid rock.
  const spot = { x: shaft.x + 3, y: shaft.y };
  C.setRichness(s.world, spot.x, spot.y, -2, 0);
  standOn(s, spot);
  assert.ok(!C.walkable(s.world, spot.x, spot.y, -1), 'rock above before climbing');
  assert.equal(C.goUp(s), true);
  assert.deepEqual([Math.floor(s.player.x), Math.floor(s.player.y), s.player.z], [spot.x, spot.y, -1], 'straight up');
  assert.ok(C.walkable(s.world, spot.x, spot.y, -1), 'the rock above was dug out');
  assert.ok(C.holeBelow(s.world, spot.x, spot.y, -1), 'a hole marks where you came up');
  assert.equal(C.descendAt(s, spot.x, spot.y), true, 'and it leads back down');
  assert.equal(s.player.z, -2);
  C.goUp(s);
  C.goUp(s);
  assert.equal(s.player.z, SURFACE, 'climbing again reaches the forest');
  assert.equal(C.goUp(s), false, 'nothing above the forest');
});

test('dropping into a dug column rides it to the bottom', () => {
  const s = C.createState(31415);
  const fx = Math.floor(s.player.x), fy = Math.floor(s.player.y);
  C.goDown(s);
  C.digHole(s.world, fx, fy, -1);
  C.digHole(s.world, fx, fy, -2);
  C.goUp(s);
  assert.equal(s.player.z, SURFACE);
  C.goDown(s);
  assert.equal(s.player.z, -3, 'fell through -1 and -2');
  assert.equal(s.underground.deepest, -3);
});

test('landing on a closed shaft opens it but does not keep falling', () => {
  const s = C.createState(31415);
  const w = s.world;
  const shaft = C.nearestTile(s.player.x, s.player.y, 80, (x, y) =>
    C.tileAt(w, x, y, -1) === T.SHAFT && C.TILE_INFO[C.tileAt(w, x, y, SURFACE)].land);
  standOn(s, shaft);
  assert.equal(C.goDown(s), true);
  assert.equal(s.player.z, -1, 'stopped on the first layer');
  assert.equal(C.tileAt(w, shaft.x, shaft.y, -1), T.SHAFT_OPEN, 'the shaft you landed on is open now');
});

test('bedrock above and mountains above block climbing', () => {
  const s = C.createState(5);
  C.goDown(s);
  s.player.z = -2;
  const bed = C.nearestTile(s.player.x, s.player.y, 40, (x, y) => C.tileAt(s.world, x, y, -1) === T.BEDROCK);
  standOn(s, bed);
  s.player.z = -2;
  assert.equal(C.canGoUp(s), false, 'bedrock above');
  const rock = C.nearestTile(s.player.x, s.player.y, 300, (x, y) => C.tileAt(s.world, x, y, SURFACE) === T.ROCK);
  standOn(s, rock);
  s.player.z = -1;
  assert.equal(C.canGoUp(s), false, 'a mountain above');
  const water = C.nearestTile(s.player.x, s.player.y, 300, (x, y) => C.tileAt(s.world, x, y, SURFACE) === T.WATER);
  standOn(s, water);
  s.player.z = SURFACE;
  assert.equal(C.canGoDown(s), false, 'no digging down through a lake');
});

test('a hole is not gathered from or built on', () => {
  const s = C.createState(31415);
  const forest = findNear(s, (st, x, y) => typeAt(st, x, y) === T.FOREST);
  standOn(s, forest);
  assert.ok(C.canHarvest(s, forest.x, forest.y));
  C.digHole(s.world, forest.x, forest.y, SURFACE);
  assert.equal(C.canHarvest(s, forest.x, forest.y), false);
});

test('tunnels persist per layer and never leak onto the surface', () => {
  const s = C.createState(31415);
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  const surfaceBefore = C.tileAt(s.world, px, py, SURFACE);
  C.goDown(s);
  assert.equal(C.tileAt(s.world, px, py, SURFACE), surfaceBefore);
  C.goUp(s);
  assert.equal(s.player.z, SURFACE);
  C.goDown(s);
  assert.ok(C.walkable(s.world, px, py, -1), 'the chamber is still there');
});

/* Regressions: rules that must only apply on the player's own layer. */

test('logistics does not collect from surface camps while underground', () => {
  const s = C.createState(31415);
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  s.unlocks.logistics = true;
  s.extractors.push(lumberCamp(px + 1, py, 20));
  C.goDown(s); // right beside the camp, a layer below (never under it)
  run(s, 2);
  assert.equal(s.inv.wood, 0);
  assert.equal(s.events.length, 0);
  assert.equal(C.collectTarget(s), null, 'nor by hand');
  C.goUp(s);
  C.step(s, 0.1);
  assert.ok(s.inv.wood >= 20, 'back on the surface it collects again');
});

test('each layer has its own fog, lifted only close by underground', () => {
  const s = C.createState(31415);
  C.goDown(s);
  const p = s.player, px = Math.floor(p.x), py = Math.floor(p.y);
  C.revealAround(s);
  assert.ok(C.isExplored(s.world, px + 2, py, -1), 'rock right beside you is revealed');
  assert.ok(!C.isExplored(s.world, px + 6, py, -1), 'but not as far as on the surface');
  assert.ok(!C.isExplored(s.world, px + 40, py, SURFACE), 'and nothing on the surface');
  assert.equal(C.tileHeight(s.world, px + 6, py, -1), 0, 'unexplored rock gives nothing away');
  assert.deepEqual(s.discovered, { ore: false, crystal: false }, 'surface discoveries are untouched');
});

test('surface regrowth is unaffected by underground position', () => {
  const s = C.createState(31415);
  const forest = findNear(s, (st, x, y) => typeAt(st, x, y) === T.FOREST);
  C.setRichness(s.world, forest.x, forest.y, SURFACE, 0);
  C.goDown(s);
  standOn(s, { x: forest.x, y: forest.y });
  run(s, 200);
  assert.equal(C.richness(s.world, forest.x, forest.y, SURFACE), 0, 'nothing regrows on a layer you are not on');
});

test('extractors cannot be built underground', () => {
  const s = C.createState(31415);
  Object.assign(s.inv, { wood: 1e4, stone: 1e4, ore: 1e4 });
  s.unlocks.sapling = true;
  C.goDown(s);
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

test('underground, pushing into rock drills it after a moment; bedrock and shafts hold', () => {
  const s = C.createState(31415);
  C.goDown(s);
  const progress = { x: 0, y: 0, t: 0 };
  const n = neighbours(s).find((t) => [T.SOIL, T.STONE_SEAM, T.ORE_SEAM].includes(typeAt(s, t.x, t.y)));
  assert.ok(n, 'a diggable wall beside the chamber');
  const steps = Math.floor(C.DRILL_TIME / 0.05) - 1;
  for (let i = 0; i < steps; i++) assert.equal(C.drill(s, progress, n.dx, n.dy, 0.05), null, 'not yet');
  assert.equal(C.drill(s, progress, 0, 0, 0.05), null);
  assert.equal(progress.t, 0, 'letting go starts over');
  let dug = null;
  for (let i = 0; i < steps + 2 && !dug; i++) dug = C.drill(s, progress, n.dx, n.dy, 0.05);
  assert.ok(dug && dug.x === n.x && dug.y === n.y, 'pushing long enough digs the tile ahead');
  assert.equal(typeAt(s, n.x, n.y), T.TUNNEL);

  // Bedrock and closed shafts never drill.
  for (const hard of [T.BEDROCK, T.SHAFT]) {
    const wall = findNear(s, (st, x, y) => typeAt(st, x, y) === hard, 40);
    if (!wall) continue;
    standOn(s, { x: wall.x, y: wall.y + 1 });
    C.setRichness(s.world, wall.x, wall.y + 1, s.player.z, 0);
    for (let i = 0; i < 40; i++) assert.equal(C.drill(s, progress, 0, -1, 0.05), null, `${hard} holds`);
  }
  // Nothing drills on the surface.
  const top = C.createState(31415);
  assert.equal(C.drillTarget(top, 1, 0), null);
});

test('no way between layers shares a tile with a building, and none opens in water', () => {
  // Down through a building: no.
  const s = C.createState(31415);
  const fx = Math.floor(s.player.x), fy = Math.floor(s.player.y);
  s.extractors.push({ key: 'sapling', res: 'wood', x: fx, y: fy, z: C.SURFACE, buffer: 0 });
  assert.equal(C.canGoDown(s), false, 'not under a building');
  s.extractors.length = 0;
  assert.equal(C.canGoDown(s), true);

  // Up into a building: no.
  C.goDown(s);
  const n = neighbours(s).find((t) => typeAt(s, t.x, t.y) !== T.BEDROCK && typeAt(s, t.x, t.y) !== T.SHAFT);
  C.harvestAt(s, n.x, n.y);
  standOn(s, n);
  s.extractors.push({ key: 'sapling', res: 'wood', x: n.x, y: n.y, z: C.SURFACE, buffer: 0 });
  assert.equal(C.canGoUp(s), false, 'not up into a building');
  s.extractors.length = 0;

  // Up into water: no; and never down from water.
  const wet = C.nearestTile(s.player.x, s.player.y, 120, (x, y) => C.tileAt(s.world, x, y, C.SURFACE) === T.WATER);
  C.setRichness(s.world, wet.x, wet.y, -1, 0);
  standOn(s, wet);
  assert.equal(C.canGoUp(s), false, 'not up into water');
  const swim = C.createState(31415);
  standOn(swim, wet);
  assert.equal(C.canGoDown(swim), false, 'not down from water');

  // And no building on a tile with a hole in its floor or ceiling.
  const b = C.createState(31415);
  b.inv.wood = 1e6; b.inv.stone = 1e6; b.inv.ore = 1e6; b.unlocks.sapling = true;
  C.goDown(b);
  const hx = Math.floor(b.player.x), hy = Math.floor(b.player.y);
  assert.ok(C.holeAbove(b.world, hx, hy, b.player.z));
  const spot = C.buildTarget(b, 'sapling');
  assert.ok(!spot || spot.x !== hx || spot.y !== hy, 'not under the hole you came down');
});
