/* What everything looks like right now: the default texture pack, with the
 * player's pack (if any) laid over it slot by slot. Drawing code asks the
 * look for colours and pictures by thing id and never names a file.
 *
 * Pictures are rasterised once per size (rounded up to a power of two) and
 * reused, so drawing a tile is a single drawImage however complex its SVG. */

import { hash2, DEFAULT_TILE } from '../../core/index.js';
import { validatePack, pictures } from './validate.js';
import { t } from '../../i18n/i18n.js';

const MIN_BUCKET = 4, MAX_BUCKET = 1024;

const svgUrl = (markup) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup.trim());  // i18n-ok: a URL

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// A file the player picked whose path (or file name) matches `path`.
function pickedFile(files, path) {
  const name = path.split('/').pop();
  return files.find((f) => (f.webkitRelativePath || '').endsWith('/' + path) || f.name === path) ||
    files.find((f) => f.name === name) || null;
}

// The URL to load a picture from. `base` is the pack's own URL (its query
// string carries the deploy's cache-busting hash on to every file).
async function urlFor(ref, base, files) {
  if (/^\s*<svg/.test(ref)) return svgUrl(ref);
  if (ref.startsWith('data:') || ref.startsWith('https://')) return ref;
  if (files) {
    const f = pickedFile(files, ref);
    if (!f) throw new Error(t('pack.fileNotPicked', { ref }));
    return readAsDataUrl(f);
  }
  if (!base) throw new Error(t('pack.pathInSingleFile', { ref }));
  const url = new URL(ref, base);
  url.search = new URL(base).search;
  return url.href;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('pack.pictureFailed')));
    img.src = url;
  });
}

function makePicture(img, url, tile, pixelated) {
  const w = img.naturalWidth, h = img.naturalHeight;
  return { img, url, units: w / tile, aspect: h / w, pixelated, cache: new Map() };
}

/* Loads and checks a pack. Resolves to { pack, problems }: `pack` is null
 * whenever there is any problem, so a broken pack is never half-applied.
 *   base      the URL pack.json came from (relative paths resolve against it)
 *   files     files picked alongside a pack.json (paths resolve among them)
 *   complete  every required slot must be filled (the default pack) */
export async function loadPack(json, { base = null, files = null, complete = false } = {}) {
  const problems = validatePack(json, { complete });
  if (problems.length) return { pack: null, problems };
  const tile = json.tile || DEFAULT_TILE;
  const pixelated = !!json.pixelated;
  const loaded = new Map(); // ref -> Promise<picture>
  const load = (ref) => {
    if (!loaded.has(ref)) {
      loaded.set(ref, urlFor(ref, base, files).then(async (url) => {
        const img = await loadImage(url);
        if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) throw new Error(t('pack.pictureNoSize'));
        return makePicture(img, url, tile, pixelated);
      }));
    }
    return loaded.get(ref);
  };

  const slots = new Map();
  const jobs = [];
  for (const [id, entry] of Object.entries(json.looks)) {
    const out = {};
    slots.set(id, out);
    for (const [slot, value] of Object.entries(entry)) {
      if (slot === 'color') { out.color = value.toLowerCase(); continue; }
      const refs = Array.isArray(value) ? value : pictures(value);
      const resolved = { variants: Array.isArray(value), fps: value.fps || 0, pics: refs.map(() => null) };
      out[slot] = resolved;
      refs.forEach((ref, i) => {
        if (ref === null) return;
        jobs.push(load(ref).then((pic) => { resolved.pics[i] = pic; },
          (err) => problems.push(`${id} ${slot}: ${ref.startsWith('<') ? t('pack.inlineSvg') : `"${ref.slice(0, 80)}"`}: ${err.message}`)));
      });
    }
  }
  await Promise.all(jobs);
  if (problems.length) return { pack: null, problems };
  return { pack: { name: json.name, author: json.author || '', pixelated, slots, json }, problems };
}

/* Packs the player picked as files into one self-contained pack (every path
 * replaced by the file's contents), so it can be remembered and reloaded
 * without the files. Throws, naming the file, if one is missing. */
export async function inlinePack(json, files) {
  const out = JSON.parse(JSON.stringify(json));
  const inline = async (ref) => (ref === null || !/^[^:<]+$/.test(ref) ? ref : urlFor(ref, null, files));
  for (const entry of Object.values(out.looks || {})) {
    for (const slot of Object.keys(entry)) {
      const v = entry[slot];
      if (slot === 'color') continue;
      if (Array.isArray(v)) entry[slot] = await Promise.all(v.map(inline));
      else if (v && typeof v === 'object') v.frames = await Promise.all((v.frames || []).map(inline));
      else entry[slot] = await inline(v);
    }
  }
  return out;
}

/* ------------------------------------------------------------ the look */

export function createLook() {
  let base = null; // the default pack
  let over = null; // the player's pack, or null

  const entry = (id, slot) => (over && over.slots.get(id) && over.slots.get(id)[slot]) || base.slots.get(id)[slot];
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  const look = {
    // Bumped on every change, so anything that caches pictures can tell.
    version: 0,

    // The default pack's name is the game's own, so it is translated.
    get name() { return over ? over.name : t('pack.defaultName'); },
    get custom() { return !!over; },
    get pack() { return over; },

    use(defaultPack, playerPack = null) {
      base = defaultPack;
      over = playerPack;
      look.version++;
    },

    color(id) {
      return entry(id, 'color');
    },

    has(id, slot) {
      return !!entry(id, slot);
    },

    // The picture to draw for (id, slot) at tile (x, y) and time t: one of
    // the variants (null = nothing), or the current animation frame.
    pick(id, slot, x = 0, y = 0, t = 0, salt = 0) {
      const e = entry(id, slot);
      if (!e) return null;
      const n = e.pics.length;
      if (n === 1) return e.pics[0];
      if (e.variants) return e.pics[Math.floor(hash2(x, y, 911 + salt) * n) % n];
      // Frames: neighbouring tiles start a little apart so water shimmers.
      return e.pics[Math.floor(t * e.fps + hash2(x, y, 913) * n) % n];
    },

    // The pile picture for 10^tier of a resource (past the pack's last
    // picture, the last one; the game makes it bigger as the pile's footprint grows).
    tier(id, tier) {
      const pics = entry(id, 'tiers').pics;
      return pics[Math.min(tier, pics.length - 1)];
    },

    // A building's picture with `share` of its room holding output waiting
    // to be collected (0 = nothing waiting, 1 = full): the first of its
    // stages when empty, the last when full, the ones between on the way
    // up. A player's pack that draws the building but not its stages keeps
    // its one picture.
    stage(id, share) {
      const own = over && over.slots.get(id);
      if (own && own.image && !own.stages) return own.image.pics[0];
      const pics = entry(id, 'stages').pics, n = pics.length;
      if (share <= 0) return pics[0];
      if (share >= 1 || n <= 2) return pics[n - 1];
      return pics[Math.min(n - 2, 1 + Math.floor(share * (n - 2)))];
    },

    // Every frame of (id, slot), for things that animate on their own clock.
    frames(id, slot) {
      const e = entry(id, slot);
      return e ? { pics: e.pics, fps: e.fps } : null;
    },

    // A URL for an <img> (the first picture of the slot).
    src(id, slot = 'icon') {
      const e = entry(id, slot);
      const pic = e && e.pics.find(Boolean);
      return pic ? pic.url : '';
    },

    // The picture rasterised at least `cssW` CSS pixels wide.
    bitmap(pic, cssW) {
      const want = Math.max(MIN_BUCKET, Math.min(MAX_BUCKET, cssW * dpr()));
      const bucket = 2 ** Math.ceil(Math.log2(want));
      let c = pic.cache.get(bucket);
      if (!c) {
        c = document.createElement('canvas');
        c.width = bucket;
        c.height = Math.max(1, Math.round(bucket * pic.aspect));
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = !pic.pixelated;
        g.drawImage(pic.img, 0, 0, c.width, c.height);
        pic.cache.set(bucket, c);
      }
      return c;
    },

    // Draws a picture into a rectangle.
    draw(ctx, pic, x, y, w, h) {
      if (pic.pixelated) ctx.imageSmoothingEnabled = false;
      ctx.drawImage(look.bitmap(pic, w), x, y, w, h);
      if (pic.pixelated) ctx.imageSmoothingEnabled = true;
    },

    // Draws a standing picture with its bottom centre at (fx, fy), `u` px per
    // tile, mirrored if `flip`. Returns its height on screen.
    stand(ctx, pic, fx, fy, u, flip = false) {
      const w = pic.units * u, h = w * pic.aspect;
      if (flip) {
        ctx.save();
        ctx.translate(fx, 0);
        ctx.scale(-1, 1);
        look.draw(ctx, pic, -w / 2, fy - h, w, h);
        ctx.restore();
      } else look.draw(ctx, pic, fx - w / 2, fy - h, w, h);
      return h;
    }
  };
  return look;
}

// An <img> for a thing's icon (or `slot`), for HTML built as strings.
export function iconHtml(look, id, cls = 'ico', slot = 'icon') {
  return `<img class="${cls}" src="${look.src(id, slot)}" alt="" draggable="false">`;
}
