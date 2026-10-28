/* What everything looks like: the game's own pictures and colours
 * (packs/default/pack.json). Drawing code asks the look for colours and
 * pictures by thing id and never names a file.
 *
 * Pictures are rasterised once per size (rounded up to a power of two) and
 * reused, so drawing a tile is a single drawImage however complex its SVG. */

import { hash2, DEFAULT_TILE } from '../../core/index.js';
import { pictures } from '../../core/index.js';
import { t } from '../../i18n/i18n.js';
import { esc } from '../format.js';
import {hasSpriteLight,litPicture,lightingWork} from '../render/lighting.js';

const MIN_BUCKET = 4, MAX_BUCKET = 1024;

const svgUrl = (markup) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup.trim());  // i18n-ok: a URL

// The URL to load a picture from. `base` is pack.json's own URL (its query
// string carries the deploy's cache-busting hash on to every file).
function urlFor(ref, base) {
  if (/^\s*<svg/.test(ref)) return svgUrl(ref);
  const url = new URL(ref, base);
  url.search = new URL(base).search;
  return url.href;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('pack.pictureFailed')+' — '+url.split('#')[0].slice(0,500))); // i18n-ok: asset URL in a diagnostic
    img.src = url;
  });
}

function makePicture(img, url, tile, pixelated) {
  const w = img.naturalWidth, h = img.naturalHeight;
  return { img, url, units: w / tile, aspect: h / w, pixelated, cache: new Map() };
}

/* Loads every picture of the pack that came from `base`. Resolves to
 * { pack, problems }: `pack` is null whenever a picture failed to load. */
export async function loadPack(json, base) {
  const problems = [];
  const tile = json.tile || DEFAULT_TILE;
  const pixelated = !!json.pixelated;
  const loaded = new Map(); // ref -> Promise<picture>
  const load = (ref) => {
    if (!loaded.has(ref)) {
      const url = urlFor(ref, base);
      loaded.set(ref, loadImage(url).then((img) => {
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
  return { pack: { slots }, problems };
}

// Loads the game's pack from `url`; throws (naming every picture that broke)
// if it is broken, which is a crash: a half-drawn world is never shown.
export async function loadDefaultPack(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('pack.defaultHttp', { url, status: res.status }));
  const { pack, problems } = await loadPack(await res.json(), url);
  if (!pack) throw new Error(t('pack.defaultBroken', { problems: problems.join('\n') }));
  return pack;
}

/* ------------------------------------------------------------ the look */

export function createLook() {
  let pack = null;

  const entry = (id, slot) => pack.slots.get(id)[slot];
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  const look = {
    lightingWork,
    // Bumped on every change, so anything that caches pictures can tell.
    version: 0,

    use(loadedPack) {
      pack = loadedPack;
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
    // up.
    stage(id, share) {
      const pics = entry(id, 'stages').pics, n = pics.length;
      if (share <= 0) return pics[0];
      if (share >= 1 || n <= 2) return pics[n - 1];
      return pics[Math.min(n - 2, 1 + Math.floor(share * (n - 2)))];
    },

    // Exact physical tier/repair state.
    level(id, index, slot = 'image') {
      const stages = entry(id, 'stages');
      return stages ? stages.pics[Math.max(0, Math.min(index, stages.pics.length - 1))] : look.pick(id, slot);
    },

    // Every frame of (id, slot), for things that animate on their own clock.
    frames(id, slot) {
      const e = entry(id, slot);
      return e ? { pics: e.pics, fps: e.fps } : null;
    },

    // A URL for an <img> (the first picture of the slot).
    src(id, slot = 'icon', level = null) {
      if(level!==null)return look.level(id,level,slot)?.url||'';
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
        if(pic.rect)g.drawImage(pic.img,...pic.rect,0,0,c.width,c.height);
        else g.drawImage(pic.img, 0, 0, c.width, c.height);
        pic.cache.set(bucket, c);
      }
      return c;
    },

    // Draws a picture into a rectangle.
    draw(ctx, pic, x, y, w, h) {
      if(pic.rect&&!hasSpriteLight(ctx)){ctx.drawImage(pic.img,...pic.rect,x,y,w,h);return;}
      if (pic.pixelated) ctx.imageSmoothingEnabled = false;
      ctx.drawImage(litPicture(ctx,look.bitmap(pic,w)),x,y,w,h);
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
export function iconHtml(look, id, cls = 'ico', slot = 'icon', level = null) {
  let src,cause;
  try{src=look.src(id,slot,level);}catch(err){cause=err;}
  const attrs=`class="${esc(cls)}" data-help="${esc(id)}" data-picture-slot="${esc(slot)}"`;
  if(typeof src!=='string'||!src.trim()){
    const err=new Error(`Missing game picture: id=${id}, slot=${slot}, level=${level??'default'}${cause?'; lookup failed: '+cause.message:''}`); // i18n-ok: developer diagnostic
    err.name='PictureUnavailableError';
    if(typeof globalThis.MTE_FAULT==='function')globalThis.MTE_FAULT(err,'picture'); // i18n-ok: developer diagnostic location
    else if(Array.isArray(globalThis.MTE_RESOURCE_ERRORS)&&globalThis.MTE_RESOURCE_ERRORS.length<8)globalThis.MTE_RESOURCE_ERRORS.push({error:err,where:'picture'}); // i18n-ok: developer diagnostic location
    // No request to the document URL; retain layout, label and tooltip.
    return `<span ${attrs} data-picture-missing="true" aria-hidden="true"></span>`;
  }
  return `<img ${attrs} src="${esc(src)}" alt="" draggable="false">`;
}
