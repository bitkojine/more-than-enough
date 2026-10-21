/* Cumulative resource accounting: observing income more often cannot change
 * a balance through repeated floating-point additions. Commands add earnings
 * or expenses; continuous systems replace their cumulative stream totals. */
import { RESOURCES } from './tiles.js';

const SOURCES = ['hand', 'finds', 'buildings', 'engine'];

export function createResourceLedger(state) {
  const opening = {}, manual = {}, spent = {}, streams = new Map(), names = [];
  for (const r of RESOURCES) {
    opening[r] = { inv: state.inv[r], stats: state.stats[r], sources: { ...state.sources[r] } };
    manual[r] = Object.fromEntries(SOURCES.map(s => [s, 0])); spent[r] = 0;
  }
  function materialize() {
    for (const r of RESOURCES) {
      let gain = 0;
      for (const source of SOURCES) {
        let amount = manual[r][source];
        // Stream names have a deterministic order independent of insertion.
        for (const name of names) {
          const stream = streams.get(name);
          if (stream.source === source) amount += stream.totals[r] || 0;
        }
        state.sources[r][source] = opening[r].sources[source] + amount;
        gain += amount;
      }
      state.inv[r] = opening[r].inv + gain - spent[r];
      state.stats[r] = opening[r].stats + gain;
    }
    return state;
  }
  function check(amount) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error('resource-ledger-amount');
  }
  function credit(source, resource, amount) {
    if (!SOURCES.includes(source) || !RESOURCES.includes(resource)) throw new Error('resource-ledger-source');
    check(amount);
    manual[resource][source] += amount;
    materialize();
  }
  function setStream(name, source, totals) {
    if (!SOURCES.includes(source)) throw new Error('resource-ledger-source');
    const old = streams.get(name);
    if (old && old.source !== source) throw new Error('resource-ledger-stream');
    const next = {};
    for (const r of RESOURCES) {
      next[r] = totals[r] ?? 0; check(next[r]);
      if (old && next[r] < old.totals[r]) throw new Error('resource-ledger-backwards');
    }
    if (!old) { names.push(name); names.sort(); }
    streams.set(name, { source, totals: next });
    materialize();
  }
  function canAfford(cost) {
    return !!cost && Object.entries(cost).every(([r, amount]) => RESOURCES.includes(r) && Number.isFinite(amount) && amount >= 0 && state.inv[r] >= amount);
  }
  function pay(cost) {
    if (!canAfford(cost)) return false;
    for (const [r, amount] of Object.entries(cost)) spent[r] += amount;
    materialize(); return true;
  }
  return { credit, setStream, canAfford, pay, materialize };
}
