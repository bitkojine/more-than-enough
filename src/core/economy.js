/* Costs, yields and production multipliers. */

import { TOOLS, EXTRACTORS, REFINERIES, ABUNDANCE, EXTRACTOR_GROWTH, EXPLORE_RADIUS, MINE_EXPLORE_RADIUS, HAND_SHARE } from './content.js';
import { RESOURCES, RESOURCE_LABEL } from './tiles.js';
import { t } from '../i18n/i18n.js';

/* ------------------------------------------------------------- income */

// Where resources come from, as counted in the earnings statement.
export const SOURCES = Object.fromEntries(['hand', 'finds', 'buildings', 'engine'].map((k) => [k, t('source.' + k)]));

// Adds `amount` of `res` to the packs, counted as gathered this world and as
// coming from `source` (a key of SOURCES).
export function earn(s, res, amount, source) {
  s.inv[res] += amount;
  s.stats[res] += amount;
  s.sources[res][source] += amount;
}

/* -------------------------------------------------------------- costs */

export function canAfford(inv, cost) {
  if (!cost) return false;
  for (const r in cost) if ((inv[r] || 0) < cost[r]) return false;
  return true;
}

export function pay(inv, cost) {
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

// The current level's entry for a tool (tool levels start at 1).
export function toolStat(s, id) {
  return TOOLS[id].levels[s.tools[id] - 1];
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

export function extractorRate(s, key) {
  const def = EXTRACTORS[key];
  return def.rate * productionMult(s, def.res);
}

// How much a building holds before it stops and waits to be collected: the
// same time's worth of output at any level (its base buffer at base rate),
// so upgrades never fill it in an instant and the income shown is the income
// you get.
export function extractorCapacity(s, key) {
  const def = EXTRACTORS[key];
  return def.buffer * productionMult(s, def.res);
}

// Total per-second income of each resource when every extractor is producing.
export function productionRates(s) {
  const rates = {};
  for (const r of RESOURCES) rates[r] = abundanceTrickle(s);
  for (const e of s.extractors) if (ownBuilding(s, e)) rates[e.res] += extractorRate(s, e.key);
  return rates;
}

// What all your buildings make of `res` a second.
export function buildingRate(s, res) {
  let rate = 0;
  for (const e of s.extractors) if (e.res === res && ownBuilding(s, e)) rate += extractorRate(s, e.key);
  return rate;
}

/* -------------------------------------------------------- extractors */

// In a shared world the buildings of everyone in it stand in s.extractors;
// a building works for whoever built it.
export function ownBuilding(s, e) {
  return !e.owner || e.owner === s.me;
}

export function extractorCount(s, key) {
  return s.extractors.filter((e) => e.key === key && ownBuilding(s, e)).length;
}

export function extractorCost(s, key) {
  return scaleCost(EXTRACTORS[key].baseCost, Math.pow(EXTRACTOR_GROWTH, extractorCount(s, key)));
}
