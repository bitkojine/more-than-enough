/* Property tests: random legal play, checked against the invariants after
 * every step. Where the example tests in test/unit/ pin what happened, these
 * search for what *could* happen: thousands of short games, each one a
 * sequence of acts the game itself would allow, none of them ever breaking a
 * rule the code promises.
 *
 * A failure prints the seed, so it replays exactly:
 *   PROP_SEEDS=<seed> npm test        (one seed)
 *   PROP_SEEDS=2000 npm test          (search wider)
 *
 * Core rules are pure (src/core/: no DOM, no clock, no Math.random), so this
 * needs nothing else: node's test runner, a seeded rng, and the game itself.
 * The random source is test/property/random.js, never Math.random. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { rng, seeds, property } from './random.js';
import { invariants } from './invariants.js';

const RULES = invariants();

// Holds every invariant after one step of play. Throws on the first break,
// naming the rule, so a failure report points at the rule that broke.
function holds(s, where) {
  for (const { name, check } of RULES) {
    try {
      check(s);
    } catch (err) {
      throw new Error(`[${where}] ${name}: ${err.message}`);
    }
  }
}

// Walks the player toward a tile, greedily and capped, the way a real walk
// works (core move/step) but without a path: most walks miss and cost only a
// little time, which is fine for a stress test.
function walkTo(s, tx, ty, budget = 8) {
  const dt = 0.1;
  for (let t = 0; t < budget; t += dt) {
    const dx = tx + 0.5 - s.player.x, dy = ty + 0.5 - s.player.y;
    if (Math.hypot(dx, dy) < 0.3) return true;
    if (!C.move(s, dx, dy, dt)) return false;
    C.revealAround(s);
    C.step(s, dt);
  }
  return false;
}

// A single legal act, chosen from what the state allows right now. Each
// branch asks before it acts (harvestAt/collect/buy/place all refuse when
// the act isn't possible), so a step never does something the game forbids.
function oneAct(s, r) {
  const choice = r.int(0, 9);
  if (choice < 4) {
    // Gather: try a handful of nearby spots, act on the first that works.
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(s.player.x) + r.int(-3, 3);
      const y = Math.floor(s.player.y) + r.int(-3, 3);
      if (C.tileAt(s.world, x, y, s.player.z) !== undefined) {
        walkTo(s, x, y, 2);
        if (C.harvestAt(s, x, y)) {
          C.step(s, 0.25);
          return;
        }
      }
    }
    return;
  }
  if (choice < 6) {
    // Collect whatever a building has made.
    if (C.collect(s)) C.step(s, 0.25);
    return;
  }
  if (choice < 8) {
    // Buy the next upgrade of a family, if affordable (buy refuses otherwise).
    const id = r.pick(['basket', 'pickaxe', 'boots', 'overclock', ...C.RESOURCES, 'abundance']);
    C.buy(s, id);
    return;
  }
  if (choice === 8) {
    // Put up a building you can afford, on a free tile beside you.
    const key = r.pick(Object.keys(C.EXTRACTORS));
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(s.player.x) + r.int(-2, 2);
      const y = Math.floor(s.player.y) + r.int(-2, 2);
      if (C.place(s, key, { x, y })) { C.step(s, 0.25); return; }
    }
    return;
  }
  // Wander, so gathering finds new ground and the fog grows.
  const dt = 0.1;
  C.move(s, r.int(-10, 10), r.int(-10, 10), dt);
  C.revealAround(s);
  C.step(s, dt);
}

// Plays one random game of `steps` acts from `seed`, checking invariants
// after every one. The acts are picked afresh from what each state allows,
// so illegal ones never happen: a failure is a real rule break, not noise.
function play(state, r, steps) {
  for (let i = 0; i < steps; i++) {
    oneAct(state, r);
    C.step(state, 0.05); // time passes even when nothing was done
    holds(state, `step ${i}`);
  }
}

test('property: random play never breaks a game rule', () => {
  property((r, seed) => {
    const s = C.createState(seed);
    holds(s, 'fresh');
    play(s, r, r.size(40, 260));
    holds(s, 'end');
  });
});

test('property: a mastered world\'s random play never breaks a rule', () => {
  // Past the early game, where multipliers, refineries and the Engine are
  // live: a different arithmetic than a fresh world.
  property((r, seed) => {
    const s = C.createState(seed);
    for (const k in s.tools) s.tools[k] = r.int(1, C.TOOLS[k].levels.length);
    for (const k in s.resUp) s.resUp[k] = r.int(0, C.REFINERIES[k].levels.length);
    for (const k in s.unlocks) s.unlocks[k] = r.chance(0.7);
    s.abundanceLv = r.int(0, 4);
    for (const res of C.RESOURCES) s.inv[res] = r.chance(0.5) ? r.int(0, 1e6) : 0;
    s.discovered = { ore: r.chance(0.5), crystal: r.chance(0.5) };
    holds(s, 'setup');
    play(s, r, r.size(40, 200));
    holds(s, 'end');
  });
});

test('property: the room\'s round-trip never breaks a rule', () => {
  // A state goes to a room (worldOf + progressOf), a fresh phone joins from
  // what the room sends back (joinState), and the two must agree on the
  // world's land and on who owns what. This is the shared-world half of
  // "saved progress survives a restart", driven at random.
  property((r, seed) => {
    const s = C.createState(seed);
    s.shared = 'room-' + seed;
    s.me = 'ab' + seed.toString(16).padStart(14, '0');
    // Build a little, so there is a building to own and to come back to.
    for (let i = 0; i < 3; i++) {
      const key = r.pick(Object.keys(C.EXTRACTORS));
      const x = Math.floor(s.player.x) + r.int(-2, 2);
      const y = Math.floor(s.player.y) + r.int(-2, 2);
      C.place(s, key, { x, y });
    }
    for (const res of C.RESOURCES) s.inv[res] = r.int(0, 1e4);
    C.revealAround(s);
    holds(s, 'before');

    const world = C.worldOf(s);
    const welcome = {
      you: s.me, c: 0,
      seed: world.seed, mods: world.mods, props: world.props,
      ext: world.ext.map((e) => [...e, s.me]),
      save: C.progressOf(s)
    };
    const back = C.joinState(welcome, s.shared, C.fogOf(s));
    assert.ok(back, 'a world you made did not come back from the room');
    holds(back, 'after join');

    // The land is a function of seed + edits: joining must not change it.
    assert.equal(back.seed, s.seed, 'the seed changed through the room');
    assert.deepEqual([...back.world.mods], [...s.world.mods], 'edits changed through the room');
    // And your buildings come back as yours.
    const at = (e) => e.x + ',' + e.y + ',' + e.z;
    const mineBefore = new Set(s.extractors.filter((e) => !e.owner || e.owner === s.me).map(at));
    for (const e of back.extractors) {
      if (mineBefore.has(at(e))) assert.equal(e.owner, s.me, `a building you own came back as someone else's at ${at(e)}`);
    }
  });
});

test("property: gathering never raises a tile's richness", () => {
  // "Nothing grows back, so a tile's richness only goes down" (room.js): a
  // tile you gather from is at most as rich as it started, never richer.
  // Harvesting is aimed deliberately at known tiles, so the check lands on
  // the arithmetic instead of hoping a random walk crosses a sampled spot.
  property((r, seed) => {
    const s = C.createState(seed);
    const z = s.player.z;
    const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
    const before = new Map();
    for (let x = px - 6; x <= px + 6; x++) {
      for (let y = py - 6; y <= py + 6; y++) {
        if (C.tileAt(s.world, x, y, z) === undefined) continue;
        before.set(x + ',' + y + ',' + z, C.richness(s.world, x, y, z));
      }
    }
    for (let i = 0; i < r.size(20, 60); i++) {
      const x = px + r.int(-6, 6), y = py + r.int(-6, 6);
      walkTo(s, x, y, 3);
      C.harvestAt(s, x, y);
      C.step(s, 0.05);
    }
    for (const [at, was] of before) {
      const [x, y, zz] = at.split(',').map(Number);
      const now = C.richness(s.world, x, y, zz);
      assert.ok(now <= was, `richness of ${at} rose from ${was} to ${now}`);
    }
  });
});
