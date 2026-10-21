/* Bounded complexity checks, not a playthrough. Never executes the old
 * billions-of-building-updates workload just to time it. */
import assert from 'node:assert/strict';
import { createProductionLedger } from '../src/core/production-ledger.js';
import { createWorld, markExplored, nearestExploredTile } from '../src/core/world.js';
import { createAutoplaySession } from './autoplay-driver.mjs';
import { RESOURCES, serialize } from '../src/core/index.js';

const ticks = 40 * 3600 * 60, observations = 100;
const production = [];
for (const count of [10, 100, 1000, 10000]) {
  const buildings = Array.from({ length: count }, (_, id) => ({ id,
    resource: ['mycelium', 'stone', 'ore', 'crystal'][id % 4],
    rate: [0.01, 0.8, 17.6, 7312.384, 2.1, 9.3, 0.35, 128][id % 8], buffer: ((id * 173) % 997) / 997 }));
  const started = performance.now(), ledger = createProductionLedger(buildings), built = performance.now();
  for (let i = 1; i <= observations; i++) ledger.advanceTo(Math.floor(ticks * i / observations));
  const ended = performance.now(), work = ledger.work;
  assert.equal(work.snapshots, 0);
  assert.equal(work.groups, observations * ledger.groups);
  assert.ok(work.comparisons <= observations * ledger.groups * Math.ceil(Math.log2(count + 1)));
  production.push({ buildings: count, groups: ledger.groups, observations, setupMs: built - started,
    queryMs: ended - built, work, fixedTickCostModelVisits: ticks * count });
}
const world = createWorld(12345);
markExplored(world, 32, 32, 0);
const spatial = [120, 1200, 120000].map(radius => {
  const work = { nodes: 0, chunks: 0, cells: 0 };
  assert.deepEqual(nearestExploredTile(world, 0.5, 0.5, 0, radius, () => true, work), { x: 32, y: 32 });
  return { radius, work };
});
assert.deepEqual(spatial[0].work, spatial[2].work);
// A short constructed fixture verifies the actual shared scheduler too. These
// grants are fixture setup only; playtest.mjs never grants or edits progress.
function session() {
  const result = createAutoplaySession(78934563);
  result.state.unlocks.logistics = true;
  for (const r of RESOURCES) result.state.inv[r] = 1e6;
  result.press(); return result;
}
const fine = session(), fast = session();
for (let i = 0; i < 1800; i++) fine.tick();
fast.advanceTicks(1800);
assert.equal(serialize(fine.state), serialize(fast.state));
assert.ok(fast.work.updates < fine.work.updates);
console.log(JSON.stringify({ kind: 'bounded kernels and constructed engine fixture; not a completed game',
  production, spatial, sharedEngineFixture: { seconds: 30, fine: fine.work, fast: fast.work, canonicalStateEqual: true } }, null, 2));
