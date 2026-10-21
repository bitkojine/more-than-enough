import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, standOn, run, mushroomGarden, master } from './helpers.js';

test('overclock doubles extractor output', () => {
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(48, 50));
  Object.assign(s.inv, { stone: 1000, ore: 1000 });
  C.buy(s, 'overclock');
  assert.equal(C.overclockMult(s), 2);
  standOn(s, { x: 100, y: 100 });
  run(s, 10);
  assert.ok(Math.abs(s.extractors[0].buffer - C.EXTRACTORS.garden.rate * 2 * 10) < 1e-6);
});

// Waiting must never beat doing something (Watch, 2026-10-18): with
// Logistics, walking off to explore costs nothing your buildings make, just
// as closing the game doesn't (awayProduce).
test('logistics hauls from your buildings wherever you are, showing only the near ones', () => {
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(48, 50, 12));
  standOn(s, { x: 100, y: 100 });
  run(s, 4);
  assert.equal(s.inv.mycelium, 0, 'without Logistics it waits to be collected');
  assert.ok(s.extractors[0].buffer > 12);

  s.unlocks.logistics = true;
  C.step(s, 0.1);
  assert.ok(s.inv.mycelium >= 12, 'hauled in from far away');
  assert.ok(s.extractors[0].buffer < 1);
  assert.equal(s.events.length, 0, 'too far to see it fly in');

  s.events.length = 0;
  standOn(s, { x: 48, y: 50 });
  run(s, 4);
  assert.ok(s.events.length > 0, 'close by, the goods fly in');
  const evt = s.events[0];
  assert.deepEqual([evt.res, evt.x, evt.y, evt.z], ['mycelium', 48, 50, C.SURFACE]);
});

test('the Abundance Engine trickles resources and compounds production', () => {
  const s = C.createState(12345);
  Object.assign(s.inv, { mycelium: 1e12, stone: 1e12, ore: 1e12, crystal: 1e12 });
  assert.equal(C.buy(s, 'abundance').ok, true);
  assert.equal(s.abundanceLv, 1);
  const before = s.inv.crystal;
  run(s, 5);
  assert.ok(Math.abs(s.inv.crystal - before - 5) < 0.5, '+1/s of each resource at level 1');
  assert.equal(C.abundanceCost(s).mycelium, Math.ceil(C.ABUNDANCE.baseCost.mycelium * C.ABUNDANCE.growth));
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
  assert.ok(Math.abs(rates.mycelium - (2 * C.EXTRACTORS.garden.rate * 1.5 + 1)) < 1e-9);
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
  assert.equal(C.holdsOutput(s, e), false, 'with Logistics, it is hauled in as made');
  // Many frames of production in reach: it never shows as waiting.
  for (let i = 0; i < 600; i++) {
    C.step(s, 1 / 60);
    assert.equal(C.holdsOutput(s, e), false, `frame ${i}`);
  }
  e.x += 1000;
  e.buffer = 3;
  assert.equal(C.holdsOutput(s, e), false, 'however far away');
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

test('a shared world has no Embark, so its milestones end before "Master the world"', () => {
  const s = C.createState(12345);
  const master = C.GOALS.findIndex((g) => g.id === 'master');
  assert.equal(C.goalsTotal(s), C.GOALS.length - 1, 'alone: all but the endless last one');
  s.shared = 'room';
  assert.equal(C.goalsTotal(s), master);
  s.goalsDone = C.GOALS.slice(0, master).map((g) => g.id);
  assert.deepEqual(C.advanceGoals(s), [], 'never past the end');
  assert.equal(s.goalIndex, master);
  assert.equal(C.nextGoal(s), null);
});

test('an upgraded building holds as long a run of output, so its rate is what you get', () => {
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(48, 50));
  s.abundanceLv = 20; // a big production multiplier
  const rate = C.extractorRate(s, 'garden');
  assert.equal(C.extractorCapacity(s, 'garden'), C.EXTRACTORS.garden.buffer * C.productionMult(s, 'mycelium'));
  standOn(s, { x: 100, y: 100 });
  run(s, 10);
  assert.ok(Math.abs(s.extractors[0].buffer - rate * 10) < 1e-6 * rate, 'ten seconds of output, not the base buffer');
  run(s, 1000);
  assert.ok(s.extractors[0].buffer <= C.extractorCapacity(s, 'garden') + 1e-6);
});

test('time away: buildings and the engine make their full rate into the packs, up to 8 hours', () => {
  const s = C.createState(5);
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 0, y: 0, z: C.SURFACE, buffer: 0 });
  s.abundanceLv = 1;
  const rate = C.extractorRate(s, 'garden'), trickle = C.abundanceTrickle(s);
  assert.equal(C.awayProduce(s, C.AWAY_MIN - 1, true), null, 'a short gap is play time, not time away');
  const made = C.awayProduce(s, 3600, true);
  assert.ok(Math.abs(made.mycelium - (rate + trickle) * 3600) < 1e-6);
  assert.ok(Math.abs(s.inv.mycelium - made.mycelium) < 1e-6, 'straight into the packs');
  assert.ok(Math.abs(s.sources.mycelium.buildings - rate * 3600) < 1e-6, 'counted as from buildings');
  assert.ok(Math.abs(made.stone - trickle * 3600) < 1e-6, 'the engine makes every resource');
  const capped = C.awayProduce(s, 30 * 24 * 3600, true);
  assert.ok(Math.abs(capped.mycelium - (rate + trickle) * C.AWAY_CAP) < 1e-6, 'a month away counts as 8 hours');
  assert.equal(C.awayProduce(s, -5000, true), null, 'a clock set back gives nothing');
  s.shared = 'room';
  assert.equal(C.awayProduce(s, 3600, true), null, 'a shared world\'s room keeps its own time');
});

test('freeze season: time away makes nothing unless the player turns it back on', () => {
  const s = C.createState(5);
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 0, y: 0, z: C.SURFACE, buffer: 0 });
  s.abundanceLv = 1;
  const before = s.inv.mycelium;
  assert.equal(C.FREEZE_AWAY, true, 'on by default');
  assert.equal(C.awayProduce(s, 3600), null, 'the default is frozen');
  assert.equal(s.inv.mycelium, before, 'and the packs do not change');
  assert.equal(C.produceAway(s, 3600), null, 'the room\'s path is frozen too');
  assert.ok(C.awayProduce(s, 3600, true), 'a player who turns it back on gets it');
});

test('a save remembers when the world was last open', () => {
  const s = C.createState(5);
  assert.equal(C.deserialize(C.serialize(s)).seen, undefined);
  s.seen = 1760000000000;
  assert.equal(C.deserialize(C.serialize(s)).seen, 1760000000000);
});

// Waiting must never beat doing something: however big your buildings get,
// a gather by hand brings HAND_SHARE seconds of what they make of it, on top
// of the tool's yield, and so does each find's loot.
test('a gather by hand keeps up with your buildings at every stage', () => {
  const s = master(C.createState(12345));
  const base = C.gatherYield(s, 'stone');
  assert.equal(base, C.TOOLS.pickaxe.levels.at(-1).yield, 'no buildings: just the tool');
  for (let i = 0; i < 6; i++) s.extractors.push({ key: 'quarry', res: 'stone', x: 40 + i, y: 40, z: C.SURFACE, buffer: 0 });
  const rate = C.productionRates(s).stone - C.abundanceTrickle(s);
  assert.ok(rate > 1e5, 'a late-game quarry row: ' + rate);
  assert.equal(C.gatherYield(s, 'stone'), base + C.HAND_SHARE * rate);
  assert.equal(C.gatherYield(s, 'mycelium'), C.TOOLS.basket.levels.at(-1).yield, 'only what makes that resource counts');
  s.extractors.push({ key: 'quarry', res: 'stone', x: 60, y: 60, z: C.SURFACE, buffer: 0, owner: 'b'.repeat(16) });
  s.me = 'a'.repeat(16);
  assert.equal(C.gatherYield(s, 'stone'), base + C.HAND_SHARE * rate, "a friend's buildings don't count");
  const loot = C.findLoot(s, C.T.CACHE, C.SURFACE - 2);
  assert.equal(loot.stone, C.FINDS[C.T.CACHE].loot.stone * 2 * C.gatherYield(s, 'stone'), 'finds scale with it too');
});
