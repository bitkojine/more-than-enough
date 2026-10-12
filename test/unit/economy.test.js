import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, standOn, run, lumberCamp } from './helpers.js';

test('overclock doubles extractor output', () => {
  const s = C.createState(12345);
  s.extractors.push(lumberCamp(48, 50));
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
  s.extractors.push(lumberCamp(48, 50, 12));
  s.unlocks.logistics = true;
  standOn(s, { x: 100, y: 100 });
  run(s, 4);
  assert.equal(s.inv.wood, 0);
  assert.equal(s.events.length, 0);
  assert.ok(s.extractors[0].buffer > 12, 'a far camp keeps filling');

  standOn(s, { x: 48, y: 50 });
  C.step(s, 0.1);
  assert.ok(s.inv.wood >= 12);
  assert.ok(s.extractors[0].buffer < 1);
  assert.equal(s.events.length, 1);
  const evt = s.events[0];
  assert.deepEqual([evt.res, evt.amt, evt.x, evt.y, evt.z], ['wood', s.inv.wood, 48, 50, C.SURFACE]);

  const held = s.inv.wood;
  standOn(s, { x: 100, y: 100 });
  run(s, 4);
  assert.equal(s.inv.wood, held, 'walking away stops auto-collect at once');
  assert.ok(s.extractors[0].buffer > 1);
});

test('the Abundance Engine trickles resources and compounds production', () => {
  const s = C.createState(12345);
  Object.assign(s.inv, { wood: 1e5, stone: 1e5, ore: 1e5, crystal: 1000 });
  assert.equal(C.buy(s, 'abundance').ok, true);
  assert.equal(s.abundanceLv, 1);
  const before = s.inv.crystal;
  run(s, 5);
  assert.ok(Math.abs(s.inv.crystal - before - 5) < 0.5, '+1/s of each resource at level 1');
  assert.equal(C.abundanceCost(s).wood, Math.ceil(1500 * 2.4));
  assert.equal(C.buy(s, 'abundance').ok, true);
  assert.equal(C.abundanceMult(s), 2.25);
  const wood = s.inv.wood;
  run(s, 5);
  assert.ok(Math.abs(s.inv.wood - wood - 10) < 0.5, '+2/s at level 2');
});

test('refinery chains multiply only their own resource', () => {
  const s = C.createState(12345);
  s.inv.wood = 1000;
  assert.equal(C.upgradeLevel(s, 'wood'), 0);
  assert.equal(C.productionMult(s, 'wood'), 1);
  assert.equal(C.buy(s, 'wood').ok, true);
  assert.equal(s.resUp.wood, 1);
  assert.equal(C.productionMult(s, 'wood'), 2);
  assert.equal(C.buy(s, 'wood').ok, false, 'Silviculture II is unaffordable');
  Object.assign(s.inv, { wood: 1e5, stone: 1e4, ore: 1000 });
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
  s.extractors.push(lumberCamp(0, 0), lumberCamp(1, 0));
  s.abundanceLv = 1;
  const rates = C.productionRates(s);
  assert.ok(Math.abs(rates.wood - (2 * 0.6 * 1.5 + 1)) < 1e-9);
  assert.equal(rates.crystal, 1);
});

test('the progression map mirrors the upgrade registry', () => {
  const s = C.createState(12345);
  assert.equal(C.PATH_FAMILIES.length, 5);
  assert.deepEqual(C.pathProgress(s, 'nope').nodes, []);
  assert.deepEqual(C.PATH_FAMILIES[0].nodes, ['axe', 'pickaxe', 'boots', 'overclock']);
  assert.deepEqual(C.PATH_FAMILIES[1].nodes, C.RESOURCES);
  assert.deepEqual(C.PATH_FAMILIES[4].nodes, Object.keys(C.PERKS));
  for (const f of C.PATH_FAMILIES) {
    assert.deepEqual(C.pathProgress(s, f.id).nodes.map((n) => n.key), f.nodes);
  }
});

test('progression nodes report saving, ready, partial and owned', () => {
  const s = C.createState(12345);
  assert.equal(C.pathNode(s, 'axe').state, 'saving');
  s.inv.wood = 100;
  assert.equal(C.pathNode(s, 'axe').state, 'ready');
  assert.equal(C.pathProgress(s, 'tools').canBuy, true);
  s.tools.axe = C.TOOLS.axe.levels.length;
  assert.equal(C.pathNode(s, 'axe').state, 'owned');
  assert.equal(C.pathProgress(s, 'tools').owned, 1);
  assert.equal(C.pathNode(s, 'wood').max, C.REFINERIES.wood.levels.length);
  s.resUp.wood = 2;
  assert.equal(C.pathNode(s, 'wood').state, 'partial');
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
