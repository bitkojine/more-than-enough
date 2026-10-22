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
 * an upgrade it can reach soon, or a building including its repayment time, hand-gathering what that
 * beats waiting for, as the pacing runs found best, and while it waits it
 * gathers anyway, since a gather always adds to what buildings make (never
 * stands idle: Watch, 2026-10-18); Abundance stops at the
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
 *   charge                stay by the charger in reach a moment, filling the battery
 *   wait {why}            nothing at all to do (nothing to gather), or
 *                         'embark': the world is done, over to you */

import { SURFACE, CHUNK_SIZE, tileDist2, packKey, unpackKey } from './coords.js';
import { T, TILE_INFO, RESOURCES } from './tiles.js';
import { tileAt, richness, isExplored, nearestTile, nearestExploredTile, holeBelow, wayUp, waysIn, walkable, findSpawn, observationVersion } from './world.js';
import { EXTRACTORS, REACH, BASE_SPEED, EMBARK_ABUNDANCE, GEAR, FINDS, PROPS, FINDS_PER_CHUNK, GLINT_RANGE, CHARGE_RANGE } from './content.js';
import { UPGRADES, isMaxed, upgradeCost, upgradeLevel, canBuy, worldMastered } from './upgrades.js';
import { usesDepots, depotFor, depotGain } from './logistics.js';
import { canAfford, gatherYield, speedMult, productionRates, extractorRate, extractorCost, extractorCapacity, extractorCount, placementGain, supportGain, ownBuilding } from './economy.js';
import { canEmbark } from './state.js';
import { canHarvest, gearNeeded, gearFor, collectTarget, extractorAt } from './actions.js';
import { autoCollected, canWade, swimsAt, settleEconomy } from './sim.js';
import { canDescendAt, canClimbAt, canPlaceProp, findsNear } from './underground.js';
import { charging } from './light.js';
import { findPath, routePosition } from './paths.js';

const TAPS = 4;               // gathers a second, holding (the game's 0.25 s between them)
const SEARCH = 120;           // tiles out the brain looks for a deposit or a spot
const STUCK = 6;              // tries at the same step before a target counts as out of reach
const PERKS_FIRST = ['memory', 'heirloom', 'cartographer'];

// The brain's judgement calls: guesses and margins the rules don't settle.
// Tuned 2026-10-19 on v0.120 rules: Embark in 24.65 h (35.83 h before).
// scripts/perfect-tune.mjs searches them for the quickest Embark after a
// rules change; scripts/perfect-bench.mjs measures what they give.
export const KNOBS = Object.freeze({
  rethink: 60,       // game seconds before the goal is chosen afresh anyway
  stick: 10,         // game seconds a way of getting the goal is kept before it's weighed again
  exploreGuess: 60,  // seconds a search for something not yet seen is reckoned to take
  walkLoss: 0.4,     // share of holding Gather reckoned to gather, the rest lost walking between tiles
  mineEdge: 0,       // surface first; positive values permit elective mining in comparison fixtures
  shaftSeconds: 22.5, // reckoned to find and open the way down out of a layer
  digSeconds: 0.6,   // reckoned per tile tunnelled toward a find (dig, then step)
  minDig: 60,        // seconds of digging a trip down must be worth: no popping in for a find or two
  outward: 0.8       // exploring: how much further from home outweighs being further from you
});

/** @returns {object} a blank memory for nextIntent, judging with `knobs` (KNOBS by default) */
export function newMind(knobs = {}) {
  return { state: null, k: { ...KNOBS, ...knobs } };
}

const key = (x, y, z) => packKey(x, y, z);
const wait = (why, badge = 'ui.wait') => ({ type: 'wait', why, badge });
const speed = (s) => BASE_SPEED * speedMult(s);
const dist = (s, x, y) => Math.hypot(x + 0.5 - s.player.x, y + 0.5 - s.player.y);
const layerOf = (s) => SURFACE - s.player.z;
const SURFACE_TYPES = Object.fromEntries(RESOURCES.map(res => [res,
  TILE_INFO.findIndex(info => info && info.res === res && !info.solid)]));

// The mind belongs to one state: a new world (Embark, switching
// worlds) starts it afresh.
function fresh(s, mind) {
  if (mind.state !== s) {
    Object.assign(mind, { state: s, goal: null, decided: -Infinity, route: null, bad: new Set(), near: {}, spots: {}, searches: {}, frontier: null, home: findSpawn(s.world), arrived: {}, flagged: new Set(), z: null, upWay: null, mineFailures: new Map() });
  }
  if (mind.z !== s.player.z) {
    // Just came onto this layer: remember where, the way back up, and when
    // a trip down from the surface began.
    if (mind.z === SURFACE) mind.downAt = s.time;
    mind.z = s.player.z;
    mind.route = null;
    mind.frontier = null;
    mind.find = null;
    mind.shaft = null;
    const x = Math.floor(s.player.x), y = Math.floor(s.player.y);
    // Coming back from a deeper layer lands at a way DOWN, which must not
    // overwrite the remembered way UP and send us pacing back to that shaft.
    if (wayUp(s.world, x, y, s.player.z)) mind.arrived[s.player.z] = { x, y };
  }
  const access = gearKey(s);
  if (mind.access !== access) {
    // A river or rock that blocked an old route may be passable with the
    // new gear. Failed targets must not stay forbidden for the whole world.
    mind.access = access;
    mind.bad.clear();
    mind.mineFailures.clear();
    mind.route = null;
    mind.near = {};
    mind.spots = {};
    mind.frontier = null;
    mind.upWay = null;
  }
}

/**
 * The one thing to do next. Never null. With `peek`, only looking (the
 * button isn't held): standing still then isn't being stuck.
 * @returns {{type: string, badge: string}}
 */
export function nextIntent(s, mind, { peek = false } = {}) {
  settleEconomy(s);
  fresh(s, mind);
  mind.peek = peek;
  if (canEmbark(s)) return wait('embark', 'ui.embark');
  const perk = nextPerk(s);
  if (perk) return { type: 'buy', id: perk, badge: 'resource.insight' };
  return power(s, mind) || pursue(s, mind, decide(s, mind));
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
    if (id==='logistics' && usesDepots(s)) continue;
    if (UPGRADES[id].currency !== 'inv' || isMaxed(s, id)) continue;
    // Abundance past the Embark level only once everything else is done.
    if (id === 'abundance' && s.abundanceLv >= EMBARK_ABUNDANCE && !worldMastered(s)) continue;
    out.push({ kind: 'buy', id, cost: upgradeCost(s, id) });
  }
  for (const id of Object.keys(EXTRACTORS)) {
    const def = EXTRACTORS[id];
    if (def.depot && !usesDepots(s)) continue;
    if (def.unlock && !s.unlocks[def.unlock]) continue;
    if (buildSpot(s, mind, id)) out.push({ kind: 'build', id, cost: extractorCost(s, id) });
    // Each search that comes up empty makes the next one look less worth it.
    else if (def.tile !== null && s.player.z === SURFACE) out.push({ kind: 'find', id, cost: {}, eta: mind.k.exploreGuess * 2 ** (mind.searches[id] || 0) });
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

// Required upgrades compete with investments including their repayment time.
// Kept until it's had (or a while
// has passed), as a person sticks to what they're saving for.
function decide(s, mind) {
  if (current(s, mind, mind.goal) && s.time - mind.decided < mind.k.rethink) return mind.goal;
  let best = null, fallback = null;
  // Evaluate the economy once, not once per candidate price.
  const rates = productionRates(s);
  for (const c of candidates(s, mind)) {
    const acquisition = c.kind === 'find' ? { eta: c.eta } : plan(s, mind, c.cost, rates);
    let eta = acquisition.eta;
    if (c.kind !== 'buy') eta += investmentPayback(s, mind, c.id, rates);
    if (!isFinite(eta)) continue;
    // A locked resource for one optional goal is not a reason to descend
    // while a different goal can progress entirely on the surface.
    if (acquisition.layer && mind.k.mineEdge <= 0) {
      if (!fallback || eta < fallback.eta) fallback = { ...c, eta };
    } else if (!best || eta < best.eta) best = { ...c, eta };
  }
  best ||= fallback;
  if (best) best.level = best.kind === 'buy' ? upgradeLevel(s, best.id) : extractorCount(s, best.id);
  if (best && best.kind === 'find') mind.searches[best.id] = (mind.searches[best.id] || 0) + 1;
  mind.goal = best;
  mind.decided = s.time;
  return best;
}

// Convert all input prices into equivalent production time, then into the
// output this building must earn back. No state mutation or speculative buys.
export function investmentPayback(s, mind, id, rates = productionRates(s)) {
  const value = r => rates[r] + (surfaceUnlocked(s, r) ? handRate(s, mind, r) : 0);
  let spent = 0;
  for (const [r, amount] of Object.entries(extractorCost(s, id))) {
    if (!amount) continue;
    if (!value(r)) return Infinity;
    spent += amount / value(r);
  }
  if (EXTRACTORS[id].depot) {
    const at=mind.spots ? buildSpot(s,mind,id) : null;
    return at && depotGain(s,at)>0 ? spent / depotGain(s,at) : Infinity;
  }
  return spent * value(EXTRACTORS[id].res) / placementGain(s, id, mind.spots ? buildSpot(s, mind, id) : null);
}

/* ------------------------------------------------------------ planning */

const handRate = (s, mind, res) => TAPS * gatherYield(s, res) * mind.k.walkLoss;

// Rare forage is only a local obstacle; harder rock gates the whole resource.
// Seeing a rare mushroom must not imply every unexplored forest is locked.
function surfaceUnlocked(s, res) {
  const type = SURFACE_TYPES[res];
  return s.tools.pickaxe >= (GEAR.rock[type] || 0);
}

// How long `m` more of `res` takes by hand from the surface, with your
// buildings (making `rate` a second) working on alongside: to the nearest
// deposit you know of and the gathering, or a search if you know of none.
function handEta(s, mind, res, m, rate = 0) {
  if (!surfaceUnlocked(s, res)) return Infinity;
  const d = nearestDeposit(s, mind, res);
  const work = m / (handRate(s, mind, res) + rate);
  if (d.tile) return dist(s, d.tile.x, d.tile.y) / speed(s) + work;
  return mind.k.exploreGuess + work;
}

/**
 * How to get the price `cost`: per missing resource, by hand ('hand') or by
 * waiting for buildings ('wait'), and how long that's reckoned to take; or,
 * when digging finds is quicker, all of it from mine layer `layer`.
 * Waiting runs alongside everything else; hand-gathering one at a time.
 */
export function plan(s, mind, cost, rates = productionRates(s)) {
  let waitMax = 0, handSum = 0;
  const how = {}, missing = {};
  for (const r of Object.keys(cost)) {
    const m = cost[r] - s.inv[r];
    if (m <= 0) continue;
    missing[r] = m;
    const w = rates[r] > 0 ? m / rates[r] : Infinity;
    const h = handEta(s, mind, r, m, rates[r]);
    if (h < w) { how[r] = 'hand'; handSum += h; } else { how[r] = 'wait'; waitMax = Math.max(waitMax, w); }
  }
  // Underground, getting it on the surface starts with the way back up.
  const surface = { eta: Math.max(waitMax, handSum) + (handSum > 0 ? climbBack(s, mind) : 0), how };
  // Any finite surface route wins under the default minimum-mining policy.
  // Do not even search caves or estimate mine layers for an elective trip.
  if (Number.isFinite(surface.eta) && mind.k.mineEdge <= 0) return surface;
  const mine = minePlan(s, mind, missing, rates, !Number.isFinite(surface.eta));
  return mine && (!Number.isFinite(surface.eta) || mine.eta < surface.eta * mind.k.mineEdge) ? mine : surface;
}

// Underground: about how long the way back up to the surface takes.
function climbBack(s, mind) {
  const here = layerOf(s);
  if (!here) return 0;
  const a = mind.arrived[s.player.z];
  return (a ? dist(s, a.x, a.y) / speed(s) : mind.k.exploreGuess) + (here - 1) * mind.k.shaftSeconds;
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
function minePlan(s, mind, missing, rates = productionRates(s), required = false) {
  const res = Object.keys(missing);
  // A new player starts on the surface: the mine waits for the first building.
  if (!res.length || !s.extractors.some((e) => ownBuilding(s, e))) return null;
  const here = layerOf(s);
  let travel = 0;
  if (here === 0) {
    const cave = caveMouth(s, mind);
    if (!cave) return null;
    travel = 2 * dist(s, cave.x, cave.y) / speed(s); // there, and back up after
  }
  // A find is about this many tiles of tunnel from the last one.
  const between = CHUNK_SIZE / Math.sqrt(FINDS_PER_CHUNK);
  let best = null;
  for (let layer = 1, deepest = deepestOpen(s); layer <= deepest; layer++) {
    const failure = mind.mineFailures?.get(layer);
    if (failure && failure.version === observationVersion(s.world, SURFACE - layer) &&
        (here !== layer || failure.glints === glintSignature(s))) continue;
    const pays = findPays(s, layer);
    if (!pays.share) continue;
    const perFind = between / Math.sqrt(pays.share) * mind.k.digSeconds;
    const outward = travel / 2 + Math.max(0, layer - Math.max(here, 1)) * mind.k.shaftSeconds;
    const home = here ? climbBack(s, mind) : travel / 2;
    const returnTrip = home + Math.max(0, layer - Math.max(here, 1)) * mind.k.shaftSeconds;
    let dig = 0;
    for (const r of res) {
      const remaining = Math.max(0, missing[r] - rates[r] * (outward + returnTrip));
      const rate = pays.loot[r] / perFind + rates[r];
      dig = Math.max(dig, remaining === 0 ? 0 : rate > 0 ? remaining / rate : Infinity);
    }
    // Down from the surface only for a dig worth the trip; once down, any dig.
    if (!required && here === 0 && dig < mind.k.minDig) continue;
    const eta = outward + returnTrip + dig;
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
  const minimum = reserveDeposit(s, SURFACE_TYPES[res]) ? 2 : 1;
  const tile = nearestExploredTile(s.world, s.player.x, s.player.y, SURFACE, SEARCH, works, null, SURFACE_TYPES[res], minimum);
  const out = { t: s.time, gear: gearKey(s), tile, gated: !tile && !!nearestExploredTile(s.world, s.player.x, s.player.y, SURFACE, SEARCH, seen, null, SURFACE_TYPES[res], minimum) };
  mind.near[res] = out;
  return out;
}

// Static terrain-to-building rules; unlock eligibility remains live.
const depositBuildings = new Map();
for (const d of Object.values(EXTRACTORS)) {
  const list = depositBuildings.get(d.tile) || [];
  list.push(d); depositBuildings.set(d.tile, list);
}
const reserveDeposit = (s, type) => depositBuildings.get(type)?.some(d => !d.unlock || s.unlocks[d.unlock]);

// Surface checks that hold wherever the player is (harvestable and
// gearNeeded look at the player's own layer).
// A deposit a building you can put up stands on is never worked down to
// nothing: the last of it is left for the building.
function harvestableOn(s, x, y) {
  const type = tileAt(s.world, x, y, SURFACE);
  const keep = reserveDeposit(s, type);
  return !!TILE_INFO[type].harvest && !holeBelow(s.world, x, y, SURFACE) && !extractorAt(s, x, y, SURFACE) &&
    richness(s.world, x, y, SURFACE) > (keep ? 1 : 0);
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
  const cave = nearestExploredTile(s.world, mind.home.x + 0.5, mind.home.y + 0.5, SURFACE, SEARCH, (x, y) =>
    isExplored(s.world, x, y, SURFACE) && tileAt(s.world, x, y, SURFACE) === T.CAVE && !mind.bad.has(key(x, y, SURFACE)), null, T.CAVE);
  mind.spots.cave = { t: s.time, tile: cave };
  return cave;
}

// Where building `id` would go: a deposit building on the free matching
// tile nearest home that you've seen with some of it left (an emptied one
// takes no building, and nothing grows back), else nearest you; a converter
// on free open land near home. Remembered while it stays free.
function buildSpot(s, mind, id) {
  const def = EXTRACTORS[id];
  const which = def.support || def.depot ? id : def.tile === null ? 'land' : 'tile' + def.tile;
  const free = (x, y) => isExplored(s.world, x, y, SURFACE) && !mind.bad.has(key(x, y, SURFACE)) && !extractorAt(s, x, y, SURFACE) &&
    !holeBelow(s.world, x, y, SURFACE) && !wayUp(s.world, x, y, SURFACE) &&
    (def.tile === null
      ? !!TILE_INFO[tileAt(s.world, x, y, SURFACE)].land && !TILE_INFO[tileAt(s.world, x, y, SURFACE)].harvest &&
        !(x === mind.home.x && y === mind.home.y)
      : tileAt(s.world, x, y, SURFACE) === def.tile && richness(s.world, x, y, SURFACE) > 0);
  if (def.support || def.depot) {
    const cached = mind.spots[which];
    if (cached && cached.n === s.extractors.length && s.time - cached.t < 120 && (!cached.tile || free(cached.tile.x, cached.tile.y))) return cached.tile;
    let tile = null, gain = 0, distance = Infinity;
    const radius = (def.support || def.depot).radius;
    const seen = new Set();
    const coverageScores = def.depot ? new Map() : null;
    for (const q of s.extractors) {
      if ((def.depot ? EXTRACTORS[q.key].rate<=0 || !!depotFor(s,q) : q.key !== def.support.target) || q.z !== SURFACE || !ownBuilding(s, q) || !isExplored(s.world, q.x, q.y, SURFACE)) continue;
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx*dx + dy*dy > radius**2) continue;
        const x = q.x+dx, y = q.y+dy, k = key(x,y,SURFACE);
        if (coverageScores) {
          const before=coverageScores.get(k);
          if(before)before.gain++;else coverageScores.set(k,{x,y,gain:1});
          continue;
        }
        if (seen.has(k)) continue;
        seen.add(k);
        if (!free(x,y)) continue;
        const g = def.depot ? depotGain(s,{x,y,z:SURFACE}) : supportGain(s, { x, y, z: SURFACE });
        const d = (x-mind.home.x)**2 + (y-mind.home.y)**2;
        if (g > gain || (g === gain && g > 0 && d < distance)) { tile = { x, y }; gain = g; distance = d; }
      }
    }
    if(coverageScores)for(const c of coverageScores.values()) {
      if(!free(c.x,c.y))continue;
      const d=(c.x-mind.home.x)**2+(c.y-mind.home.y)**2;
      if(c.gain>gain||(c.gain===gain&&d<distance)){tile={x:c.x,y:c.y};gain=c.gain;distance=d;}
    }
    mind.spots[which] = { n: s.extractors.length, t: s.time, tile };
    return tile;
  }
  const c = mind.spots[which];
  if (c && (c.tile ? free(c.tile.x, c.tile.y) : s.time - c.t < 120)) return c.tile;
  const tile = nearestExploredTile(s.world, mind.home.x + 0.5, mind.home.y + 0.5, SURFACE, def.tile === null ? 30 : SEARCH, free, null, def.tile) ||
    (def.tile === null ? null : nearestExploredTile(s.world, s.player.x, s.player.y, SURFACE, SEARCH, free, null, def.tile));
  mind.spots[which] = { t: s.time, tile };
  return tile;
}

/* ------------------------------------------------------------- walking */

// A step toward tile (tx, ty) on this layer, along a route through what
// you've seen (underground, through rock you can dig). Null once you're on
// it, or when there's no way there (then it's remembered as out of reach).
function walkTo(s, mind, tx, ty, badge, retried = false) {
  const z = s.player.z, px = Math.floor(s.player.x), py = Math.floor(s.player.y);
  if (px === tx && py === ty) return null;
  let r = mind.route;
  const i = r && r.tx === tx && r.ty === ty && r.z === z ? routePosition(r, px, py) : -1;
  if (i < 0) {
    const opts = { pad: 12, known: true, dig: z !== SURFACE, unknownDig: z !== SURFACE };
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
  // Walk toward an unknown frontier without looking through its rock. Moving
  // reveals it normally; a newly discovered obstacle triggers a fresh route.
  if (z !== SURFACE && !isExplored(s.world, next.x, next.y, z)) {
    return { type: 'walk', x: next.x, y: next.y, badge };
  }
  if (next.dig && !walkable(s.world, next.x, next.y, z)) {
    if (canHarvest(s, next.x, next.y)) return { type: 'harvestAt', x: next.x, y: next.y, badge: 'tool.pickaxe' };
    mind.route = null;
    return !retried ? walkTo(s, mind, tx, ty, badge, true) : (unreachable(s, mind, tx, ty), null);
  }
  return { type: 'walk', x: next.x, y: next.y, badge };
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
// `beyond`: the search is for more of a resource, so past where buildings
// are looked for too (nothing grows back: near home runs out).
function explore(s, mind, beyond = false) {
  const z = s.player.z;
  for (let tries = 0; tries < 3; tries++) {
    let f = mind.frontier;
    if (!f || f.z !== z || mind.bad.has(key(f.x, f.y, z))) {
      const tile = z === SURFACE ? outward(s, mind, beyond) : nearestTile(s.player.x, s.player.y, 40, (x, y) => !isExplored(s.world, x, y, z) && !mind.bad.has(key(x, y, z)));
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

const EDGE_LOOK = 24; // tiles around you an edge is looked for in

// The edge of what you've seen worth heading to: near you, far from home.
function outward(s, mind, beyond) {
  const w = s.world, z = SURFACE, wade = canWade(s);
  const px = Math.floor(s.player.x), py = Math.floor(s.player.y), h = mind.home;
  const seen = (x, y) => isExplored(w, x, y, z);
  // Only as far out as buildings are looked for (further finds nothing to
  // use), unless it's more to gather that's wanted.
  const reach = beyond ? Infinity : SEARCH;
  const edge = (x, y) => Math.hypot(x - h.x, y - h.y) < reach && seen(x, y) && !(seen(x + 1, y) && seen(x - 1, y) && seen(x, y + 1) && seen(x, y - 1)) &&
    walkable(w, x, y, z) && (wade || !swimsAt(w, x, y, z)) && !mind.bad.has(key(x, y, z));
  let best = null, bestScore = Infinity;
  for (let y = py - EDGE_LOOK; y <= py + EDGE_LOOK; y++) {
    for (let x = px - EDGE_LOOK; x <= px + EDGE_LOOK; x++) {
      if (!edge(x, y)) continue;
      const score = Math.hypot(x - px, y - py) - mind.k.outward * Math.hypot(x - h.x, y - h.y);
      if (score < bestScore) { bestScore = score; best = { x, y }; }
    }
  }
  // Nothing unseen close by: the nearest edge further off (much further when
  // it's more to gather that's wanted and all around has been seen).
  return best || nearestExploredTile(w, px + 0.5, py + 0.5, SURFACE, beyond ? 400 : 80, edge);
}

/* ------------------------------------------------------------ pursuing */

function pursue(s, mind, goal) {
  const underground = s.player.z !== SURFACE;
  if (!goal || goal.kind === 'find') return (underground ? up(s, mind) : explore(s, mind, goal?.kind === 'find')) || idle(s, mind);
  if (canAfford(s.inv, goal.cost)) return obtain(s, mind, goal);
  // How to get it, kept a while: chosen afresh at every step, two ways that
  // are nearly as quick would take turns, a step toward each. A trip down is
  // kept as long as a dig is worth (minDig), or a guess about the surface
  // that shifts as its deposits run out would pop it straight back up.
  const keep = mind.how?.p.layer ? Math.max(mind.k.stick, mind.k.minDig) : mind.k.stick;
  if (!mind.how || mind.how.goal !== goal || s.time - mind.how.t > keep) {
    const p = plan(s, mind, goal.cost);
    mind.how = { goal, t: s.time, p };
  }
  const p = mind.how.p;
  if (p.layer) return mine(s, mind, p.layer);
  if (underground) return up(s, mind) || idle(s, mind);
  const hand = Object.keys(p.how).find((r) => p.how[r] === 'hand' && goal.cost[r] > s.inv[r]);
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
  if (!d.tile) return surfaceUnlocked(s, res) ? explore(s, mind, true) : null;
  if (canHarvest(s, d.tile.x, d.tile.y)) return { type: 'harvestAt', x: d.tile.x, y: d.tile.y, badge };
  const step = walkTo(s, mind, d.tile.x, d.tile.y, badge);
  if (step) return step;
  if (!canHarvest(s, d.tile.x, d.tile.y)) unreachable(s, mind, d.tile.x, d.tile.y);
  return null;
}

// Waiting on buildings: fetch what they hold that the goal still needs
// (`need`, resources) and empty the ones filling up (before Logistics hauls
// for you), else gather by hand what the goal will take longest to get,
// which beats standing about whatever the buildings make.
function idle(s, mind, need = {}) {
  const cap = (e) => extractorCapacity(s, e.key, e);
  const due = s.unlocks.logistics ? [] : s.extractors.filter((e) => e.z === s.player.z && ownBuilding(s, e) && e.buffer >= 1 && !autoCollected(s, e) &&
    (e.buffer >= Math.min(need[e.res] || Infinity, 0.25 * cap(e)) || e.buffer >= 0.5 * cap(e)) && !mind.bad.has(key(e.x, e.y, e.z)));
  // The building you're on your way to, until it's emptied; else the nearest due.
  const f = mind.fetch;
  if (!(f && f.buffer >= 1 && f.z === s.player.z && s.extractors.includes(f) && !autoCollected(s, f))) {
    mind.fetch = due.length ? due.reduce((a, b) => (dist(s, b.x, b.y) < dist(s, a.x, a.y) ? b : a)) : null;
  }
  const e = mind.fetch;
  const near = !s.unlocks.logistics && collectTarget(s);
  if (near && near.list.includes(e)) { mind.fetch = null; return { type: 'collect', badge: 'ui.collect' }; }
  if (e) {
    const step = walkTo(s, mind, e.x, e.y, 'ui.collect');
    if (step) return step;
    mind.fetch = null;
  }
  if (s.player.z !== SURFACE) return up(s, mind) || wait('lost');
  const rates = productionRates(s);
  const slowest = Object.keys(need).sort((a, b) => need[b] / rates[b] - need[a] / rates[a]);
  for (const r of slowest) {
    const step = gather(s, mind, r);
    if (step) return step;
  }
  // Searching for a building has no resource price yet. If this look at
  // the frontier found only failed paths, gather something already known
  // while the next look tries another edge instead of doing nothing.
  if (!slowest.length) for (const r of RESOURCES) {
    if (!nearestDeposit(s, mind, r).tile) continue;
    const step = gather(s, mind, r);
    if (step) return step;
  }
  return wait('production');
}

/* ------------------------------------------------------------ the battery */

const CHARGE_BELOW = 0.5;  // battery share that sends it off to a charger
const CHARGE_FULL = 0.98;  // ... and that it stays there until
const CHARGE_TRIP = 60;    // tiles it'll go for a charge
const SOLAR_NEAR = 40;     // tiles from home it puts its solar panel within

// Keeping the light up: once the battery has begun to run down, a solar
// panel on water near home; when it's low, off to a charger that works now
// (a solar panel only by day), staying by it till the battery is full.
function power(s, mind) {
  if (s.player.z !== SURFACE) { mind.charger = null; return null; }
  let c = mind.charger;
  if (c && (s.battery >= CHARGE_FULL || !charging(s.world.props.get(key(c.x, c.y, SURFACE)), s.time))) c = mind.charger = null;
  if (!c && s.battery < CHARGE_BELOW) c = mind.charger = nearestCharger(s, mind);
  if (!c) return solar(s, mind);
  const badge = 'mark.' + s.world.props.get(key(c.x, c.y, SURFACE));
  // Physics can charge from an unseen prop, but AUTO may only decide to
  // wait beside the observed charger it actually selected.
  if (tileDist2(s.player, c.x, c.y, SURFACE) <= CHARGE_RANGE * CHARGE_RANGE) return { type: 'charge', badge };
  const step = walkTo(s, mind, c.x, c.y, badge);
  if (!step) mind.charger = null;
  return step;
}

// The nearest charger that works now within CHARGE_TRIP of you.
function nearestCharger(s, mind) {
  let best = null, bestD = CHARGE_TRIP;
  for (const [k, kind] of s.world.props) {
    const t = unpackKey(k);
    if (t.z !== SURFACE || !isExplored(s.world, t.x, t.y, SURFACE) || !charging(kind, s.time) || mind.bad.has(k)) continue;
    const d = dist(s, t.x, t.y);
    if (d < bestD) { bestD = d; best = { x: t.x, y: t.y }; }
  }
  return best;
}

// A solar panel on the water nearest home that's beside the shore, so it
// charges you from land too, unless there's a charger near home already.
function solar(s, mind) {
  if (s.battery >= 0.9 || !canWade(s) || !canAfford(s.inv, PROPS.solar.cost)) return null;
  const h = mind.home;
  for (const [k, kind] of s.world.props) {
    const t = unpackKey(k);
    if (t.z === SURFACE && isExplored(s.world, t.x, t.y, SURFACE) && PROPS[kind].charge && Math.hypot(t.x - h.x, t.y - h.y) < SOLAR_NEAR) return null;
  }
  const w = s.world, land = (x, y) => isExplored(w, x, y, SURFACE) && walkable(w, x, y, SURFACE) && !swimsAt(w, x, y, SURFACE);
  const free = (x, y) => isExplored(w, x, y, SURFACE) && swimsAt(w, x, y, SURFACE) && !w.props.has(key(x, y, SURFACE)) &&
    !mind.bad.has(key(x, y, SURFACE)) && (land(x + 1, y) || land(x - 1, y) || land(x, y + 1) || land(x, y - 1));
  const c = mind.spots.solar;
  const spot = c && (c.tile ? free(c.tile.x, c.tile.y) : s.time - c.t < 120) ? c.tile : nearestExploredTile(w, h.x + 0.5, h.y + 0.5, SURFACE, SOLAR_NEAR, free, null, T.WATER);
  mind.spots.solar = { t: c && c.tile === spot ? c.t : s.time, tile: spot };
  if (!spot) return null;
  if (Math.floor(s.player.x) === spot.x && Math.floor(s.player.y) === spot.y) {
    if (canPlaceProp(s, 'solar')) return { type: 'prop', kind: 'solar', badge: 'mark.solar' };
    unreachable(s, mind, spot.x, spot.y);
    return null;
  }
  return walkTo(s, mind, spot.x, spot.y, 'mark.solar');
}

/* -------------------------------------------------------------- the mine */

const UP_LOOK = 2;

function knownWayUp(s, mind) {
  const w = s.world, z = s.player.z;
  let best = null, bestD = Infinity;
  // Only inspect ways in chunks the player has explored, and only accept
  // explored tiles. The exit can be farther than the old 60-tile search.
  for (const k of w.explored.keys()) {
    const c = unpackKey(k);
    if (c.z !== z) continue;
    const x = c.x * CHUNK_SIZE, y = c.y * CHUNK_SIZE;
    for (const t of waysIn(w, z, x, y, x + CHUNK_SIZE - 1, y + CHUNK_SIZE - 1)) {
      if (!isExplored(w, t.x, t.y, z) || !wayUp(w, t.x, t.y, z) || mind.bad.has(key(t.x, t.y, z))) continue;
      const d = dist(s, t.x, t.y);
      if (d < bestD) { bestD = d; best = t; }
    }
  }
  return best;
}

// Up toward the surface: the ladder in reach, else the way up you know of
// nearest (the one you came down by, at least).
function up(s, mind) {
  if (s.player.z === SURFACE) return null;
  const z = s.player.z, w = s.world;
  const ladder = nearestExploredTile(w, s.player.x, s.player.y, z, 2, (x, y) => canClimbAt(s, x, y));
  if (ladder) return { type: 'climb', x: ladder.x, y: ladder.y, badge: 'ui.climb' };
  // Looked for afresh every UP_LOOK seconds, not every step.
  const c = mind.upWay;
  if (!c || c.z !== z || s.time - c.t > UP_LOOK || (c.way && mind.bad.has(key(c.way.x, c.way.y, z)))) {
    mind.upWay = { z, t: s.time, way: knownWayUp(s, mind) };
  }
  const a = mind.arrived[z];
  const known = mind.upWay.way || (a && wayUp(w, a.x, a.y, z) && !mind.bad.has(key(a.x, a.y, z)) ? a : null);
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
  const productive = dig(s, mind) || explore(s, mind);
  if (productive) return productive;
  mind.mineFailures.set(layer, { version: observationVersion(s.world, SURFACE - layer),
    glints: here === layer ? glintSignature(s) : null });
  mind.how = null; // retreat must not immediately re-enter with the same plan
  return up(s, mind) || idle(s, mind);
}

const glintSignature = s => findsNear(s).map(f => key(f.x, f.y, s.player.z)).sort((a, b) => a - b).join(',');

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
    for (let x = px - LAMP_GAP; x <= px + LAMP_GAP; x++) if (isExplored(s.world, x, y, z) && props.has(key(x, y, z))) return null;
  }
  return { type: 'prop', kind: 'glowcap', badge: 'mark.glowcap' };
}

// Down the nearest shaft you've seen on this layer: open it (a deliberate
// dig, never done by a Trail), then drop through.
function shaftDown(s, mind) {
  const z = s.player.z, w = s.world;
  const valid = (x, y) => isExplored(w, x, y, z) && !mind.bad.has(key(x, y, z)) &&
    (tileAt(w, x, y, z) === T.SHAFT_OPEN || (tileAt(w, x, y, z) === T.SHAFT && !gearNeeded(s, x, y)));
  // A detour can temporarily put an already discovered shaft outside the
  // search radius too. Finish the route instead of exploring back and forth.
  if (mind.shaft && (mind.shaft.z !== z || !valid(mind.shaft.x, mind.shaft.y))) mind.shaft = null;
  const shaft = mind.shaft || nearestExploredTile(w, s.player.x, s.player.y, z, 40, valid);
  if (shaft) mind.shaft = { ...shaft, z };
  if (!shaft) return null;
  if (canDescendAt(s, shaft.x, shaft.y)) return { type: 'descend', x: shaft.x, y: shaft.y, badge: 'ui.climbDown' };
  if (canHarvest(s, shaft.x, shaft.y)) return { type: 'harvestAt', x: shaft.x, y: shaft.y, badge: 'ui.climbDown' };
  return walkTo(s, mind, shaft.x, shaft.y, 'ui.climbDown');
}

// Tunnel to the nearest find glinting in the dark that your Pickaxe can break.
function dig(s, mind) {
  const z = s.player.z;
  // A route may initially lead away from the glint (around bedrock). Keep
  // the find we actually saw until collected or unreachable; losing sight
  // must not replace that route with exploration back toward the glint.
  const f = mind.find;
  const valid = (f) => s.tools.pickaxe >= (GEAR.rock[f.type] || 1) && !mind.bad.has(key(f.x, f.y, z)) &&
    (!mind.goal?.cost || Object.keys(FINDS[f.type].loot).some(r => mind.goal.cost[r] > s.inv[r]));
  const observed = findsNear(s);
  if (f && (f.z !== z || !valid(f) ||
      (isExplored(s.world, f.x, f.y, z) && tileAt(s.world, f.x, f.y, z) !== f.type) ||
      (tileDist2(s.player, f.x, f.y, z) <= GLINT_RANGE * GLINT_RANGE && !observed.some(v => v.x === f.x && v.y === f.y)))) mind.find = null;
  const finds = mind.find ? [mind.find] : observed.filter(valid).sort((a, b) => a.d - b.d);
  for (const f of finds.slice(0, 3)) {
    mind.find = { ...f, z };
    if (tileDist2(s.player, f.x, f.y, z) <= REACH * REACH && canHarvest(s, f.x, f.y)) return { type: 'harvestAt', x: f.x, y: f.y, badge: 'tool.pickaxe' };
    const step = walkTo(s, mind, f.x, f.y, 'tool.pickaxe');
    if (step) return step;
  }
  return null;
}
