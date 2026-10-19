import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, mushroomGarden } from './helpers.js';
import { createIncome, MAX_SAMPLES } from '../../src/game/income.js';

const near = (a, b, what) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${what}: ${a} vs ${b}`);
const rich = (s) => { for (const r of C.RESOURCES) s.inv[r] = 1e15; };
const held = (s) => ({ ...s.inv });

// Puts up a building of `key` the way placing one pays for it.
function build(s, key, x) {
  assert.ok(C.pay(s.inv, C.extractorCost(s, key)));
  s.extractors.push({ key, res: C.EXTRACTORS[key].res, x, y: 0, z: C.SURFACE, buffer: 0 });
}

test('spending adds up to exactly what buying took from your packs', () => {
  const s = C.createState(12345);
  rich(s);
  const before = held(s);
  for (let i = 0; i < 4; i++) build(s, 'garden', i);
  for (let i = 0; i < 2; i++) build(s, 'quarry', 10 + i);
  for (const id of ['pickaxe', 'pickaxe', 'basket', 'overclock', 'mycelium', 'mycelium', 'stone', 'abundance', 'abundance', 'logistics', 'compost']) {
    assert.ok(C.buy(s, id).ok, id);
  }
  s.world.props.set(C.packKey(3, 3, C.SURFACE), 'solar');
  s.inv.stone -= C.PROPS.solar.cost.stone;
  s.inv.ore -= C.PROPS.solar.cost.ore;
  const spent = C.totalSpent(s);
  for (const r of C.RESOURCES) near(spent[r], before[r] - s.inv[r], r);
  const ids = C.spendingStatement(s).map((c) => c.id);
  assert.deepEqual(ids, ['buildings', 'tools', 'refining', 'abundance', 'unlocks', 'props']);
  assert.deepEqual(Object.keys(C.spendingStatement(s)[0].parts), ['garden', 'quarry']);
});

test('a new world has spent nothing and earns nothing but what hands gather', () => {
  const s = C.createState(12345);
  assert.deepEqual(C.spendingStatement(s), []);
  const inc = C.incomeStatement(s);
  for (const r of C.RESOURCES) {
    assert.equal(inc[r].rate, 0);
    assert.deepEqual(inc[r].lines, []);
  }
  assert.equal(inc.mycelium.hand, 1);
});

test('in a shared world only your own buildings count, and props are left out', () => {
  const s = C.createState(12345);
  s.shared = 'room'; s.me = 'me';
  s.extractors.push({ ...mushroomGarden(1, 1), owner: 'me' }, { ...mushroomGarden(2, 1), owner: 'friend' }, { ...mushroomGarden(3, 1), owner: 'friend' });
  s.world.props.set(C.packKey(3, 3, C.SURFACE), 'solar');
  const spend = C.spendingStatement(s);
  assert.deepEqual(spend.map((c) => c.id), ['buildings']);
  assert.deepEqual(spend[0].cost, { mycelium: C.EXTRACTORS.garden.baseCost.mycelium, stone: 0, ore: 0, crystal: 0 });
  const line = C.incomeStatement(s).mycelium.lines[0];
  assert.equal(line.count, 1);
  near(line.rate, C.extractorRate(s, 'garden'), 'one garden');
});

test('income lines add up to the rates the resource bar shows, multipliers and all', () => {
  const s = C.createState(12345);
  rich(s);
  for (let i = 0; i < 3; i++) build(s, 'garden', i);
  build(s, 'quarry', 5);
  s.unlocks.compost = true; build(s, 'compost', 6);
  s.resUp.mycelium = 3; s.tools.overclock = 3; s.abundanceLv = 2; s.perks.legacy = 1;
  const inc = C.incomeStatement(s), rates = C.productionRates(s);
  for (const r of C.RESOURCES) near(inc[r].rate, rates[r], r);
  const m = inc.mycelium.mult;
  near(m.total, m.refinery * m.overclock * m.abundance * m.legacy, 'multipliers');
  assert.equal(m.refinery, 8);
  assert.deepEqual(inc.mycelium.lines.map((l) => [l.key, l.count]), [['garden', 3], ['compost', 1], ['engine', 2]]);
  near(inc.mycelium.hand, C.gatherYield(s, 'mycelium'), 'a gather');
  near(inc.crystal.rate, C.abundanceTrickle(s), 'the engine alone');
});

test('payback counts a price in seconds of your own income', () => {
  const s = C.createState(12345);
  rich(s);
  build(s, 'garden', 0);
  const rates = C.worthRates(s);
  // Costs and earns mycelium only: the price over what it adds.
  const cost = C.extractorCost(s, 'garden'), gain = C.extractorRate(s, 'garden');
  near(C.payback(cost, { mycelium: gain }, rates), cost.mycelium / gain, 'garden');
  // Nothing made yet: worth what holding Gather brings.
  near(rates.ore, 4 * C.toolStat(s, 'pickaxe').yield, 'ore by hand');
  near(C.costSeconds({ mycelium: rates.mycelium * 10, ore: rates.ore * 5 }, rates), 15, 'seconds');
  assert.equal(C.payback(cost, {}, rates), Infinity);
});

test('best buys: quickest payback first, with what each would add', () => {
  const s = C.createState(12345);
  rich(s);
  for (let i = 0; i < 2; i++) build(s, 'garden', i);
  s.discovered.ore = false;
  const buys = C.bestBuys(s);
  for (let i = 1; i < buys.length; i++) assert.ok(buys[i - 1].payback <= buys[i].payback);
  const ids = buys.map((b) => b.id);
  assert.ok(ids.includes('garden') && ids.includes('quarry') && ids.includes('mycelium') && ids.includes('abundance'));
  assert.ok(!ids.includes('mine'), 'no Mine before ore is found');
  assert.ok(!ids.includes('compost'), 'no Compost Heap before its blueprint');
  assert.ok(!ids.includes('stone'), 'a refinery with nothing to refine adds nothing');
  const refine = buys.find((b) => b.id === 'mycelium');
  near(refine.gain.mycelium, C.buildingRate(s, 'mycelium'), 'a level doubles what the buildings make');
  const engine = buys.find((b) => b.id === 'abundance');
  near(engine.gain.stone, 1, 'the engine adds a stone a second');
  near(engine.gain.mycelium, 1 + C.buildingRate(s, 'mycelium') * 0.5, 'and half again on mycelium');
  s.resUp.mycelium = C.REFINERIES.mycelium.levels.length;
  assert.ok(!C.bestBuys(s).some((b) => b.id === 'mycelium'), 'a finished refinery is no buy');
});

test('what you own earns its price back in the same measure', () => {
  const s = C.createState(12345);
  rich(s);
  for (let i = 0; i < 3; i++) build(s, 'garden', i);
  const paid = C.spendingStatement(s)[0].parts.garden.mycelium;
  near(C.ownedPayback(s).garden, paid / (3 * C.extractorRate(s, 'garden')), 'three gardens');
});

/* ------------------------------------------------------- the history */

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('income history: a sample a minute, sooner on a jump, kept per world', () => {
  const store = memoryStore();
  const s = C.createState(12345);
  s.extractors.push(mushroomGarden(1, 1));
  const income = createIncome({ store });
  const t0 = 1e12;
  assert.ok(income.note(s, t0));
  assert.ok(!income.note(s, t0 + 30000), 'steady: not yet');
  assert.ok(income.note(s, t0 + 60000), 'a minute on');
  s.resUp.mycelium = 1;
  assert.ok(!income.note(s, t0 + 61000), 'a jump waits a moment');
  assert.ok(income.note(s, t0 + 64000), 'then is noted');
  const h = income.history(s, 'mycelium');
  assert.deepEqual(h.map((p) => p.at), [t0, t0 + 60000, t0 + 64000]);
  near(h[2].rate, 2 * h[0].rate, 'doubled');

  const again = createIncome({ store });
  assert.equal(again.history(s, 'mycelium').length, 3, 'kept on the phone');
  const other = C.createState(777);
  assert.equal(again.history(other, 'mycelium').length, 0, 'another world has its own');
  s.shared = 'room';
  assert.equal(again.history(s, 'mycelium').length, 0, 'and a shared world too');
});

test('income history thins its older half once full, and survives bad storage', () => {
  const s = C.createState(12345);
  const income = createIncome({ store: memoryStore() });
  for (let i = 0; i < MAX_SAMPLES * 3; i++) income.note(s, i * 60000);
  const h = income.history(s, 'stone');
  assert.ok(h.length <= MAX_SAMPLES && h.length > MAX_SAMPLES / 2);
  assert.equal(h[0].at, 0, 'still reaches back to the start');
  assert.equal(h[h.length - 1].at, (MAX_SAMPLES * 3 - 1) * 60000);

  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  const b = createIncome({ store: broken });
  assert.ok(b.note(s, 0));
  assert.equal(b.history(s, 'stone').length, 1, 'kept for this visit');
  const junk = createIncome({ store: { getItem: () => '[[1,"x"],{"a":1}]', setItem: () => {} } });
  assert.equal(junk.history(s, 'stone').length, 0, 'unreadable samples are dropped');
});
