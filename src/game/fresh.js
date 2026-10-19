/* NEW on Build and Upgrade (Watch, 2026-10-19). Once something there you
 * haven't been able to afford before can be had (a building, the next one
 * of a kind, an upgrade's next level), the button says NEW until you open
 * that sheet, and the rows that were new say so while it stays open.
 * Walking, spending or waiting never take it away: only looking does, or
 * the thing being bought (by you or Auto-play). What you've seen is kept per
 * world on this phone, so a reload or an update doesn't bring it all back. */

import * as Core from '../core/index.js';

const STORE = 'mte.seen.';
export const SHEETS = ['build', 'upgrades'];

// Some private modes throw on merely touching localStorage.
const localStore = () => { try { return globalThis.localStorage; } catch { return null; } };

// How far along thing `id` on `sheet` is: the next one of a building, an
// upgrade's level. A prop (water power, mine lights) is new only once.
function level(s, sheet, id) {
  if (sheet === 'upgrades') return Core.upgradeLevel(s, id);
  return Object.hasOwn(Core.PROPS, id) ? 0 : Core.extractorCount(s, id);
}

// Everything Build and Upgrade let you have right now: [sheet, id]. Where
// you stand doesn't matter (that's for the sheet to say); props count once
// you've been where they go.
export function offers(s) {
  const out = [];
  for (const k of [...Core.DEPOSIT_EXTRACTORS, ...Core.CONVERTERS]) {
    const def = Core.EXTRACTORS[k];
    if ((!def.unlock || s.unlocks[def.unlock]) && Core.canAfford(s.inv, Core.extractorCost(s, k))) out.push(['build', k]);
  }
  for (const [k, def] of Object.entries(Core.PROPS)) {
    const been = def.on === 'tunnel' ? s.underground.deepest < Core.SURFACE : s.tools.boots >= Core.GEAR.water;
    if (been && Core.canAfford(s.inv, def.cost)) out.push(['build', k]);
  }
  for (const f of Core.PATH_FAMILIES) {
    if (f.layer === 'world') for (const id of f.nodes) if (Core.canBuy(s, id)) out.push(['upgrades', id]);
  }
  return out;
}

const worldOf = (s) => s.shared || 'solo.' + s.seed;

export function createFresh({ store = localStore() } = {}) {
  let world = null;
  let seen = {};      // 'sheet:id' -> the highest level seen affordable
  let waiting = {};   // 'sheet:id' -> level, not looked at yet
  let showing = null; // { sheet, keys: Map('sheet:id' -> level) } while a sheet is open

  function save() {
    try { store && store.setItem(STORE + world, JSON.stringify(seen)); } catch { /* full or blocked: shown again next time */ }
  }

  // Another world: its own record. One never recorded (every world before
  // this, or storage off) starts with what's affordable now as seen, so
  // nobody gets a burst of NEW for things they've long had.
  function load(s) {
    const w = worldOf(s);
    if (w === world) return;
    world = w; waiting = {}; showing = null;
    let kept = null;
    try { kept = JSON.parse(store && store.getItem(STORE + w)); } catch { kept = null; }
    seen = kept && typeof kept === 'object' ? kept : {};
    if (!kept) {
      for (const [sheet, id] of offers(s)) seen[sheet + ':' + id] = level(s, sheet, id);
      save();
    }
  }

  const unseen = (key, lv) => !(seen[key] >= lv);
  // Still the level it was new at (not bought since).
  const current = (s, key, lv) => { const [sheet, id] = key.split(':'); return level(s, sheet, id) === lv; };

  return {
    // Which buttons say NEW: something waiting on a sheet that isn't open.
    check(s, openSheet = null) {
      load(s);
      if (showing && showing.sheet !== openSheet) showing = null;
      for (const [sheet, id] of offers(s)) {
        if (sheet === openSheet) continue;
        const key = sheet + ':' + id, lv = level(s, sheet, id);
        if (unseen(key, lv)) waiting[key] = lv;
      }
      for (const key of Object.keys(waiting)) if (!current(s, key, waiting[key])) delete waiting[key];
      const keys = Object.keys(waiting);
      return Object.fromEntries(SHEETS.map((sheet) => [sheet, keys.some((k) => k.startsWith(sheet + ':'))]));
    },

    // `sheet` is open: what's new there counts as seen, and the ids to tag
    // while it stays open.
    see(s, sheet) {
      load(s);
      if (!showing || showing.sheet !== sheet) showing = { sheet, keys: new Map() };
      let changed = false;
      for (const key of Object.keys(waiting)) {
        if (!key.startsWith(sheet + ':')) continue;
        showing.keys.set(key, waiting[key]);
        delete waiting[key];
      }
      for (const [on, id] of offers(s)) {
        const key = on + ':' + id, lv = level(s, on, id);
        if (on !== sheet || !unseen(key, lv)) continue;
        showing.keys.set(key, lv);
      }
      for (const [key, lv] of showing.keys) {
        if (unseen(key, lv)) { seen[key] = lv; changed = true; }
      }
      if (changed) save();
      const ids = new Set();
      for (const [key, lv] of showing.keys) if (current(s, key, lv)) ids.add(key.slice(sheet.length + 1));
      return ids;
    }
  };
}
