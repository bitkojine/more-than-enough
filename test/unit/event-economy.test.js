import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductionLedger } from '../../src/core/production-ledger.js';
import { createResourceLedger } from '../../src/core/resource-ledger.js';
import { createEventClock } from '../../src/engine/event-clock.js';
import * as C from '../../src/core/index.js';
import { productionFixture } from '../support/production-fixture.js';
import { economyForState } from '../../src/core/economy-context.js';
import { createEventEconomy } from '../../src/core/event-economy.js';
import { createSimulation } from '../../src/engine/simulation.js';

function haulingState() {
  const s = productionFixture();
  // A legacy tick safely hauls accumulated output in old saved worlds before
  // activation. Fixture construction is not a bot input or a win evaluation.
  C.step(s, 1 / 60, { visualEvents: false });
  return s;
}

function economy() {
  const s = C.createState(12345);
  for (const r of C.RESOURCES) { s.inv[r] = 0.1; s.stats[r] = 0.1; s.sources[r].engine = 0.1; }
  const account = createResourceLedger(s);
  const production = createProductionLedger([{ id: 1, resource: 'mycelium', rate: 0.8, buffer: 0.99 }]);
  const observe = (tick) => {
    account.setStream('production', 'buildings', production.advanceTo(tick));
    account.setStream('trickle', 'engine', Object.fromEntries(C.RESOURCES.map(r => [r, tick / 720])));
  };
  return { s, account, observe };
}

test('currency, production, spending and manual income are independent of observation cadence', () => {
  const a = economy(), b = economy();
  for (const e of [a, b]) {
    e.observe(1000); e.account.credit('finds', 'stone', 17); assert.equal(e.account.pay({ mycelium: 1 }), true);
  }
  for (let tick = 1001; tick < 10000; tick += 3) b.observe(tick);
  a.observe(10000); b.observe(10000);
  assert.deepEqual(b.s.inv, a.s.inv);
  assert.deepEqual(b.s.stats, a.s.stats);
  assert.deepEqual(b.s.sources, a.s.sources);
  assert.equal(a.account.pay({ stone: 1e9 }), false);
  assert.throws(() => a.account.setStream('production', 'buildings', { mycelium: 0 }));
});

test('event clock skips empty ticks and keeps stable command ordering', () => {
  const clock = createEventClock(), seen = [];
  clock.schedule(15, () => seen.push('input'), 0);
  clock.schedule(15, () => seen.push('economy'), -1);
  clock.schedule(15, () => seen.push('other-input'), 0);
  const cancelled = clock.schedule(20, () => seen.push('cancelled'));
  clock.cancel(cancelled);
  assert.equal(clock.advanceTo(8640000), 3);
  assert.deepEqual(seen, ['economy', 'input', 'other-input']);
  assert.equal(clock.now, 8640000);
  assert.throws(() => clock.schedule(clock.now, () => {}), 'zero-time event cycles are rejected');
});

test('scheduled observations perform only actual events, not forty hours of frame updates', () => {
  const e = economy(), clock = createEventClock();
  for (const tick of [15, 30, 1000, 8640000]) clock.schedule(tick, e.observe);
  assert.equal(clock.advanceTo(8640000), 4);
  assert.ok(e.s.inv.mycelium > 100000);
});

test('shared core step uses lazy production without visiting buildings every tick', () => {
  const s = haulingState(), originalRates = C.productionRates(s);
  const runtime = C.startEventEconomy(s);
  assert.deepEqual(C.productionRates(s), originalRates, 'cached planner rates keep the original rounding order');
  const before = runtime.work;
  for (let i = 0; i < 120; i++) C.step(s, 1 / 60, { visualEvents: false });
  assert.equal(runtime.work.buildingVisits, before.buildingVisits);
  assert.equal(runtime.work.observations, before.observations);
  C.settleEconomy(s);
  assert.equal(runtime.work.observations, before.observations + 1);
  assert.equal(runtime.work.buildingVisits, before.buildingVisits);
  assert.equal(runtime.tick, 120);
  const counts = Object.fromEntries(Object.keys(C.EXTRACTORS).map(key => [key,
    s.extractors.filter(e => e.key === key && C.ownBuilding(s, e)).length]));
  const rates = C.productionRates(s);
  for (let i = 0; i < 100; i++) {
    for (const key of Object.keys(C.EXTRACTORS)) assert.equal(C.extractorCount(s, key), counts[key]);
    assert.deepEqual(C.productionRates(s), rates);
  }
  assert.equal(runtime.work.buildingVisits, before.buildingVisits, 'planning queries reuse epoch indexes');
});

test('legal upgrade, spending, earnings and save observations preserve economy epochs', () => {
  const a = haulingState(), b = structuredClone(a);
  const ra = C.startEventEconomy(a), rb = C.startEventEconomy(b);
  for (const s of [a, b]) {
    const runtime = economyForState(s);
    runtime.advanceTicks(1234);
    const mastery = C.worldMastery(s);
    assert.equal(C.buy(s, 'overclock').ok, true);
    assert.equal(C.worldMastery(s).done, mastery.done + 1, 'a purchase invalidates cached mastery');
    C.earn(s, 'stone', 17, 'finds');
    assert.equal(C.pay(s.inv, { ore: 123 }), true);
  }
  for (let i = 0; i < 100; i++) { rb.advanceTicks(13); C.settleEconomy(b); }
  ra.advanceTicks(1300);
  assert.equal(C.serialize(a), C.serialize(b), 'extra observations cannot change canonical state');
  assert.deepEqual(a.extractors, b.extractors, 'fractional output matches before save rounding');
  const saved = C.serialize(a), loaded = C.deserialize(saved);
  assert.ok(loaded);
  assert.equal(C.serialize(loaded), saved, 'existing save format retains earned output');
  assert.equal(economyForState(loaded), undefined, 'runtime indices are never persisted');
});

test('variable-step fallback settles pending income and keeps legacy compatibility', () => {
  const a = haulingState(), b = structuredClone(a);
  const ra = C.startEventEconomy(a), rb = C.startEventEconomy(b);
  ra.advanceTicks(321); rb.advanceTicks(321); rb.stop();
  C.step(a, 0.013, { visualEvents: false });
  C.step(b, 0.013, { visualEvents: false });
  assert.equal(economyForState(a), undefined);
  assert.equal(C.serialize(a), C.serialize(b));
});

test('legal building placement starts production at its purchase time', () => {
  const s = C.createState(12345);
  s.unlocks.logistics = true;
  for (const r of C.RESOURCES) s.inv[r] = 1e6;
  const runtime = C.startEventEconomy(s);
  runtime.advanceTicks(600);
  const at = C.buildTarget(s, 'garden');
  assert.ok(at);
  assert.equal(C.place(s, 'garden', at).ok, true);
  assert.equal(C.extractorCount(s, 'garden'), 1);
  const before = s.sources.mycelium.buildings;
  const rate = C.extractorRate(s, 'garden');
  runtime.advanceTicks(600);
  C.settleEconomy(s);
  assert.equal(s.sources.mycelium.buildings - before, Math.floor(rate * 10));
  assert.equal(C.buildingRate(s, 'mycelium'), rate);
  assert.equal(runtime.work.rebuilds, 2);
});

test('entering shared mode settles solo output before returning to legacy stepping', () => {
  const a = haulingState(), b = structuredClone(a);
  const ra = C.startEventEconomy(a), rb = C.startEventEconomy(b);
  ra.advanceTicks(123); rb.advanceTicks(123); rb.stop();
  a.shared = true; b.shared = true;
  C.step(a, 1 / 60, { visualEvents: false });
  C.step(b, 1 / 60, { visualEvents: false });
  assert.equal(economyForState(a), undefined);
  assert.equal(C.serialize(a), C.serialize(b));
});

test('production feedback observes only nearby buildings and cannot change earnings', () => {
  const a = haulingState(), b = structuredClone(a);
  a.player = { x: 0.5, y: 0.5, z: 0 }; b.player = { ...a.player };
  a.events.length = 0; b.events.length = 0;
  const initial = a.extractors.map(e => ({ buffer: e.buffer, rate: C.extractorRate(a, e.key, e) }));
  const ra = C.startEventEconomy(a); C.startEventEconomy(b);
  for (let tick = 1; tick <= 60; tick++) {
    C.step(a, 1 / 60); C.step(b, 1 / 60, { visualEvents: false });
    const expected = a.extractors.flatMap((e, i) => {
      if (C.tileDist2(a.player, e.x, e.y, e.z) > 144) return [];
      const d = initial[i], amt = Math.floor(d.buffer + tick * d.rate / 60) -
        Math.floor(d.buffer + (tick - 1) * d.rate / 60);
      return amt > 0 ? [{ res: e.res, amt, x: e.x, y: e.y, z: e.z }] : [];
    });
    assert.deepEqual(a.events, expected);
    a.events.length = 0;
  }
  assert.equal(C.serialize(a), C.serialize(b));
  a.player = { x: 10000.5, y: 10000.5, z: 0 };
  const visits = ra.work.visualVisits;
  C.step(a, 1 / 60);
  assert.equal(ra.work.visualVisits, visits, 'distant buildings are not visited for presentation');
  assert.deepEqual(a.events, []);
});

test('browser and headless shared loops activate the same economy despite different observations', () => {
  const a = haulingState(), b = structuredClone(a);
  function engine(state, display) {
    return createSimulation({ game: { state },
      controller: { steer: () => false, tick() {}, checkGoals() { C.advanceGoals(state); } },
      autoplay: { tick() {} },
      input: { moveVector: () => ({ x: 0, y: 0 }), holdPoint: () => null },
      onEvents: display ? () => {} : null });
  }
  const browser = engine(a, true), headless = engine(b, false);
  for (let i = 0; i < 240; i++) {
    browser.tick(); headless.tick();
    if (i % 3 === 0) C.settleEconomy(a); // presentation observes at its own cadence
  }
  assert.ok(economyForState(a)); assert.ok(economyForState(b));
  assert.equal(economyForState(a).tick, 239, 'the initial tick normalizes kept saves');
  assert.equal(C.serialize(a), C.serialize(b));
  assert.deepEqual(a.extractors, b.extractors);
});

test('unsafe event-time production falls back before changing a kept world', () => {
  const a = haulingState(), b = structuredClone(a);
  const runtime = createEventEconomy(a, { rateFor: () => 1e30, trickleFor: () => 0, owns: C.ownBuilding });
  assert.equal(runtime.canAdvanceTicks(1), false);
  C.step(a, 1 / 60, { visualEvents: false });
  C.step(b, 1 / 60, { visualEvents: false });
  assert.equal(economyForState(a), undefined);
  assert.equal(C.serialize(a), C.serialize(b));
});

test('Embark polling does not rescan upgrades between purchases', () => {
  const s = haulingState(); C.startEventEconomy(s);
  assert.equal(C.worldMastered(s), false);
  let reads = 0;
  s.tools = new Proxy(s.tools, { get(target, key) { reads++; return target[key]; } });
  for (let i = 0; i < 1000; i++) assert.equal(C.canEmbark(s), false);
  assert.equal(reads, 0);
});

test('stationary battery batches match individual ticks across daylight and charging changes', () => {
  const dusk = C.DAY_LENGTH * Math.acos(0.2) / (2 * Math.PI);
  for (const time of [dusk - 0.15, C.DAY_LENGTH - dusk - 0.15]) {
    for (const charger of [null, 'solar', 'wheel']) {
      const a = haulingState();
      a.time = time; a.player = { x: 0.5, y: 0.5, z: 0 }; a.battery = 0.5;
      if (charger) a.world.props.set(C.packKey(0, 0, 0), charger);
      const b = structuredClone(a);
      C.startEventEconomy(a); C.startEventEconomy(b);
      for (let i = 0; i < 30; i++) C.step(a, 1 / 60, { visualEvents: false });
      C.step(b, 0.25, { visualEvents: false }); C.step(b, 0.25, { visualEvents: false });
      assert.equal(b.battery, a.battery, 'battery must be exactly independent of batching');
      assert.equal(C.serialize(b), C.serialize(a));
    }
  }
});
