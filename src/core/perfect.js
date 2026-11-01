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

import { SURFACE, CHUNK_SIZE } from './coords.js';
import { T, RESOURCES } from './tiles.js';
import { wayUp, findSpawn, observationVersion } from './world.js';
import { atInteraction } from './interaction.js';
import { EXTRACTORS, EMBARK_ABUNDANCE, GEAR, FINDS, FINDS_PER_CHUNK } from './content.js';
import { UPGRADES, isMaxed, upgradeCost, upgradeLevel, canBuy, worldMastered } from './upgrades.js';
import { usesDepots, depotGain } from './logistics.js';
import {
  canAfford,
  gatherYield,
  productionRates,
  extractorCost,
  extractorCapacity,
  extractorCount,
  placementGain,
  ownBuilding
} from './economy.js';
import { canEmbark } from './state.js';
import { canHarvest, collectTarget } from './actions.js';
import { autoCollected, settleEconomy } from './sim.js';
import { HANDS_PER_SECOND } from './pace.js';
import { walkTo, unreachable, explore } from './perfect-walk.js';
import { key, wait, speed, dist, layerOf, SURFACE_TYPES } from './perfect-util.js';
import { gearKey, nearestDeposit, caveMouth, buildSpot } from './perfect-find.js';
import { power, up, mine, glintSignature } from './perfect-mine.js';

const PERKS_FIRST = ['memory', 'heirloom', 'cartographer'];

// The brain's judgement calls: guesses and margins the rules don't settle.
// Tuned 2026-10-19 on v0.120 rules: Embark in 24.65 h (35.83 h before).
// scripts/perfect-tune.mjs searches them for the quickest Embark after a
// rules change; scripts/perfect-bench.mjs measures what they give.
export const KNOBS = Object.freeze({
  rethink: 60, // game seconds before the goal is chosen afresh anyway
  stick: 10, // game seconds a way of getting the goal is kept before it's weighed again
  exploreGuess: 60, // seconds a search for something not yet seen is reckoned to take
  walkLoss: 0.4, // share of holding Gather reckoned to gather, the rest lost walking between tiles
  mineEdge: 0, // surface first; positive values permit elective mining in comparison fixtures
  shaftSeconds: 22.5, // reckoned to find and open the way down out of a layer
  digSeconds: 0.6, // reckoned per tile tunnelled toward a find (dig, then step)
  minDig: 60, // seconds of digging a trip down must be worth: no popping in for a find or two
  outward: 0.8 // exploring: how much further from home outweighs being further from you
});

/** @returns {object} a blank memory for nextIntent, judging with `knobs` (KNOBS by default) */
export function newMind(knobs = {}) {
  return { state: null, k: { ...KNOBS, ...knobs } };
}

// The mind belongs to one state: a new world (Embark, switching
// worlds) starts it afresh.
function fresh(s, mind) {
  if (mind.state !== s) {
    Object.assign(mind, {
      state: s,
      goal: null,
      decided: -Infinity,
      route: null,
      bad: new Set(),
      near: {},
      spots: {},
      searches: {},
      frontier: null,
      home: findSpawn(s.world),
      arrived: {},
      flagged: new Set(),
      z: null,
      upWay: null,
      mineFailures: new Map()
    });
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
    const x = Math.floor(s.player.x),
      y = Math.floor(s.player.y);
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
    if (id === 'logistics' && usesDepots(s)) continue;
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
    else if (def.tile !== null && s.player.z === SURFACE)
      out.push({
        kind: 'find',
        id,
        cost: {},
        eta: mind.k.exploreGuess * 2 ** (mind.searches[id] || 0)
      });
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
  let best = null,
    fallback = null;
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
  if (best)
    best.level = best.kind === 'buy' ? upgradeLevel(s, best.id) : extractorCount(s, best.id);
  if (best && best.kind === 'find') mind.searches[best.id] = (mind.searches[best.id] || 0) + 1;
  mind.goal = best;
  mind.decided = s.time;
  return best;
}

// Convert all input prices into equivalent production time, then into the
// output this building must earn back. No state mutation or speculative buys.
export function investmentPayback(s, mind, id, rates = productionRates(s)) {
  const value = (r) => rates[r] + (surfaceUnlocked(s, r) ? handRate(s, mind, r) : 0);
  let spent = 0;
  for (const [r, amount] of Object.entries(extractorCost(s, id))) {
    if (!amount) continue;
    if (!value(r)) return Infinity;
    spent += amount / value(r);
  }
  if (EXTRACTORS[id].depot) {
    const at = mind.spots ? buildSpot(s, mind, id) : null;
    return at && depotGain(s, at) > 0 ? spent / depotGain(s, at) : Infinity;
  }
  return (
    (spent * value(EXTRACTORS[id].res)) /
    placementGain(s, id, mind.spots ? buildSpot(s, mind, id) : null)
  );
}

/* ------------------------------------------------------------ planning */

const handRate = (s, mind, res) => HANDS_PER_SECOND * gatherYield(s, res) * mind.k.walkLoss;

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
  let waitMax = 0,
    handSum = 0;
  const how = {},
    missing = {};
  for (const r of Object.keys(cost)) {
    const m = cost[r] - s.inv[r];
    if (m <= 0) continue;
    missing[r] = m;
    const w = rates[r] > 0 ? m / rates[r] : Infinity;
    const h = handEta(s, mind, r, m, rates[r]);
    if (h < w) {
      how[r] = 'hand';
      handSum += h;
    } else {
      how[r] = 'wait';
      waitMax = Math.max(waitMax, w);
    }
  }
  // Underground, getting it on the surface starts with the way back up.
  const surface = { eta: Math.max(waitMax, handSum) + (handSum > 0 ? climbBack(s, mind) : 0), how };
  // Any finite surface route wins under the default minimum-mining policy.
  // Do not even search caves or estimate mine layers for an elective trip.
  if (Number.isFinite(surface.eta) && mind.k.mineEdge <= 0) return surface;
  const mine = minePlan(s, mind, missing, rates, !Number.isFinite(surface.eta));
  return mine && (!Number.isFinite(surface.eta) || mine.eta < surface.eta * mind.k.mineEdge)
    ? mine
    : surface;
}

// Underground: about how long the way back up to the surface takes.
function climbBack(s, mind) {
  const here = layerOf(s);
  if (!here) return 0;
  const a = mind.arrived[s.player.z];
  return (
    (a ? dist(s, a.x, a.y) / speed(s) : mind.k.exploreGuess) + (here - 1) * mind.k.shaftSeconds
  );
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
    travel = (2 * dist(s, cave.x, cave.y)) / speed(s); // there, and back up after
  }
  // A find is about this many tiles of tunnel from the last one.
  const between = CHUNK_SIZE / Math.sqrt(FINDS_PER_CHUNK);
  let best = null;
  for (let layer = 1, deepest = deepestOpen(s); layer <= deepest; layer++) {
    const failure = mind.mineFailures?.get(layer);
    if (
      failure &&
      failure.version === observationVersion(s.world, SURFACE - layer) &&
      (here !== layer || failure.glints === glintSignature(s))
    )
      continue;
    const pays = findPays(s, layer);
    if (!pays.share) continue;
    const perFind = (between / Math.sqrt(pays.share)) * mind.k.digSeconds;
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
    if (isFinite(eta) && (!best || eta < best.eta))
      best = { eta, layer, how: Object.fromEntries(res.map((r) => [r, 'mine'])) };
  }
  return best;
}

/* ------------------------------------------------------------ pursuing */

function pursue(s, mind, goal) {
  const underground = s.player.z !== SURFACE;
  if (!goal || goal.kind === 'find')
    return (underground ? up(s, mind) : explore(s, mind, goal?.kind === 'find')) || idle(s, mind);
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
  if (p.layer) return mine(s, mind, p.layer, idle);
  if (underground) return up(s, mind) || idle(s, mind);
  const hand = Object.keys(p.how).find((r) => p.how[r] === 'hand' && goal.cost[r] > s.inv[r]);
  if (hand) return gather(s, mind, hand) || idle(s, mind);
  const need = {};
  for (const r of Object.keys(goal.cost))
    if (goal.cost[r] > s.inv[r]) need[r] = goal.cost[r] - s.inv[r];
  return idle(s, mind, need);
}

// The goal is affordable: buy it, or go and put it up.
function obtain(s, mind, goal) {
  if (goal.kind === 'buy') return { type: 'buy', id: goal.id, badge: 'ui.upgrade' };
  if (s.player.z !== SURFACE) return up(s, mind) || idle(s, mind);
  const spot = buildSpot(s, mind, goal.id);
  if (!spot) {
    mind.goal = null;
    return idle(s, mind);
  }
  if (atInteraction(s, spot.x, spot.y)) {
    return { type: 'place', key: goal.id, x: spot.x, y: spot.y, badge: 'ui.build' };
  }
  return walkTo(s, mind, spot.x, spot.y, 'ui.build') || idle(s, mind);
}

// Hand-gathering `res` from the nearest deposit of it you know of.
function gather(s, mind, res) {
  const d = nearestDeposit(s, mind, res);
  const badge = 'resource.' + res;
  if (!d.tile) return surfaceUnlocked(s, res) ? explore(s, mind, true) : null;
  if (canHarvest(s, d.tile.x, d.tile.y))
    return { type: 'harvestAt', x: d.tile.x, y: d.tile.y, badge };
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
  const due = s.unlocks.logistics
    ? []
    : s.extractors.filter(
        (e) =>
          e.z === s.player.z &&
          ownBuilding(s, e) &&
          e.buffer >= 1 &&
          !autoCollected(s, e) &&
          (e.buffer >= Math.min(need[e.res] || Infinity, 0.25 * cap(e)) ||
            e.buffer >= 0.5 * cap(e)) &&
          !mind.bad.has(key(e.x, e.y, e.z))
      );
  // The building you're on your way to, until it's emptied; else the nearest due.
  const f = mind.fetch;
  if (!(
    f &&
    f.buffer >= 1 &&
    f.z === s.player.z &&
    s.extractors.includes(f) &&
    !autoCollected(s, f)
  )) {
    mind.fetch = due.length
      ? due.reduce((a, b) => (dist(s, b.x, b.y) < dist(s, a.x, a.y) ? b : a))
      : null;
  }
  const e = mind.fetch;
  const near = !s.unlocks.logistics && collectTarget(s);
  if (near && near.list.includes(e)) {
    mind.fetch = null;
    return { type: 'collect', badge: 'ui.collect' };
  }
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
  if (!slowest.length)
    for (const r of RESOURCES) {
      if (!nearestDeposit(s, mind, r).tile) continue;
      const step = gather(s, mind, r);
      if (step) return step;
    }
  return wait('production');
}
