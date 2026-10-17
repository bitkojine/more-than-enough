/* Scripted playthroughs: a bot walks the real world with real movement and
 * plays the game from nothing to automation, and on to the Abundance Engine. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, createBot } from './helpers.js';

function playToAutomation(seed) {
  const b = createBot(seed);
  const { s, clock, mark, gather, standBy, free } = b;
  gather('mycelium', 6); C.buy(s, 'basket'); mark('axe2');
  gather('mycelium', 8); C.buy(s, 'boots'); mark('boots2');
  gather('mycelium', 10); gather('stone', 6); C.buy(s, 'pickaxe'); mark('pick2');
  gather('mycelium', 15); standBy(free(T.FOREST)); C.place(s, 'garden'); mark('garden');
  gather('mycelium', 30); gather('stone', 15); standBy(free(T.STONE)); C.place(s, 'quarry'); mark('quarry');
  gather('stone', 45); gather('ore', 12); standBy(free(T.ORE)); C.place(s, 'mine'); mark('mine');
  gather('stone', 30); gather('ore', 4); C.buy(s, 'overclock'); mark('overclock2');

  const start = clock.t;
  while (clock.t - start < 180 && clock.t < 1400) {
    C.step(s, 0.1); clock.t += 0.1;
    if (C.collectTarget(s)) C.collect(s);
    if (!s.unlocks.logistics) {
      if (C.buy(s, 'logistics').ok) mark('logistics');
      else if (s.extractors.length < 3) break;
    }
  }
  return b;
}

for (const seed of [12345, 777, 20260101]) {
  test('bot reaches automation on seed ' + seed, () => {
    const { s, timeline } = playToAutomation(seed);
    assert.ok(s.extractors.length >= 2, JSON.stringify(timeline));
    if (seed === 12345) {
      for (const step of ['axe2', 'garden', 'quarry', 'mine']) assert.ok(timeline[step] !== undefined, step);
    }
  });
}

test('bot plays through to the Abundance Engine', () => {
  const { s, clock, timeline, mark, gather, standBy, buyNow, buildNow } = createBot(12345);
  buyNow('basket'); buyNow('boots'); buyNow('pickaxe');
  buildNow('garden'); buildNow('quarry'); buildNow('mine');
  assert.ok(buyNow('logistics').ok, 'Logistics');
  while (s.tools.overclock < 3 && clock.t < 2000) if (!buyNow('overclock').ok) break;
  assert.ok(buyNow('pickaxe').ok, 'Pickaxe III, for crystal');
  if (standBy((st, x, y) => typeAt(st, x, y) === T.CRYSTAL)) {
    mark('crystal');
    if (buildNow('resonator').ok) mark('resonator');
  }

  const quota = C.abundanceCost(s);
  const campFor = (res) => s.extractors.find((e) => e.res === res);
  while (clock.t < 6000 && s.abundanceLv === 0) {
    const want = C.RESOURCES.find((r) => s.inv[r] < quota[r]);
    if (want) {
      const camp = campFor(want);
      const near = camp && Math.hypot(camp.x + 0.5 - s.player.x, camp.y + 0.5 - s.player.y) <= 2.9;
      const camped = near || (camp && standBy((st, x, y) =>
        !C.extractorAt(st, x, y, 0) && C.walkable(st.world, x, y, 0) && Math.hypot(x - camp.x, y - camp.y) <= 2.4, true));
      if (!camped) gather(want, Math.min(quota[want], s.inv[want] + 25)); // no camp: hand-gather a batch
    }
    C.step(s, 0.1); clock.t += 0.1;
    if (C.buy(s, 'abundance').ok) mark('abundance');
  }
  assert.ok(timeline.crystal !== undefined, 'found crystal');
  assert.ok(timeline.resonator !== undefined, 'built a Resonator');
  assert.ok(timeline.abundance !== undefined, 'built the Abundance Engine (' + JSON.stringify(timeline) + ')');
});
