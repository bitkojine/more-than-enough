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
import { render } from './render/renderer.js';
import { loadGame, saveGame } from './storage.js';

const SAVE_EVERY = 3;       // seconds between autosaves
const HINT_RANGE = 200;     // tiles the compass searches for undiscovered resources
const WAKE_CHANCE = 0.35;   // boat ripples per moving frame

const el = findElements();
el.verText.textContent = 'v' + VERSION;

const cam = createCamera(el.canvas);
const audio = createAudio();
const fx = createEffects();
const hud = createHud(el);

const loaded = loadGame();
let saveDue = false;

// The one place the current state lives. Everything else reads game.state.
const game = {
  state: loaded.state,
  saveSoon() { saveDue = true; },
  saveNow() { saveDue = false; saveGame(game.state); },
  // Swaps in a different world (embark, reset).
  replace(next) {
    game.state = next;
    fx.clear();
    controller.forget();
    input.release();
    sheet.close();
    lastTileKey = -1;
    hintDir = null;
    hud.update(next);
    game.saveNow();
  }
};

const controller = createController({ game, cam, fx, audio, hud });

const sheet = createSheet(el, {
  getState: () => game.state,
  actions: { buy: controller.buy, place: controller.place, embark: controller.embark }
});

const trailTargets = (trail) => (trail && trail.leftButton ? Core.sweepTargets(game.state, trail.points) : []);

const input = createInput({
  canvas: el.canvas, cam, el,
  handlers: {
    blocked: () => sheet.isOpen,
    tap: controller.tap,
    actionPressed: controller.press,
    trailChanged: (trail) => hud.trailHint(trailTargets(trail).length, Core.isUnderground(game.state)),
    trailEnded: controller.trailEnded,
    zoomed: () => hud.zoom(cam.zoom),
    command: (cmd) => (cmd === 'close' ? sheet.close() : sheet.toggle(cmd))
  }
});

el.build.addEventListener('click', () => sheet.toggle('build'));
el.upgrade.addEventListener('click', () => sheet.toggle('upgrades'));
el.mine.addEventListener('click', controller.toggleMine);
el.reset.addEventListener('click', controller.reset);
el.help.addEventListener('click', () => { sheet.close(); hud.openTutorial(); });
el.mute.addEventListener('click', () => {
  audio.muted = !audio.muted;
  el.mute.textContent = 'Sound: ' + (audio.muted ? 'off' : 'on');
});

/* ----------------------------------------------------------- compass */

let hintDir = null;

// Points toward the nearest ore until it's discovered, then crystal.
function updateHint() {
  const s = game.state, p = s.player;
  hintDir = null;
  if (Core.isUnderground(s) || (s.discovered.ore && s.discovered.crystal)) return;
  const want = s.discovered.ore ? Core.T.CRYSTAL : Core.T.ORE;
  const t = Core.nearestTile(p.x, p.y, HINT_RANGE, (x, y) => Core.tileAt(s.world, x, y, Core.SURFACE) === want);
  if (t) hintDir = { x: t.x + 0.5 - p.x, y: t.y + 0.5 - p.y };
}

/* -------------------------------------------------------------- loop */

// Work that runs on its own cadence rather than every frame.
const timers = [
  { every: SAVE_EVERY, run: () => game.saveNow() },
  { every: 0.4, run: () => controller.checkGoals() },
  { every: 0.25, run: () => { hud.update(game.state); audio.drone(game.state.extractors.length, Core.overclockMult(game.state)); } },
  { every: 0.5, run: updateHint }
].map((t) => ({ ...t, left: t.every }));

let lastTileKey = -1;

function update(dt) {
  const s = game.state;
  const moved = controller.steer(dt, input.moveVector());
  Core.step(s, dt);

  // Logistics reports auto-collections as events; show them as flyers.
  for (const e of s.events) if (e.z === s.player.z) fx.flyersFrom(e.x, e.y, e.res, e.amt);
  s.events.length = 0;

  const tileKey = Core.packKey(Math.floor(s.player.x), Math.floor(s.player.y), s.player.z);
  if (tileKey !== lastTileKey) {
    lastTileKey = tileKey;
    Core.revealAround(s);
  }

  controller.tick(dt, input.held && !input.trail);
  if (moved && Core.onWater(s) && Math.random() < WAKE_CHANCE) {
    const f = controller.facing, len = Math.hypot(f.x, f.y) || 1;
    fx.wake(s.player.x, s.player.y, f.x / len, f.y / len);
  }
  fx.update(dt, s.player);

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
    harvestTarget: Core.harvestTarget(s),
    buildTargets: sheet.isOpen && sheet.tab === 'build'
      ? Core.DEPOSIT_EXTRACTORS.map((k) => Core.buildTarget(s, k)).filter(Boolean) : [],
    trail: input.trail,
    trailTargets: trailTargets(input.trail),
    underground,
    joy: input.joy,
    hasMoved: controller.hasMoved,
    hintDir: s.stats.gathers >= 3 ? hintDir : null,
    prompt: !controller.hasMoved ? 'Drag anywhere to move'
      : s.stats.gathers === 0 ? 'Hold GATHER (or tap a resource tile)' : null
  };
}

let last = 0;
function frame(now) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (!document.hidden) update(dt);
  render(cam, game.state, fx, view());
  requestAnimationFrame(frame);
}

/* -------------------------------------------------------------- boot */

function resize() {
  cam.resize();
  hud.zoom(cam.zoom);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
window.addEventListener('pagehide', () => game.saveNow());
document.addEventListener('visibilitychange', () => { if (document.hidden) game.saveNow(); });

resize();
hud.update(game.state);
hud.updateButtons(game.state);
updateHint();
if (loaded.lost) hud.toast('Your old save could not be loaded — starting a new world');
requestAnimationFrame(frame);

// A small hook so the browser tests can inspect and adjust the real game.
window.MTE_GAME = {
  core: Core,
  getState: () => game.state,
  save: () => game.saveNow(),
  setPlayer(x, y) { game.state.player.x = x; game.state.player.y = y; controller.forget(); lastTileKey = -1; },
  addRes(r, n) { game.state.inv[r] += n; hud.update(game.state); },
  flyers: () => fx.flyers,
  audioState: () => audio.state(),
  zoom: () => cam.zoom,
  tilePx: () => cam.tilePx,
  setZoom(z) { cam.setZoom(z); hud.zoom(cam.zoom); }
};
