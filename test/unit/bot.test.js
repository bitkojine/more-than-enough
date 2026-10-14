/* Scripted playthroughs: a bot walks the real world with real movement and
 * plays the game from nothing to automation, and on to the Abundance Engine. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, richAt, findNear, findPath, walkPath } from './helpers.js';

function createBot(seed) {
  const s = C.createState(seed);
  const clock = { t: 0 };
  const timeline = {};
  const mark = (name) => { if (timeline[name] === undefined) timeline[name] = +clock.t.toFixed(1); };

  function walkTowards(target, pad, budget) {
    const path = findPath(s, Math.floor(s.player.x), Math.floor(s.player.y), target.x, target.y, pad);
    if (!path) return -1;
    const used = walkPath(s, path, 0.1, budget);
    clock.t += used;
    return used;
  }

  function gather(res, need) {
    for (let guard = 0; s.inv[res] < need && guard < 6000; guard++) {
      const t = findNear(s, (st, x, y) => C.TILE_INFO[typeAt(st, x, y)].res === res && richAt(st, x, y) > 0);
      if (!t) return false;
      if (!C.canHarvest(s, t.x, t.y)) {
        if (walkTowards(t, 10, 30) < 0) C.setRichness(s.world, t.x, t.y, 0, 0); // unreachable: forget it
        continue;
      }
      if (!C.harvestAt(s, t.x, t.y)) continue;
      C.step(s, 0.25);
      clock.t += 0.25;
    }
    return s.inv[res] >= need;
  }

  // Walks next to (or, when tight, onto) the nearest tile matching pred.
  function standBy(pred, tight) {
    const stop = tight ? 0.25 : 1.2;
    for (let attempt = 0; attempt < 30; attempt++) {
      const t = findNear(s, pred);
      if (!t) return false;
      if (Math.hypot(t.x + 0.5 - s.player.x, t.y + 0.5 - s.player.y) <= stop) return true;
      if (walkTowards(t, 24, 12) < 0.1) return false;
    }
    return false;
  }

  const free = (type) => (st, x, y) => typeAt(st, x, y) === type && !C.extractorAt(st, x, y, 0);

  return { s, clock, timeline, mark, gather, standBy, free };
}

function playToAutomation(seed) {
  const b = createBot(seed);
  const { s, clock, mark, gather, standBy, free } = b;
  gather('mycelium', 6); C.buy(s, 'basket'); mark('axe2');
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
  const { s, clock, timeline, mark, gather, standBy, free } = createBot(12345);
  gather('mycelium', 6); C.buy(s, 'basket');
  gather('mycelium', 10); gather('stone', 6); C.buy(s, 'pickaxe');
  gather('mycelium', 15); standBy(free(T.FOREST)); C.place(s, 'garden');
  gather('mycelium', 30); gather('stone', 15); standBy(free(T.STONE)); C.place(s, 'quarry');
  gather('stone', 45); gather('ore', 12); standBy(free(T.ORE)); C.place(s, 'mine');
  gather('stone', 150); gather('ore', 40); C.buy(s, 'logistics');
  while (s.tools.overclock < 4 && clock.t < 2000) {
    const cost = C.upgradeCost(s, 'overclock');
    gather('stone', cost.stone); gather('ore', cost.ore);
    if (!C.buy(s, 'overclock').ok) break;
  }
  gather('stone', 140); gather('ore', 70);
  if (standBy((st, x, y) => typeAt(st, x, y) === T.CRYSTAL)) {
    mark('crystal');
    gather('crystal', 6);
    standBy(free(T.CRYSTAL));
    if (C.place(s, 'resonator').ok) mark('resonator');
  }

  const quota = C.ABUNDANCE.baseCost;
  const campFor = (res) => s.extractors.find((e) => e.res === res);
  while (clock.t < 3000 && s.abundanceLv === 0) {
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
