/* The earnings statement: what makes each resource and how fast, what the
 * world has cost you so far, and how soon each thing earns its price back.
 *
 * Everything here is worked out from the state as it stands, nothing is
 * recorded: every price is fixed by level, so what you've spent is the sum of
 * the prices of what you own (at today's prices), in solo and shared worlds
 * alike. */

import { EXTRACTORS, PROPS, ABUNDANCE, EXTRACTOR_GROWTH, HAND_SHARE, REFINERIES, TOOLS } from './content.js';
import { RESOURCES } from './tiles.js';
import {
  refineryMult, overclockMult, abundanceMult, legacyMult, productionMult, abundanceTrickle,
  extractorRate, placementGain, productionRates, ownBuilding, toolStat, scaleCost, extractorCost, abundanceCost
} from './economy.js';
import { buildTarget } from './actions.js';
import { UPGRADES, PATH_FAMILIES, upgradeLevel } from './upgrades.js';

const zero = () => Object.fromEntries(RESOURCES.map((r) => [r, 0]));

function add(into, cost, times = 1) {
  for (const r in cost) into[r] = (into[r] || 0) + cost[r] * times;
  return into;
}

/* ------------------------------------------------------------- income */

// What each resource earns a second, line by line: one line per kind of
// building you own (how many, what one makes, what they all make) and the
// Abundance Engine's trickle; `mult` is every multiplier behind the
// buildings' rate, and `hand` what one gather brings.
export function incomeStatement(s) {
  const out = {};
  for (const res of RESOURCES) {
    const lines = [];
    for (const key of Object.keys(EXTRACTORS)) {
      if (EXTRACTORS[key].res !== res) continue;
      const members = s.extractors.filter(e => e.key === key && ownBuilding(s,e));
      const count = members.length;
      if (!count) continue;
      const outputs = members.map(e => extractorRate(s,key,e));
      const rate = outputs.reduce((n,v) => n+v,0);
      lines.push({ key, count, each: rate / count, rate, average: outputs.some(v => v !== outputs[0]) });
    }
    const engine = abundanceTrickle(s);
    if (engine > 0) lines.push({ key: 'engine', count: s.abundanceLv, each: legacyMult(s), rate: engine });
    out[res] = {
      rate: lines.reduce((n, l) => n + l.rate, 0),
      lines,
      mult: { refinery: refineryMult(s, res), overclock: overclockMult(s), abundance: abundanceMult(s), legacy: legacyMult(s), total: productionMult(s, res) },
      hand: toolStat(s, res === 'mycelium' ? 'basket' : 'pickaxe').yield + HAND_SHARE * lines.filter((l) => l.key !== 'engine').reduce((n, l) => n + l.rate, 0)
    };
  }
  return out;
}

/* ----------------------------------------------------------- spending */

// What you own cost: buildings by kind, then each upgrade family, then the
// props you put down (in your own world; a shared world's are everyone's).
// Each entry is {id, cost: {res: amount}}, only those that cost something.
export function spendingStatement(s) {
  const out = [];
  const buildings = {};
  for (const key of Object.keys(EXTRACTORS)) {
    const n = s.extractors.filter((e) => e.key === key && ownBuilding(s, e)).length;
    const cost = zero();
    for (let i = 0; i < n; i++) add(cost, scaleCost(EXTRACTORS[key].baseCost, Math.pow(EXTRACTOR_GROWTH, i)));
    if (n) buildings[key] = cost;
  }
  out.push({ id: 'buildings', cost: Object.values(buildings).reduce((a, c) => add(a, c), zero()), parts: buildings });
  for (const f of PATH_FAMILIES) {
    if (f.layer !== 'world') continue;
    const parts = {};
    for (const id of f.nodes) {
      const u = UPGRADES[id], lv = upgradeLevel(s, id), cost = zero();
      for (let i = 0; i < lv; i++) add(cost, id === 'abundance' ? scaleCost(ABUNDANCE.baseCost, Math.pow(ABUNDANCE.growth, i)) : u.cost(s, i));
      if (lv) parts[id] = cost;
    }
    out.push({ id: f.id, cost: Object.values(parts).reduce((a, c) => add(a, c), zero()), parts });
  }
  if (!s.shared) {
    const parts = {};
    for (const kind of s.world.props.values()) if (PROPS[kind]) add(parts[kind] ??= zero(), PROPS[kind].cost);
    out.push({ id: 'props', cost: Object.values(parts).reduce((a, c) => add(a, c), zero()), parts });
  }
  return out.filter((c) => RESOURCES.some((r) => c.cost[r] > 0));
}

// Everything spent, per resource.
export function totalSpent(s) {
  return spendingStatement(s).reduce((a, c) => add(a, c.cost), zero());
}

/* ---------------------------------------------------------------- ROI */

const TAPS = 4; // gathers a second, holding Gather

// What a resource is worth, as how fast you come by it a second: your income
// of it, or holding Gather for it when that's faster (so the first building of
// a kind, with no income yet, still has a worth).
export function worthRates(s) {
  const rates = productionRates(s);
  for (const r of RESOURCES) rates[r] = Math.max(rates[r], TAPS * toolStat(s, r === 'mycelium' ? 'basket' : 'pickaxe').yield);
  return rates;
}

// A price as seconds of your own income (worthRates): each resource counts
// as the time it takes you to come by that much, so what you make little of
// is worth more.
export function costSeconds(cost, rates) {
  let sec = 0;
  for (const r in cost) if (cost[r] > 0) sec += cost[r] / rates[r];
  return sec;
}

// How long something adding `gain` ({res: per second}) takes to earn back
// `cost`, both valued in seconds of your income (Watch's choice, 2026-10-19).
export function payback(cost, gain, rates) {
  let worth = 0;
  for (const r in gain) if (gain[r] > 0) worth += gain[r] / rates[r];
  return worth > 0 ? costSeconds(cost, rates) / worth : Infinity;
}

function buildingRates(s) {
  const out = zero();
  for (const e of s.extractors) if (ownBuilding(s, e)) out[e.res] += extractorRate(s, e.key, e);
  return out;
}

const scaled = (rates, f) => Object.fromEntries(RESOURCES.map((r) => [r, rates[r] * f]));

// Everything you could buy next that adds to your income, with what it costs,
// what it adds a second and how soon it pays that back, quickest first:
// another building of each kind you can put up, the next refinery level, the
// Overclock and the Abundance Engine. ({kind: 'building'|'upgrade', id, cost,
// gain, payback})
export function bestBuys(s) {
  const rates = worthRates(s), made = buildingRates(s), out = [];
  for (const key of Object.keys(EXTRACTORS)) {
    const def = EXTRACTORS[key];
    if (def.depot) continue;
    if (def.unlock && !s.unlocks[def.unlock]) continue;
    if (def.res in s.discovered && !s.discovered[def.res] && def.tile !== null) continue;
    out.push({ kind: 'building', id: key, cost: extractorCost(s, key), gain: { [def.res]: placementGain(s, key, buildTarget(s, key)) } });
  }
  for (const res of RESOURCES) {
    const next = REFINERIES[res].levels[s.resUp[res]];
    if (next) out.push({ kind: 'upgrade', id: res, cost: next.cost, gain: { [res]: made[res] * (next.mult - 1) } });
  }
  const oc = TOOLS.overclock.levels;
  if (s.tools.overclock < oc.length) out.push({ kind: 'upgrade', id: 'overclock', cost: oc[Math.max(1, s.tools.overclock)].cost, gain: scaled(made, oc[Math.max(1, s.tools.overclock)].mult / overclockMult(s) - 1) });
  const engine = scaled(made, ABUNDANCE.prodMult - 1);
  for (const r of RESOURCES) engine[r] += legacyMult(s);
  out.push({ kind: 'upgrade', id: 'abundance', cost: abundanceCost(s), gain: engine });
  for (const b of out) b.payback = payback(b.cost, b.gain, rates);
  return out.filter((b) => b.payback < Infinity).sort((a, b) => a.payback - b.payback);
}

// How soon what you already own of each kind of building earns back what it
// all cost (the same measure as bestBuys), by building key.
export function ownedPayback(s) {
  const rates = worthRates(s), out = {};
  const spent = spendingStatement(s).find((c) => c.id === 'buildings');
  for (const key in spent?.parts || {}) {
    out[key] = payback(spent.parts[key], { [EXTRACTORS[key].res]: s.extractors.filter(e => e.key === key && ownBuilding(s, e)).reduce((v,e) => v + extractorRate(s, key, e), 0) }, rates);
  }
  return out;
}
