/* MORE THAN ENOUGH — browser entry point. Wires the modules together and runs
 * the frame loop: input -> controller -> core step -> effects -> render. */

import * as Core from '../core/index.js';
import { VERSION } from '../version.js';
import { findElements } from './dom.js';
import { createCamera } from './camera.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createSheet } from './sheet.js';
import { createController } from './controller.js';
import { createPerf } from './perf.js';
import { createLook } from './look/look.js';
import { createTextures, loadDefaultPack } from './textures.js';
import { createYard } from './yard.js';
import { render } from './render/renderer.js';
import { groundHeight } from './render/terrain.js';
import { createDescent } from './render/descent.js';
import { loadGame, saveGame, savedElsewhere, onSavedElsewhere, adopt, loadView, saveView } from './storage.js';
import { createFork } from './fork.js';

const SAVE_EVERY = 3;       // seconds between autosaves
const WAKE_CHANCE = 0.35;   // boat ripples per moving frame

const el = findElements();
el.verText.textContent = 'v' + VERSION;
window.MTE_VERSION = VERSION;  // for the crash report

// Nothing is drawn until the default texture pack is in. If it can't load,
// that's a crash: say exactly what broke.
const look = createLook();
let defaultPack;
try {
  defaultPack = await loadDefaultPack();
} catch (err) {
  window.MTE_CRASH(err.message);
  throw err;
}
look.use(defaultPack);

const cam = createCamera(el.canvas);
const descent = createDescent(el.canvas);
cam.relief = (x, y) => groundHeight(game.state.world, x, y, cam.z);
const audio = createAudio();
audio.wakeOn(el.canvas);
// What you gather flies to its pile in the yard (yard is made just below).
const fx = createEffects(look, (res) => yard.landing(res));
const yard = createYard({ fx, look });
const hud = createHud(el, look);
const perf = createPerf(el, el.canvas, audio);

const loaded = loadGame();
let saveDue = false;
let saveError = null;

// The one place the current state lives. Everything else reads game.state.
const game = {
  state: loaded.state,
  saveSoon() { saveDue = true; },
  saveNow(force = false) {
    saveDue = false;
    if (fork.open) return; // the player hasn't picked a world yet
    const r = saveGame(game.state, force);
    if (r && r.conflict) return forked(r.conflict);
    const err = r && r.error;
    // Say so the moment saving starts failing (and again if it recovers and
    // fails later), so progress is never lost silently.
    if (err && !saveError) {
      console.error('Saving failed:', err);
      hud.toast('Saving failed — progress is not being kept (' + (err.name || 'error') + ')');
    }
    saveError = err;
  },
  // Swaps in a different world (embark, reset).
  replace(next) {
    game.state = next;
    fx.clear();
    yard.reset();
    controller.forget();
    input.release();
    sheet.close();
    lastTileKey = -1;
    hud.update(next);
    game.saveNow();
  }
};

// Another tab saved this world since this tab did: don't overwrite it, ask.
const fork = createFork(el.fork);
// The other tab may still be open and saving while this one asks, so the
// choice shows (and takes) its newest save, not the one that started it:
// adopting an older copy would only conflict again on the next save.
function forked(raw) {
  input.release();
  fork.show(game.state, Core.deserialize(raw), {
    keepOther: () => {
      const latest = adopt(savedElsewhere() || raw);
      if (latest) game.replace(latest);
      else location.reload(); // saved by a newer version of the game
    },
    keepMine: () => game.saveNow(true),
    reload: () => location.reload()
  });
}
function checkFork() {
  const raw = !document.hidden && savedElsewhere();
  if (raw) forked(raw);
}
onSavedElsewhere(checkFork);

const controller = createController({ game, cam, fx, audio, hud, look });

const sheet = createSheet(el, {
  getState: () => game.state,
  look,
  onTab: (tab) => { if (tab === 'awards') hud.awardsSeen(); },
  actions: { buy: controller.buy, place: controller.place, placeProp: controller.placeProp, embark: controller.embark }
});

const textures = createTextures({
  el, look, defaultPack,
  changed: () => { hud.repaint(); sheet.render(); },
  toast: hud.toast
});

const trailTargets = (trail) => (trail && trail.leftButton ? Core.sweepTargets(game.state, trail.points) : []);

const input = createInput({
  canvas: el.canvas, cam, el,
  handlers: {
    blocked: () => sheet.isOpen || fork.open,
    dismiss: () => sheet.close(),
    tap: controller.tap,
    actionPressed: controller.press,
    trailEnded: controller.trailEnded,
    viewChanged: () => { hud.view(cam); saveView(cam, input.invert); },
    command(cmd) {
      if (cmd === 'perf') perf.toggle();
      else if (cmd === 'close') sheet.close();
      else sheet.toggle(cmd);
    }
  }
});


el.build.addEventListener('click', () => sheet.toggle('build'));
el.upgrade.addEventListener('click', () => sheet.toggle('upgrades'));
el.awards.addEventListener('click', () => sheet.toggle('awards'));
el.mine.addEventListener('click', controller.toggleMine);
el.reset.addEventListener('click', controller.reset);
// Which way a drag moves you: toward the finger (a joystick), or away from it,
// pulling the map along like scrolling.
function setDrag(invert) {
  input.invert = invert;
  el.dragMode.textContent = invert ? 'pull the map' : 'walk that way';
  el.drag.setAttribute('aria-pressed', String(invert));
}
el.drag.addEventListener('click', () => { setDrag(!input.invert); saveView(cam, input.invert); });
el.mute.addEventListener('click', () => {
  audio.muted = !audio.muted;
  el.mute.textContent = 'Sound: ' + (audio.muted ? 'off' : 'on');
});

/* -------------------------------------------------------------- loop */

// Work that runs on its own cadence rather than every frame.
const timers = [
  { every: SAVE_EVERY, run: () => game.saveNow() },
  { every: 0.4, run: () => controller.checkGoals() },
  { every: 0.25, run: () => { hud.update(game.state); audio.drone(game.state.extractors.length, Core.overclockMult(game.state)); } }
].map((t) => ({ ...t, left: t.every }));

let lastTileKey = -1;
let moving = false;

function update(dt) {
  const s = game.state;
  const moved = controller.steer(dt, input.moveVector());
  moving = moved;
  Core.step(s, dt);

  // Logistics reports auto-collections as events; show them as flyers.
  for (const e of s.events) if (e.z === s.player.z) fx.flyersFrom(e.x, e.y, e.res, e.amt);
  s.events.length = 0;

  const tileKey = Core.packKey(Math.floor(s.player.x), Math.floor(s.player.y), s.player.z);
  if (tileKey !== lastTileKey) {
    lastTileKey = tileKey;
    Core.revealAround(s);
  }

  controller.tick(dt, input.held && !input.trail, input.holdPoint());
  if (moved && Core.onWater(s) && Math.random() < WAKE_CHANCE) {
    const f = controller.facing, len = Math.hypot(f.x, f.y) || 1;
    fx.wake(s.player.x, s.player.y, f.x / len, f.y / len);
  }
  fx.update(dt);

  if (saveDue) game.saveNow();
  for (const t of timers) {
    if ((t.left -= dt) <= 0) { t.left = t.every; t.run(); }
  }
  hud.tick(dt);
  hud.updateButtons(s);
  sheet.tick();
}

function view() {
  const s = game.state;
  const underground = Core.isUnderground(s);
  return {
    facing: controller.facing,
    moving,
    yard,
    harvestTarget: Core.harvestTarget(s),
    buildTargets: sheet.isOpen && sheet.tab === 'build'
      ? Core.DEPOSIT_EXTRACTORS.map((k) => Core.buildTarget(s, k)).filter(Boolean) : [],
    trail: input.trail,
    trailTargets: trailTargets(input.trail),
    underground,
    joy: input.joy
  };
}

let last = 0;
let shownState = null, shownZ = 0; // the world and layer the last frame showed
function frame(now) {
  const intervalMs = last ? now - last : 0;
  const dt = Math.min(0.1, intervalMs / 1000); // the game never jumps more than this
  last = now;
  try {
    const t0 = performance.now();
    if (!document.hidden && !fork.open) update(dt);
    cam.tick(dt);
    yard.update(game.state, dt);
    const t1 = performance.now();
    // Changed layers in this world since the last frame: show the trip.
    const z = game.state.player.z;
    if (game.state === shownState && z !== shownZ) descent.start(shownZ, z);
    shownState = game.state; shownZ = z;
    const stats = render(cam, game.state, fx, view(), look);
    descent.draw(cam, look, dt);
    if (intervalMs > 0) perf.frame(intervalMs, t1 - t0, performance.now() - t1, stats.tiles);
    perf.tick(dt);
  } catch (err) {
    // Stop here and show what broke, rather than throwing every frame.
    window.MTE_CRASH(err);
    return;
  }
  requestAnimationFrame(frame);
}

/* -------------------------------------------------------------- boot */

function resize() {
  cam.resize();
  hud.view(cam);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
window.addEventListener('pagehide', () => game.saveNow());
document.addEventListener('visibilitychange', () => { if (document.hidden) game.saveNow(); else checkFork(); });

const savedView = loadView();
cam.setZoom(savedView.zoom);
cam.setTilt(savedView.tilt, true);
setDrag(savedView.invertDrag);
// The performance panel is for whoever is tuning the game, not for play:
// F3 toggles it, and ?perf in the address opens it (for phones).
perf.toggle(new URLSearchParams(location.search).has('perf'));
resize();
hud.repaint();
await textures.restore();
hud.update(game.state);
hud.updateButtons(game.state);
if (loaded.lost) hud.toast('Your old save could not be loaded — starting a new world');
requestAnimationFrame(frame);

// A small hook so the browser tests can inspect and adjust the real game.
window.MTE_GAME = {
  core: Core,
  look,
  textures,
  yard,
  getState: () => game.state,
  save: () => game.saveNow(),
  setPlayer(x, y) { game.state.player.x = x; game.state.player.y = y; controller.forget(); lastTileKey = -1; },
  addRes(r, n) { game.state.inv[r] += n; hud.update(game.state); },
  flyers: () => fx.flyers,
  audioState: () => audio.state(),
  audio,
  zoom: () => cam.zoom,
  tilePx: () => cam.tilePx,
  setZoom(z) { cam.setZoom(z); hud.view(cam); },
  tilt: () => cam.tilt,
  perf: () => perf.snapshot(),
  perfVisible: () => perf.visible,
  setTilt(t) { cam.setTilt(t, true); hud.view(cam); },
  project: (x, y, h) => cam.project(x, y, h),
  unproject: (sx, sy) => cam.unproject(sx, sy)
};
