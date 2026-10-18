/* Light: day and night, when it's dark, and the battery of the phone or
 * laptop in your hands. Its screen is what lights the dark, and that runs
 * the battery down; water power you build on the surface (PROPS with
 * `charge`) fills it up again. A low battery only shrinks your light: it
 * never stops you doing anything. Nothing charges or drains while you're
 * away. */

import { SURFACE, packKey } from './coords.js';
import { PROPS, DAY_LENGTH, BATTERY_LIFE, BATTERY_LOW, BATTERY_DIM, CHARGE_TIME, CHARGE_RANGE } from './content.js';

// 1 at time 0 (noon) ... 0 at DAY_LENGTH / 2 (midnight).
export function daylight(t) {
  return 0.5 + 0.5 * Math.cos((t / DAY_LENGTH) * Math.PI * 2);
}

// Underground is dark; so is the forest at night. Then the screen of what
// the wanderer plays on (phone or laptop) is what lights the way.
export function isDark(s) {
  return s.player.z < SURFACE || daylight(s.time) < 0.6;
}

// Whether a charger of `kind` works at game time `time`: solar only by day.
export function charging(kind, time) {
  const c = PROPS[kind] && PROPS[kind].charge;
  return c === 'always' || (c === 'day' && daylight(time) >= 0.6);
}

// The nearest charger within CHARGE_RANGE of you that works now
// ({x, y, kind}), or null. Anyone's charger charges anyone.
export function chargerNear(s) {
  const p = s.player;
  if (p.z !== SURFACE) return null;
  const r = Math.ceil(CHARGE_RANGE), px = Math.floor(p.x), py = Math.floor(p.y);
  let best = null, bestD = CHARGE_RANGE * CHARGE_RANGE;
  for (let y = py - r; y <= py + r; y++) {
    for (let x = px - r; x <= px + r; x++) {
      const kind = s.world.props.get(packKey(x, y, SURFACE));
      if (!kind || !charging(kind, s.time)) continue;
      const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
      if (d <= bestD) { bestD = d; best = { x, y, kind }; }
    }
  }
  return best;
}

// One tick: by a working charger the battery fills; in the dark it drains.
export function tickBattery(s, dt) {
  if (chargerNear(s)) s.battery = Math.min(1, s.battery + dt / CHARGE_TIME);
  else if (isDark(s)) s.battery = Math.max(0, s.battery - dt / BATTERY_LIFE);
}

// How far your light reaches, as a share of a full battery's: 1 down to
// BATTERY_LOW, then shrinking to BATTERY_DIM when it's flat. Daylight
// needs no screen, so by day it's always 1.
export function lightScale(s) {
  if (!isDark(s) || s.battery >= BATTERY_LOW) return 1;
  return BATTERY_DIM + (1 - BATTERY_DIM) * Math.max(0, s.battery) / BATTERY_LOW;
}
