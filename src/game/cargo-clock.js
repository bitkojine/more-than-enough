/* What the clock over Mica, and over a chamber or a heart shelter, says
 * (Watch, 2026-11-01: bars suck, a timer ticking down is more engaging).
 * The times come from the rules (src/core/cultivation-forecast.js); this only
 * words them. `tone` picks the colour: 'calm', 'warn' or 'danger'. */
import * as Core from '../core/index.js';
import { fmtClock } from './format.js';
import { t, number } from '../i18n/i18n.js';

// What Mica carries: a countdown while something is running out, otherwise
// how sound it is. Null when nothing that can crack is carried.
export function cargoClock(s) {
  const f = Core.cargoForecast(s);
  if (!f) return null;
  if (f.state === 'cracking' && f.lostIn !== undefined)
    return { text: t('clock.' + f.what + '.lost', { t: fmtClock(f.lostIn) }), tone: 'danger' };
  if (f.state === 'cracking')
    return { text: t('clock.cooling', { t: fmtClock(f.safeIn ?? 0) }), tone: 'danger' };
  if (f.state === 'warming')
    return { text: t('clock.crackIn', { t: fmtClock(f.crackIn) }), tone: 'warn' };
  return {
    text: t('clock.' + f.what, { n: number(Math.floor(Math.max(0, f.health))) }),
    tone: f.health < 35 ? 'danger' : f.health < 65 ? 'warn' : 'calm'
  };
}

// A chamber's colony dying in the heat, or the heart mending (or cracking) in
// its shelter. Null when no clock runs there.
export function facilityClock(s, b) {
  const f = Core.facilityForecast(s, b);
  if (!f) return null;
  if (f.crumbles !== undefined)
    return { text: t('clock.crystal.lost', { t: fmtClock(f.crumbles) }), tone: 'danger' };
  if (f.dies !== undefined)
    return { text: t('clock.dies', { t: fmtClock(f.dies) }), tone: 'danger' };
  if (f.breaks !== undefined)
    return { text: t('clock.heart.lost', { t: fmtClock(f.breaks) }), tone: 'danger' };
  return { text: t('clock.mended', { t: fmtClock(f.mended) }), tone: 'calm' };
}

// The lantern battery as the time it has left in the dark, or, by a
// charger, the time until full. Null when it is full.
export function batteryClock(s) {
  if (s.battery >= 0.995) return null; // full, as the old percent rounded it
  if (Core.chargerNear(s))
    return { text: fmtClock((1 - s.battery) * Core.CHARGE_TIME), charging: true };
  return { text: fmtClock(s.battery * Core.BATTERY_LIFE), charging: false };
}
