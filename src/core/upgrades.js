/* Everything the player can buy that isn't a building, in one registry.
 *
 * Each upgrade has the same shape, so buying, the progression map and the
 * upgrade sheet all share one code path:
 *   level(s)       purchases made so far (0 = none)
 *   max            purchases available (Infinity for repeatables)
 *   cost(s, lv)    price of purchase number lv + 1
 *   currency       'inv' (resources) or 'insight'
 *   apply(s)       records one purchase in the state */

import { TOOLS, UNLOCKS, ABUNDANCE, REFINERIES, PERKS } from './content.js';
import { RESOURCES } from './tiles.js';
import { canAfford, pay, costText, abundanceCost } from './economy.js';

const REGISTRY = {};

function define(u) {
  if (REGISTRY[u.id]) throw new Error('Duplicate upgrade id: ' + u.id);
  REGISTRY[u.id] = { currency: 'inv', desc: '', ...u };
}

for (const id of Object.keys(TOOLS)) {
  const tool = TOOLS[id];
  define({
    id, family: 'tools', kind: 'tool', name: tool.name, icon: tool.icon, desc: tool.desc,
    max: tool.levels.length - 1,
    level: (s) => s.tools[id] - 1,
    cost: (s, lv) => tool.levels[lv + 1].cost,
    apply: (s) => { s.tools[id] += 1; }
  });
}

for (const res of RESOURCES) {
  const chain = REFINERIES[res];
  define({
    id: res, family: 'refining', kind: 'resup', name: chain.name, icon: chain.icon,
    max: chain.levels.length,
    level: (s) => s.resUp[res],
    cost: (s, lv) => chain.levels[lv].cost,
    apply: (s) => { s.resUp[res] += 1; }
  });
}

define({
  id: 'abundance', family: 'abundance', kind: 'abundance', name: ABUNDANCE.name, icon: ABUNDANCE.icon, desc: ABUNDANCE.desc,
  max: Infinity,
  level: (s) => s.abundanceLv,
  cost: (s) => abundanceCost(s),
  apply: (s) => { s.abundanceLv += 1; }
});

for (const id of Object.keys(UNLOCKS)) {
  const u = UNLOCKS[id];
  define({
    id, family: 'unlocks', kind: 'unlock', name: u.name, icon: u.icon, desc: u.desc,
    max: 1,
    level: (s) => (s.unlocks[id] ? 1 : 0),
    cost: () => u.cost,
    apply: (s) => { s.unlocks[id] = true; }
  });
}

for (const id of Object.keys(PERKS)) {
  const p = PERKS[id];
  define({
    id, family: 'perks', kind: 'perk', name: p.name, icon: p.icon, desc: p.desc, currency: 'insight',
    max: p.repeat ? Infinity : 1,
    level: (s) => s.perks[id],
    cost: (s, lv) => p.base + (p.repeat ? lv : 0),
    apply: (s) => { s.perks[id] += 1; }
  });
}

export const UPGRADES = REGISTRY;

// The progression map's families, in display order. `layer` separates what a
// world keeps from what survives an Embark.
export const PATH_FAMILIES = [
  { id: 'tools', layer: 'world', name: 'Tools', icon: '\u{1F9F0}' },
  { id: 'refining', layer: 'world', name: 'Refineries', icon: '⛏️' },
  { id: 'abundance', layer: 'world', name: 'Abundance Engine', icon: '✨' },
  { id: 'unlocks', layer: 'world', name: 'Unlocks & Blueprints', icon: '\u{1F4DC}' },
  { id: 'perks', layer: 'legacy', name: 'Perks', icon: '\u{1F570}️' }
].map((f) => ({ ...f, nodes: Object.keys(REGISTRY).filter((id) => REGISTRY[id].family === f.id) }));

/* --------------------------------------------------------------- buying */

export function upgradeLevel(s, id) {
  return REGISTRY[id].level(s);
}

export function isMaxed(s, id) {
  return upgradeLevel(s, id) >= REGISTRY[id].max;
}

// Price of the next purchase, or null once maxed. Insight prices are numbers;
// resource prices are { resource: amount } maps.
export function upgradeCost(s, id) {
  if (isMaxed(s, id)) return null;
  return REGISTRY[id].cost(s, upgradeLevel(s, id));
}

export function canBuy(s, id) {
  const cost = upgradeCost(s, id);
  if (cost === null) return false;
  return REGISTRY[id].currency === 'insight' ? s.insight >= cost : canAfford(s.inv, cost);
}

export function buy(s, id) {
  const u = REGISTRY[id];
  if (!u) return { ok: false, reason: 'Unknown upgrade' };
  const cost = upgradeCost(s, id);
  if (cost === null) return { ok: false, reason: u.max === 1 ? 'Already owned' : 'Maxed' };
  if (!canBuy(s, id)) {
    return { ok: false, reason: 'Need ' + (u.currency === 'insight' ? cost + ' Insight' : costText(cost)) };
  }
  if (u.currency === 'insight') s.insight -= cost;
  else pay(s.inv, cost);
  u.apply(s);
  return { ok: true, id, level: upgradeLevel(s, id) };
}

/* ------------------------------------------------------- progression map */

// owned = fully bought; ready = the next purchase is affordable now;
// partial = some progress, next not affordable; saving = nothing bought yet.
export function pathNode(s, id) {
  const u = REGISTRY[id];
  const level = upgradeLevel(s, id);
  const ready = canBuy(s, id);
  let state;
  if (level >= u.max) state = 'owned';
  else if (ready) state = 'ready';
  else state = level > 0 ? 'partial' : 'saving';
  return { key: id, kind: u.kind, name: u.name, icon: u.icon, level, max: u.max, canBuy: ready, cost: upgradeCost(s, id), state };
}

export function pathFamily(familyId) {
  return PATH_FAMILIES.find((f) => f.id === familyId) || null;
}

export function pathProgress(s, familyId) {
  const family = pathFamily(familyId);
  const nodes = family ? family.nodes.map((id) => pathNode(s, id)) : [];
  const owned = nodes.filter((n) => n.state === 'owned').length;
  return { owned, total: nodes.length, canBuy: nodes.some((n) => n.canBuy), allOwned: owned === nodes.length, nodes };
}
