import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, master } from './helpers.js';

test('the last refinery price grows slower than its production reward', () => {
  for (const chain of Object.values(C.REFINERIES)) {
    const previous = chain.levels.at(-2), final = chain.levels.at(-1);
    for (const [res, amount] of Object.entries(final.cost)) {
      assert.ok(amount > previous.cost[res], 'the final purchase still requires investment');
      assert.ok(amount < previous.cost[res] * final.mult, 'price growth cannot outpace the final production reward');
    }
  }
});

test('a real final purchase unlocks victory and mastery progress without an income gate', () => {
  const s = master(C.createState(82376));
  s.resUp.crystal--;
  const price = C.upgradeCost(s, 'crystal');
  Object.assign(s.inv, price);
  s.inv.stone--;
  assert.equal(C.buy(s, 'crystal').ok, false, 'the final purchase still pays its full price');
  assert.equal(C.canEmbark(s), false);
  s.inv.stone++;
  assert.equal(C.buy(s, 'crystal').ok, true);
  assert.equal(C.worldTotal(s), 0, 'the test has not manufactured lifetime earnings');
  assert.equal(C.canEmbark(s), true, 'completion itself ends the world');
  assert.ok(C.advanceGoals(s).some(g => g.id === 'master'));
  const m = C.worldMastery(s);
  assert.deepEqual(C.GOALS.find(g => g.id === 'master').count(s), { n: m.total, of: m.total });
  const saved = C.serialize(s), restored = C.deserialize(saved);
  assert.equal(C.serialize(restored), saved, 'earned levels and remaining balances survive saving');
  assert.equal(C.canEmbark(restored), true);
  assert.equal(C.canEmbark(C.createState(82377)), false, 'a new world still needs its own upgrades');
});
