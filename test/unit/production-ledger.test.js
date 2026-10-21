import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductionLedger } from '../../src/core/production-ledger.js';

const fixture = (count) => Array.from({ length: count }, (_, id) => ({ id,
  resource: ['mycelium', 'stone', 'ore', 'crystal'][id % 4],
  rate: [0.01, 0.8, 17.6, 7312.384][id % 4], buffer: ((id * 173) % 997) / 997 }));
function scalar(buildings, tick, epoch = 0) {
  const earned = {}, buffers = [];
  for (const b of buildings) {
    const total = b.buffer + (tick - epoch) * b.rate / 60;
    earned[b.resource] = (earned[b.resource] || 0) + Math.floor(total);
    buffers.push({ ...b, buffer: total - Math.floor(total) });
  }
  return { earned, buffers };
}

for (const count of [1, 17, 1000]) test(`event production matches scalar cumulative accounting for ${count} buildings`, () => {
  const buildings = fixture(count), ledger = createProductionLedger(buildings);
  for (const tick of [1, 15, 59, 60, 600, 3600, 8640000]) {
    const expected = scalar(buildings, tick);
    assert.deepEqual(ledger.advanceTo(tick), expected.earned);
    assert.deepEqual(ledger.snapshot(), expected.buffers);
  }
});

test('observing production more often cannot change payouts or buffers', () => {
  const buildings = fixture(217), direct = createProductionLedger(buildings), frequent = createProductionLedger(buildings);
  for (let tick = 1; tick < 10000; tick += 73) frequent.advanceTo(tick);
  assert.deepEqual(frequent.advanceTo(10000), direct.advanceTo(10000));
  assert.deepEqual(frequent.snapshot(), direct.snapshot());
});

test('a rate or membership change is an explicit epoch, with no lost fractional buffers', () => {
  const buildings = fixture(19), old = createProductionLedger(buildings);
  const before = old.advanceTo(1000);
  const nextBuildings = old.snapshot().map(b => ({ ...b, rate: b.rate * 2 }));
  nextBuildings.push({ id: 99, resource: 'stone', rate: 0.8, buffer: 0 });
  const next = createProductionLedger(nextBuildings, { epoch: 1000 });
  assert.deepEqual(next.advanceTo(2000), scalar(nextBuildings, 2000, 1000).earned);
  assert.deepEqual(old.advanceTo(1000), before, 'the completed epoch remains unchanged');
});

test('forty hours of production has the same query work as one game second', () => {
  const buildings = fixture(1000), short = createProductionLedger(buildings), long = createProductionLedger(buildings);
  short.advanceTo(60); long.advanceTo(8640000);
  assert.equal(long.work.groups, 4);
  assert.equal(short.work.groups, 4);
  assert.ok(long.work.comparisons <= 4 * Math.ceil(Math.log2(251)));
  assert.equal(long.work.snapshots, 0, 'no per-building materialization on ordinary observations');
});

test('event production rejects backwards time and unsafe integer payouts', () => {
  const ledger = createProductionLedger(fixture(1));
  ledger.advanceTo(10);
  assert.throws(() => ledger.advanceTo(9));
  assert.throws(() => createProductionLedger([{ id: 1, resource: 'stone', rate: Number.MAX_SAFE_INTEGER, buffer: 0 }]).advanceTo(600));
});
