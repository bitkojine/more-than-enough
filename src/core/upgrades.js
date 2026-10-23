/* Everything the player can buy that isn't a building, in one registry.
 *
 * Each upgrade has the same shape, so buying, the progression map and the
 * upgrade sheet all share one code path:
 *   level(s)       purchases made so far (0 = none)
 *   max            purchases available (Infinity for repeatables)
 *   cost(s, lv)    price of purchase number lv + 1
 *   currency       'inv' (resources) or 'insight'
 *   apply(s)       records one purchase in the state */

import { usesDepots, hasDepot } from './logistics.js';
import { economyForState } from './economy-context.js';
import { TOOLS, UNLOCKS, ABUNDANCE, REFINERIES, PERKS, EMBARK_ABUNDANCE } from './content.js';
import { RESOURCES } from './tiles.js';
import { canAfford, pay, costText, abundanceCost } from './economy.js';
import { noteAct } from './acts.js';
import { t } from '../i18n/i18n.js';

const REGISTRY = {};

function define(u) {
  if (REGISTRY[u.id]) throw new Error('Duplicate upgrade id: ' + u.id);  // i18n-ok: a bug in the game's own tables, for its developers
  REGISTRY[u.id] = { currency: 'inv', desc: '', ...u };
}

for (const id of Object.keys(TOOLS)) {
  const tool = TOOLS[id];
  define({
    id, family: 'tools', kind: 'tool', name: tool.name, look: 'tool.' + id, desc: tool.desc,
    max: tool.levels.length - 1,
    level: (s) => Math.max(0, s.tools[id] - 1),
    cost: (s, lv) => tool.levels[lv + 1].cost,
    apply: (s) => { s.tools[id] = Math.max(1, s.tools[id]) + 1; }
  });
}

for (const res of RESOURCES) {
  const chain = REFINERIES[res];
  define({
    id: res, family: 'refining', kind: 'resup', name: chain.name, look: 'refinery.' + res,
    max: chain.levels.length,
    level: (s) => s.resUp[res],
    cost: (s, lv) => chain.levels[lv].cost,
    apply: (s) => { s.resUp[res] += 1; }
  });
}

define({
  id: 'abundance', family: 'abundance', kind: 'abundance', name: ABUNDANCE.name, look: 'engine.abundance', desc: ABUNDANCE.desc,
  max: Infinity,
  level: (s) => s.abundanceLv,
  cost: (s) => abundanceCost(s),
  apply: (s) => { s.abundanceLv += 1; }
});

for (const id of Object.keys(UNLOCKS)) {
  const u = UNLOCKS[id];
  define({
    id, family: 'unlocks', kind: 'unlock', name: u.name, look: 'unlock.' + id, desc: u.desc,
    max: 1,
    level: (s) => id==='logistics' && usesDepots(s) ? (hasDepot(s) ? 1 : 0) : (s.unlocks[id] ? 1 : 0),
    cost: () => u.cost,
    apply: (s) => { s.unlocks[id] = true; }
  });
}

for (const id of Object.keys(PERKS)) {
  const p = PERKS[id];
  define({
    id, retired: p.retired === true, family: 'perks', kind: 'perk', name: p.name, look: 'perk.' + id, desc: p.desc, currency: 'insight',
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
  { id: 'tools', layer: 'world' },
  { id: 'refining', layer: 'world' },
  { id: 'abundance', layer: 'world' },
  { id: 'unlocks', layer: 'world' },
  { id: 'perks', layer: 'legacy' }
].map((f) => ({ ...f, name: t('path.' + f.id), look: 'path.' + f.id, nodes: Object.keys(REGISTRY).filter((id) => REGISTRY[id].family === f.id) }));

// The world upgrades that can be finished (Abundance never is).
const FINITE = () => PATH_FAMILIES.filter((f) => f.layer === 'world' && f.id !== 'abundance').flatMap((f) => f.nodes);

// How far through this world's upgrades you are: every tool, refinery and
// unlock level bought, plus Abundance Engine levels up to EMBARK_ABUNDANCE.
export function worldMastery(s) {
  const indexed = economyForState(s);
  if (indexed?.mastery) return { ...indexed.mastery };
  let done = 0, total = 0;
  for (const id of FINITE()) { done += upgradeLevel(s, id); total += REGISTRY[id].max; }
  const result = { done: done + Math.min(s.abundanceLv, EMBARK_ABUNDANCE), total: total + EMBARK_ABUNDANCE };
  indexed?.cacheMastery(result);
  return result;
}

// Every world upgrade done: the first condition for embarking.
export function worldMastered(s) {
  const cached = economyForState(s)?.mastery;
  if (cached) return cached.done >= cached.total;
  const m = worldMastery(s);
  return m.done >= m.total;
}

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
  if(s.cultivation&&!['basket','pickaxe','boots'].includes(id))return false;
  if(id==='logistics' && usesDepots(s))return false;
  if (REGISTRY[id]?.retired) return false;
  const cost = upgradeCost(s, id);
  if (cost === null) return false;
  return REGISTRY[id].currency === 'insight' ? s.insight >= cost : canAfford(s.inv, cost);
}

export function buy(s, id) {
  const u = Object.hasOwn(REGISTRY, id) ? REGISTRY[id] : null;
  if (!u) return { ok: false, reason: t('reason.unknownUpgrade') };
  if (u.retired) return { ok: false, reason: t('reason.retiredUpgrade') };
  if (id==='logistics' && usesDepots(s)) return {ok:false,reason:t('reason.localLogistics')};
  const cost = upgradeCost(s, id);
  if (cost === null) return { ok: false, reason: t(u.max === 1 ? 'reason.owned' : 'reason.maxed') };
  if (!canBuy(s, id)) {
    return { ok: false, reason: t('reason.need', { cost: u.currency === 'insight' ? t('cost.insight', { n: cost }) : costText(cost) }) };
  }
  noteAct(s, 'u', id);
  if (u.currency === 'insight') s.insight -= cost;
  else pay(s.inv, cost);
  u.apply(s);
  economyForState(s)?.reconfigure();
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
  return { key: id, kind: u.kind, name: id==='logistics'&&usesDepots(s)?t('building.depot'):u.name, look: 'unlock.' + id, level, max: u.max, canBuy: ready, cost: upgradeCost(s, id), state };
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
