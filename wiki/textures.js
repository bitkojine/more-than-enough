/* The wiki's view of texture packs: pictures from the default pack for the
 * tables, the full list of everything in the game (from the core catalog),
 * and the default pack as one downloadable file to start a new pack from. */

import * as Core from '../src/core/index.js';
import { pictures } from '../src/game/look/validate.js';
import { t } from './strings.js';

const PACK_DIR = '../packs/default/';
let pack = null;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export async function loadDefaultPack() {
  const res = await fetch(PACK_DIR + 'pack.json');
  if (!res.ok) throw new Error(t('wiki.packFailed', { status: res.status }));
  pack = await res.json();
  return pack;
}

const slotOf = (id, slot) => (pack.looks[id] || {})[slot];

// Where a picture of the pack loads from: a file next to pack.json, or (in the
// deployed site, which puts every picture inside pack.json) its own markup.
const srcOf = (ref) => (ref.startsWith('<')
  ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ref)  // i18n-ok: a URL
  : PACK_DIR + ref);

// The URL of the first picture in a thing's slot ('' if it has none).
export function pictureUrl(id, slot = 'icon') {
  const v = slotOf(id, slot);
  const first = v === undefined ? null : pictures(v)[0];
  return first ? srcOf(first) : '';
}

// A thing's colour in the default pack.
export const colorOf = (id) => slotOf(id, 'color');

// The URL of a stockpile pile's picture for 10^tier of a resource.
export function tierUrl(res, tier) {
  const list = pack.looks['pile.' + res].tiers;
  return srcOf(list[Math.min(tier, list.length - 1)]);
}

// An inline <img> of a thing's picture, sized like text. Give it `alt` when
// the picture stands for a word (a resource in a cost), not beside one.
export function pic(id, slot = 'icon', cls = 'pic', alt = '') {
  const url = pictureUrl(id, slot);
  return url ? `<img class="${cls}" src="${url}" alt="${esc(alt)}" loading="lazy">` : '';
}

/* --------------------------------------------- everything in the game */

const SLOT_ORDER = ['top', 'stand', 'cut', 'face', 'image', 'icon', 'tiers', 'stages'];

// What the default pack shows for a thing: each picture slot's pictures
// (every variant and frame) and its colour.
function preview(thing) {
  const look = pack.looks[thing.id] || {};
  const parts = [];
  for (const slot of SLOT_ORDER) {
    if (look[slot] === undefined) continue;
    const imgs = pictures(look[slot]).filter((p, i, all) => all.indexOf(p) === i)
      .map((p) => `<img src="${srcOf(p)}" alt="" loading="lazy" class="thumb thumb-${slot}">`).join('');
    parts.push(`<span class="slotpics" title="${slot}">${imgs}</span>`);
  }
  if (look.color) parts.push(`<span class="swatch" style="background:${look.color}" title="${look.color}"></span>`);
  return parts.join('');
}

function slotList(thing) {
  return Object.entries(thing.slots)
    .map(([slot, required]) => (required ? `<code class="req">${slot}</code>` : `<code>${slot}</code>`)).join(' ');
}

export function renderThings() {
  const count = `<p class="count">${t('wiki.thingCount', { count: Core.LOOKS.length, groups: Core.LOOK_GROUPS.length })}</p>`;
  return count + Core.LOOK_GROUPS.map((g) => {
    const rows = Core.LOOKS.filter((thing) => thing.group === g.id).map((thing) => `
      <li class="thing" id="look-${esc(thing.id)}">
        <div class="thing-pics">${preview(thing)}</div>
        <div class="thing-text">
          <div class="thing-head"><strong>${esc(thing.name)}</strong> <code class="thing-id">${esc(thing.id)}</code></div>
          <p>${esc(thing.does)}</p>
          <p class="thing-slots">${t('wiki.slots', { slots: slotList(thing) })}</p>
        </div>
      </li>`).join('');
    return `<h2 id="group-${g.id}">${esc(g.name)}</h2><p class="area-blurb">${esc(g.blurb)}</p><ul class="things">${rows}</ul>`;
  }).join('');
}

/* ------------------------------------------- the pack as a single file */

// The default pack with every picture inlined (SVG as markup), so it can be
// saved, edited and picked in the game as one file.
export async function bundleDefaultPack() {
  const out = JSON.parse(JSON.stringify(pack));
  const cache = new Map();
  const inline = async (ref) => {
    if (ref === null || ref.startsWith('<')) return ref;
    if (!cache.has(ref)) {
      cache.set(ref, fetch(PACK_DIR + ref).then((r) => {
        if (!r.ok) throw new Error(`${ref}: ${r.status}`);
        return r.text();
      }).then((t) => t.trim()));
    }
    return cache.get(ref);
  };
  for (const entry of Object.values(out.looks)) {
    for (const slot of Object.keys(entry)) {
      const v = entry[slot];
      if (slot === 'color') continue;
      if (Array.isArray(v)) entry[slot] = await Promise.all(v.map(inline));
      else if (v && typeof v === 'object') v.frames = await Promise.all(v.frames.map(inline));
      else entry[slot] = await inline(v);
    }
  }
  out.name = t('wiki.packCopy', { name: t('pack.defaultName') });
  return out;
}

export function wireDownload(button) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const json = await bundleDefaultPack();
      const blob = new Blob([JSON.stringify(json, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'lanternlight-pack.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (err) {
      button.insertAdjacentHTML('afterend', `<p class="error">${t('wiki.packBuildFailed', { error: esc(err.message) })}</p>`);
    } finally {
      button.disabled = false;
    }
  });
}
