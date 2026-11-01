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
  const icon = f.what;
  if (f.state === 'cracking' && f.lostIn !== undefined)
    return {
      icon,
      text: t('clock.' + f.what + '.lost', { t: fmtClock(f.lostIn) }),
      tone: 'danger'
    };
  if (f.state === 'cracking')
    return { icon, text: t('clock.cooling', { t: fmtClock(f.safeIn ?? 0) }), tone: 'danger' };
  if (f.state === 'warming')
    return { icon, text: t('clock.crackIn', { t: fmtClock(f.crackIn) }), tone: 'warn' };
  return {
    icon,
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
    return {
      icon: 'crystal',
      text: t('clock.crystal.lost', { t: fmtClock(f.crumbles) }),
      tone: 'danger'
    };
  if (f.dies !== undefined)
    return { icon: 'starter', text: t('clock.dies', { t: fmtClock(f.dies) }), tone: 'danger' };
  if (f.breaks !== undefined)
    return {
      icon: 'heart',
      text: t('clock.heart.lost', { t: fmtClock(f.breaks) }),
      tone: 'danger'
    };
  return { icon: 'heart', text: t('clock.mended', { t: fmtClock(f.mended) }), tone: 'calm' };
}

// The lantern battery as the time it has left in the dark, or, by a
// charger, the time until full. Null when it is full.
export function batteryClock(s) {
  if (s.battery >= 0.995) return null; // full, as the old percent rounded it
  if (Core.chargerNear(s))
    return { text: fmtClock((1 - s.battery) * Core.CHARGE_TIME), charging: true };
  return { text: fmtClock(s.battery * Core.BATTERY_LIFE), charging: false };
}

// Reuse the actual subjects from the world artwork. The heart is the pink
// core in the hiding place; the starter is the colony inside a geode. Crop
// out their surroundings, retaining the same forms and colors at HUD size.
// Regions are fractions of the source art, independent of raster density.
const SUBJECTS = {
  heart: ['building.hidingPlace', 'image', [35 / 96, 45 / 100, 26 / 96, 26 / 100]],
  starter: ['tile.geode', 'top', [8 / 64, 14 / 64, 48 / 64, 42 / 64]],
  crystal: ['resource.crystal', 'icon']
};
const subjectPictures = new WeakMap();
export function clockIcon(look, subject) {
  const [id, slot, crop] = SUBJECTS[subject];
  const source = look.pick(id, slot);
  if (!crop) return source;
  let picture = subjectPictures.get(source);
  if (!picture) {
    const width = source.img.naturalWidth,
      height = source.img.naturalHeight;
    const rect = [crop[0] * width, crop[1] * height, crop[2] * width, crop[3] * height];
    picture = { ...source, rect, aspect: rect[3] / rect[2], cache: new Map() };
    subjectPictures.set(source, picture);
  }
  return picture;
}
