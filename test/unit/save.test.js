import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, mushroomGarden, run, away } from './helpers.js';

const roundTrip = (s) => C.deserialize(C.serialize(s));

test('a save restores the world, the economy and the player', () => {
  const s = away(C.createState(4242));
  Object.assign(s.inv, { mycelium: 123, ore: 7 });
  s.tools.basket = 3; s.tools.overclock = 2;
  s.unlocks.logistics = true;
  s.perks.legacy = 2;
  s.extractors.push(mushroomGarden(48, 50, 12.5));
  s.goalsDone = ['forage', 'basket', 'stone', 'garden', 'pickaxe'];
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
  assert.equal(r.extractors[0].key, 'garden');
  assert.equal(r.extractors[0].z, 0);
  assert.equal(r.extractors[0].buffer, 12.5);
  assert.equal(r.goalIndex, 5);
  assert.deepEqual(r.goalsDone, s.goalsDone);
  assert.deepEqual(r.player, { x: 51.25, y: 47.75, z: 0 });
  assert.equal(C.richness(r.world, 49, 49, 0), 2);
  assert.equal(C.richness(r.world, -5000, 4000, 0), 1);
  assert.equal(C.tileAt(r.world, 3, 3, -2), C.tileAt(s.world, 3, 3, -2), 'dug tunnels persist');
  assert.ok(C.isExplored(r.world, 51, 47, 0));
  assert.ok(!C.isExplored(r.world, 5000, 5000, 0));
});

test('an underground expedition survives a reload, holes and mine fog included', () => {
  const s = away(C.createState(4242));
  const fx = Math.floor(s.player.x), fy = Math.floor(s.player.y);
  C.goDown(s);
  C.revealAround(s);
  s.underground.deepest = -5;
  const r = roundTrip(s);
  assert.equal(r.player.z, -1);
  assert.deepEqual(r.underground, { deepest: -5 });
  assert.ok(C.holeBelow(r.world, fx, fy, 0), 'the cave mouth down from the forest is still there');
  assert.ok(C.isExplored(r.world, fx + 1, fy, -1), 'so is what you saw underground');
  C.goUp(r);
  assert.deepEqual([Math.floor(r.player.x), Math.floor(r.player.y), r.player.z], [fx, fy, 0], 'climbs back out the same way');
});

test('a reloaded save keeps producing', () => {
  const s = away(C.createState(12345));
  s.unlocks.logistics = true;
  s.extractors.push(mushroomGarden(Math.floor(s.player.x) - 2, Math.floor(s.player.y)));
  run(s, 10);
  const r = roundTrip(s);
  const before = r.inv.mycelium;
  run(r, 10);
  assert.ok(r.inv.mycelium > before);
});

test('unreadable saves and saves from other format versions are rejected', () => {
  assert.equal(C.deserialize('not json'), null);
  assert.equal(C.deserialize('null'), null);
  for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, C.SAVE_VERSION + 1]) {
    assert.equal(C.deserialize(JSON.stringify({ v, seed: 4242 })), null, 'format v' + v);
  }
  assert.equal(C.deserialize(JSON.stringify({ v: C.SAVE_VERSION })), null, 'a seed is required');
});

test('corrupt fields fall back to defaults instead of breaking the game', () => {
  const r = C.deserialize(JSON.stringify({
    v: C.SAVE_VERSION, seed: 9, inv: { mycelium: 'lots' }, player: { x: 1.5, y: 2.5, z: 99 },
    tools: { basket: 99, pickaxe: -3 }, resUp: { mycelium: 1e9 },
    extractors: [{ k: 'nope', x: 0, y: 0 }, { k: 'quarry', x: 1.5, y: 0 }],
    mods: [[1, -4], ['x', 2]], explored: [[1, '!!']], underground: { deepest: 3 }, holes: ['x', 1.5]
  }));
  assert.equal(r.inv.mycelium, 0);
  assert.equal(r.tools.basket, C.TOOLS.basket.levels.length);
  assert.equal(r.tools.pickaxe, 1);
  assert.equal(r.resUp.mycelium, C.REFINERIES.mycelium.levels.length);
  assert.equal(C.gatherYield(r, 'mycelium'), 32, 'clamped levels stay usable');
  assert.equal(r.player.z, 0);
  assert.equal(r.extractors.length, 0);
  assert.equal(r.world.mods.size, 0);
  assert.equal(r.world.explored.size, 0);
  assert.equal(r.underground.deepest, 0);
  assert.equal(r.world.holes.size, 0);
});

