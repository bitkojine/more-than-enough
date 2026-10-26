/* Placing a building (Watch, 2026-10-26, as Clash of Clans and Stardew do):
 * Place in Build, or Move on a building's card, closes the sheet and stands
 * the building on the map as a ghost, on the best free tile beside you. Every
 * tile in view it fits on is softly lit; tap one (or drag the ghost) to put
 * it there. A card at the bottom says what it would do there and what it
 * costs, with Cancel and Place here. A tile out of reach: Mica walks there
 * and builds on arrival. Build and Upgrade step aside meanwhile; Back or
 * Cancel ends it. Moving is free and takes all the building holds with it.
 *
 * The rules are the core's (Core.extractorFits, Core.facilitySite,
 * Core.place, Core.moveExtractor, Core.moveFacility); this only shows them. */
import * as Core from '../core/index.js';
import { t } from '../i18n/i18n.js';
import { esc, fmtRate } from './format.js';
import { pic, price, icon } from './sheet.js';
import { reachOf } from './reach.js';

const REFRESH_S = 0.3;    // how often the lit tiles are found again
const MAX_TILES = 6000;   // tiles looked at, at most (zoomed far out)
const SETTLE_MS = 400;    // map taps ignored this long after it starts: the
                          // tap on Place (or Move) itself, landing on the map

export function createPlacing({ cam, state, controller, cultivate, toast, done }) {
  const el = document.createElement('div');
  el.id = 'placeCard'; el.className = 'bcard placing'; el.hidden = true; // i18n-ok: an id and class names
  el.setAttribute('role', 'dialog');
  document.body.append(el);

  // { key } or { kind }, `from` the building being moved (else null), the
  // layer, the tile chosen, and whether Mica is walking there.
  let job = null;
  let rows = new Map(), age = Infinity, shown = '', dragging = false, startedAt = 0;

  const isMove = () => !!job?.from;
  const fits = (s, x, y) => job.key ? Core.extractorFits(s, job.key, x, y, job.from) : !Core.facilitySite(s, job.kind, x, y, job.from);
  const nameOf = () => job.key ? esc(Core.EXTRACTORS[job.key].name) : t('cr.' + job.kind);
  const lookOf = () => job.key ? 'building.' + job.key : Core.CULTIVATION_LOOK[job.kind];
  const costOf = (s) => isMove() ? null : job.key ? Core.extractorCost(s, job.key) : Core.CULTIVATION_RECIPES[job.kind];
  const tileAt = (sx, sy) => { const w = cam.unproject(sx, sy); return { x: Math.floor(w.x), y: Math.floor(w.y) }; };

  // The tiles on screen it fits on, by row.
  function findFits(s) {
    const a = cam.unproject(0, 0), b = cam.unproject(cam.width, cam.height);
    const x0 = Math.floor(Math.min(a.x, b.x)) - 1, x1 = Math.ceil(Math.max(a.x, b.x)) + 1;
    const y0 = Math.floor(Math.min(a.y, b.y)) - 1, y1 = Math.ceil(Math.max(a.y, b.y)) + 2;
    rows = new Map();
    if ((x1 - x0) * (y1 - y0) > MAX_TILES) return;
    for (let y = y0; y <= y1; y++) {
      const row = [];
      for (let x = x0; x <= x1; x++) if (fits(s, x, y)) row.push(x);
      if (row.length) rows.set(y, row);
    }
  }

  // Where the ghost starts: where it stands, if moving; else the best free
  // tile beside you; else the nearest it fits on in view.
  function firstSpot(s) {
    if (job.from) return { x: job.from.x, y: job.from.y };
    const near = job.key ? Core.buildTarget(s, job.key) : null;
    if (near) return near;
    let best = null, bestD = Infinity;
    for (const [y, row] of rows) for (const x of row) {
      const d = Core.tileDist2(s.player, x, y, s.player.z);
      if (d < bestD) { best = { x, y }; bestD = d; }
    }
    return best;
  }

  function start(what, from = null) {
    const s = state();
    controller.stop();
    job = { key: what.key || null, kind: what.kind || null, from, z: s.player.z, at: null, walking: false };
    findFits(s); age = 0;
    job.at = firstSpot(s);
    startedAt = performance.now();
    document.body.classList.add('placing');
    render();
  }

  function end() {
    if (!job) return false;
    if (job.walking) controller.stop();
    job = null; dragging = false; shown = ''; rows = new Map();
    el.hidden = true;
    document.body.classList.remove('placing');
    return true;
  }

  // What it would do on the chosen tile, as one line.
  function gainLine(s) {
    if (!job.at) return '';
    const f = focus();
    const reach = reachOf(s, f);
    if (job.key === 'stoneworks') return t('place.doubles', { count: reach.targets.length });
    if (job.key === 'depot') return t('place.collects', { count: reach.targets.length });
    if (job.kind === 'cooler') return t('place.cools', { count: reach.targets.length });
    if (job.kind === 'conduit') return t('cr.conduit.desc');
    if (job.key) {
      const def = Core.EXTRACTORS[job.key];
      if (def.rate > 0) return `+${fmtRate(Core.placementGain(s, job.key, job.at))} ${icon(def.res)}/s`;
      return esc(t('building.' + job.key + '.desc'));
    }
    return t('cr.' + job.kind + '.desc');
  }

  function render() {
    const s = state(), cost = costOf(s);
    const affordable = !cost || Core.canAfford(s.inv, cost);
    const hint = job.walking ? t('place.walking') : !job.at ? t('place.none') : t(isMove() ? 'place.hint.move' : 'place.hint');
    const ready = !!job.at && !job.walking && affordable;
    const html = `<div class="bc-head">${pic(lookOf(), 'image')}<strong>${isMove() ? t('place.move', { name: nameOf() }) : nameOf()}</strong></div>` +
      `<p>${gainLine(s)}</p>` +
      (cost ? `<div class="pc-cost">${price(s.inv, cost)}</div>` : `<p>${t('place.free')}</p>`) +
      `<p class="pc-hint">${hint}</p>` +
      `<div class="bc-acts"><button type="button" class="alt" data-do="cancel">${t('place.cancel')}</button>` +
      `<button type="button" class="pc-go" data-do="go"${ready ? '' : ' disabled'}>${t(isMove() ? 'place.moveHere' : 'place.here')}</button></div>`;
    if (html !== shown) { el.innerHTML = html; shown = html; }
    el.hidden = false;
    // The zoom pill moves up clear of the card (style.css).
    document.body.style.setProperty('--place-h', el.offsetHeight + 'px');
  }

  // Builds (or moves) it on the chosen tile, Mica beside it.
  function finish() {
    const s = state(), at = job.at, cost = costOf(s);
    if (cost && !Core.canAfford(s.inv, cost)) { job.walking = false; toast(t('reason.need', { cost: Core.costText(cost) })); return render(); }
    let ok;
    if (job.from) ok = controller.move(job.from, at);
    else if (job.key) ok = controller.place(job.key, at);
    else ok = cultivate({ type: 'build', kind: job.kind, x: at.x, y: at.y }) === 'ok';
    if (!ok) { job.walking = false; findFits(s); if (!fits(s, at.x, at.y)) job.at = firstSpot(s); return render(); }
    end();
    done(at);
  }

  function go() {
    if (!job?.at) return;
    if (Core.inReach(state(), job.at.x, job.at.y)) return finish();
    controller.walk(job.at.x, job.at.y);
    job.walking = true;
    render();
  }

  // The chosen tile changes: Mica stops walking to the old one.
  function choose(x, y) {
    if (job.at && job.at.x === x && job.at.y === y) return;
    job.at = { x, y };
    if (job.walking) { controller.stop(); job.walking = false; }
    render();
  }

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-do]');
    if (!btn || !job) return;
    if (btn.dataset.do === 'cancel') end();
    else go();
  });

  // The focus for the reach area and badges: the ghost where it stands.
  function focus() {
    if (!job?.at) return null;
    return { key: job.key, kind: job.kind, x: job.at.x, y: job.at.y, z: job.z, building: job.from, moved: true };
  }

  return {
    get open() { return !!job; },
    start,
    cancel: end,
    // A tap on the map while placing: on a lit tile, the building goes there.
    // Any other tap does nothing (it would walk Mica off).
    tap(sx, sy) {
      if (!job) return false;
      if (performance.now() - startedAt < SETTLE_MS) return true;
      const s = state(), p = tileAt(sx, sy);
      if (fits(s, p.x, p.y)) choose(p.x, p.y);
      return true;
    },
    // A finger down on the ghost drags it from lit tile to lit tile.
    grab(sx, sy) {
      if (!job?.at || performance.now() - startedAt < SETTLE_MS) return false;
      const p = tileAt(sx, sy);
      dragging = p.x === job.at.x && p.y === job.at.y;
      return dragging;
    },
    drag(sx, sy) {
      if (!dragging) return;
      const s = state(), p = tileAt(sx, sy);
      if (fits(s, p.x, p.y)) choose(p.x, p.y);
    },
    drop() { dragging = false; },
    tick(dt) {
      if (!job) return;
      const s = state();
      if (s.player.z !== job.z || (job.from && !s.extractors.includes(job.from) && !s.cultivation?.facilities.includes(job.from))) return end();
      if ((age += dt) >= REFRESH_S) { age = 0; findFits(s); }
      if (job.walking) {
        if (Core.inReach(s, job.at.x, job.at.y)) { controller.stop(); return finish(); }
        if (!controller.walking) { job.walking = false; toast(t('place.far')); }
      }
      render();
    },
    view() {
      if (!job) return null;
      const s = state(), at = job.at;
      const ghost = !at ? null : job.from ? { ...job.from, x: at.x, y: at.y } : job.key
        ? { key: job.key, res: Core.EXTRACTORS[job.key].res, x: at.x, y: at.y, z: job.z, buffer: 0 }
        : { kind: job.kind, x: at.x, y: at.y, z: job.z, closed: true, buffer: 0 };
      if (ghost && job.from) ghost.buffer = 0;
      return { rows, ghost, from: job.from, z: s.player.z };
    },
    focus
  };
}
