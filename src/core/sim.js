/* Time and motion: the per-tick simulation, movement and fog reveal.
 * Deterministic: no clocks, no Math.random. */

import { SURFACE, tileDist2 } from './coords.js';
import { hash2 } from './noise.js';
import { TILE_INFO, T, RESOURCES } from './tiles.js';
import { tileAt, walkable, richness, baseRichness, setRichness, markExplored } from './world.js';
import {
  EXTRACTORS, AUTO_COLLECT_RANGE, BASE_SPEED, SWIM_SPEED, PLAYER_RADIUS, DAY_LENGTH,
  REGROW_RADIUS, REGROW_INTERVAL, REGROW_CHANCE
} from './content.js';
import { productionMult, abundanceTrickle, speedMult, exploreRadius, earn } from './economy.js';

const MAX_STEP = 0.25;

/* --------------------------------------------------------------- step */

export function step(s, dt) {
  if (dt > MAX_STEP) dt = MAX_STEP;
  const regrowTick = Math.floor(s.time / REGROW_INTERVAL);
  s.time += dt;
  s.stats.playedMs += dt * 1000;

  produce(s, dt);

  const trickle = abundanceTrickle(s) * dt;
  if (trickle > 0) {
    for (const r of RESOURCES) {
      earn(s, r, trickle, 'engine');
    }
  }

  const nextTick = Math.floor(s.time / REGROW_INTERVAL);
  if (nextTick !== regrowTick) regrow(s, nextTick);
}

const REACH2 = AUTO_COLLECT_RANGE * AUTO_COLLECT_RANGE;

// Whether Logistics hauls this building's output in as it's made.
export function autoCollected(s, e) {
  return s.unlocks.logistics && tileDist2(s.player, e.x, e.y, e.z) <= REACH2;
}

// Whether a building holds output that waits for you to collect it (a whole
// unit or more, and nothing is hauling it in).
export function holdsOutput(s, e) {
  return e.buffer >= 1 && !autoCollected(s, e);
}

function produce(s, dt) {
  for (const e of s.extractors) {
    const def = EXTRACTORS[e.key];
    if (e.buffer < def.buffer) {
      e.buffer = Math.min(def.buffer, e.buffer + def.rate * productionMult(s, e.res) * dt);
    }
    // Logistics: whole units funnel into your packs, but only from extractors
    // close enough to haul from (on your layer). Far away they keep producing
    // and fill their buffers, ready for when you walk back.
    if (e.buffer >= 1 && autoCollected(s, e)) {
      const amt = Math.floor(e.buffer);
      earn(s, e.res, amt, 'buildings');
      e.buffer -= amt;
      s.events.push({ res: e.res, amt, x: e.x, y: e.y, z: e.z });
    }
  }
}

// Depleted deposits near the player creep back toward their generated
// richness. Randomness is a hash of tile and tick, so replays match.
function regrow(s, tick) {
  const w = s.world, z = s.player.z;
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  for (let y = py - REGROW_RADIUS; y <= py + REGROW_RADIUS; y++) {
    for (let x = px - REGROW_RADIUS; x <= px + REGROW_RADIUS; x++) {
      if (!TILE_INFO[tileAt(w, x, y, z)].regrows) continue;
      const cur = richness(w, x, y, z);
      if (cur < baseRichness(w, x, y, z) && hash2(x ^ tick, y, w.seed + tick) < REGROW_CHANCE) {
        setRichness(w, x, y, z, cur + 1);
      }
    }
  }
}

/* --------------------------------------------------------------- move */

function canStand(s, x, y) {
  const w = s.world, z = s.player.z, r = PLAYER_RADIUS;
  return walkable(w, Math.floor(x - r), Math.floor(y - r), z) && walkable(w, Math.floor(x + r), Math.floor(y - r), z) &&
    walkable(w, Math.floor(x - r), Math.floor(y + r), z) && walkable(w, Math.floor(x + r), Math.floor(y + r), z) &&
    walkable(w, Math.floor(x), Math.floor(y), z);
}

export function onWater(s) {
  const p = s.player;
  return !!TILE_INFO[tileAt(s.world, Math.floor(p.x), Math.floor(p.y), p.z)].swim;
}

// Moves the player along (dx, dy), sliding along walls axis by axis.
// Returns whether the player moved at all.
export function move(s, dx, dy, dt) {
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return false;
  dx /= len; dy /= len;
  let speed = BASE_SPEED * speedMult(s);
  if (onWater(s)) speed *= SWIM_SPEED;
  const p = s.player;
  let moved = false;
  const nx = p.x + dx * speed * dt;
  if (canStand(s, nx, p.y)) { p.x = nx; moved = true; }
  const ny = p.y + dy * speed * dt;
  if (canStand(s, p.x, ny)) { p.y = ny; moved = true; }
  return moved;
}

/* ---------------------------------------------------------------- fog */

// Only the surface has fog. Revealing ore or crystal marks it discovered,
// which drives the early goals and the compass hint.
export function revealAround(s, radius = exploreRadius(s)) {
  const p = s.player;
  const w = s.world, r = Math.ceil(radius), r2 = radius * radius;
  const px = Math.floor(p.x), py = Math.floor(p.y);
  for (let y = py - r; y <= py + r; y++) {
    for (let x = px - r; x <= px + r; x++) {
      if (tileDist2(p, x, y, p.z) > r2) continue;
      markExplored(w, x, y, p.z);
      if (p.z !== SURFACE) continue;
      const t = tileAt(w, x, y, SURFACE);
      if (t === T.ORE) s.discovered.ore = true;
      if (t === T.CRYSTAL) s.discovered.crystal = true;
    }
  }
}

/* ---------------------------------------------------------- day/night */

// 1 at time 0 (noon) ... 0 at DAY_LENGTH / 2 (midnight).
export function daylight(t) {
  return 0.5 + 0.5 * Math.cos((t / DAY_LENGTH) * Math.PI * 2);
}
