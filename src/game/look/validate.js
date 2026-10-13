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
 * A picture is a path next to pack.json, inline "<svg ...>" markup, a
 * data:image/... URL or an https:// URL. */

import { LOOK, LOOKS, PACK_FORMAT } from '../../core/index.js';
const TOP_KEYS = ['format', 'name', 'author', 'tile', 'pixelated', 'looks'];
const COLOR = /^#[0-9a-f]{6}$/i;
const PATH = /^(?!\/)(?!.*\.\.)[\w\-./ ]+\.(svg|png|webp|jpe?g|gif)$/i;

export const isPicture = (v) => typeof v === 'string' &&
  (PATH.test(v) || v.startsWith('data:image/') || v.startsWith('https://') || /^\s*<svg[\s>]/.test(v));

// Every picture an image value refers to, in order (variants' nulls skipped).
export function pictures(value) {
  if (Array.isArray(value)) return value.filter((v) => v !== null);
  if (value && typeof value === 'object') return value.frames || [];
  return [value];
}

function checkImage(value, where, problems) {
  if (Array.isArray(value)) {
    if (!value.length) problems.push(`${where}: the list of variants is empty`);
    if (value.every((v) => v === null)) problems.push(`${where}: every variant is empty`);
  } else if (value && typeof value === 'object') {
    const extra = Object.keys(value).filter((k) => k !== 'frames' && k !== 'fps');
    if (extra.length) problems.push(`${where}: unknown key ${extra.map((k) => `"${k}"`).join(', ')} (an animation has "frames" and "fps")`);
    if (!Array.isArray(value.frames) || !value.frames.length) problems.push(`${where}: "frames" must be a list of pictures`);
    if (!(value.fps > 0 && value.fps <= 30)) problems.push(`${where}: "fps" must be a number from 1 to 30`);
  }
  for (const p of pictures(value)) {
    if (!isPicture(p)) problems.push(`${where}: ${JSON.stringify(String(p).slice(0, 60))} is not a picture (a path ending .svg/.png/.webp/.jpg/.gif, inline <svg>, data:image/ or https://)`);
  }
}

// Returns the list of problems ([] = fine). `complete` also demands every
// required slot (the default pack must be complete).
export function validatePack(pack, { complete = false } = {}) {
  const problems = [];
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return ['The pack is not a JSON object'];
  for (const k of Object.keys(pack)) if (!TOP_KEYS.includes(k)) problems.push(`Unknown top-level key "${k}" (allowed: ${TOP_KEYS.join(', ')})`);
  if (pack.format !== PACK_FORMAT) problems.push(`"format" must be ${PACK_FORMAT} (this game's pack format), not ${JSON.stringify(pack.format)}`);
  if (typeof pack.name !== 'string' || !pack.name.trim()) problems.push('"name" is missing');
  if (pack.author !== undefined && typeof pack.author !== 'string') problems.push('"author" must be text');
  if (pack.tile !== undefined && !(Number.isInteger(pack.tile) && pack.tile >= 4 && pack.tile <= 1024)) problems.push('"tile" must be a whole number of pixels from 4 to 1024');
  if (pack.pixelated !== undefined && typeof pack.pixelated !== 'boolean') problems.push('"pixelated" must be true or false');
  const looks = pack.looks;
  if (!looks || typeof looks !== 'object' || Array.isArray(looks)) {
    problems.push('"looks" must be an object of thing ids');
    return problems;
  }
  for (const id of Object.keys(looks)) {
    const thing = LOOK[id];
    if (!thing) { problems.push(`${id}: no such thing in the game (see the wiki's list)`); continue; }
    const entry = looks[id];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) { problems.push(`${id}: must be an object of slots`); continue; }
    for (const slot of Object.keys(entry)) {
      const where = `${id} ${slot}`;
      if (!(slot in thing.slots)) problems.push(`${where}: ${thing.name} has no "${slot}" (it has ${Object.keys(thing.slots).join(', ')})`);
      else if (slot === 'color') { if (!COLOR.test(entry[slot])) problems.push(`${where}: must be a colour like "#4a7a33"`); }
      else checkImage(entry[slot], where, problems);
    }
  }
  if (complete) {
    for (const thing of LOOKS) {
      for (const [slot, required] of Object.entries(thing.slots)) {
        if (required && !(looks[thing.id] && looks[thing.id][slot] !== undefined)) problems.push(`${thing.id} ${slot}: missing`);
      }
    }
  }
  return problems;
}
