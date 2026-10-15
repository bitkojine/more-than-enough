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

// Breadth-first path over walkable tiles inside a padded box around start and
// goal (not over water until your Boots take you onto it).
export function findPath(s, sx, sy, tx, ty, pad = 10) {
  const minX = Math.min(sx, tx) - pad, maxX = Math.max(sx, tx) + pad;
  const minY = Math.min(sy, ty) - pad, maxY = Math.max(sy, ty) + pad;
  const key = (x, y) => x + ',' + y;
  const prev = new Map([[key(sx, sy), null]]);
  const queue = [[sx, sy]];
  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head];
    if (cx === tx && cy === ty) break;
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      if (nx < minX || ny < minY || nx > maxX || ny > maxY || prev.has(key(nx, ny))) continue;
      if (!C.walkable(s.world, nx, ny, s.player.z)) continue;
      if (!C.canWade(s) && C.swimsAt(s.world, nx, ny, s.player.z)) continue;
      prev.set(key(nx, ny), [cx, cy]);
      queue.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return null;
  const path = [];
  for (let node = [tx, ty]; node && !(node[0] === sx && node[1] === sy); node = prev.get(key(node[0], node[1]))) {
    path.push({ x: node[0], y: node[1] });
  }
  return path.reverse();
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

// A bot that plays state `s` (a new world from `seed` unless given) the way
// a player would; `tick()` runs after every step of play.
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

  function gather(res, need) {
    for (let guard = 0; s.inv[res] < need && guard < 6000; guard++) {
      const t = findNear(s, (st, x, y) => C.TILE_INFO[typeAt(st, x, y)].res === res && richAt(st, x, y) > 0 && !C.gearNeeded(st, x, y));
      if (!t) return false;
      if (!C.canHarvest(s, t.x, t.y)) {
        if (walkTowards(t, 10, 30) < 0) C.setRichness(s.world, t.x, t.y, 0, 0); // unreachable: forget it
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

  const free = (type) => (st, x, y) => typeAt(st, x, y) === type && !C.extractorAt(st, x, y, 0);

  return { s, clock, timeline, mark, gather, standBy, free };
}
