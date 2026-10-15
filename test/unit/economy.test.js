import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, standOn, run, mushroomGarden } from './helpers.js';

test('overclock doubles extractor output', () => {
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(48, 50));
  Object.assign(s.inv, { stone: 1000, ore: 1000 });
  C.buy(s, 'overclock');
  assert.equal(C.overclockMult(s), 2);
  standOn(s, { x: 100, y: 100 });
  run(s, 10);
  assert.equal(Math.round(s.extractors[0].buffer), Math.round(0.6 * 2 * 10));
});

test('logistics auto-collects only within range', () => {
  assert.equal(C.AUTO_COLLECT_RANGE, 3);
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(48, 50, 12));
  s.unlocks.logistics = true;
  standOn(s, { x: 100, y: 100 });
  run(s, 4);
  assert.equal(s.inv.mycelium, 0);
  assert.equal(s.events.length, 0);
  assert.ok(s.extractors[0].buffer > 12, 'a far camp keeps filling');

  standOn(s, { x: 48, y: 50 });
  C.step(s, 0.1);
  assert.ok(s.inv.mycelium >= 12);
  assert.ok(s.extractors[0].buffer < 1);
  assert.equal(s.events.length, 1);
  const evt = s.events[0];
  assert.deepEqual([evt.res, evt.amt, evt.x, evt.y, evt.z], ['mycelium', s.inv.mycelium, 48, 50, C.SURFACE]);

  const held = s.inv.mycelium;
  standOn(s, { x: 100, y: 100 });
  run(s, 4);
  assert.equal(s.inv.mycelium, held, 'walking away stops auto-collect at once');
  assert.ok(s.extractors[0].buffer > 1);
});

test('the Abundance Engine trickles resources and compounds production', () => {
  const s = C.createState(12345);
  Object.assign(s.inv, { mycelium: 1e5, stone: 1e5, ore: 1e5, crystal: 1000 });
  assert.equal(C.buy(s, 'abundance').ok, true);
  assert.equal(s.abundanceLv, 1);
  const before = s.inv.crystal;
  run(s, 5);
  assert.ok(Math.abs(s.inv.crystal - before - 5) < 0.5, '+1/s of each resource at level 1');
  assert.equal(C.abundanceCost(s).mycelium, Math.ceil(1500 * 2.4));
  assert.equal(C.buy(s, 'abundance').ok, true);
  assert.equal(C.abundanceMult(s), 2.25);
  const mycelium = s.inv.mycelium;
  run(s, 5);
  assert.ok(Math.abs(s.inv.mycelium - mycelium - 10) < 0.5, '+2/s at level 2');
});

test('refinery chains multiply only their own resource', () => {
  const s = C.createState(12345);
  s.inv.mycelium = 1000;
  assert.equal(C.upgradeLevel(s, 'mycelium'), 0);
  assert.equal(C.productionMult(s, 'mycelium'), 1);
  assert.equal(C.buy(s, 'mycelium').ok, true);
  assert.equal(s.resUp.mycelium, 1);
  assert.equal(C.productionMult(s, 'mycelium'), 2);
  assert.equal(C.buy(s, 'mycelium').ok, false, 'Mycology II is unaffordable');
  Object.assign(s.inv, { mycelium: 1e5, stone: 1e4, ore: 1000 });
  C.buy(s, 'stone');
  assert.equal(C.productionMult(s, 'stone'), 2);
  assert.equal(C.refineryMult(s, 'ore'), 1);
});

test('one-shot unlocks cannot be bought twice', () => {
  const s = C.createState(12345);
  Object.assign(s.inv, { stone: 1000, ore: 1000 });
  assert.equal(C.buy(s, 'logistics').ok, true);
  assert.deepEqual(C.buy(s, 'logistics'), { ok: false, reason: 'Already owned' });
  assert.equal(C.buy(s, 'nonsense').ok, false);
});

test('production rates add up extractors and abundance', () => {
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(0, 0), mushroomGarden(1, 0));
  s.abundanceLv = 1;
  const rates = C.productionRates(s);
  assert.ok(Math.abs(rates.mycelium - (2 * 0.6 * 1.5 + 1)) < 1e-9);
  assert.equal(rates.crystal, 1);
});

test('the progression map mirrors the upgrade registry', () => {
  const s = C.createState(12345);
  assert.equal(C.PATH_FAMILIES.length, 5);
  assert.deepEqual(C.pathProgress(s, 'nope').nodes, []);
  assert.deepEqual(C.PATH_FAMILIES[0].nodes, ['basket', 'pickaxe', 'boots', 'overclock']);
  assert.deepEqual(C.PATH_FAMILIES[1].nodes, C.RESOURCES);
  assert.deepEqual(C.PATH_FAMILIES[4].nodes, Object.keys(C.PERKS));
  for (const f of C.PATH_FAMILIES) {
    assert.deepEqual(C.pathProgress(s, f.id).nodes.map((n) => n.key), f.nodes);
  }
});

test('progression nodes report saving, ready, partial and owned', () => {
  const s = C.createState(12345);
  assert.equal(C.pathNode(s, 'basket').state, 'saving');
  s.inv.mycelium = 100;
  assert.equal(C.pathNode(s, 'basket').state, 'ready');
  assert.equal(C.pathProgress(s, 'tools').canBuy, true);
  s.tools.basket = C.TOOLS.basket.levels.length;
  assert.equal(C.pathNode(s, 'basket').state, 'owned');
  assert.equal(C.pathProgress(s, 'tools').owned, 1);
  assert.equal(C.pathNode(s, 'mycelium').max, C.REFINERIES.mycelium.levels.length);
  s.resUp.mycelium = 2;
  assert.equal(C.pathNode(s, 'mycelium').state, 'partial');
  assert.equal(C.pathNode(s, 'logistics').state, 'saving');
  s.unlocks.logistics = true;
  assert.equal(C.pathNode(s, 'logistics').state, 'owned');
  assert.equal(C.pathNode(s, 'abundance').max, Infinity);
  assert.equal(C.pathNode(s, 'legacy').max, Infinity);
  s.insight = 1;
  assert.equal(C.pathNode(s, 'legacy').state, 'ready');
  C.buy(s, 'legacy');
  assert.equal(C.pathNode(s, 'legacy').state, 'partial');
});

test('a building shows waiting output only when nothing hauls it in', () => {
  const s = C.createState(3);
  const e = { key: 'garden', res: 'mycelium', x: Math.floor(s.player.x), y: Math.floor(s.player.y), z: s.player.z, buffer: 0.6 };
  s.extractors.push(e);
  assert.equal(C.holdsOutput(s, e), false, 'less than a unit is not worth collecting yet');
  e.buffer = 3;
  assert.equal(C.holdsOutput(s, e), true, 'without Logistics, output waits');
  s.unlocks.logistics = true;
  assert.equal(C.holdsOutput(s, e), false, 'in Logistics reach, it is hauled in as made');
  // Many frames of production in reach: it never shows as waiting.
  for (let i = 0; i < 600; i++) {
    C.step(s, 1 / 60);
    assert.equal(C.holdsOutput(s, e), false, `frame ${i}`);
  }
  e.x += 1000;
  e.buffer = 3;
  assert.equal(C.holdsOutput(s, e), true, 'out of reach, it waits again');
});

test("in a shared world, friends' buildings don't count toward your 25 structures", () => {
  const s = C.createState(12345);
  s.me = 'a'.repeat(16);
  const structures = C.GOALS.find((g) => g.id === 'structures');
  for (let i = 0; i < 25; i++) s.extractors.push({ ...mushroomGarden(40 + i, 50), owner: 'b'.repeat(16) });
  assert.equal(structures.done(s), false, "a friend's buildings");
  for (const e of s.extractors) e.owner = s.me;
  assert.equal(structures.done(s), true, 'your own');
});
