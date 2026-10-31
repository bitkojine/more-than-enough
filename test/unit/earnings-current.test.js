import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { createStatement } from '../../src/game/statement.js';
import { createIncome } from '../../src/game/income.js';
import { unlockOptional } from './helpers.js';

function chamber(s, extra = {}) {
  const b = {
    id: 1,
    kind: 'chamber',
    x: 0,
    y: 0,
    z: -2,
    buffer: 2,
    temperature: 18,
    quality: 100,
    health: 100,
    ...extra
  };
  s.cultivation.facilities.push(b);
  s.cultivation.nextId = 2;
  return b;
}
function statement(history = []) {
  return createStatement({
    look: { color: () => '#fff' },
    pic: () => '',
    icon: (r) => r,
    price: () => '',
    row: (a, b, c, d) => `<div>${a}${b}${c}${d}</div>`,
    income: { history: () => history }
  });
}
test('Earnings includes actual chamber growth, stock and each reason it stops', () => {
  const s = C.createState(7, { cultivation: true }),
    b = chamber(s);
  let i = C.incomeStatement(s).crystal;
  assert.equal(i.rate, 0.3);
  assert.equal(i.buffered, 2);
  assert.equal(i.hand, null);
  for (const [patch, status] of [
    [{ buffer: 20 }, 'full'],
    [{ buffer: 2, needsTend: true }, 'injured'],
    [{ needsTend: false, temperature: 30 }, 'hot'],
    [{ temperature: 18, health: 0 }, 'dead'],
    [{ health: undefined }, 'empty']
  ]) {
    Object.assign(b, patch);
    i = C.incomeStatement(s).crystal;
    assert.equal(i.rate, 0);
    assert.equal(i.lines[0].status, status);
  }
});
test('locked producers retain stock, report the lock and have no unavailable recommendations', () => {
  const s = C.createState(7, { cultivation: true });
  s.extractors.push({ key: 'quarry', res: 'stone', x: 0, y: 0, z: 0, buffer: 8 });
  const inc = C.incomeStatement(s).stone;
  assert.equal(inc.rate, 0);
  assert.equal(inc.buffered, 8);
  assert.equal(inc.lines[0].status, 'locked');
  assert.deepEqual(C.bestBuys(s), []);
  unlockOptional(s);
  s.discovered.ore = true;
  for (const b of C.bestBuys(s)) {
    assert.equal(b.kind, 'building');
    assert.ok(C.buildsOnLayer(s, b.id));
    assert.ok(['garden', 'quarry', 'stoneworks'].includes(b.id));
  }
});
test('full extractor buffers stop the reported current rate without losing potential output', () => {
  const s = C.createState(7);
  s.extractors.push({
    key: 'quarry',
    res: 'stone',
    x: 0,
    y: 0,
    z: 0,
    buffer: C.extractorCapacity(s, 'quarry')
  });
  const line = C.incomeStatement(s).stone.lines[0];
  assert.equal(line.rate, 0);
  assert.ok(line.potential > 0);
  assert.equal(line.status, 'full');
});
test('actual payments include crafting, buildings, care and machine repairs, but not transfers or failed buys', () => {
  const s = C.createState(7, { cultivation: true });
  for (const r of C.RESOURCES) C.earn(s, r, 1000, 'hand');
  assert.ok(C.buy(s, 'pickaxe').ok);
  assert.equal(s.spending.totals.tools.stone, 5);
  assert.equal(C.cultivationCommand(s, { type: 'craft', kind: 'carrier' }), 'ok');
  const before = structuredClone(s.spending);
  assert.equal(C.cultivationCommand(s, { type: 'craft', kind: 'carrier' }), 'invalid');
  assert.deepEqual(s.spending, before);
  // Every command uses the same successful-payment boundary.
  C.pay(s.inv, { stone: 10 }, 'buildings');
  C.pay(s.inv, { mycelium: 2 }, 'care');
  C.pay(s.inv, { crystal: 6 }, 'restoration');
  C.pay(s.inv, { crystal: 4 }, null);
  assert.equal(s.spending.totals.buildings.stone, 10);
  assert.equal(s.spending.totals.care.mycelium, 2);
  assert.equal(s.spending.totals.restoration.crystal, 6);
  assert.equal(s.spending.totals.other, undefined);
  assert.deepEqual(C.deserialize(C.serialize(s)).spending, s.spending);
});
test('old saves get partial accounting without inventing history, invalid journals cannot spoil a world', () => {
  const s = C.createState(7),
    d = JSON.parse(C.serialize(s));
  delete d.spending;
  d.time = 123;
  const old = C.deserialize(JSON.stringify(d));
  assert.deepEqual(old.spending, { since: 123, complete: false, totals: {} });
  C.earn(old, 'stone', 10, 'hand');
  C.pay(old.inv, { stone: 2 }, 'buildings');
  assert.equal(C.recordedSpending(old)[0].cost.stone, 2);
  assert.deepEqual(C.deserialize(C.serialize(old)).spending, old.spending);
  d.spending = { since: 0, complete: true, totals: { buildings: { stone: -1 } } };
  assert.ok(C.deserialize(JSON.stringify(d)));
  assert.equal(C.deserialize(JSON.stringify(d)).spending.complete, false);
});
test('linear charts retain zeroes and real elapsed gaps; crystal has no invented pickaxe yield', () => {
  const s = C.createState(7, { cultivation: true });
  chamber(s);
  const before = C.serialize(s),
    html = statement([
      { at: 0, rate: 0.3 },
      { at: 60000, rate: 0 },
      { at: 600000, rate: 0.3 }
    ]).render(s);
  assert.match(html, /\[0.1,0,60000\]/);
  assert.match(html, /starter, not construction crystal/);
  assert.match(html, /Packs: 0 · Waiting in buildings: 2/);
  assert.doesNotMatch(html, /Overclock|Masonry|Abundance Engine/);
  assert.match(html, /<details class="mushroomCollection">/);
  assert.equal(C.serialize(s), before, 'inspection does not change gameplay');
});
test('production history records chamber growth stopping rather than legacy-only rates', () => {
  const s = C.createState(7, { cultivation: true }),
    b = chamber(s);
  const income = createIncome({ store: null });
  income.note(s, 0);
  b.buffer = 20;
  income.note(s, 4000);
  assert.deepEqual(
    income.history(s, 'crystal').map((p) => p.rate),
    [0.3, 0]
  );
});

test('cloned simulation states record canonical payments and saves keep category ordering stable', () => {
  const a = C.createState(7, { cultivation: true });
  for (const r of C.RESOURCES) C.earn(a, r, 100, 'hand');
  const b = structuredClone(a);
  assert.ok(C.buy(b, 'pickaxe').ok);
  C.spend(b, { stone: 2 }, 'buildings');
  C.spend(b, { stone: 1 }, 'tools');
  assert.equal(b.spending.totals.tools.stone, 6);
  const saved = C.serialize(b);
  assert.equal(C.serialize(C.deserialize(saved)), saved);
});
