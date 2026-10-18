/* The Perfect button's brain: what a perfect player would do next.
 *
 * nextIntent(s, mind) looks at the game and names one thing to do, an
 * intent, and the game carries it out through the very calls a press makes
 * (src/game/perfect.js), so a shared world's room replays it like any
 * player's acts. The brain never changes the state itself. `mind` (from
 * newMind) is only what it remembers between calls so it needn't search the
 * world every time: the goal it's after, the route it's walking, tiles that
 * turned out to be out of reach.
 *
 * It plays like a person could: it only goes for what has been seen (fog
 * stays fog; with nothing known to go for, it explores) and underground it
 * digs toward the finds that glint in the dark. What to get next is
 * whatever it can get soonest, upgrade or building, hand-gathering what that
 * beats waiting for, as the pacing runs found best; Abundance stops at the
 * Embark level until everything else is bought. When the world is ready to
 * leave it waits: Embark is the player's to press (wait, why 'embark').
 *
 * Intents ({type, badge, ...}; badge is the look id the button shows):
 *   walk {x, y}           take a step toward tile (x, y), next on its route
 *   harvestAt {x, y}      gather or dig tile (x, y), in reach
 *   collect               empty the buildings in reach
 *   buy {id}              buy upgrade or perk `id`
 *   place {key, x, y}     put up building `key` on tile (x, y), in reach
 *   descend / climb {x, y} through the way between layers at (x, y)
 *   prop {kind}           put a prop down where you stand
 *   wait {why}            nothing to do but let the buildings work, or
 *                         'embark': the world is done, over to you */

import { SURFACE, CHUNK_SIZE, tileDist2, packKey } from './coords.js';
import { T, TILE_INFO, RESOURCES } from './tiles.js';
import { tileAt, richness, isExplored, nearestTile, holeBelow, wayUp, walkable, findSpawn } from './world.js';
import { EXTRACTORS, REACH, AUTO_COLLECT_RANGE, BASE_SPEED, EMBARK_ABUNDANCE, GEAR, FINDS, PROPS, FINDS_PER_CHUNK } from './content.js';
import { UPGRADES, isMaxed, upgradeCost, upgradeLevel, canBuy, worldMastered } from './upgrades.js';
import { canAfford, gatherYield, speedMult, productionRates, extractorCost, extractorCapacity, extractorCount, ownBuilding } from './economy.js';
import { canEmbark } from './state.js';
import { canHarvest, gearNeeded, gearFor, collectTarget, extractorAt } from './actions.js';
import { autoCollected, canWade, swimsAt } from './sim.js';
import { canDescendAt, canClimbAt, canPlaceProp, findsNear } from './underground.js';
import { findPath } from './paths.js';

const TAPS = 4;               // gathers a second, holding (the game's 0.25 s between them)
const RETHINK = 60;           // game seconds before the goal is chosen afresh anyway
const EXPLORE_GUESS = 60;     // seconds a search for something not yet seen is reckoned to take
const SEARCH = 120;           // tiles out the brain looks for a deposit or a spot
const STUCK = 6;              // tries at the same step before a target counts as out of reach
// Inside Logistics' reach by this much more than the room could miss (it
// knows where you are to half a tile, src/core/acts.js).
const SURE_RANGE = AUTO_COLLECT_RANGE - 0.6;
const STICK = 10;             // game seconds a way of getting the goal is kept before it's weighed again
const MINE_EDGE = 0.8;       // the mine must be this much quicker than the surface to go down
const SHAFT_SECONDS = 45;     // reckoned to find and open the way down out of a layer
const DIG_SECONDS = 0.6;      // reckoned per tile tunnelled toward a find (dig, then step)
const PERKS_FIRST = ['memory', 'heirloom', 'cartographer'];

/** @returns {object} a blank memory for nextIntent */
export function newMind() {
  return { state: null };
}

const key = (x, y, z) => packKey(x, y, z);
const wait = (why, badge = 'ui.wait') => ({ type: 'wait', why, badge });
const speed = (s) => BASE_SPEED * speedMult(s);
const dist = (s, x, y) => Math.hypot(x + 0.5 - s.player.x, y + 0.5 - s.player.y);
const layerOf = (s) => SURFACE - s.player.z;

// The mind belongs to one state: a new world (Embark, the nuke, switching
// worlds) starts it afresh.
function fresh(s, mind) {
  if (mind.state !== s) {
    Object.assign(mind, { state: s, goal: null, decided: -Infinity, route: null, bad: new Set(), near: {}, spots: {}, searches: {}, frontier: null, home: findSpawn(s.world), arrived: {}, flagged: new Set(), z: null });
  }
  if (mind.z !== s.player.z) {
    // Just came onto this layer: remember where, the way back up.
    mind.z = s.player.z;
    mind.route = null;
    mind.frontier = null;
    mind.arrived[s.player.z] = { x: Math.floor(s.player.x), y: Math.floor(s.player.y) };
  }
}

/**
 * The one thing to do next. Never null. With `peek`, only looking (the
 * button isn't held): standing still then isn't being stuck.
 * @returns {{type: string, badge: string}}
 */
export function nextIntent(s, mind, { peek = false } = {}) {
  fresh(s, mind);
  mind.peek = peek;
  if (canEmbark(s)) return wait('embark', 'ui.embark');
  const perk = nextPerk(s);
  if (perk) return { type: 'buy', id: perk, badge: 'resource.insight' };
  return pursue(s, mind, decide(s, mind));
}

/* -------------------------------------------------------------- perks */

// Insight goes first on the one-time perks, then on Legacy, then Nomad.
// Only where the Beyond tab can be opened: never in a shared world.
export function nextPerk(s) {
  if (s.shared) return null;
  for (const id of PERKS_FIRST) if (canBuy(s, id)) return id;
  if (canBuy(s, 'legacy')) return 'legacy';
  return canBuy(s, 'nomad') ? 'nomad' : null;
}

/* ------------------------------------------------------------ choosing */

// Everything there is to get with resources now: { kind, id, cost }, and a
// building with nowhere seen to stand ({ kind: 'find' }): look for its tile.
export function candidates(s, mind) {
  const out = [];
  for (const id of Object.keys(UPGRADES)) {
    if (UPGRADES[id].currency !== 'inv' || isMaxed(s, id)) continue;
    // Abundance past the Embark level only once everything else is done.
    if (id === 'abundance' && s.abundanceLv >= EMBARK_ABUNDANCE && !worldMastered(s)) continue;
    out.push({ kind: 'buy', id, cost: upgradeCost(s, id) });
  }
  for (const id of Object.keys(EXTRACTORS)) {
    const def = EXTRACTORS[id];
    if (def.unlock && !s.unlocks[def.unlock]) continue;
    if (buildSpot(s, mind, id)) out.push({ kind: 'build', id, cost: extractorCost(s, id) });
    // Each search that comes up empty makes the next one look less worth it.
    else if (def.tile !== null && s.player.z === SURFACE) out.push({ kind: 'find', id, cost: {}, eta: EXPLORE_GUESS * 2 ** (mind.searches[id] || 0) });
  }
  return out;
}

// Whether the goal is still to get: not bought or built since it was chosen.
function current(s, mind, goal) {
  if (!goal) return false;
  if (goal.kind === 'buy') return !isMaxed(s, goal.id) && upgradeLevel(s, goal.id) === goal.level;
  if (goal.kind === 'find') return !buildSpot(s, mind, goal.id);
  return extractorCount(s, goal.id) === goal.level;
}

// The goal: whatever can be had soonest. Kept until it's had (or a while
// has passed), as a person sticks to what they're saving for.
function decide(s, mind) {
  if (current(s, mind, mind.goal) && s.time - mind.decided < RETHINK) return mind.goal;
  let best = null;
  for (const c of candidates(s, mind)) {
    const eta = c.kind === 'find' ? c.eta : plan(s, mind, c.cost).eta;
    if (isFinite(eta) && (!best || eta < best.eta)) best = { ...c, eta };
  }
  if (best) best.level = best.kind === 'buy' ? upgradeLevel(s, best.id) : extractorCount(s, best.id);
  if (best && best.kind === 'find') mind.searches[best.id] = (mind.searches[best.id] || 0) + 1;
  mind.goal = best;
  mind.decided = s.time;
  return best;
}

/* ------------------------------------------------------------ planning */

const handRate = (s, res) => TAPS * gatherYield(s, res) * 0.8; // a little lost to walking between tiles

// How long `m` more of `res` takes by hand from the surface: to the nearest
// deposit you know of and the gathering, or a search if you know of none.
function handEta(s, mind, res, m) {
  const d = nearestDeposit(s, mind, res);
  if (d.tile) return dist(s, d.tile.x, d.tile.y) / speed(s) + m / handRate(s, res);
  return d.gated ? Infinity : EXPLORE_GUESS + m / handRate(s, res);
}

/**
 * How to get the price `cost`: per missing resource, by hand ('hand') or by
 * waiting for buildings ('wait'), and how long that's reckoned to take; or,
 * when digging finds is quicker, all of it from mine layer `layer`.
 * Waiting runs alongside everything else; hand-gathering one at a time.
 */
export function plan(s, mind, cost) {
  const rates = productionRates(s);
  let waitMax = 0, handSum = 0;
  const how = {}, missing = {};
  for (const r of Object.keys(cost)) {
    const m = cost[r] - s.inv[r];
    if (m <= 0) continue;
    missing[r] = m;
    const w = rates[r] > 0 ? m / rates[r] : Infinity;
    const h = handEta(s, mind, r, m);
    if (h < w) { how[r] = 'hand'; handSum += h; } else { how[r] = 'wait'; waitMax = Math.max(waitMax, w); }
  }
  const surface = { eta: Math.max(waitMax, handSum), how };
  const mine = minePlan(s, mind, missing);
  return mine && mine.eta < surface.eta * MINE_EDGE ? mine : surface;
}

// The deepest mine layer your Pickaxe can open the way down to.
function deepestOpen(s) {
  let layer = 1;
  for (;;) {
    const gate = GEAR.shafts.filter((g) => layer >= g.from).pop();
    if (gate && s.tools.pickaxe < gate.level) return layer;
    if (++layer >= 12) return layer; // a trip any deeper never pays
  }
}

// What a find pays on `layer`, on average, per find there, with the tools you have.
function findPays(s, layer) {
  const out = Object.fromEntries(RESOURCES.map((r) => [r, 0]));
  let share = 0;
  for (const type of Object.keys(FINDS).map(Number)) {
    const f = FINDS[type];
    if (layer < f.from || (GEAR.rock[type] && s.tools.pickaxe < GEAR.rock[type])) continue;
    const odds = type === T.GEODE ? 0.4 : layer >= FINDS[T.GEODE].from ? 0.6 : 1;
    share += odds;
    for (const r of Object.keys(f.loot)) out[r] += odds * f.loot[r] * layer * gatherYield(s, r);
  }
  return { loot: out, share };
}

// Digging finds for everything still missing: the quickest layer to do it on.
function minePlan(s, mind, missing) {
  const res = Object.keys(missing);
  // A new player starts on the surface: the mine waits for the first building.
  if (!res.length || !s.extractors.some((e) => ownBuilding(s, e))) return null;
  const here = layerOf(s);
  let travel = 0;
  if (here === 0) {
    const cave = caveMouth(s, mind);
    if (!cave) return null;
    travel = dist(s, cave.x, cave.y) / speed(s);
  }
  // A find is about this many tiles of tunnel from the last one.
  const between = CHUNK_SIZE / Math.sqrt(FINDS_PER_CHUNK);
  let best = null;
  for (let layer = 1, deepest = deepestOpen(s); layer <= deepest; layer++) {
    const pays = findPays(s, layer);
    if (!pays.share) continue;
    const perFind = between / Math.sqrt(pays.share) * DIG_SECONDS;
    let dig = 0;
    for (const r of res) dig = Math.max(dig, pays.loot[r] > 0 ? missing[r] / pays.loot[r] * perFind : Infinity);
    const eta = travel + Math.max(0, layer - Math.max(here, 1)) * SHAFT_SECONDS + dig;
    if (isFinite(eta) && (!best || eta < best.eta)) best = { eta, layer, how: Object.fromEntries(res.map((r) => [r, 'mine'])) };
  }
  return best;
}

/* ------------------------------------------------------------- finding */

const gearKey = (s) => s.tools.pickaxe + ',' + s.tools.basket + ',' + s.tools.boots;

// The nearest deposit of `res` you've seen on the surface and can work
// ({ tile }), or { gated: true } if all you've seen take a better tool.
// Remembered a while, and dropped once worked out or the tools change.
function nearestDeposit(s, mind, res) {
  const seen = (x, y) => isExplored(s.world, x, y, SURFACE) && TILE_INFO[tileAt(s.world, x, y, SURFACE)].res === res &&
    harvestableOn(s, x, y) && !mind.bad.has(key(x, y, SURFACE));
  const works = (x, y) => seen(x, y) && !gearOn(s, x, y);
  const c = mind.near[res];
  if (c && c.gear === gearKey(s) && s.time - c.t < 30 && (!c.tile || works(c.tile.x, c.tile.y)) &&
      (!c.tile || dist(s, c.tile.x, c.tile.y) < 3 || s.time - c.t < 5)) return c;
  const tile = nearestTile(s.player.x, s.player.y, SEARCH, works);
  const out = { t: s.time, gear: gearKey(s), tile, gated: !tile && !!nearestTile(s.player.x, s.player.y, SEARCH, seen) };
  mind.near[res] = out;
  return out;
}

// Surface checks that hold wherever the player is (harvestable and
// gearNeeded look at the player's own layer).
// A deposit a building you can put up stands on is never worked down to
// nothing: the last of it is left for the building.
function harvestableOn(s, x, y) {
  const type = tileAt(s.world, x, y, SURFACE);
  const keep = Object.values(EXTRACTORS).some((d) => d.tile === type && (!d.unlock || s.unlocks[d.unlock]));
  return !!TILE_INFO[type].harvest && !holeBelow(s.world, x, y, SURFACE) && richness(s.world, x, y, SURFACE) > (keep ? 1 : 0);
}
function gearOn(s, x, y) {
  const g = gearFor(s, x, y, SURFACE);
  return !!g && s.tools[g.tool] < g.level;
}

// The nearest cave mouth you've seen: the way down into the mine.
function caveMouth(s, mind) {
  // Remembered once seen; none seen yet is looked for again now and then.
  const c = mind.spots.cave;
  if (c && (c.tile ? !mind.bad.has(key(c.tile.x, c.tile.y, SURFACE)) : s.time - c.t < 120)) return c.tile;
  const cave = nearestTile(mind.home.x + 0.5, mind.home.y + 0.5, SEARCH, (x, y) =>
    isExplored(s.world, x, y, SURFACE) && tileAt(s.world, x, y, SURFACE) === T.CAVE && !mind.bad.has(key(x, y, SURFACE)));
  mind.spots.cave = { t: s.time, tile: cave };
  return cave;
}

// Where building `id` would go: a deposit building on the free matching
// tile nearest home that you've seen, a converter on free open land beside
// where you stand among your buildings (camp), so Logistics reaches it.
// Remembered while it stays free.
function buildSpot(s, mind, id) {
  const def = EXTRACTORS[id];
  const which = def.tile === null ? 'land' : 'tile' + def.tile;
  const free = (x, y) => isExplored(s.world, x, y, SURFACE) && !mind.bad.has(key(x, y, SURFACE)) && !extractorAt(s, x, y, SURFACE) &&
    !holeBelow(s.world, x, y, SURFACE) && !wayUp(s.world, x, y, SURFACE) &&
    (def.tile === null
      ? !!TILE_INFO[tileAt(s.world, x, y, SURFACE)].land && !TILE_INFO[tileAt(s.world, x, y, SURFACE)].harvest &&
        !(x === mind.home.x && y === mind.home.y)
      : tileAt(s.world, x, y, SURFACE) === def.tile);
  const c = mind.spots[which];
  if (c && (c.tile ? free(c.tile.x, c.tile.y) : s.time - c.t < 120)) return c.tile;
  const from = def.tile === null ? camp(s, mind) : mind.home;
  const tile = nearestTile(from.x + 0.5, from.y + 0.5, def.tile === null ? 30 : SEARCH, free);
  mind.spots[which] = { t: s.time, tile };
  return tile;
}

/* ------------------------------------------------------------- walking */

// A step toward tile (tx, ty) on this layer, along a route through what
// you've seen (underground, through rock you can dig). Null once you're on
// it, or when there's no way there (then it's remembered as out of reach).
function walkTo(s, mind, tx, ty, badge) {
  const z = s.player.z, px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  if (px === tx && py === ty) return null;
  let r = mind.route;
  const i = r && r.tx === tx && r.ty === ty && r.z === z ? routeIndex(r, px, py) : -1;
  if (i < 0) {
    const opts = { pad: 12, known: z === SURFACE, dig: z !== SURFACE };
    // The long way round, and the very long way (out past where you've explored).
    const nodes = findPath(s, px, py, tx, ty, opts) || findPath(s, px, py, tx, ty, { ...opts, pad: 40 }) || findPath(s, px, py, tx, ty, { ...opts, pad: 120 });
    if (!nodes) { unreachable(s, mind, tx, ty); return null; }
    r = mind.route = { tx, ty, z, nodes, i: 0, from: { x: px, y: py }, last: -1, same: 0 };
  } else r.i = i;
  const next = r.nodes[r.i];
  if (!next) return null;
  const at = key(px, py, z);
  if (!mind.peek) { r.same = at === r.last ? r.same + 1 : 0; r.last = at; }
  if (r.same > STUCK) { unreachable(s, mind, tx, ty); return null; }
  if (next.dig && !walkable(s.world, next.x, next.y, z)) {
    return canHarvest(s, next.x, next.y) ? { type: 'harvestAt', x: next.x, y: next.y, badge: 'tool.pickaxe' } : (unreachable(s, mind, tx, ty), null);
  }
  return { type: 'walk', x: next.x, y: next.y, badge };
}

// Where along route r a player on tile (px, py) is: the index of the next
// step, or -1 if they've left it (a person took over for a moment).
function routeIndex(r, px, py) {
  for (let k = r.nodes.length - 1; k >= 0; k--) if (r.nodes[k].x === px && r.nodes[k].y === py) return k + 1;
  return px === r.from.x && py === r.from.y ? 0 : -1;
}

function unreachable(s, mind, x, y) {
  mind.bad.add(key(x, y, s.player.z));
  mind.route = null;
  mind.near = {};
  mind.frontier = null;
  const cave = mind.spots.cave && mind.spots.cave.tile;
  if (cave && cave.x === x && cave.y === y) delete mind.spots.cave;
}

// Somewhere new. On the surface, an edge of what you've seen, outward from
// home: a person exploring heads away from where they've been rather than
// filling in every corner near home. Underground, the nearest rock you
// haven't seen, dug toward.
function explore(s, mind) {
  const z = s.player.z;
  for (let tries = 0; tries < 3; tries++) {
    let f = mind.frontier;
    if (!f || f.z !== z || mind.bad.has(key(f.x, f.y, z))) {
      const tile = z === SURFACE ? outward(s, mind) : nearestTile(s.player.x, s.player.y, 40, (x, y) => !isExplored(s.world, x, y, z) && !mind.bad.has(key(x, y, z)));
      if (!tile) return null;
      f = mind.frontier = { ...tile, z };
    }
    const step = walkTo(s, mind, f.x, f.y, 'ui.explore');
    if (step) return step;
    mind.frontier = null; // got there (or can't): the next edge
    if (z !== SURFACE) mind.bad.add(key(f.x, f.y, z));
  }
  return null;
}

const OUTWARD = 0.8; // how much further from home outweighs being further from you
const EDGE_LOOK = 24; // tiles around you an edge is looked for in

// The edge of what you've seen worth heading to: near you, far from home.
function outward(s, mind) {
  const w = s.world, z = SURFACE, wade = canWade(s);
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y), h = mind.home;
  const seen = (x, y) => isExplored(w, x, y, z);
  // Only as far out as buildings are looked for: further finds nothing to use.
  const edge = (x, y) => Math.hypot(x - h.x, y - h.y) < SEARCH && seen(x, y) && !(seen(x + 1, y) && seen(x - 1, y) && seen(x, y + 1) && seen(x, y - 1)) &&
    walkable(w, x, y, z) && (wade || !swimsAt(w, x, y, z)) && !mind.bad.has(key(x, y, z));
  let best = null, bestScore = Infinity;
  for (let y = py - EDGE_LOOK; y <= py + EDGE_LOOK; y++) {
    for (let x = px - EDGE_LOOK; x <= px + EDGE_LOOK; x++) {
      if (!edge(x, y)) continue;
      const score = Math.hypot(x - px, y - py) - OUTWARD * Math.hypot(x - h.x, y - h.y);
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  return best || nearestTile(px + 0.5, py + 0.5, 80, edge);
}

/* ------------------------------------------------------------ pursuing */

function pursue(s, mind, goal) {
  const underground = s.player.z !== SURFACE;
  if (!goal || goal.kind === 'find') return (underground ? up(s, mind) : explore(s, mind)) || idle(s, mind);
  if (canAfford(s.inv, goal.cost)) return obtain(s, mind, goal);
  // How to get it, kept a while: chosen afresh at every step, two ways that
  // are nearly as quick would take turns, a step toward each.
  if (!mind.how || mind.how.goal !== goal || s.time - mind.how.t > STICK) mind.how = { goal, t: s.time, p: plan(s, mind, goal.cost) };
  const p = mind.how.p;
  if (p.layer) return mine(s, mind, p.layer);
  if (underground) return up(s, mind) || idle(s, mind);
  const hand = Object.keys(p.how).find((r) => p.how[r] === 'hand');
  if (hand) return gather(s, mind, hand) || idle(s, mind);
  const need = {};
  for (const r of Object.keys(goal.cost)) if (goal.cost[r] > s.inv[r]) need[r] = goal.cost[r] - s.inv[r];
  return idle(s, mind, need);
}

// The goal is affordable: buy it, or go and put it up.
function obtain(s, mind, goal) {
  if (goal.kind === 'buy') return { type: 'buy', id: goal.id, badge: 'ui.upgrade' };
  if (s.player.z !== SURFACE) return up(s, mind) || idle(s, mind);
  const spot = buildSpot(s, mind, goal.id);
  if (!spot) { mind.goal = null; return idle(s, mind); }
  if (tileDist2(s.player, spot.x, spot.y, SURFACE) <= REACH * REACH && dist(s, spot.x, spot.y) <= 1.2) {
    return { type: 'place', key: goal.id, x: spot.x, y: spot.y, badge: 'ui.build' };
  }
  return walkTo(s, mind, spot.x, spot.y, 'ui.build') || idle(s, mind);
}

// Hand-gathering `res` from the nearest deposit of it you know of.
function gather(s, mind, res) {
  const d = nearestDeposit(s, mind, res);
  const badge = 'resource.' + res;
  if (!d.tile) return d.gated ? null : explore(s, mind);
  if (canHarvest(s, d.tile.x, d.tile.y)) return { type: 'harvestAt', x: d.tile.x, y: d.tile.y, badge };
  const step = walkTo(s, mind, d.tile.x, d.tile.y, badge);
  if (step) return step;
  if (!canHarvest(s, d.tile.x, d.tile.y)) unreachable(s, mind, d.tile.x, d.tile.y);
  return null;
}

// Waiting on buildings: fetch what they hold that the goal still needs
// (`need`, resources) and empty the ones filling up, else stand at camp, among
// the buildings, and let Logistics haul.
function idle(s, mind, need = {}) {
  const logistics = s.unlocks.logistics;
  const cap = (e) => extractorCapacity(s, e.key);
  const due = s.extractors.filter((e) => e.z === s.player.z && ownBuilding(s, e) && e.buffer >= 1 && !autoCollected(s, e) &&
    (e.buffer >= Math.min(need[e.res] || Infinity, 0.25 * cap(e)) || e.buffer >= (logistics ? 0.7 : 0.5) * cap(e)) && !mind.bad.has(key(e.x, e.y, e.z)));
  // The building you're on your way to, until it's emptied; else the nearest due.
  const f = mind.fetch;
  if (!(f && f.buffer >= 1 && f.z === s.player.z && s.extractors.includes(f))) {
    mind.fetch = due.length ? due.reduce((a, b) => (dist(s, b.x, b.y) < dist(s, a.x, a.y) ? b : a)) : null;
  }
  const e = mind.fetch;
  const near = !logistics && collectTarget(s);
  if (near && near.list.includes(e)) { mind.fetch = null; return { type: 'collect', badge: 'ui.collect' }; }
  // In Logistics' reach it's hauled in; go on in a little, so a shared
  // world's room, which knows where you are only to half a tile, sees it too.
  if (e && autoCollected(s, e) && dist(s, e.x, e.y) <= SURE_RANGE) mind.fetch = null;
  else if (e) {
    const step = walkTo(s, mind, e.x, e.y, 'ui.collect');
    if (step) return step;
    mind.fetch = null;
  }
  if (s.player.z !== SURFACE) return up(s, mind) || wait('lost');
  const c = camp(s, mind);
  if (dist(s, c.x, c.y) > 0.5) {
    const step = walkTo(s, mind, c.x, c.y, 'ui.wait');
    if (step) return step;
  }
  return wait('production');
}

// Where to stand while the buildings work: the tile with the most of your
// buildings within Logistics' reach (home, before there are any).
function camp(s, mind) {
  const mine = s.extractors.filter((e) => e.z === SURFACE && ownBuilding(s, e));
  if (mind.camp && mind.camp.n === mine.length && !mind.bad.has(key(mind.camp.x, mind.camp.y, SURFACE))) return mind.camp;
  let best = { x: mind.home.x, y: mind.home.y, score: -1 };
  if (s.unlocks.logistics) {
    const r2 = SURE_RANGE * SURE_RANGE, wade = canWade(s), tried = new Set();
    for (const e of mine) {
      for (let y = e.y - 2; y <= e.y + 2; y++) {
        for (let x = e.x - 2; x <= e.x + 2; x++) {
          const k = key(x, y, SURFACE);
          if (tried.has(k) || mind.bad.has(k)) continue;
          tried.add(k);
          if (!walkable(s.world, x, y, SURFACE) || (!wade && swimsAt(s.world, x, y, SURFACE))) continue;
          let score = 0;
          for (const o of mine) if ((o.x - x) ** 2 + (o.y - y) ** 2 <= r2) score++;
          if (score > best.score) best = { x, y, score };
        }
      }
    }
  }
  mind.camp = { x: best.x, y: best.y, n: mine.length };
  return mind.camp;
}

/* -------------------------------------------------------------- the mine */

// Up toward the surface: the ladder in reach, else the way up you know of
// nearest (the one you came down by, at least).
function up(s, mind) {
  if (s.player.z === SURFACE) return null;
  const z = s.player.z, w = s.world;
  const ladder = nearestTile(s.player.x, s.player.y, 2, (x, y) => canClimbAt(s, x, y));
  if (ladder) return { type: 'climb', x: ladder.x, y: ladder.y, badge: 'ui.climb' };
  const known = nearestTile(s.player.x, s.player.y, 60, (x, y) => wayUp(w, x, y, z) && isExplored(w, x, y, z) && !mind.bad.has(key(x, y, z))) ||
    mind.arrived[z];
  return known ? walkTo(s, mind, known.x, known.y, 'ui.climb') || explore(s, mind) : explore(s, mind);
}

// A trip to dig finds on mine layer `layer`: down the nearest cave mouth,
// on down the shafts, then tunnel to whatever glints nearest.
function mine(s, mind, layer) {
  const here = layerOf(s);
  if (here === 0) {
    const cave = caveMouth(s, mind);
    if (!cave) return explore(s, mind) || idle(s, mind);
    if (canDescendAt(s, cave.x, cave.y)) return { type: 'descend', x: cave.x, y: cave.y, badge: 'ui.climbDown' };
    return walkTo(s, mind, cave.x, cave.y, 'ui.climbDown') || idle(s, mind);
  }
  if (here > layer) return up(s, mind) || idle(s, mind);
  const mark = beacon(s, mind) || lamp(s);
  if (mark) return mark;
  if (here < layer) {
    const down = shaftDown(s, mind);
    if (down) return down;
  }
  return dig(s, mind) || explore(s, mind) || up(s, mind) || idle(s, mind);
}

// A flag beside where you came down onto this layer, to find the way back by
// (it shows through the dark from anywhere on screen).
function beacon(s, mind) {
  const z = s.player.z, a = mind.arrived[z];
  if (mind.flagged.has(z) || !a || !canPlaceProp(s, 'flag') || !canAfford(s.inv, PROPS.flag.cost)) return null;
  if (Math.abs(Math.floor(s.player.x) - a.x) + Math.abs(Math.floor(s.player.y) - a.y) > 2) return null;
  mind.flagged.add(z);
  return { type: 'prop', kind: 'flag', badge: 'mark.flag' };
}

const LAMP_GAP = 6; // tiles between glowcaps along a tunnel

// A glowcap where the tunnel has gone dark: none within LAMP_GAP of you.
function lamp(s) {
  if (!canPlaceProp(s, 'glowcap') || !canAfford(s.inv, PROPS.glowcap.cost)) return null;
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y), z = s.player.z, props = s.world.props;
  for (let y = py - LAMP_GAP; y <= py + LAMP_GAP; y++) {
    for (let x = px - LAMP_GAP; x <= px + LAMP_GAP; x++) if (props.has(key(x, y, z))) return null;
  }
  return { type: 'prop', kind: 'glowcap', badge: 'mark.glowcap' };
}

// Down the nearest shaft you've seen on this layer: open it (a deliberate
// dig, never done by a Trail), then drop through.
function shaftDown(s, mind) {
  const z = s.player.z, w = s.world;
  const shaft = nearestTile(s.player.x, s.player.y, 40, (x, y) => isExplored(w, x, y, z) && !mind.bad.has(key(x, y, z)) &&
    (tileAt(w, x, y, z) === T.SHAFT_OPEN || (tileAt(w, x, y, z) === T.SHAFT && !gearNeeded(s, x, y))));
  if (!shaft) return null;
  if (canDescendAt(s, shaft.x, shaft.y)) return { type: 'descend', x: shaft.x, y: shaft.y, badge: 'ui.climbDown' };
  if (canHarvest(s, shaft.x, shaft.y)) return { type: 'harvestAt', x: shaft.x, y: shaft.y, badge: 'ui.climbDown' };
  return walkTo(s, mind, shaft.x, shaft.y, 'ui.climbDown');
}

// Tunnel to the nearest find glinting in the dark that your Pickaxe can break.
function dig(s, mind) {
  const z = s.player.z;
  const finds = findsNear(s).filter((f) => !gearNeeded(s, f.x, f.y) && !mind.bad.has(key(f.x, f.y, z))).sort((a, b) => a.d - b.d);
  for (const f of finds.slice(0, 3)) {
    if (canHarvest(s, f.x, f.y)) return { type: 'harvestAt', x: f.x, y: f.y, badge: 'tool.pickaxe' };
    const step = walkTo(s, mind, f.x, f.y, 'tool.pickaxe');
    if (step) return step;
  }
  return null;
}
