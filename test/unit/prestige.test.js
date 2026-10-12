import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from './helpers.js';

test('embarking needs 20k gathered in this world', () => {
  const s = C.createState(12345);
  assert.equal(C.canEmbark(s), false);
  assert.equal(C.embarkGain(s), 0);
  assert.equal(C.lifetimeTotal(s), 0);
  assert.equal(C.embark(s, 1).ok, false);
  s.stats.wood = 20000;
  assert.equal(C.canEmbark(s), true);
  assert.equal(C.embarkGain(s), 3, 'floor(sqrt(20000 / 2000))');
});

test('lifetime total adds earlier worlds to this one', () => {
  const s = C.createState(7);
  s.stats.wood = 150;
  s.totalEver = 100;
  assert.equal(C.lifetimeTotal(s), 250);
});

test('embarking starts a fresh world and keeps Insight and lifetime', () => {
  const s = C.createState(12345);
  s.stats.wood = 20000;
  s.extractors.push({ key: 'lumber', res: 'wood', x: 0, y: 0, z: 0, buffer: 0 });
  const em = C.embark(s, 99);
  assert.equal(em.ok, true);
  assert.equal(em.gained, 3);
  const fresh = em.state;
  assert.equal(fresh.seed, 99);
  assert.equal(fresh.inv.wood, 0);
  assert.equal(fresh.extractors.length, 0);
  assert.equal(fresh.insight, 3);
  assert.equal(fresh.prestiges, 1);
  assert.equal(fresh.totalEver, 20000);
  assert.equal(C.worldTotal(fresh), 0);
  assert.equal(C.canEmbark(fresh), false, 'carried progress alone cannot re-embark');
});

test('perks cost Insight and compound', () => {
  const s = C.createState(1);
  s.insight = 3;
  assert.equal(C.upgradeCost(s, 'legacy'), 1);
  assert.equal(C.buy(s, 'legacy').ok, true);
  assert.equal(C.upgradeCost(s, 'legacy'), 2);
  assert.equal(C.buy(s, 'legacy').ok, true);
  assert.equal(s.insight, 0);
  assert.equal(C.legacyMult(s), 1.5625);
  assert.equal(C.productionMult(s, 'wood'), 1.5625);
  assert.deepEqual(C.buy(s, 'nomad'), { ok: false, reason: 'Need 2 Insight' });
  assert.equal(C.speedMult(s), 1);
});

test('one-shot perks carry their bonus into the next world', () => {
  const s = C.createState(1);
  s.insight = 10;
  s.stats.wood = 20000;
  for (const p of ['memory', 'heirloom', 'cartographer']) assert.equal(C.buy(s, p).ok, true);
  assert.equal(C.buy(s, 'memory').reason, 'Already owned');
  const next = C.embark(s, 2).state;
  assert.equal(next.unlocks.logistics, true);
  assert.equal(next.tools.axe, 2);
  assert.equal(next.tools.pickaxe, 2);
  assert.equal(C.exploreRadius(next), C.EXPLORE_RADIUS + 2);
  assert.ok(C.isExplored(next.world, Math.floor(next.player.x) + 7, Math.floor(next.player.y), 0), 'the wider reveal applies at once');
});

test('milestones complete in order', () => {
  const s = C.createState(1);
  assert.equal(C.advanceGoals(s), false);
  s.stats.wood = 1;
  s.tools.axe = 2;
  assert.equal(C.advanceGoals(s), true);
  assert.equal(s.goalIndex, 2);
});

test('the day-night cycle runs from noon to midnight and back', () => {
  assert.equal(C.daylight(0), 1);
  assert.equal(Math.round(C.daylight(C.DAY_LENGTH / 2)), 0);
  const dusk = C.daylight(C.DAY_LENGTH / 4);
  assert.ok(dusk > 0.4 && dusk < 0.6);
  assert.equal(C.daylight(C.DAY_LENGTH), 1);
});
