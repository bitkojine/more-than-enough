/* Shared event-time hauling economy. The host advances a cheap clock; only
 * commands, queries and snapshots observe production. Structural/rate changes
 * explicitly start an epoch. Ordinary observations never visit all buildings.
 * Uses cumulative arithmetic, not repeated frame-sized floating additions. */
import { createProductionLedger } from './production-ledger.js';
import { createResourceLedger } from './resource-ledger.js';
import { attachEconomy, detachEconomy } from './economy-context.js';
import { haulingEconomyAvailable, haulsBuilding, usesDepots } from './logistics.js';
import { extractorCapacity } from './economy.js';
import { RESOURCES } from './tiles.js';
import { tileDist2 } from './coords.js';

const zero = () => Object.fromEntries(RESOURCES.map(r => [r, 0]));

export function createEventEconomy(state, { tickHz = 60, rateFor, trickleFor, owns }) {
  if (!haulingEconomyAvailable(state)) throw new Error('event-economy-mode');
  const account = createResourceLedger(state);
  const openedAt = state.time, playedAt = state.stats.playedMs;
  let tick = 0, epoch = 0, observed = -1, production, members, trickle, rates, buildingRates, counts;
  const offset = zero(); let engineOffset = 0;
  let covered = new Set();
  const waiting = new Map();
  let visualTick = 0, visualTiles, visible = null, lastSafeTick, mastery = null;
  const work = { observations: 0, rebuilds: 0, buildingVisits: 0, visualVisits: 0 };

  function configure() {
    work.rebuilds++;
    mastery = null;
    members = state.extractors.filter(e => owns(state, e));
    counts = new Map();
    covered = new Set(members.filter(e=>haulsBuilding(state,e)));
    const definitions = members.flatMap((e, order) => {
      work.buildingVisits++;
      counts.set(e.key, (counts.get(e.key) || 0) + 1);
      const rate=rateFor(state,e.key,e);
      if (!covered.has(e)) {
        const member={value:e.buffer,at:tick,rate,cap:extractorCapacity(state,e.key,e)};
        waiting.set(e,member);
        Object.defineProperty(e,'buffer',{enumerable:true,configurable:true,
          get:()=>Math.min(member.cap,member.value+(tick-member.at)*member.rate/tickHz),
          set:value=>{member.value=value;member.at=tick;}});
        return [];
      }
      // A newly built depot immediately takes already waiting whole units.
      // Legacy global mode still normalizes in its existing initial tick.
      if (usesDepots(state) && e.buffer>=1) {
        const n=Math.floor(e.buffer);account.credit('buildings',e.res,n);e.buffer-=n;
      }
      return [{ id: e, order, resource: e.res, rate, buffer: e.buffer }];
    });
    if (!Number.isFinite(trickleFor(state)) || definitions.some(d => !Number.isFinite(d.rate) ||
        d.rate < 0 || !Number.isFinite(d.buffer) || d.buffer < 0 || d.buffer >= 1)) return false;
    visualTiles = new Map(); visible = null; visualTick = tick;
    for (const d of definitions) {
      const e = d.id, key = e.x + ',' + e.y + ',' + e.z;
      let list = visualTiles.get(key);
      if (!list) { list = []; visualTiles.set(key, list); }
      list.push(d);
    }
    production = createProductionLedger(definitions, { tickHz, epoch: tick });
    epoch = tick; trickle = trickleFor(state); rates = zero(); buildingRates = zero();
    // Cached planner rates keep the legacy addition order (engine first).
    for (const r of RESOURCES) rates[r] = trickle;
    for (const e of members) { const rate=rateFor(state,e.key,e); rates[e.res]+=rate; buildingRates[e.res]+=rate; }
    // Stay well inside the integer-payout range. The ordinary step can settle
    // and return to the legacy economy before crossing this bound, rather
    // than throwing in an existing highly advanced saved world.
    const rate = definitions.reduce((sum, d) => sum + d.rate, 0);
    const budget = Number.MAX_SAFE_INTEGER / 2 - members.length - Object.values(offset).reduce((a, b) => a + b, 0);
    lastSafeTick = Math.min(Number.MAX_SAFE_INTEGER, tick + (rate > 0 ? Math.max(0, Math.floor(budget / rate * tickHz)) : Number.MAX_SAFE_INTEGER - tick));
    return true;
  }
  function settle() {
    if (observed === tick) return state;
    work.observations++;
    const made = production.advanceTo(tick), totals = {};
    for (const r of RESOURCES) totals[r] = offset[r] + (made[r] || 0);
    const engine = engineOffset + (tick - epoch) * trickle / tickHz;
    account.setStreams([{ name: 'production', source: 'buildings', totals },
      { name: 'trickle', source: 'engine', totals: Object.fromEntries(RESOURCES.map(r => [r, engine])) }]);
    observed = tick;
    return state;
  }
  function materializeBuffers() {
    for (const e of members) { work.buildingVisits++; if(covered.has(e)) e.buffer = production.buffer(e, tick); }
  }
  function restoreWaiting() {
    for(const e of waiting.keys()) {
      const value=e.buffer;
      Object.defineProperty(e,'buffer',{value,writable:true,enumerable:true,configurable:true});
    }
    waiting.clear();
  }
  function reconfigure() {
    settle(); materializeBuffers(); restoreWaiting();
    const made = production.advanceTo(tick);
    for (const r of RESOURCES) offset[r] += made[r] || 0;
    engineOffset += (tick - epoch) * trickle / tickHz;
    if (!configure()) { restoreWaiting(); detachEconomy(state); return; }
    observed = -1;
  }
  function emitVisualEvents() {
    const p = state.player, px = Math.floor(p.x), py = Math.floor(p.y);
    if (!visible || visible.x !== px || visible.y !== py || visible.z !== p.z) {
      const entries = [];
      for (let y = py - 12; y <= py + 12; y++) for (let x = px - 12; x <= px + 12; x++) {
        const list = visualTiles.get(x + ',' + y + ',' + p.z);
        if (list) entries.push(...list);
      }
      // Preserve building order for feedback independently of the spatial map.
      entries.sort((a, b) => a.order - b.order);
      visible = { x: px, y: py, z: p.z, entries };
    }
    for (const d of visible.entries) {
      work.visualVisits++;
      const e = d.id;
      if (tileDist2(p, e.x, e.y, e.z) > 144) continue;
      const amt = Math.floor(d.buffer + (tick - epoch) * d.rate / tickHz) -
        Math.floor(d.buffer + (visualTick - epoch) * d.rate / tickHz);
      if (amt > 0) state.events.push({ res: d.resource, amt, x: e.x, y: e.y, z: e.z });
    }
    visualTick = tick;
  }
  if (!configure()) throw new Error('event-economy-mode');
  const economy = {
    settle, reconfigure, emitVisualEvents,
    canAdvanceTicks(count) { return Number.isSafeInteger(count) && count >= 0 && tick + count <= lastSafeTick; },
    advanceTicks(count) {
      if (!economy.canAdvanceTicks(count)) throw new Error('event-economy-time');
      tick += count;
      state.time = openedAt + tick / tickHz;
      state.stats.playedMs = playedAt + tick * 1000 / tickHz;
    },
    credit(source, resource, amount) { settle(); account.credit(source, resource, amount); },
    canAfford(cost) { settle(); return account.canAfford(cost); },
    pay(cost) { settle(); return account.pay(cost); },
    productionRates() { return { ...rates }; },
    buildingRate(resource) { return buildingRates[resource]; },
    extractorCount(key) { return counts.get(key) || 0; },
    cacheMastery(value) { mastery = Object.freeze({ ...value }); },
    get mastery() { return mastery; },
    timeAt(at) { return openedAt + at / tickHz; },
    snapshot() { settle(); materializeBuffers(); return state; },
    stop() { settle(); materializeBuffers(); restoreWaiting(); detachEconomy(state); },
    get work() { return { ...work, production: production.work }; },
    get tick() { return tick; }
  };
  attachEconomy(state, economy);
  return economy;
}
