/* The earnings statement's history (Watch, 2026-10-19): what each resource
 * earned a second, noted as you play and kept per world on this phone, for
 * the charts. A sample is taken a minute apart, or sooner when income jumps
 * (a building put up, an upgrade bought), so each buy shows as a step. Once
 * the record is full, every other one of its older half goes, so it reaches
 * further back the longer you play, at the same size. */

import * as Core from '../core/index.js';

const STORE = 'mte.income.';
export const MAX_SAMPLES = 480;
const EVERY = 60000;  // ms between samples while income holds steady
const SOON = 3000;    // ms after the last sample a jump in income is noted
const JUMP = 0.02;    // a change in any resource's income of this share is a jump

const localStore = () => { try { return globalThis.localStorage; } catch { return null; } };
const worldOf = (s) => s.shared || 'solo.' + s.seed;
const round = (n) => (n < 100 ? Math.round(n * 1000) / 1000 : Math.round(n));

export function createIncome({ store = localStore() } = {}) {
  let world = null;
  let samples = []; // [ms since 1970, rate of each of Core.RESOURCES...]

  function load(s) {
    const w = worldOf(s);
    if (w === world) return;
    world = w;
    samples = [];
    try {
      const saved = JSON.parse(store?.getItem(STORE + w) || '[]');
      if (Array.isArray(saved)) samples = saved.filter((p) => Array.isArray(p) && p.length === Core.RESOURCES.length + 1 && p.every(Number.isFinite));
    } catch { /* unreadable: start afresh */ }
  }

  function save() {
    try { store?.setItem(STORE + world, JSON.stringify(samples)); } catch { /* full or blocked: kept for this visit only */ }
  }

  function thin() {
    const half = samples.length >> 1;
    samples = samples.slice(0, half).filter((_, i) => i % 2 === 0).concat(samples.slice(half));
  }

  return {
    // Notes the income of world `s` at `now` if it's time to.
    note(s, now) {
      load(s);
      const rates = Core.productionRates(s);
      const last = samples[samples.length - 1];
      const jumped = last && Core.RESOURCES.some((r, i) => Math.abs(rates[r] - last[i + 1]) > JUMP * Math.max(last[i + 1], 0.01));
      if (last && now - last[0] < EVERY && !(jumped && now - last[0] >= SOON)) return false;
      samples.push([now, ...Core.RESOURCES.map((r) => round(rates[r]))]);
      if (samples.length > MAX_SAMPLES) thin();
      save();
      return true;
    },
    // Resource `res`'s history in world `s`: [{at, rate}], oldest first.
    history(s, res) {
      load(s);
      const i = Core.RESOURCES.indexOf(res) + 1;
      return samples.map((p) => ({ at: p[0], rate: p[i] }));
    }
  };
}
