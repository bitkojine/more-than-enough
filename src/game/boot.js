/* What the page does before the game can start, and small facts about the
 * page the game asks for: whether it's framed by another site, the game's
 * pictures and the 3D character, and what a problem report says about the
 * moment it happened. main.js runs these in order. */

import { createLook, loadDefaultPack, warmPictures } from './look/look.js';
import { where } from './problems.js';
import { t } from '../i18n/i18n.js';
import { lazy } from './lazy.js';

const LOCAL = ['localhost', '127.0.0.1'];

// Never inside another site's page: framed, the game could be shown under
// something else and trick taps onto Join or Remove. GitHub Pages can't send
// a header that forbids framing, so the game refuses and offers itself in a
// tab of its own. Says whether it was framed (and so must go no further).
export function refuseFraming(win = window) {
  if (win.top === win.self) return false;
  const open = document.createElement('a');
  open.id = 'framed';
  open.href = location.href;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = t('game.framed');
  document.body.replaceChildren(open);
  return true;
}

// The game's pictures, loaded before anything is drawn: if they can't load,
// that's a crash, saying exactly what broke. `packUrl` carries this module's
// ?v= cache-busting hash (the deployed game is one bundle in main.js's
// place, so it resolves the same there).
//
// The 3D character is a lazy presentation module, shared with the dev
// viewer, and it draws every player. Until it settles nobody is drawn but
// their shadow (render/sprites.js), and if it fails that stays so. Clipping is illegal: a local or
// ?clips build throws when Mica's parts cross.
export async function loadLook(packUrl, page = location) {
  const look = createLook();
  try {
    look.use(await loadDefaultPack(packUrl));
  } catch (err) {
    window.MTE_CRASH(err.message);
    throw err;
  }
  warmPictures();
  const checkClips = LOCAL.includes(page.hostname) || new URLSearchParams(page.search).has('clips');
  look.rigReady = lazy('./render/rigged-character.js')
    .then(({ createRiggedCharacter }) => {
      look.rig = createRiggedCharacter({ checkClips });
      return look.rig;
    })
    .catch((error) => {
      look.rigError = String(error);
      return null;
    })
    .finally(() => {
      look.rigSettled = true;
    });
  return look;
}

// The local-only deterministic replay (the playtest drives commands and ticks).
export const replaying = (page = location) =>
  LOCAL.includes(page.hostname) && new URLSearchParams(page.search).has('playtestReplay');

// Plugging in the charger may give a hot or saving phone its speed back
// (where the browser says so: not Safari).
export function onCharging(retry, nav = navigator) {
  if (!nav.getBattery) return;
  nav.getBattery().then(
    (b) =>
      b.addEventListener('chargingchange', () => {
        if (b.charging) retry();
      }),
    () => {}
  );
}

// What a problem report says about the moment it happened: the world, where
// you stood, the view, the game time, the frame rate and what was open.
// For developers, in English.
export function reportContext({ s, cam, canvas, quality, frames, open }) {
  const w = s.world;
  return {
    world: `${s.shared ? 'shared' : 'solo'}, ${w.cultivation ? 'crystal' : 'old economy'}, seed ${w.seed}`, // i18n-ok: a report for developers, in English
    at: where(s.player),
    view: `zoom ${cam.zoom.toFixed(2)}x, tile ${cam.tilePx.toFixed(1)} CSS px, canvas ${canvas.width}x${canvas.height} at ${cam.dpr}x, quality ${quality}`, // i18n-ok: a report for developers, in English
    'game time': s.time.toFixed(1), // i18n-ok: a report for developers, in English
    frames: `${frames.fps.toFixed(0)} fps, worst ${frames.worstMs.toFixed(0)} ms`, // i18n-ok: a report for developers, in English
    open:
      [
        open.sheet && 'sheet ' + open.sheet, // i18n-ok: a report for developers, in English
        open.descent && 'changing layer', // i18n-ok: a report for developers, in English
        open.fork && 'picking a world' // i18n-ok: a report for developers, in English
      ]
        .filter(Boolean)
        .join(', ') || 'the map' // i18n-ok: a report for developers, in English
  };
}

// Whether a point on screen is near enough to count as seen (a flyer just
// past the edge still flies to its pile).
export const onScreen = (p, width, height, margin) =>
  p.x > -margin && p.y > -margin && p.x < width + margin && p.y < height + margin;
