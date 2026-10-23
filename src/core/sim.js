/* Time and motion: the per-tick simulation, movement and fog reveal.
 * Deterministic: no clocks, no Math.random. */

import {stepCultivation} from './cultivation.js';
import { SURFACE, tileDist2 } from './coords.js';
import { noteWhere } from './acts.js';
import { TILE_INFO, T, RESOURCES } from './tiles.js';
import { tileAt, walkable, markExplored } from './world.js';
import {
  AWAY_CAP, AWAY_MIN, FREEZE_AWAY, BASE_SPEED, SWIM_SPEED, PLAYER_RADIUS, GEAR, EXTRACTORS
} from './content.js';
import { extractorRate, supportMult, productionMult, abundanceTrickle, speedMult, exploreRadius, earn, ownBuilding } from './economy.js';
import { tickBattery, lightScale } from './light.js';
import { economyForState } from './economy-context.js';
import { haulingEconomyAvailable, haulsBuilding, usesDepots } from './logistics.js';
import { extractorCapacity } from './economy.js';
import { createEventEconomy } from './event-economy.js';

const MAX_STEP = 0.25;

// The shared engine activates hauling after one normalizing legacy tick.
// Direct variable-step/core replay callers retain their existing contract.
export function startEventEconomy(s) {
  const current = economyForState(s);
  if (current) return current;
  if (!haulingEconomyAvailable(s) || !Number.isFinite(abundanceTrickle(s)) ||
      s.extractors.some(e => ownBuilding(s, e) && (!Number.isFinite(e.buffer) || e.buffer < 0 || (!usesDepots(s) && e.buffer >= 1) ||
        !Number.isFinite(extractorRate(s, e.key, e))))) return null;
  return createEventEconomy(s, {
    rateFor: extractorRate, trickleFor: abundanceTrickle, owns: ownBuilding
  });
}

export function settleEconomy(s) { economyForState(s)?.settle(); }
export function canBatchEconomy(s, count) { return haulingEconomyAvailable(s) && !!economyForState(s)?.canAdvanceTicks(count); }

/* --------------------------------------------------------------- step */

export function step(s, dt, { visualEvents = true } = {}) {
  if (dt > MAX_STEP) dt = MAX_STEP;
  if(s.cultivation)stepCultivation(s,dt);
  noteWhere(s); // a shared world's room follows where you are (acts.js)
  const economy = economyForState(s) || (usesDepots(s) && Math.abs(dt*60-Math.round(dt*60))<1e-9 ? startEventEconomy(s) : null);
  if (economy) {
    const ticks = Math.round(dt * 60);
    if (haulingEconomyAvailable(s) && Math.abs(dt * 60 - ticks) < 1e-9 && economy.canAdvanceTicks(ticks)) {
      economy.advanceTicks(ticks);
      tickBattery(s, dt);
      if (visualEvents) economy.emitVisualEvents();
      return;
    }
    // Variable-step and shared callers retain the legacy contract. Settle
    // first so falling back cannot discard production or fractional buffers.
    economy.stop();
  }
  s.time += dt;
  s.stats.playedMs += dt * 1000;

  produce(s, dt, visualEvents);
  tickBattery(s, dt);

  const trickle = abundanceTrickle(s) * dt;
  if (trickle > 0) {
    for (const r of RESOURCES) {
      earn(s, r, trickle, 'engine');
    }
  }
}

// Whether Logistics hauls this building's output in as it's made: any of
// yours, wherever you are, so walking off to do something never costs what
// your buildings make (closing the game doesn't either, awayProduce).
export function autoCollected(s, e) {
  return haulsBuilding(s,e);
}

const SHOW2 = 12 * 12; // tiles away a haul is still shown flying in

// Whether a building holds output that waits for you to collect it (a whole
// unit or more, and nothing is hauling it in).
export function holdsOutput(s, e) {
  return e.buffer >= 1 && !autoCollected(s, e);
}

const productionScratch = new WeakMap();

function produce(s, dt, visualEvents) {
  if (!s.extractors.length) return;
  let scratch = productionScratch.get(s);
  if (!scratch) {
    scratch = { groups: Object.fromEntries(RESOURCES.map((res) => [res, { indices: [], count: 0 }])), events: [] };
    productionScratch.set(s, scratch);
  }
  const groups = scratch.groups, events = scratch.events;
  for (const res of RESOURCES) groups[res].count = 0;
  // Rebuild membership every tick: appends, removals, replacement arrays,
  // same-length replacements and ownership changes all take effect now.
  for (let i = 0; i < s.extractors.length; i++) {
    const e = s.extractors[i];
    if (!ownBuilding(s, e)) continue;
    const group = groups[e.res];
    group.indices[group.count++] = i;
  }
  let lastEvent = -1;
  const hauling = s.unlocks.logistics;
  for (const res of RESOURCES) {
    const group = groups[res];
    if (!group.count) continue;
    const m = productionMult(s, res);
    let inv = s.inv[res], total = s.stats[res], income = s.sources[res].buildings;
    for (let j = 0; j < group.count; j++) {
      const i = group.indices[j], e = s.extractors[i], def = EXTRACTORS[e.key];
      const boosted = m * supportMult(s, e);
      const cap = def.buffer * boosted;
      if (e.buffer < cap) e.buffer = Math.min(cap, e.buffer + def.rate * boosted * dt);
      if (e.buffer >= 1 && (usesDepots(s) ? haulsBuilding(s,e) : hauling)) {
        const amt = Math.floor(e.buffer);
        // Keep each resource's original building order and every addition.
        // Summing into a single gain would change floating-point rounding.
        inv += amt; total += amt; income += amt;
        e.buffer -= amt;
        if (visualEvents && tileDist2(s.player, e.x, e.y, e.z) <= SHOW2) {
          events[i] = { res, amt, x: e.x, y: e.y, z: e.z };
          lastEvent = Math.max(lastEvent, i);
        }
      }
    }
    s.inv[res] = inv; s.stats[res] = total; s.sources[res].buildings = income;
  }
  // Presentation events retain their original inter-resource order too.
  for (let i = 0; i <= lastEvent; i++) if (events[i]) { s.events.push(events[i]); events[i] = undefined; }
}

// `seconds` away from a solo world: your buildings and the Abundance Engine
// make what they would have, capped at AWAY_CAP, into your packs. Returns
// what was made per resource, or null when nothing is (too short, frozen
// season, or a shared world, whose room keeps the time and calls produceAway
// itself). `allowed` is the player's own setting: away makes nothing unless
// they turned it back on (FREEZE_AWAY is the default).
export function awayProduce(s, seconds, allowed = !FREEZE_AWAY) {
  return s.shared ? null : produceAway(s, seconds, allowed);
}

export function produceAway(s, seconds, allowed = !FREEZE_AWAY) {
  if (s.cultivation || !allowed) return null; // freeze season: time away makes nothing
  if (!(seconds >= AWAY_MIN)) return null;
  const sec = Math.min(AWAY_CAP, seconds);
  if (usesDepots(s)) economyForState(s)?.stop();
  const made = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  for (const e of s.extractors) {
    if (!ownBuilding(s, e)) continue;
    const amount = extractorRate(s, e.key, e) * sec;
    if (usesDepots(s)) {
      const total = e.buffer + amount;
      if (haulsBuilding(s,e)) { const n=Math.floor(total); made[e.res]+=n; e.buffer=total-n; }
      else e.buffer=Math.min(extractorCapacity(s,e.key,e),total);
    } else made[e.res] += amount;
  }
  const trickle = abundanceTrickle(s) * sec;
  for (const r of RESOURCES) {
    if (made[r] > 0) earn(s, r, made[r], 'buildings');
    if (trickle > 0) { earn(s, r, trickle, 'engine'); made[r] += trickle; }
  }
  return made;
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
  return swimsAt(s.world, p.x, p.y, p.z);
}

// Whether (x, y) on layer z is water, where anyone there rides a boat.
export function swimsAt(world, x, y, z) {
  return !!TILE_INFO[tileAt(world, Math.floor(x), Math.floor(y), z)].swim;
}

// Whether your Boots take you onto water (see GEAR.water).
export function canWade(s) {
  return s.tools.boots >= GEAR.water;
}

// Whether a step to (x, y) would take you from land onto water you can't
// go on yet. Someone already in the water can always get out.
function shoreStops(s, x, y) {
  return !canWade(s) && !onWater(s) && swimsAt(s.world, x, y, s.player.z);
}

// Whether walking along (dx, dy) runs into water your Boots can't take you
// onto: the shore is what stops you, to tell the player why.
export function waterAhead(s, dx, dy) {
  const len = Math.hypot(dx, dy);
  if (canWade(s) || len < 0.0001) return false;
  return shoreStops(s, s.player.x + dx / len * 0.6, s.player.y + dy / len * 0.6);
}

// How fast the player walks (or rows) where they are, in tiles a second.
export function walkSpeed(s) {
  return BASE_SPEED * speedMult(s) * (onWater(s) ? SWIM_SPEED : 1);
}

// Moves the player along (dx, dy), sliding along walls axis by axis.
// Returns whether the player moved at all.
export function move(s, dx, dy, dt) {
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return false;
  dx /= len; dy /= len;
  const speed = walkSpeed(s);
  const p = s.player;
  let moved = false;
  const nx = p.x + dx * speed * dt;
  if (canStand(s, nx, p.y) && !shoreStops(s, nx, p.y)) { p.x = nx; moved = true; }
  const ny = p.y + dy * speed * dt;
  if (canStand(s, p.x, ny) && !shoreStops(s, p.x, ny)) { p.y = ny; moved = true; }
  return moved;
}

/* ---------------------------------------------------------------- fog */

// Only the surface has fog. Revealing ore or crystal marks it discovered,
// which drives the early goals and the compass hint. In the dark a low
// battery lifts it over less (battery.js).
// Derived visibility coverage, never serialized. Consecutive circles differ
// only at their edges: O(radius + newly covered tiles), not O(radius²).
const revealCoverage = new WeakMap();
export function revealAround(s, radius = exploreRadius(s) * lightScale(s), work = null) {
  const p = s.player, w = s.world, r = Math.ceil(radius), r2 = radius * radius;
  const px = Math.floor(p.x), py = Math.floor(p.y), top = py - r;
  const revision = w.explored.revision;
  let cache = revealCoverage.get(s);
  const reuse = cache && typeof revision === 'number' && cache.world === w &&
    cache.fog === w.explored && cache.revision === revision && cache.z === p.z &&
    (!cache.ore || s.discovered.ore) && (!cache.crystal || s.discovered.crystal);
  const previous = reuse ? cache.rows : null, previousTop = cache?.top;
  const rows = cache?.spare || [];
  rows.length = (2 * r + 1) * 2;
  const reveal = (left, right, y) => {
    for (let x = left; x <= right; x++) {
      if (work) work.tiles = (work.tiles || 0) + 1;
      markExplored(w, x, y, p.z);
      if (p.z !== SURFACE && !s.cultivation) continue;
      const t = tileAt(w, x, y, p.z);
      if (t === T.ORE || (s.cultivation && t === T.ORE_SEAM)) s.discovered.ore = true;
      if (t === T.CRYSTAL || (s.cultivation && t === T.GEODE)) s.discovered.crystal = true;
    }
  };
  for (let y = top; y <= py + r; y++) {
    if (work) work.rows = (work.rows || 0) + 1;
    const index = (y - top) * 2, dy = y + 0.5 - p.y;
    if (dy * dy > r2) { rows[index] = 1; rows[index + 1] = 0; continue; }
    const span = Math.sqrt(r2 - dy * dy);
    // Widen by one, then use the original distance predicate at both ends:
    // rounding at an exact circular boundary must not reveal a different tile.
    let left = Math.max(px - r, Math.ceil(p.x - 0.5 - span) - 1);
    let right = Math.min(px + r, Math.floor(p.x - 0.5 + span) + 1);
    while (left <= right && tileDist2(p, left, y, p.z) > r2) left++;
    while (right >= left && tileDist2(p, right, y, p.z) > r2) right--;
    rows[index] = left; rows[index + 1] = right;
    const old = (y - previousTop) * 2;
    if (!previous || old < 0 || old >= previous.length || previous[old] > previous[old + 1]) {
      reveal(left, right, y);
    } else {
      reveal(left, Math.min(right, previous[old] - 1), y);
      reveal(Math.max(left, previous[old + 1] + 1), right, y);
    }
  }
  if (!cache) { cache = {}; revealCoverage.set(s, cache); }
  cache.spare = cache.rows; cache.rows = rows; cache.top = top;
  cache.world = w; cache.fog = w.explored; cache.revision = w.explored.revision;
  cache.z = p.z; cache.ore = s.discovered.ore; cache.crystal = s.discovered.crystal;
}
