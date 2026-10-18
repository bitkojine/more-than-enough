import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, richAt, findNear, standOn, run, mushroomGarden } from './helpers.js';

const forest = (s, x, y) => typeAt(s, x, y) === T.FOREST && richAt(s, x, y) > 0;

test('gathering a forest yields mycelium and depletes the tile', () => {
  const s = C.createState(12345);
  const t = findNear(s, forest);
  standOn(s, t);
  const rich0 = richAt(s, t.x, t.y);
  const got = C.harvest(s);
  assert.equal(got.res, 'mycelium');
  assert.equal(got.amount, 1, 'a level-1 basket yields 1');
  assert.equal(s.inv.mycelium, 1);
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
  s.inv.mycelium = 1000;
  assert.equal(C.buy(s, 'basket').ok, true);
  assert.equal(s.tools.basket, 2);
  assert.equal(C.gatherYield(s, 'mycelium'), 2);
  assert.equal(C.gatherYield(s, 'stone'), 1, 'the pickaxe is unaffected');
  Object.assign(s.inv, { mycelium: 1e12, stone: 1e12, ore: 1e12 });
  for (let i = 0; i < 10; i++) C.buy(s, 'basket');
  assert.equal(s.tools.basket, 6);
  assert.deepEqual(C.buy(s, 'basket'), { ok: false, reason: 'Maxed' });
});

test('upgrades cost exactly their price', () => {
  const s = C.createState(12345);
  const price = C.TOOLS.basket.levels[1].cost.mycelium;
  s.inv.mycelium = price - 1;
  assert.equal(C.buy(s, 'basket').ok, false);
  s.inv.mycelium = price;
  assert.equal(C.buy(s, 'basket').ok, true);
  assert.equal(s.inv.mycelium, 0);
  s.inv.mycelium = C.TOOLS.boots.levels[1].cost.mycelium;
  C.buy(s, 'boots');
  assert.equal(s.tools.boots, 2);
  assert.ok(C.speedMult(s) > 1);
});

test('extractors need a matching deposit and enough resources', () => {
  const s = C.createState(12345);
  const stone = findNear(s, (st, x, y) => typeAt(st, x, y) === T.STONE);
  standOn(s, stone);
  s.inv.mycelium = 1000;
  if (!C.buildTarget(s, 'garden')) assert.equal(C.place(s, 'garden').ok, false, 'no camp on stone');
  standOn(s, findNear(s, (st, x, y) => typeAt(st, x, y) === T.FOREST));
  s.inv.mycelium = 14;
  assert.equal(C.place(s, 'garden').ok, false, '14 mycelium is not enough');
  s.inv.mycelium = 15;
  const placed = C.place(s, 'garden');
  assert.equal(placed.ok, true);
  assert.equal(s.inv.mycelium, 0);
  assert.equal(C.extractorCount(s, 'garden'), 1);
  assert.equal(s.extractors[0].z, C.SURFACE);
});

test('each extra extractor of a kind costs more', () => {
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(0, 0));
  const first = C.extractorCost(s, 'garden').mycelium;
  s.extractors.push(mushroomGarden(1, 0));
  assert.ok(C.extractorCost(s, 'garden').mycelium > first);
});

test('extractors fill their buffer up to its cap and can be collected nearby', () => {
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(48, 50));
  standOn(s, { x: 100, y: 100 });
  run(s, 60);
  const e = s.extractors[0];
  assert.ok(e.buffer > C.EXTRACTORS.garden.buffer / 2 && e.buffer <= C.EXTRACTORS.garden.buffer + 1e-9);
  assert.equal(s.inv.mycelium, 0, 'nothing arrives from far away');
  assert.equal(C.collectTarget(s), null);
  standOn(s, { x: 48, y: 50 });
  const got = C.collect(s);
  assert.ok(got.gained.mycelium > 0);
  assert.deepEqual(got.sources.map((x) => [x.x, x.y]), [[48, 50]]);
  assert.ok(e.buffer < 1);
});

test('converters need their blueprint and build on any dry land, not home ground', () => {
  const s = C.createState(12345);
  Object.assign(s.inv, { mycelium: 1e4, stone: 1e4, ore: 1e4 });
  s.unlocks.foundry = true;
  assert.equal(typeAt(s, Math.floor(s.player.x), Math.floor(s.player.y)), T.HOME, 'every world starts on home ground');
  standOn(s, C.home());
  assert.equal(C.place(s, 'foundry').ok, false, 'home ground is kept for the stockpile');
  s.unlocks.foundry = false;
  standOn(s, findNear(s, (st, x, y) => C.TILE_INFO[typeAt(st, x, y)].land));
  assert.equal(C.place(s, 'foundry').ok, false);
  s.unlocks.foundry = true;
  assert.equal(C.place(s, 'foundry').ok, true);
  standOn(s, { x: 500, y: 500 });
  s.inv.ore = 0;
  run(s, 10);
  assert.ok(s.extractors[0].buffer > 8 * C.EXTRACTORS.foundry.rate);
  assert.equal(s.inv.ore, 0);
  run(s, 300);
  assert.ok(s.extractors[0].buffer <= C.extractorCapacity(s, 'foundry') + 1e-9);
});

test('mycelium from a spore bed underground does not count as gathering from the forest', () => {
  const s = C.createState(77);
  s.player.z = -4;
  const sporeBed = findNear(s, (st, x, y) => typeAt(st, x, y) === T.SPORE_BED && richAt(st, x, y) > 0);
  standOn(s, sporeBed);
  assert.equal(C.harvestAt(s, sporeBed.x, sporeBed.y).res, 'mycelium');
  assert.equal(s.stats.mycelium, 1);
  assert.deepEqual(C.advanceGoals(s), [], 'the forest milestone waits for a forest');

  s.player.z = C.SURFACE;
  standOn(s, findNear(s, forest));
  C.harvest(s);
  assert.deepEqual(C.advanceGoals(s).map((g) => g.id), ['forage']);
  assert.equal(s.goalIndex, 1);
});

test("Perfect's first press heads for a resource, or out to find one", () => {
  for (let i = 0; i < 60; i++) {
    const seed = (i * 2654435761) >>> 0;
    const s = C.createState(seed);
    C.revealAround(s); // what a new player sees
    const go = C.nextIntent(s, C.newMind());
    assert.ok(go.type === 'walk' || go.type === 'harvestAt', 'from spawn there is always something to head for (seed ' + seed + ': ' + go.type + ')');
    assert.ok(go.badge.startsWith('resource.') || go.badge === 'ui.explore', 'to a resource, or out to look for one (' + go.badge + ')');
  }
});
