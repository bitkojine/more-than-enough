import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, richAt, findNear, standOn, run, lumberCamp } from './helpers.js';

const forest = (s, x, y) => typeAt(s, x, y) === T.FOREST && richAt(s, x, y) > 0;

test('gathering a forest yields wood and depletes the tile', () => {
  const s = C.createState(12345);
  const t = findNear(s, forest);
  standOn(s, t);
  const rich0 = richAt(s, t.x, t.y);
  const got = C.harvest(s);
  assert.equal(got.res, 'wood');
  assert.equal(got.amount, 1, 'a level-1 axe yields 1');
  assert.equal(s.inv.wood, 1);
  assert.deepEqual([got.x, got.y], [t.x, t.y], 'the tile underfoot is the nearest target');
  assert.equal(richAt(s, t.x, t.y), rich0 - 1);
});

test('harvesting a chosen tile works only within reach', () => {
  const s = C.createState(12345);
  const t = findNear(s, forest);
  standOn(s, t);
  const rich0 = richAt(s, t.x, t.y);
  assert.equal(C.harvestAt(s, t.x, t.y).x, t.x);
  assert.equal(richAt(s, t.x, t.y), rich0 - 1);
  assert.equal(C.harvestAt(s, t.x + 10, t.y), null);
});

test('depleted deposits yield nothing', () => {
  const s = C.createState(12345);
  standOn(s, findNear(s, (st, x, y) => typeAt(st, x, y) === T.STONE));
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  for (let y = py - 2; y <= py + 2; y++) for (let x = px - 2; x <= px + 2; x++) {
    if (C.TILE_INFO[typeAt(s, x, y)].harvest) C.setRichness(s.world, x, y, 0, 0);
  }
  assert.equal(C.harvestTarget(s), null);
  assert.equal(C.harvest(s), null);
});

test('a Trail sweeps every reachable resource tile it crosses', () => {
  const s = C.createState(12345);
  const t = findNear(s, forest);
  standOn(s, t);
  const points = [{ x: t.x - 1.5, y: t.y + 0.5 }, { x: t.x + 2.5, y: t.y + 0.5 }];
  const targets = C.sweepTargets(s, points);
  assert.ok(targets.some((g) => g.x === t.x && g.y === t.y), 'the tile under the stroke is swept');
  assert.ok(targets.every((g) => Math.abs(g.y + 0.5 - (t.y + 0.5)) <= C.SWEEP_RADIUS), 'only tiles along the stroke');
  assert.deepEqual(C.sweepTargets(s, []), []);
});

test('tool upgrades raise yields and stop at their max level', () => {
  const s = C.createState(12345);
  s.inv.wood = 1000;
  assert.equal(C.buy(s, 'axe').ok, true);
  assert.equal(s.tools.axe, 2);
  assert.equal(C.gatherYield(s, 'wood'), 2);
  assert.equal(C.gatherYield(s, 'stone'), 1, 'the pickaxe is unaffected');
  Object.assign(s.inv, { wood: 1e5, stone: 1e5, ore: 1e5 });
  for (let i = 0; i < 10; i++) C.buy(s, 'axe');
  assert.equal(s.tools.axe, 6);
  assert.deepEqual(C.buy(s, 'axe'), { ok: false, reason: 'Maxed' });
});

test('upgrades cost exactly their price', () => {
  const s = C.createState(12345);
  s.inv.wood = 5;
  assert.equal(C.buy(s, 'axe').ok, false);
  s.inv.wood = 6;
  assert.equal(C.buy(s, 'axe').ok, true);
  assert.equal(s.inv.wood, 0);
  s.inv.wood = 8;
  C.buy(s, 'boots');
  assert.equal(s.tools.boots, 2);
  assert.ok(C.speedMult(s) > 1);
});

test('extractors need a matching deposit and enough resources', () => {
  const s = C.createState(12345);
  const stone = findNear(s, (st, x, y) => typeAt(st, x, y) === T.STONE);
  standOn(s, stone);
  s.inv.wood = 1000;
  if (!C.buildTarget(s, 'lumber')) assert.equal(C.place(s, 'lumber').ok, false, 'no camp on stone');
  standOn(s, findNear(s, (st, x, y) => typeAt(st, x, y) === T.FOREST));
  s.inv.wood = 14;
  assert.equal(C.place(s, 'lumber').ok, false, '14 wood is not enough');
  s.inv.wood = 15;
  const placed = C.place(s, 'lumber');
  assert.equal(placed.ok, true);
  assert.equal(s.inv.wood, 0);
  assert.equal(C.extractorCount(s, 'lumber'), 1);
  assert.equal(s.extractors[0].z, C.SURFACE);
});

test('each extra extractor of a kind costs more', () => {
  const s = C.createState(12345);
  s.extractors.push(lumberCamp(0, 0));
  const first = C.extractorCost(s, 'lumber').wood;
  s.extractors.push(lumberCamp(1, 0));
  assert.ok(C.extractorCost(s, 'lumber').wood > first);
});

test('extractors fill their buffer up to its cap and can be collected nearby', () => {
  const s = C.createState(12345);
  s.extractors.push(lumberCamp(48, 50));
  standOn(s, { x: 100, y: 100 });
  run(s, 60);
  const e = s.extractors[0];
  assert.ok(e.buffer > 30 && e.buffer <= C.EXTRACTORS.lumber.buffer + 1e-9);
  assert.equal(s.inv.wood, 0, 'nothing arrives from far away');
  assert.equal(C.collectTarget(s), null);
  standOn(s, { x: 48, y: 50 });
  const got = C.collect(s);
  assert.ok(got.gained.wood > 0);
  assert.deepEqual(got.sources.map((x) => [x.x, x.y]), [[48, 50]]);
  assert.ok(e.buffer < 1);
});

test('converters need their blueprint and build on any dry land', () => {
  const s = C.createState(12345);
  standOn(s, findNear(s, (st, x, y) => C.walkable(st.world, x, y, 0) && typeAt(st, x, y) !== T.WATER));
  Object.assign(s.inv, { wood: 1e4, stone: 1e4, ore: 1e4 });
  assert.equal(C.place(s, 'foundry').ok, false);
  s.unlocks.foundry = true;
  assert.equal(C.place(s, 'foundry').ok, true);
  standOn(s, { x: 500, y: 500 });
  s.inv.ore = 0;
  run(s, 10);
  assert.ok(s.extractors[0].buffer > 2.5);
  assert.equal(s.inv.ore, 0);
  run(s, 300);
  assert.ok(s.extractors[0].buffer <= C.EXTRACTORS.foundry.buffer + 1e-9);
});
