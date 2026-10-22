/* Light: day and night, when it's dark, and the battery of the phone or
 * laptop in your hands. Its screen is what lights the dark, and that runs
 * the battery down; water power you build on the surface (PROPS with
 * `charge`) fills it up again. A low battery only shrinks your light: it
 * never stops you doing anything. Nothing charges or drains while you're
 * away. */

import { SURFACE, packKey } from './coords.js';
import { PROPS, DAY_LENGTH, BATTERY_LIFE, BATTERY_LOW, BATTERY_DIM, CHARGE_TIME, CHARGE_RANGE } from './content.js';
import { economyForState } from './economy-context.js';

// 1 at time 0 (noon) ... 0 at DAY_LENGTH / 2 (midnight).
export function daylight(t) {
  return 0.5 + 0.5 * Math.cos((t / DAY_LENGTH) * Math.PI * 2);
}

// Underground is dark; so is the forest at night. Then the screen of what
// the wanderer plays on (phone or laptop) is what lights the way.
export function isDark(s, time = s.time) {
  return s.player.z < SURFACE || daylight(time) < 0.6;
}

// Whether a charger of `kind` works at game time `time`: solar only by day.
export function charging(kind, time) {
  const c = PROPS[kind] && PROPS[kind].charge;
  return c === 'always' || (c === 'day' && daylight(time) >= 0.6);
}

// The nearest charger within CHARGE_RANGE of you that works now
// ({x, y, kind}), or null. Anyone's charger charges anyone.
const chargerCandidates = new WeakMap();
export function chargerNear(s, time = s.time, work = null) {
  const p = s.player;
  if (p.z !== SURFACE || !s.world.props.size) return null;
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
  let best = null, bestD = CHARGE_RANGE * CHARGE_RANGE;
  for (const candidate of cached.entries) {
    if (work) work.candidates = (work.candidates || 0) + 1;
    const { x, y, kind } = candidate;
    if (!charging(kind, time)) continue;
    const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
    if (d <= bestD) { bestD = d; best = { x, y, kind }; }
  }
  return best;
}

// One tick: by a working charger the battery fills; in the dark it drains.
export function tickBattery(s, dt) {
  const economy = economyForState(s);
  if (economy) { tickEventBattery(s, economy, Math.round(dt * 60)); return; }
  if (chargerNear(s)) s.battery = Math.min(1, s.battery + dt / CHARGE_TIME);
  else if (isDark(s)) s.battery = Math.max(0, s.battery - dt / BATTERY_LIFE);
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
    return chargerNear(s, time) ? 1 / CHARGE_TIME : isDark(s, time) ? -1 / BATTERY_LIFE : 0;
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
