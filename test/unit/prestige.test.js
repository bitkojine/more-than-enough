import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, master } from './helpers.js';
import { LANGUAGES } from '../../src/i18n/i18n.js';

test('embarking needs world mastery without a production-total waiting gate', () => {
  const s = C.createState(12345);
  assert.equal(C.canEmbark(s), false);
  assert.equal(C.embarkGain(s), 0);
  assert.equal(C.lifetimeTotal(s), 0);
  assert.equal(C.embark(s, 1).ok, false);
  s.stats.mycelium = C.EMBARK_MIN_TOTAL;
  assert.equal(C.canEmbark(s), false, 'gathering alone is not enough');
  master(s);
  s.tools.overclock -= 1;
  assert.equal(C.worldMastered(s), false, 'one upgrade short');
  assert.equal(C.canEmbark(s), false);
  s.tools.overclock += 1;
  assert.equal(C.worldMastered(s), true);
  assert.equal(C.canEmbark(s), true);
  s.stats.mycelium = C.EMBARK_MIN_TOTAL - 1;
  assert.equal(C.canEmbark(s), true, 'mastery ends the world without another funding gate');
  s.stats.mycelium = 0;
  assert.equal(C.canEmbark(s), true, 'eligibility is independent of production totals');
  s.shared = 'room';
  assert.equal(C.canEmbark(s), false, 'shared worlds cannot embark');
  s.shared = null;
  s.stats.mycelium = C.EMBARK_MIN_TOTAL;
  assert.equal(C.embarkGain(s), 22, 'floor(sqrt(500)) for one world\'s worth');
  s.stats.mycelium = 4 * C.EMBARK_MIN_TOTAL;
  assert.equal(C.embarkGain(s), 44, 'the square root after that');
});

test('mastery counts every level of every finite world upgrade', () => {
  const s = C.createState(1);
  const m0 = C.worldMastery(s);
  assert.equal(m0.done, 0);
  s.tools.basket = 2;
  s.abundanceLv = 99;
  const m1 = C.worldMastery(s);
  assert.equal(m1.done, 1 + C.EMBARK_ABUNDANCE, 'Abundance counts only up to the embark level');
  assert.equal(m1.total, m0.total);
  assert.equal(C.worldMastery(master(C.createState(2))).done, m0.total);
});

test('lifetime total adds earlier worlds to this one', () => {
  const s = C.createState(7);
  s.stats.mycelium = 150;
  s.totalEver = 100;
  assert.equal(C.lifetimeTotal(s), 250);
});

test('embarking starts empty-handed and keeps lifetime records and known mushroom kinds', () => {
  const s = C.createState(12345);
  master(s);
  s.stats.mycelium = C.EMBARK_MIN_TOTAL;
  s.mushrooms.morel = 4;
  s.mushroomsEver.push('morel');
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 0, y: 0, z: 0, buffer: 0 });
  const em = C.embark(s, 99);
  assert.equal(em.ok, true);
  assert.equal(em.gained, 22);
  const fresh = em.state;
  assert.equal(fresh.seed, 99);
  assert.equal(fresh.inv.mycelium, 0);
  assert.equal(fresh.extractors.length, 0);
  assert.equal(fresh.insight, 0);
  assert.equal(fresh.prestiges, 1);
  assert.equal(fresh.totalEver, C.EMBARK_MIN_TOTAL);
  assert.equal(C.worldTotal(fresh), 0);
  assert.equal(C.canEmbark(fresh), false, 'carried progress alone cannot re-embark');
  assert.deepEqual(fresh.mushroomsEver, ['morel'], 'the collection of kinds found carries over');
  assert.deepEqual(fresh.mushrooms, {}, 'what was picked in this world does not');
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
  assert.equal(C.productionMult(s, 'mycelium'), 1.5625);
  assert.deepEqual(C.buy(s, 'nomad'), { ok: false, reason: 'Need 2 Insight' });
  assert.equal(C.speedMult(s), 1);
});

test('perks and free starting equipment do not carry into the next world', () => {
  const s = C.createState(1);
  s.insight = 10;
  master(s);
  s.stats.mycelium = C.EMBARK_MIN_TOTAL;
  s.perks.memory = 1; s.perks.heirloom = 1; // preserved ownership from legacy saves
  assert.equal(C.buy(s, 'cartographer').ok, true);
  const before = s.insight;
  assert.equal(C.buy(s, 'memory').ok, false);
  assert.equal(C.buy(s, 'heirloom').ok, false);
  assert.equal(s.insight, before, 'retired perks never charge the player');
  const next = C.embark(s, 2).state;
  assert.equal(next.unlocks.logistics, false);
  assert.equal(next.tools.basket, 0);
  assert.equal(next.tools.pickaxe, 0);
  assert.equal(C.exploreRadius(next), C.EXPLORE_RADIUS);
  assert.ok(Object.values(next.perks).every(n => n === 0));
  assert.equal(s.perks.memory, 1, 'the previous world keeps its earned perks');
});

test('milestones count in any order, and the next one says what it still takes', () => {
  const s = C.createState(1);
  assert.deepEqual(C.advanceGoals(s), []);
  assert.equal(C.nextGoal(s).id, 'forage');
  s.stats.foraged = 1;
  s.tools.basket = 2;
  assert.deepEqual(C.advanceGoals(s).map((g) => g.id), ['forage', 'basket']);
  assert.equal(s.goalIndex, 2);

  // A garden before the Pickaxe still counts (a player built three while stuck on it).
  s.extractors.push({ key: 'garden', res: 'mycelium', x: 3, y: 3, z: C.SURFACE, buffer: 0 });
  assert.deepEqual(C.advanceGoals(s).map((g) => g.id), ['garden']);
  assert.equal(s.goalIndex, 3);
  assert.equal(C.nextGoal(s).id, 'stone');
  s.stats.stone = 5;
  C.advanceGoals(s);
  const next = C.nextGoal(s);
  assert.equal(next.id, 'pickaxe');
  assert.deepEqual(C.goalNeeds(s, next), { cost: C.TOOLS.pickaxe.levels[1].cost });

  // A converter's milestone asks for its blueprint first.
  assert.deepEqual(C.goalNeeds(s, C.GOALS.find((g) => g.id === 'compost')), { cost: C.UNLOCKS.compost.cost });
  s.unlocks.compost = true;
  assert.deepEqual(C.goalNeeds(s, C.GOALS.find((g) => g.id === 'compost')), { cost: C.extractorCost(s, 'compost') });
  assert.deepEqual(C.goalNeeds(s, C.GOALS.find((g) => g.id === 'structures')), { n: 1, of: 25 });
});

// Watch (2026-10-19): a milestone reached is congratulated as done, in the
// past tense, never in the words of the objective it was.
test('every milestone that can be reached says so in its own past-tense words, in every language', () => {
  for (const g of C.GOALS.filter((g) => g.id !== 'forever')) {
    assert.ok(g.reached && g.reached !== g.text, `${g.id} has no words for being reached`);
    for (const [code, { strings }] of Object.entries(LANGUAGES)) {
      assert.ok(strings[`goal.${g.id}.reached`], `${code} ${g.id} has no reached words`);
      assert.notEqual(strings[`goal.${g.id}.reached`], strings[`goal.${g.id}`], `${code} ${g.id} reads like the objective`);
    }
  }
});

test('milestones reached survive a save, and an old save keeps its count', () => {
  const s = C.createState(1);
  s.goalsDone = ['forage', 'garden'];
  s.goalIndex = 2;
  const r = C.deserialize(C.serialize(s));
  assert.deepEqual(r.goalsDone, ['forage', 'garden']);
  const old = JSON.parse(C.serialize(s));
  delete old.goalsDone;
  old.goalIndex = 3;
  assert.deepEqual(C.deserialize(JSON.stringify(old)).goalsDone, ['forage', 'basket', 'stone']);
});

test('the day-night cycle runs from noon to midnight and back', () => {
  assert.equal(C.daylight(0), 1);
  assert.equal(Math.round(C.daylight(C.DAY_LENGTH / 2)), 0);
  const dusk = C.daylight(C.DAY_LENGTH / 4);
  assert.ok(dusk > 0.4 && dusk < 0.6);
  assert.equal(C.daylight(C.DAY_LENGTH), 1);
});
