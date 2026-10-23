/* Costs, yields and production multipliers. */

import { TOOLS, EXTRACTORS, REFINERIES, ABUNDANCE, EXTRACTOR_GROWTH, EXPLORE_RADIUS, MINE_EXPLORE_RADIUS, HAND_SHARE } from './content.js';
import { RESOURCES, RESOURCE_LABEL } from './tiles.js';
import { t } from '../i18n/i18n.js';

import { economyForState, economyForInventory } from './economy-context.js';

/* ------------------------------------------------------------- income */

// Where resources come from, as counted in the earnings statement.
export const SOURCES = Object.fromEntries(['hand', 'finds', 'buildings', 'engine'].map((k) => [k, t('source.' + k)]));

// Adds `amount` of `res` to the packs, counted as gathered this world and as
// coming from `source` (a key of SOURCES).
export function earn(s, res, amount, source) {
  const indexed = economyForState(s);
  if (indexed) return indexed.credit(source, res, amount);
  s.inv[res] += amount;
  s.stats[res] += amount;
  s.sources[res][source] += amount;
}

/* -------------------------------------------------------------- costs */

export function canAfford(inv, cost) {
  const indexed = economyForInventory(inv);
  if (indexed) return indexed.canAfford(cost);
  if (!cost) return false;
  for (const r in cost) if ((inv[r] || 0) < cost[r]) return false;
  return true;
}

export function pay(inv, cost) {
  const indexed = economyForInventory(inv);
  if (indexed) return indexed.pay(cost);
  if (!canAfford(inv, cost)) return false;
  for (const r in cost) inv[r] -= cost[r];
  return true;
}

export function costText(cost) {
  return Object.keys(cost || {}).map((r) => t('cost.item', { n: cost[r], res: RESOURCE_LABEL[r] })).join(', ');
}

export function scaleCost(cost, factor) {
  const out = {};
  for (const r in cost) out[r] = Math.ceil(cost[r] * factor);
  return out;
}

/* ------------------------------------------------------- tool effects */

// Level zero is bare hands/barefoot/base machinery: no owned item.
// Level one is retained for legacy basic equipment; first crafting reaches two.
export function toolStat(s, id) {
  return TOOLS[id].levels[Math.max(0, s.tools[id] - 1)];
}

// One gather of `res`: what the tool brings, plus HAND_SHARE seconds of your
// buildings' output of it, so working by hand always adds to waiting.
export function gatherYield(s, res) {
  return toolStat(s, res === 'mycelium' ? 'basket' : 'pickaxe').yield + HAND_SHARE * buildingRate(s, res);
}

export function overclockMult(s) {
  return toolStat(s, 'overclock').mult;
}

export function speedMult(s) {
  return toolStat(s, 'boots').mult * (1 + 0.2 * s.perks.nomad);
}

// How far around the player the fog lifts on layer z.
export function exploreRadius(s, z = s.player.z) {
  if (z < 0) return MINE_EXPLORE_RADIUS + (s.perks.cartographer ? 1 : 0);
  return EXPLORE_RADIUS + (s.perks.cartographer ? 2 : 0);
}

/* ------------------------------------------------------- production */

export function refineryMult(s, res) {
  const levels = REFINERIES[res].levels;
  let m = 1;
  for (let i = 0; i < s.resUp[res]; i++) m *= levels[i].mult;
  return m;
}

export function legacyMult(s) {
  return Math.pow(1.25, s.perks.legacy);
}

export function abundanceMult(s) {
  return Math.pow(ABUNDANCE.prodMult, s.abundanceLv);
}

export function abundanceCost(s) {
  return scaleCost(ABUNDANCE.baseCost, Math.pow(ABUNDANCE.growth, s.abundanceLv));
}

// Every multiplier that applies to extractors and converters of a resource.
export function productionMult(s, res) {
  return refineryMult(s, res) * overclockMult(s) * abundanceMult(s) * legacyMult(s);
}

// Passive per-second gain of each resource from the Abundance Engine.
export function abundanceTrickle(s) {
  return s.abundanceLv * legacyMult(s);
}

// Adjacency is indexed once per building layout, never searched each tick.
// Canonical layout changes append a building or replace the shared-world array.
const supportLayouts = new WeakMap();
export function invalidateSupports(s) { supportLayouts.delete(s); }
function supportLayout(s) {
  const old = supportLayouts.get(s);
  if (old && old.list === s.extractors && old.n === s.extractors.length) return old;
  const tiles = new Map(), links = new Map();
  for (const e of s.extractors) tiles.set(`${e.x},${e.y},${e.z}`, e);
  const layout = { list: s.extractors, n: s.extractors.length, tiles, links };
  supportLayouts.set(s, layout);
  for (const e of s.extractors) {
    if (!EXTRACTORS[e.key].support) continue;
    for (const q of supportTargets(s, e)) {
      const before = links.get(q);
      if (!before || (e.x-q.x)**2+(e.y-q.y)**2 < (before.x-q.x)**2+(before.y-q.y)**2) links.set(q, e);
    }
  }
  return layout;
}

// A fixed-radius lookup: O(radius²), independent of world size. Ownership
// and layer must match; multiple workshops never multiply the same quarry.
export function supportTargets(s, at) {
  const def = EXTRACTORS[at.key || 'stoneworks'].support;
  if (!def) return [];
  const { tiles } = supportLayout(s), out = [];
  for (let dy = -def.radius; dy <= def.radius; dy++) for (let dx = -def.radius; dx <= def.radius; dx++) {
    if (dx*dx + dy*dy > def.radius*def.radius) continue;
    const q = tiles.get(`${at.x+dx},${at.y+dy},${at.z}`);
    if (q?.key === def.target && q.owner === at.owner) out.push(q);
  }
  return out;
}
export function supportingBuilding(s, e) { return supportLayout(s).links.get(e) || null; }
export function supportMult(s, e) { return e?.key === 'quarry' && supportingBuilding(s, e) ? EXTRACTORS.stoneworks.support.mult : 1; }
export function supportGain(s, at) {
  return supportTargets(s, { key: 'stoneworks', z: s.player.z, owner: s.me || undefined, ...at })
    .filter(q => !supportingBuilding(s, q)).length * EXTRACTORS.quarry.rate * productionMult(s, 'stone');
}

export function extractorRate(s, key, instance = null) {
  const def = EXTRACTORS[key];
  return def.rate * productionMult(s, def.res) * supportMult(s, instance);
}

// Quote a *new* building at a known location without mutating the layout.
export function placementGain(s, key, at) {
  if (EXTRACTORS[key].depot) return 0;
  if (EXTRACTORS[key].support) return at ? supportGain(s, at) : 0;
  const base = extractorRate(s, key);
  if (key !== 'quarry' || !at) return base;
  const def = EXTRACTORS.stoneworks.support, { tiles } = supportLayout(s);
  for (let dy=-def.radius; dy<=def.radius; dy++) for (let dx=-def.radius; dx<=def.radius; dx++) {
    if (dx*dx+dy*dy > def.radius*def.radius) continue;
    const b = tiles.get(`${at.x+dx},${at.y+dy},${at.z ?? s.player.z}`);
    if (b?.key === 'stoneworks' && b.owner === (s.me || undefined)) return base * def.mult;
  }
  return base;
}

// How much a building holds before it stops and waits to be collected: the
// same time's worth of output at any level (its base buffer at base rate),
// so upgrades never fill it in an instant and the income shown is the income
// you get.
export function extractorCapacity(s, key, instance = null) {
  const def = EXTRACTORS[key];
  return def.buffer * productionMult(s, def.res) * supportMult(s, instance);
}

// Total per-second income of each resource when every extractor is producing.
export function productionRates(s) {
  const indexed = economyForState(s);
  if (indexed) return indexed.productionRates();
  const rates = {};
  for (const r of RESOURCES) rates[r] = abundanceTrickle(s);
  for (const e of s.extractors) if (ownBuilding(s, e)) rates[e.res] += extractorRate(s, e.key, e);
  return rates;
}

// What all your buildings make of `res` a second.
export function buildingRate(s, res) {
  const indexed = economyForState(s);
  if (indexed) return indexed.buildingRate(res);
  let rate = 0;
  for (const e of s.extractors) if (e.res === res && ownBuilding(s, e)) rate += extractorRate(s, e.key, e);
  return rate;
}

/* -------------------------------------------------------- extractors */

// In a shared world the buildings of everyone in it stand in s.extractors;
// a building works for whoever built it.
export function ownBuilding(s, e) {
  return !e.owner || e.owner === s.me;
}

export function extractorCount(s, key) {
  const indexed = economyForState(s);
  if (indexed) return indexed.extractorCount(key);
  return s.extractors.filter((e) => e.key === key && ownBuilding(s, e)).length;
}

export function extractorCost(s, key) {
  return scaleCost(s.cultivation&&key==='stoneworks'?{mycelium:20,stone:12,ore:4}:EXTRACTORS[key].baseCost, Math.pow(EXTRACTOR_GROWTH, extractorCount(s, key)));
}
