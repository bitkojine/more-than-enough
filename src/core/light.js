import { contentLocked } from './progression.js';
/* Light: day and night, when it's dark, and the battery of the lantern you
 * carry. It is what lights the dark, and that runs the battery down; water power you build on the surface (PROPS with
 * `charge`) fills it up again. A low battery only shrinks your light: it
 * never stops you doing anything. Nothing charges or drains while you're
 * away. */

import {atInteraction} from './interaction.js';
import { SURFACE, packKey } from './coords.js';
import { PROPS, DAY_LENGTH, BATTERY_LIFE, BATTERY_LOW, BATTERY_DIM, CHARGE_TIME, CHARGE_RANGE } from './content.js';
import { economyForState } from './economy-context.js';

// One authoritative carried source for simulation, battery, UI and rendering.
// Paused flares remain saved but do not take the lantern's active slot.
export function activeCarriedLight(s) {
  if(!contentLocked(s,'flare') && s.flare>0)return 'flare';
  return !s.cultivation || s.cultivation.lantern ? 'lantern' : null;
}
export function normalizeCarriedLight(s) {
  if(s.cultivation && activeCarriedLight(s)==='flare')s.cultivation.lantern=false;
}

// 1 at time 0 (noon) ... 0 at DAY_LENGTH / 2 (midnight).
export function daylight(t) {
  return 0.5 + 0.5 * Math.cos((t / DAY_LENGTH) * Math.PI * 2);
}

// The daylight a solar panel needs; below it the forest is dark.
export const SOLAR_LIGHT = 0.6;
// The daylight that reaches crystal in the open in a crystal world
// (cultivation.js), and cracks a carried crystal or the heart.
export const SUN_CRACKS = 0.3;

// Underground is dark; so is the forest at night. Then your lantern lights
// the way.
export function isDark(s, time = s.time) {
  return s.player.z < SURFACE || daylight(time) < SOLAR_LIGHT;
}

// Whether a charger of `kind` works at game time `time`: solar only by day.
export function charging(kind, time) {
  const c = PROPS[kind] && PROPS[kind].charge;
  return c === 'always' || (c === 'day' && daylight(time) >= SOLAR_LIGHT);
}

// The sun clock on the gear (docs/ui.md): the part of each day when
// daylight is at least `level` is centred on noon and reaches `half` seconds
// either side of it. `up` says whether it's that part now, `left` the
// seconds until that changes (to sunset while up, to sunrise while not),
// and `phase` how far through the day it is, 0 at noon to 1.
export function sunWindow(time, level = SOLAR_LIGHT) {
  const half = (Math.acos(2 * level - 1) / (2 * Math.PI)) * DAY_LENGTH;
  const p = ((time % DAY_LENGTH) + DAY_LENGTH) % DAY_LENGTH;
  const up = p <= half || p >= DAY_LENGTH - half;
  const left = !up ? DAY_LENGTH - half - p : p <= half ? half - p : DAY_LENGTH - p + half;
  return { up, left, half, phase: p / DAY_LENGTH };
}

// Every charger on the tiles around you that CHARGE_RANGE could reach,
// working or not ([{x, y, kind}]), kept until you or the props move.
const chargerCandidates = new WeakMap();
function chargersAround(s, work) {
  const p = s.player;
  const r = Math.ceil(CHARGE_RANGE), px = Math.floor(p.x), py = Math.floor(p.y);
  const props = s.world.props;
  let cached = chargerCandidates.get(s);
  if (!cached || typeof props.revision !== 'number' || cached.props !== props ||
      cached.revision !== props.revision || cached.x !== px || cached.y !== py) {
    const entries = [];
    for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) {
      if (work) work.lookups = (work.lookups || 0) + 1;
      const kind = props.get(packKey(x, y, SURFACE));
      if (PROPS[kind]?.charge) entries.push({ x, y, kind });
    }
    cached = { props, revision: props.revision, x: px, y: py, entries };
    chargerCandidates.set(s, cached);
  }
  return cached.entries;
}

const dist2 = (p, { x, y }) => (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;

// The nearest charger within CHARGE_RANGE of you that works now
// ({x, y, kind}), or null. Anyone's charger charges anyone.
export function chargerNear(s, time = s.time, work = null) {
  const p = s.player;
  if (p.z !== SURFACE || !s.world.props.size) return null;
  let best = null, bestD = CHARGE_RANGE * CHARGE_RANGE;
  for (const candidate of chargersAround(s, work)) {
    if (work) work.candidates = (work.candidates || 0) + 1;
    const { x, y, kind } = candidate;
    if (!charging(kind, time)||!atInteraction(s,x,y)) continue;
    const d = dist2(p, candidate);
    if (d <= bestD) { bestD = d; best = { x, y, kind }; }
  }
  return best;
}

// Whether you're in reach of a solar panel, so that when the sun charges
// matters: by day or not, and with no water wheel in reach, which charges
// at every hour anyway.
export function solarInReach(s) {
  const p = s.player;
  if (p.z !== SURFACE || !s.world.props.size) return false;
  let solar = false;
  for (const c of chargersAround(s, null)) {
    if (!atInteraction(s,c.x,c.y)) continue;
    const kind = PROPS[c.kind].charge;
    if (kind === 'always') return false;
    if (kind === 'day') solar = true;
  }
  return solar;
}

// One tick: by a working charger the battery fills; in the dark it drains.
export function tickBattery(s, dt) {
  const economy = economyForState(s);
  if (economy) { tickEventBattery(s, economy, Math.round(dt * 60)); return; }
  if (chargerNear(s)) s.battery = Math.min(1, s.battery + dt / CHARGE_TIME);
  else if (isDark(s) && activeCarriedLight(s)==='lantern') s.battery = Math.max(0, s.battery - dt / BATTERY_LIFE);
}

const batteryEpochs = new WeakMap();

// Cumulative battery intervals make a quiet 15-tick batch identical to fifteen
// individual ticks. Walking still evaluates the current location each tick.
// step's 0.25-second maximum is shorter than either daylight interval, so at
// most one day/night transition can occur inside a stationary batch.
function tickEventBattery(s, economy, count) {
  if (!count) return;
  const end = economy.tick, start = end - count;
  let epoch = batteryEpochs.get(s);
  if (!epoch || epoch.economy !== economy || epoch.last !== start || epoch.value !== s.battery) {
    epoch = { economy, at: start, opening: s.battery, rate: null, last: start, value: s.battery };
    batteryEpochs.set(s, epoch);
  }
  const rateAt = tick => {
    const time = economy.timeAt(tick);
    return chargerNear(s, time) ? 1 / CHARGE_TIME : isDark(s, time) && activeCarriedLight(s)==='lantern' ? -1 / BATTERY_LIFE : 0;
  };
  const apply = (first, last, rate) => {
    if (rate !== epoch.rate) { epoch.at = first - 1; epoch.opening = epoch.value; epoch.rate = rate; }
    epoch.value = Math.max(0, Math.min(1, epoch.opening + (last - epoch.at) * rate / 60));
    epoch.last = last;
  };
  const firstRate = rateAt(start + 1), lastRate = count === 1 ? firstRate : rateAt(end);
  if (firstRate === lastRate) apply(start + 1, end, firstRate);
  else {
    let lo = start + 2, hi = end;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (rateAt(mid) === firstRate) lo = mid + 1; else hi = mid;
    }
    apply(start + 1, lo - 1, firstRate); apply(lo, end, lastRate);
  }
  s.battery = epoch.value;
}

// How far your light reaches, as a share of a full battery's: 1 down to
// BATTERY_LOW, then shrinking to BATTERY_DIM when it's flat. Daylight
// needs no screen, so by day it's always 1.
export function lightScale(s) {
  if (!isDark(s) || s.battery >= BATTERY_LOW) return 1;
  return BATTERY_DIM + (1 - BATTERY_DIM) * Math.max(0, s.battery) / BATTERY_LOW;
}
