/* Wiki, the mycelium sprite on Mica's hood (drawn by render/wiki-model.js).
 * It looks at what the player points at and says one short line about the
 * things worth knowing: once each, unless asked again. Hovering asks nothing
 * (Watch, 2026-10-25): press and hold the mouse or a finger on a world
 * thing (slide to ask about the next). Mica and Wiki have no pointer targets.
 * What Wiki says goes in the message log (messages.js), where it
 * stays to be read; whatever Wiki is talking about is
 * outlined in the world (render/focus.js) while it talks. Presentation only:
 * nothing here changes the game. What Wiki has told is kept per browser
 * (wiki-memory.js), so it carries over to new worlds like any knowledge. */
import * as Core from '../core/index.js';
import { t } from '../i18n/i18n.js';
import { describeWorld } from './tooltips.js';
import { createWikiMemory, WIKI_MODES } from './wiki-memory.js';

const LOOK_HOLD_S = 1.5; // Wiki keeps looking a moment after the pointer leaves
const REST_AFTER_S = 6; // then it closes its eyes
const HELLO_AFTER_S = 8; // its first hello waits a moment after the game opens
const SCAN_EVERY_S = 0.5; // looking around Mica for firsts and for crystal
const FOLD_NEAR = 2; // tiles: living crystal this close shuts Wiki's cap
const FOCUS_IN_S = 0.15; // the outline fades in this fast
const LINGER_S = 3; // a long press's answer stays this long after the finger lifts

export function createWiki({ cam, state, saved, keep, messages }) {
  const memory = createWikiMemory(saved);
  const started = performance.now() / 1000;
  let clock = 0,
    scanIn = 0,
    fold = 0,
    folding = false;
  let line = null,
    hideAt = 0,
    talking = false,
    pressNo = 0;
  let lookAt = null,
    lookedAt = -Infinity;
  let holding = false;
  let focus = null,
    holdKey = ''; // what the outline is around; the tile a long press is on

  const hello = () => ({ kind: 'wiki.hello', name: t('wiki.name'), description: t('wiki.hello') });
  const nothing = () => ({ kind: null, name: t('wiki.name'), description: t('wiki.nothing') });
  const off = () => memory.mode === 'off';

  // `tile`: where in the world the thing is ({x, y}), to outline it.
  // Into the log, and Wiki talks (and rings the thing) for a while. A long
  // press that slides over the map keeps rewriting its one line.
  function say(info, how, link = true, tile = null) {
    if (!info) return;
    line = info;
    focus = !tile || !info.kind ? null : { x: tile.x, y: tile.y, z: state().player.z, at: clock };
    const linked = link && info.kind && !info.kind.startsWith('wiki.');
    const own = info.name === t('wiki.name');
    messages.add(
      {
        kind: 'wiki',
        name: own ? '' : info.name,
        text: info.description || '',
        link: linked ? 'wiki/#search/' + encodeURIComponent(info.name) : ''
      },
      holding ? 'press' + pressNo : null
    );
    talking = true;
    line.started = clock;
    hideAt = clock + Math.max(4, 1.5 + (info.description || '').length * 0.05);
    if (info.kind) {
      memory.told(info.kind, how, clock);
      keep(memory.save());
    }
  }
  function hush() {
    line = null;
    focus = null;
    talking = false;
  }
  function consider(info, how) {
    if (info && memory.decide(info.kind, how, clock) === 'speak') say(info, how);
  }

  function infoAt(tile) {
    return describeWorld(state(), tile.x, tile.y, state().player.z);
  }
  function look(tile) {
    lookAt = tile;
    lookedAt = clock;
  }

  // Around Mica: the first sight of something new, and living crystal, which
  // light harms, so Wiki keeps its cap shut beside it (it gives no light at
  // all; the fold is a cue, not a rule).
  function scan() {
    const s = state(),
      p = s.player,
      px = Math.floor(p.x),
      py = Math.floor(p.y);
    let near = false;
    if (s.cultivation) {
      near = !!(s.cultivation.starter || s.inv.crystal > 0);
      for (let dx = -FOLD_NEAR; dx <= FOLD_NEAR && !near; dx++)
        for (let dy = -FOLD_NEAR; dy <= FOLD_NEAR && !near; dy++) {
          const type = Core.tileAt(s.world, px + dx, py + dy, p.z);
          near =
            type === Core.T.CRYSTAL ||
            type === Core.T.CRYSTAL_SEAM ||
            !!Core.cultivationAt(s, px + dx, py + dy, p.z);
        }
    }
    const first = near && !folding;
    folding = near;
    if (first)
      consider({ kind: 'wiki.fold', name: t('wiki.name'), description: t('wiki.fold') }, 'nearby');
    if (!talking && memory.mode === 'chatty') {
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const tile = { x: px + dx, y: py + dy },
            info = describeWorld(s, tile.x, tile.y, p.z);
          if (info && memory.decide(info.kind, 'nearby', clock) === 'speak') {
            look(tile);
            say(info, 'nearby', true, tile);
            return;
          }
        }
    }
  }

  // A finger (or the mouse) held still on the map, at canvas point (x, y):
  // Wiki answers for what is there, and keeps answering as it slides.
  function holdAt(x, y, first) {
    const w = cam.unproject(x, y),
      tile = { x: Math.floor(w.x), y: Math.floor(w.y) },
      key = tile.x + ',' + tile.y;
    look(tile);
    if (key === holdKey) return;
    holdKey = key;
    const info = infoAt(tile);
    if (info) {
      if (line?.kind !== info.kind || !focus || focus.x !== tile.x || focus.y !== tile.y)
        say(info, 'asked', true, tile);
    } else if (first) say(nothing(), 'asked');
  }

  return {
    get mode() {
      return memory.mode;
    },
    // A long press on the map (src/game/input.js). Returns whether Wiki takes
    // that finger: off, it doesn't, and the press is the game's.
    longPress(x, y) {
      if (off()) return false;
      holdKey = '';
      holding = true;
      pressNo++;
      holdAt(x, y, true);
      return true;
    },
    longPressMove(x, y) {
      if (holding) holdAt(x, y, false);
    },
    longPressEnd() {
      if (!holding) return;
      holding = false;
      holdKey = '';
      lookedAt = clock;
      hideAt = Math.max(hideAt, clock + LINGER_S);
    },
    setMode(mode) {
      if (!WIKI_MODES.includes(mode)) return;
      memory.mode = mode;
      keep(memory.save());
      if (mode === 'off') {
        holding = false;
        holdKey = '';
        hush();
      }
    },
    // Each frame. Wiki keeps real time: calm frames come seldom.
    update(dt) {
      if (off()) return;
      clock = performance.now() / 1000 - started;
      fold += ((folding ? 1 : 0) - fold) * Math.min(1, dt * 4);
      if ((scanIn -= dt) <= 0) {
        scanIn = SCAN_EVERY_S;
        scan();
      }
      if (!memory.known.has('wiki.hello') && clock > HELLO_AFTER_S && !talking)
        say(hello(), 'pointed');
      if (line && !holding && clock > hideAt) hush();
      if (lookAt && !holding && clock - lookedAt > LOOK_HOLD_S && !talking) lookAt = null;
    },
    // Wiki's pose for the rig (null hides Wiki).
    pose() {
      if (off()) return null;
      const p = state().player;
      return {
        look: lookAt ? { x: lookAt.x + 0.5 - p.x, y: lookAt.y + 0.5 - p.y } : null,
        fold,
        talk: line && talking ? clock - line.started : null,
        rest: !lookAt && clock - lookedAt > REST_AFTER_S,
        // What Wiki is talking about: a world tile, and how far faded in.
        focus:
          focus && talking
            ? { ...focus, alpha: Math.min(1, (clock - focus.at) / FOCUS_IN_S) }
            : null
      };
    },
    // What Wiki is saying now (it stays in the log after).
    get line() {
      return !talking ? null : line && { kind: line.kind, name: line.name, text: line.description };
    },
    get focus() {
      return !talking ? null : focus;
    }
  };
}
