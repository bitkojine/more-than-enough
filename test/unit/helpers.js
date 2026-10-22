/* Shared helpers for the unit tests: finding tiles and walking the player
 * through the real movement rules. */

import * as C from '../../src/core/index.js';

export { C };
export const T = C.T;

export function typeAt(s, x, y, z = s.player.z) {
  return C.tileAt(s.world, x, y, z);
}

export function richAt(s, x, y, z = s.player.z) {
  return C.richness(s.world, x, y, z);
}

// Nearest tile on the player's layer matching pred(s, x, y).
export function findNear(s, pred, maxR = 140) {
  return C.nearestTile(s.player.x, s.player.y, maxR, (x, y) => pred(s, x, y));
}

export function standOn(s, t) {
  s.player.x = t.x + 0.5;
  s.player.y = t.y + 0.5;
}

// The route over walkable tiles from start to goal (the brain's own, core
// paths.js), not over water until your Boots take you onto it.
export function findPath(s, sx, sy, tx, ty, pad = 10) {
  return C.findPath(s, sx, sy, tx, ty, { pad });
}

// Walks the path with real movement for up to `budget` seconds; returns time used.
export function walkPath(s, path, dt, budget) {
  let used = 0, i = 0;
  while (i < path.length && used < budget) {
    const wp = path[i];
    const dx = wp.x + 0.5 - s.player.x, dy = wp.y + 0.5 - s.player.y;
    if (Math.hypot(dx, dy) < 0.25) { i++; continue; }
    const moved = C.move(s, dx, dy, dt);
    C.revealAround(s);
    C.step(s, dt); // walking takes play time, as in the game
    used += dt;
    if (!moved) break;
  }
  return used;
}

// Runs the simulation for `seconds` in 0.1 s steps.
export function run(s, seconds) {
  for (let t = 0; t < seconds * 10 - 1e-9; t++) C.step(s, 0.1);
}

export function mushroomGarden(x, y, buffer = 0) {
  return { key: 'garden', res: 'mycelium', x, y, z: C.SURFACE, buffer };
}

// Every world upgrade bought (tools, refineries, unlocks, Abundance to the
// embark level): a mastered world.
export function master(s) {
  for (const k in s.tools) s.tools[k] = C.TOOLS[k].levels.length;
  for (const k in s.resUp) s.resUp[k] = C.REFINERIES[k].levels.length;
  for (const k in s.unlocks) s.unlocks[k] = true;
  s.abundanceLv = C.EMBARK_ABUNDANCE;
  return s;
}

// The player moved to the nearest cave mouth (a way down into the mine; never
// on home ground), with the view revealed around them.
export function away(s) {
  const t = C.nearestTile(s.player.x, s.player.y, 60, (x, y) => C.tileAt(s.world, x, y, C.SURFACE) === T.CAVE);
  standOn(s, t);
  C.revealAround(s);
  return s;
}

/* ------------------------------------------------------------- the bot */

// Scripted rules-test fixture, NOT a fair-play bot: target searches inspect
// unexplored terrain and routes need not respect fog. Never use this helper
// for AUTO-only evaluation or fair-world timing claims. `tick()` runs after
// every step of the constructed scenario.
export function createBot(seed, s = C.createState(seed), tick = () => {}) {
  const clock = { t: 0 };
  const timeline = {};
  const mark = (name) => { if (timeline[name] === undefined) timeline[name] = +clock.t.toFixed(1); };

  function walkTowards(target, pad, budget) {
    const path = findPath(s, Math.floor(s.player.x), Math.floor(s.player.y), target.x, target.y, pad);
    if (!path) return -1;
    const used = walkPath(s, path, 0.1, budget);
    clock.t += used;
    tick();
    return used;
  }

  const unreachable = new Set(); // tiles a walk found no way to: passed by
  const reachable = (x, y) => !unreachable.has(x + ',' + y);

  function gather(res, need) {
    for (let guard = 0; s.inv[res] < need && guard < 6000; guard++) {
      const t = findNear(s, (st, x, y) => C.TILE_INFO[typeAt(st, x, y)].res === res && richAt(st, x, y) > 0 && !C.gearNeeded(st, x, y) && !C.extractorAt(st, x, y, C.SURFACE) && reachable(x, y));
      if (!t) return false;
      if (!C.canHarvest(s, t.x, t.y)) {
        if (walkTowards(t, 10, 30) < 0) unreachable.add(t.x + ',' + t.y);
        continue;
      }
      if (!C.harvestAt(s, t.x, t.y)) continue;
      C.step(s, 0.25);
      clock.t += 0.25;
      tick();
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

  const free = (type) => (st, x, y) => typeAt(st, x, y) === type && richAt(st, x, y) > 0 && !C.extractorAt(st, x, y, 0) && reachable(x, y);

  // Gathers what upgrade `id` costs by hand, then buys it.
  function buyNow(id) {
    const cost = C.upgradeCost(s, id);
    for (const r in cost) gather(r, cost[r]);
    return C.buy(s, id);
  }
  // Gathers what building `key` costs by hand, walks to a free tile it can
  // stand on and builds it.
  function buildNow(key) {
    const cost = C.extractorCost(s, key);
    for (const r in cost) gather(r, cost[r]);
    const tile = C.EXTRACTORS[key].tile;
    if (tile !== null) standBy(free(tile));
    return C.place(s, key);
  }

  return { s, clock, timeline, mark, gather, standBy, free, buyNow, buildNow };
}

/* --------------------------------------------------- the Perfect button */

// Holds the Perfect button for `seconds` of play: the brain (core
// perfect.js) picks each intent and it's carried out the way the game's
// button does it (src/game/perfect.js): walking with real movement, one act
// every 0.25 s. `seen(intent, result)` hears each one, and `tick()` runs
// after every step of play. Returns the time played and the last intent;
// stops early at the Embark pause.
export function holdPerfect(s, seconds, { mind = C.newMind(), seen = () => {}, tick = () => {} } = {}) {
  let played = 0, last = null;
  // In steps the game takes (it caps each at a quarter second), so a second
  // spent waiting is a second of play.
  const pass = (dt) => {
    for (let left = dt; left > 1e-9; left -= 0.25) C.step(s, Math.min(0.25, left));
    played += dt;
    tick();
  };
  C.revealAround(s); // as the game's first frame does
  while (played < seconds) {
    const intent = C.nextIntent(s, mind);
    last = intent;
    if (intent.type === 'wait') {
      seen(intent);
      if (intent.why === 'embark') break;
      pass(1);
      continue;
    }
    if (intent.type === 'walk') {
      const tx = intent.x + 0.5, ty = intent.y + 0.5;
      for (let k = 0; k < 20; k++) {
        const dx = tx - s.player.x, dy = ty - s.player.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.18) break;
        const dt = Math.min(0.1, d / C.walkSpeed(s)); // no overshooting the step
        const moved = C.move(s, dx, dy, dt);
        C.revealAround(s);
        pass(dt);
        if (!moved) break;
      }
      seen(intent);
      continue;
    }
    seen(intent, performIntent(s, intent));
    pass(0.25);
  }
  return { played, last, mind };
}

// Carries out one act intent through the core calls a press makes.
export function performIntent(s, intent) {
  switch (intent.type) {
    case 'harvestAt': return C.harvestAt(s, intent.x, intent.y);
    case 'collect': return C.collect(s);
    case 'buy': return C.buy(s, intent.id);
    case 'place': return C.place(s, intent.key, { x: intent.x, y: intent.y });
    case 'descend': { const r = C.descendAt(s, intent.x, intent.y); C.revealAround(s); return r; }
    case 'climb': { const r = C.climbAt(s, intent.x, intent.y); C.revealAround(s); return r; }
    case 'prop': return C.placeProp(s, intent.kind);
    case 'charge': return !!C.chargerNear(s);
  }
  throw new Error('unknown intent ' + intent.type);
}
