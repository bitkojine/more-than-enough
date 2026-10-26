/* Wiki, the mycelium sprite on Mica's hood (drawn by render/wiki-model.js).
 * It looks at what the player points at and says one short line about the
 * things worth knowing: once each, unless asked again. Hovering asks nothing
 * (Watch, 2026-10-25): press and hold the mouse or a finger on a thing (slide
 * it to ask about the next), tap Wiki and then tap a thing, or drag from Wiki
 * onto it. What Wiki says goes in the message log (messages.js), where it
 * stays to be read; whatever Wiki is talking about is
 * outlined in the world (render/focus.js) while it talks. Presentation only:
 * nothing here changes the game. What Wiki has told is kept per browser
 * (wiki-memory.js), so it carries over to new worlds like any knowledge. */
import * as Core from '../core/index.js';
import { t } from '../i18n/i18n.js';
import { describeLook, describeWorld } from './tooltips.js';
import { createWikiMemory, WIKI_MODES } from './wiki-memory.js';

const ASK_MS = 8000;         // how long a tap on Wiki waits for the next tap
const LOOK_HOLD_S = 1.5;     // Wiki keeps looking a moment after the pointer leaves
const REST_AFTER_S = 6;      // then it closes its eyes
const HELLO_AFTER_S = 8;     // its first hello waits a moment after the game opens
const SCAN_EVERY_S = 0.5;    // looking around Mica for firsts and for crystal
const FOLD_NEAR = 2;         // tiles: living crystal this close shuts Wiki's cap
const DRAG_PX = 10;
const FOCUS_IN_S = 0.15;     // the outline fades in this fast
const LINGER_S = 3;          // a long press's answer stays this long after the finger lifts

export function createWiki({ canvas, cam, state, saved, keep, messages }) {
  const memory = createWikiMemory(saved);
  // A dotted pointer line while dragging from Wiki onto something.
  const chalk = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chalk.id = 'wikiChalk'; chalk.setAttribute('aria-hidden', 'true'); chalk.style.display = 'none';
  const stroke = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  chalk.append(stroke);
  document.body.append(chalk);

  const started = performance.now() / 1000;
  let clock = 0, scanIn = 0, fold = 0, folding = false;
  let line = null, hideAt = 0, talking = false, pressNo = 0;
  let lookAt = null, lookedAt = -Infinity;
  let anchor = null, asking = false, askTimer = 0, press = null;
  let focus = null, holdKey = '';  // what the outline is around; the tile a long press is on

  const hello = () => ({ kind: 'wiki.hello', name: t('wiki.name'), description: t('wiki.hello') });
  const nothing = () => ({ kind: null, name: t('wiki.name'), description: t('wiki.nothing') });
  const off = () => memory.mode === 'off';

  // `tile`: where in the world the thing is ({x, y}), to outline it.
  // Into the log, and Wiki talks (and rings the thing) for a while. A long
  // press that slides over the map keeps rewriting its one line.
  function say(info, how, link = true, tile = null) {
    if (!info) return;
    line = info;
    focus = !tile || !info.kind ? null : info.kind === 'character.wanderer' ? { mica: true, at: clock } : { x: tile.x, y: tile.y, z: state().player.z, at: clock };
    const linked = link && info.kind && !info.kind.startsWith('wiki.');
    const own = info.name === t('wiki.name');
    messages.add({ kind: 'wiki', name: own ? '' : info.name, text: info.description || '', link: linked ? 'wiki/#search/' + encodeURIComponent(info.name) : '' }, press?.long ? 'press' + pressNo : null);
    talking = true;
    line.started = clock;
    hideAt = clock + Math.max(4, 1.5 + (info.description || '').length * 0.05);
    if (info.kind) { memory.told(info.kind, how, clock); keep(memory.save()); }
  }
  function hush() { line = null; focus = null; talking = false; }
  function consider(info, how) { if (info && memory.decide(info.kind, how, clock) === 'speak') say(info, how); }

  function canvasPoint(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function tileUnder(e) { const p = canvasPoint(e), w = cam.unproject(p.x, p.y); return { x: Math.floor(w.x), y: Math.floor(w.y) }; }
  function infoAt(tile) {
    const s = state(), p = s.player;
    if (tile.x === Math.floor(p.x) && tile.y === Math.floor(p.y)) return { ...describeLook('character.wanderer'), kind: 'character.wanderer' };
    return describeWorld(s, tile.x, tile.y, p.z);
  }
  function onWiki(e) {
    if (!anchor) return false;
    const p = canvasPoint(e);
    return Math.hypot(p.x - anchor.x, p.y - anchor.y - anchor.r * 0.6) < Math.max(anchor.r * 1.5, 24);
  }
  function look(tile) { lookAt = tile; lookedAt = clock; }
  function stopAsking() { asking = false; clearTimeout(askTimer); if (line && !line.kind && line.asking) hush(); }

  // Taps and drags that start on Wiki, or answer a tap on Wiki, are Wiki's:
  // they never reach the game's own walking and gathering input.
  document.addEventListener('pointerdown', (e) => {
    if (off() || e.target !== canvas || e.button > 0) return;
    if (onWiki(e)) {
      e.preventDefault(); e.stopImmediatePropagation();
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, drag: false };
      return;
    }
    if (!asking) return;
    e.preventDefault(); e.stopImmediatePropagation();
    stopAsking();
    const tile = tileUnder(e);
    look(tile);
    say(infoAt(tile) || nothing(), 'asked', true, tile);
  }, { capture: true, passive: false });
  window.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_PX) return;
    press.drag = true; stopAsking();
    look(tileUnder(e));
    const r = canvas.getBoundingClientRect();
    chalk.style.display = '';
    stroke.setAttribute('x1', r.left + anchor.x); stroke.setAttribute('y1', r.top + anchor.y + anchor.r * 0.6);
    stroke.setAttribute('x2', e.clientX); stroke.setAttribute('y2', e.clientY);
  }, { capture: true, passive: true });
  const release = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const dragged = press.drag;
    press = null; chalk.style.display = 'none';
    if (e.type === 'pointercancel') return;
    if (dragged) { const tile = tileUnder(e); look(tile); say(infoAt(tile) || nothing(), 'asked', true, tile); return; }
    if (asking) { stopAsking(); return; }
    asking = true; clearTimeout(askTimer);
    askTimer = setTimeout(stopAsking, ASK_MS);
    say({ kind: null, name: t('wiki.name'), description: t('wiki.ask'), asking: true }, 'asked', false);
  };
  window.addEventListener('pointerup', release, true);
  window.addEventListener('pointercancel', release, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && asking) stopAsking(); }); // i18n-ok: keyboard key name.

  // Around Mica: the first sight of something new, and living crystal, which
  // light harms, so Wiki keeps its cap shut beside it (it gives no light at
  // all; the fold is a cue, not a rule).
  function scan() {
    const s = state(), p = s.player, px = Math.floor(p.x), py = Math.floor(p.y);
    let near = false;
    if (s.cultivation) {
      near = !!(s.cultivation.starter || s.inv.crystal > 0);
      for (let dx = -FOLD_NEAR; dx <= FOLD_NEAR && !near; dx++) for (let dy = -FOLD_NEAR; dy <= FOLD_NEAR && !near; dy++) {
        const type = Core.tileAt(s.world, px + dx, py + dy, p.z);
        near = type === Core.T.CRYSTAL || type === Core.T.CRYSTAL_SEAM || !!Core.cultivationAt(s, px + dx, py + dy, p.z);
      }
    }
    const first = near && !folding;
    folding = near;
    if (first) consider({ kind: 'wiki.fold', name: t('wiki.name'), description: t('wiki.fold') }, 'nearby');
    if (!talking && !asking && memory.mode === 'chatty') {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const tile = { x: px + dx, y: py + dy }, info = describeWorld(s, tile.x, tile.y, p.z);
        if (info && memory.decide(info.kind, 'nearby', clock) === 'speak') { look(tile); say(info, 'nearby', true, tile); return; }
      }
    }
  }

  // A finger (or the mouse) held still on the map, at canvas point (x, y):
  // Wiki answers for what is there, and keeps answering as it slides.
  function holdAt(x, y, first) {
    const w = cam.unproject(x, y), tile = { x: Math.floor(w.x), y: Math.floor(w.y) }, key = tile.x + ',' + tile.y;
    look(tile);
    if (key === holdKey) return;
    holdKey = key;
    const info = infoAt(tile);
    if (info) { if (line?.kind !== info.kind || !focus || focus.x !== tile.x || focus.y !== tile.y) say(info, 'asked', true, tile); }
    else if (first) say(nothing(), 'asked');
  }

  return {
    get mode() { return memory.mode; },
    // A long press on the map (src/game/input.js). Returns whether Wiki takes
    // that finger: off, it doesn't, and the press is the game's.
    longPress(x, y) {
      if (off()) return false;
      stopAsking();
      holdKey = ''; press = { long: true }; pressNo++;
      holdAt(x, y, true);
      return true;
    },
    longPressMove(x, y) { if (press?.long) holdAt(x, y, false); },
    longPressEnd() {
      if (!press?.long) return;
      press = null; holdKey = ''; lookedAt = clock;
      hideAt = Math.max(hideAt, clock + LINGER_S);
    },
    setMode(mode) {
      if (!WIKI_MODES.includes(mode)) return;
      memory.mode = mode; keep(memory.save());
      if (mode === 'off') { stopAsking(); hush(); }
    },
    // Each frame. Wiki keeps real time: calm frames come seldom.
    update(dt) {
      if (off()) return;
      clock = performance.now() / 1000 - started;
      fold += ((folding ? 1 : 0) - fold) * Math.min(1, dt * 4);
      if ((scanIn -= dt) <= 0) { scanIn = SCAN_EVERY_S; scan(); }
      if (!memory.known.has('wiki.hello') && clock > HELLO_AFTER_S && !talking && !asking) say(hello(), 'pointed');
      if (line && !asking && !press?.long && clock > hideAt) hush();
      if (lookAt && !press && clock - lookedAt > LOOK_HOLD_S && !talking) lookAt = null;
    },
    // Wiki's pose for the rig (null hides Wiki).
    pose() {
      if (off()) return null;
      const p = state().player;
      return {
        look: lookAt ? { x: lookAt.x + 0.5 - p.x, y: lookAt.y + 0.5 - p.y } : null,
        fold, talk: line && talking ? clock - line.started : null,
        rest: !lookAt && clock - lookedAt > REST_AFTER_S,
        // What Wiki is talking about, outlined: a tile or Mica, and how far faded in.
        focus: focus && talking ? { ...focus, alpha: Math.min(1, (clock - focus.at) / FOCUS_IN_S) } : null
      };
    },
    // After drawing: where Wiki is on the canvas ({x, y, r}), or Mica's head
    // when the 2D figure stands in, for taps and drags that start on it.
    place(at) { anchor = at; },
    // For tests: whether Wiki is holding a tap for its next answer.
    get asking() { return asking; },
    // What Wiki is saying now (it stays in the log after).
    get line() { return !talking ? null : line && { kind: line.kind, name: line.name, text: line.description }; },
    get focus() { return !talking ? null : focus; }
  };
}
