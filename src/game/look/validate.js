/* Checking a texture pack against the catalog before anything is drawn with
 * it. Pure (no DOM), so the tests run it in Node. A pack with any problem is
 * not used, and every problem is listed, naming the thing and slot that broke.
 *
 * A pack is JSON:
 *   format     PACK_FORMAT
 *   name       shown when it's picked
 *   author     optional
 *   tile       image pixels per tile (default 64): an image this wide is
 *              one tile wide on the map
 *   pixelated  true keeps pixel art crisp instead of smoothing it
 *   looks      { "<thing id>": { "<slot>": value } }
 *
 * An image value is one picture, a list of variants (one is picked per tile;
 * null means nothing there), or { "frames": [...], "fps": n } to animate.
 * The stockpile's "tiers" slot is a list of pictures (no nulls), one per
 * power of ten, smallest first; a building's "stages" slot is a list of
 * pictures (no nulls), empty first, full last.
 * A picture is a path next to pack.json, inline "<svg ...>" markup, a
 * data:image/... URL or an https:// URL. */

import { LOOK, LOOKS, PACK_FORMAT, RETIRED_LOOKS } from '../../core/index.js';
import { t } from '../../i18n/i18n.js';
const TOP_KEYS = ['format', 'name', 'author', 'tile', 'pixelated', 'looks'];
const COLOR = /^#[0-9a-f]{6}$/i;
const PATH = /^(?!\/)(?!.*\.\.)[\w\-./ ]+\.(svg|png|webp|jpe?g|gif)$/i;

export const isPicture = (v) => typeof v === 'string' &&
  (PATH.test(v) || v.startsWith('data:image/') || v.startsWith('https://') || /^\s*<svg[\s>]/.test(v));  // i18n-ok: a URL prefix

// Every picture an image value refers to, in order (variants' nulls skipped).
export function pictures(value) {
  if (Array.isArray(value)) return value.filter((v) => v !== null);
  if (value && typeof value === 'object') return value.frames || [];
  return [value];
}

function checkImage(value, where, problems) {
  if (Array.isArray(value)) {
    if (!value.length) problems.push(t('pack.variantsEmpty', { where }));
    if (value.every((v) => v === null)) problems.push(t('pack.variantsAllEmpty', { where }));
  } else if (value && typeof value === 'object') {
    const extra = Object.keys(value).filter((k) => k !== 'frames' && k !== 'fps');
    if (extra.length) problems.push(t('pack.animationKey', { where, keys: extra.map((k) => `"${k}"`).join(', ') }));
    if (!Array.isArray(value.frames) || !value.frames.length) problems.push(t('pack.frames', { where }));
    if (!(value.fps > 0 && value.fps <= 30)) problems.push(t('pack.fps', { where }));
  }
  for (const p of pictures(value)) {
    if (!isPicture(p)) problems.push(t('pack.notPicture', { where, value: JSON.stringify(String(p).slice(0, 60)) }));
  }
}

// Returns the list of problems ([] = fine). `complete` also demands every
// required slot (the default pack must be complete).
export function validatePack(pack, { complete = false } = {}) {
  const problems = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return [t('pack.notObject')];
  for (const k of Object.keys(pack)) if (!TOP_KEYS.includes(k)) problems.push(t('pack.topKey', { key: k, allowed: TOP_KEYS.join(', ') }));
  if (pack.format !== PACK_FORMAT) problems.push(t('pack.format', { format: PACK_FORMAT, got: JSON.stringify(pack.format) }));
  if (typeof pack.name !== 'string' || !pack.name.trim()) problems.push(t('pack.name'));
  if (pack.author !== undefined && typeof pack.author !== 'string') problems.push(t('pack.author'));
  if (pack.tile !== undefined && !(Number.isInteger(pack.tile) && pack.tile >= 4 && pack.tile <= 1024)) problems.push(t('pack.tile'));
  if (pack.pixelated !== undefined && typeof pack.pixelated !== 'boolean') problems.push(t('pack.pixelated'));
  const looks = pack.looks;
  if (!looks || typeof looks !== 'object' || Array.isArray(looks)) {
    problems.push(t('pack.looks'));
    return problems;
  }
  for (const id of Object.keys(looks)) {
    const thing = LOOK[id];
    if (!thing && RETIRED_LOOKS.has(id)) continue;
    if (!thing) { problems.push(t('pack.noThing', { id })); continue; }
    const entry = looks[id];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { problems.push(t('pack.slotsObject', { id })); continue; }
    for (const slot of Object.keys(entry)) {
      const where = `${id} ${slot}`;
      if (!(slot in thing.slots)) problems.push(t('pack.noSlot', { where, name: thing.name, slot, slots: Object.keys(thing.slots).join(', ') }));
      else if (slot === 'color') { if (!COLOR.test(entry[slot])) problems.push(t('pack.color', { where })); }
      else if ((slot === 'tiers' || slot === 'stages') && !(Array.isArray(entry[slot]) && entry[slot].length && !entry[slot].includes(null))) {
        problems.push(t('pack.' + slot, { where }));
      }
      else checkImage(entry[slot], where, problems);
    }
  }
  if (complete) {
    for (const thing of LOOKS) {
      for (const [slot, required] of Object.entries(thing.slots)) {
        if (required && !(looks[thing.id] && looks[thing.id][slot] !== undefined)) problems.push(t('pack.missing', { where: `${thing.id} ${slot}` }));
      }
    }
  }
  return problems;
}
