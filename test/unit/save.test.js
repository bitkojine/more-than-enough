import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, lumberCamp, run } from './helpers.js';

const roundTrip = (s) => C.deserialize(C.serialize(s));

test('a save restores the world, the economy and the player', () => {
  const s = C.createState(4242);
  Object.assign(s.inv, { wood: 123, ore: 7 });
  s.tools.axe = 3; s.tools.overclock = 2;
  s.unlocks.logistics = true;
  s.perks.legacy = 2;
  s.extractors.push(lumberCamp(48, 50, 12.5));
  s.goalIndex = 5;
  s.player.x = 51.25; s.player.y = 47.75;
  C.setRichness(s.world, 49, 49, 0, 2);
  C.setRichness(s.world, -5000, 4000, 0, 1);
  C.setRichness(s.world, 3, 3, -2, 0);
  C.revealAround(s);

  const r = roundTrip(s);
  assert.equal(r.seed, 4242);
  assert.deepEqual(r.inv, s.inv);
  assert.deepEqual(r.tools, s.tools);
  assert.equal(r.unlocks.logistics, true);
  assert.equal(r.perks.legacy, 2);
  assert.equal(r.extractors.length, 1);
  assert.equal(r.extractors[0].key, 'lumber');
  assert.equal(r.extractors[0].z, 0);
  assert.equal(r.extractors[0].buffer, 12.5);
  assert.equal(r.goalIndex, 5);
  assert.deepEqual(r.player, { x: 51.25, y: 47.75, z: 0 });
  assert.equal(C.richness(r.world, 49, 49, 0), 2);
  assert.equal(C.richness(r.world, -5000, 4000, 0), 1);
  assert.equal(C.tileAt(r.world, 3, 3, -2), C.tileAt(s.world, 3, 3, -2), 'dug tunnels persist');
  assert.ok(C.isExplored(r.world, 51, 47, 0));
  assert.ok(!C.isExplored(r.world, 5000, 5000, 0));
});

test('an underground expedition survives a reload', () => {
  const s = C.createState(4242);
  const forest = { x: s.player.x, y: s.player.y };
  C.enterMine(s);
  s.underground.deepest = -5;
  const r = roundTrip(s);
  assert.equal(r.player.z, -1);
  assert.deepEqual(r.underground, { deepest: -5, entry: forest });
  C.leaveMine(r);
  assert.deepEqual([r.player.x, r.player.y, r.player.z], [forest.x, forest.y, 0]);
});

test('a reloaded save keeps producing', () => {
  const s = C.createState(12345);
  s.unlocks.logistics = true;
  s.extractors.push(lumberCamp(Math.floor(s.player.x) - 2, Math.floor(s.player.y)));
  run(s, 10);
  const r = roundTrip(s);
  const before = r.inv.wood;
  run(r, 10);
  assert.ok(r.inv.wood > before);
});

test('unreadable and pre-v3 saves are rejected', () => {
  assert.equal(C.deserialize('not json'), null);
  assert.equal(C.deserialize('null'), null);
  assert.equal(C.deserialize(JSON.stringify({ v: 1, seed: 4242 })), null);
  assert.equal(C.deserialize(JSON.stringify({ v: 2, seed: 4242 })), null);
  assert.equal(C.deserialize(JSON.stringify({ v: 4 })), null, 'a seed is required');
});

test('corrupt fields fall back to defaults instead of breaking the game', () => {
  const r = C.deserialize(JSON.stringify({
    v: 4, seed: 9, inv: { wood: 'lots' }, player: { x: 1.5, y: 2.5, z: 99 },
    tools: { axe: 99, pickaxe: -3 }, resUp: { wood: 1e9 },
    extractors: [{ k: 'nope', x: 0, y: 0 }, { k: 'quarry', x: 1.5, y: 0 }],
    mods: [[1, -4], ['x', 2]], explored: [[1, '!!']], underground: { deepest: 3 }
  }));
  assert.equal(r.inv.wood, 0);
  assert.equal(r.tools.axe, C.TOOLS.axe.levels.length);
  assert.equal(r.tools.pickaxe, 1);
  assert.equal(r.resUp.wood, C.REFINERIES.wood.levels.length);
  assert.equal(C.gatherYield(r, 'wood'), 32, 'clamped levels stay usable');
  assert.equal(r.player.z, 0);
  assert.equal(r.extractors.length, 0);
  assert.equal(r.world.mods.size, 0);
  assert.equal(r.world.explored.size, 0);
  assert.equal(r.underground.deepest, -1);
});

// A v3 save as written by 0.18.x: 2D keys, booleans for one-shot perks, an
// `unlocks.abundance` flag and a pocket mine with its own coordinates.
function v3Save(overrides = {}) {
  const k2 = (x, y) => (x + 2 ** 20) * 2 ** 21 + (y + 2 ** 20);
  const mask = new Uint8Array(32); mask[0] = 1;
  return JSON.stringify({
    v: 3, seed: 4242,
    mods: [[k2(49, 49), 2]],
    explored: [[k2(0, 0), C.bytesToB64(mask)]],
    player: { x: 51.25, y: 47.75 },
    inv: { wood: 10, stone: 0, ore: 0, crystal: 0 },
    tools: { axe: 2, pickaxe: 1, boots: 1, overclock: 1 },
    unlocks: { logistics: true, abundance: true, sapling: false, brickyard: false, foundry: false, observatory: false },
    resUp: { wood: 1, stone: 0, ore: 0, crystal: 0 }, abundanceLv: 1,
    insight: 2, prestiges: 1, totalEver: 30000,
    perks: { legacy: 1, memory: true, heirloom: false, cartographer: false, nomad: 0 },
    extractors: [{ k: 'mine', x: 48, y: 50, b: 3 }],
    stats: { wood: 50, stone: 0, ore: 0, crystal: 0, gathers: 9, collected: 0, built: 1, playedMs: 1000 },
    discovered: { ore: true, crystal: false }, goalIndex: 7, time: 12,
    mine: { active: false, depth: 2, x: 0, y: 0, carved: { '1,0': true }, mined: {}, shaftOpen: true, surface: { x: 51.25, y: 47.75 } },
    ...overrides
  });
}

test('v3 saves migrate onto the surface layer', () => {
  const r = C.deserialize(v3Save());
  assert.ok(r, 'migrated');
  assert.deepEqual(r.player, { x: 51.25, y: 47.75, z: 0 });
  assert.equal(C.richness(r.world, 49, 49, 0), 2, 'edits keep their tiles');
  assert.ok(C.isExplored(r.world, 0, 0, 0), 'fog keeps its chunks');
  assert.deepEqual(r.perks, { legacy: 1, memory: 1, heirloom: 0, cartographer: 0, nomad: 0 });
  assert.equal(r.abundanceLv, 1);
  assert.deepEqual(r.extractors, [{ key: 'mine', res: 'ore', x: 48, y: 50, z: 0, buffer: 3 }]);
  assert.deepEqual(r.underground, { deepest: -3, entry: null }, 'old depth 2 is the third layer down');
  assert.equal(r.goalIndex, 7);
});

test('a v3 save taken inside the old pocket mine resumes at its forest entrance', () => {
  const r = C.deserialize(v3Save({
    player: { x: 0.5, y: 0.5 },
    mine: { active: true, depth: 0, x: 0, y: 0, carved: {}, shaftOpen: false, surface: { x: 51.25, y: 47.75 } }
  }));
  assert.deepEqual(r.player, { x: 51.25, y: 47.75, z: 0 });
});
