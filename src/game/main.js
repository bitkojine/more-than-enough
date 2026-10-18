/* MORE THAN ENOUGH — browser entry point. Wires the modules together and runs
 * the frame loop: input -> controller -> core step -> effects -> render. */

// First: an admin's copy swaps this browser's storage before anything reads it.
import { copy } from './copy.js';
import * as Core from '../core/index.js';
import { VERSION } from '../version.js';
import { findElements } from './dom.js';
import { createCamera } from './camera.js';
import { createAudio } from './audio.js';
import { sceneFor } from './music/score.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createSheet } from './sheet.js';
import { createWorldMap } from './worldmap.js';
import { createController } from './controller.js';
import { createPerfect } from './perfect.js';
import { createPerf } from './perf.js';
import { createQuality, frameDue, FULL_FPS, CALM_FPS, CALM_AFTER_S } from './quality.js';
import { createLook } from './look/look.js';
import { createTextures, loadDefaultPack } from './textures.js';
import { loadSavedPack } from './look/store.js';
import { createYard } from './yard.js';
import { render } from './render/renderer.js';
import { groundHeight } from './render/terrain.js';
import { createDescent } from './render/descent.js';
import { createActor } from './render/motion.js';
import { loadGame, saveGame, savedElsewhere, onSavedElsewhere, adopt, loadView, saveView } from './storage.js';
import { createFork } from './fork.js';
import { createAsk } from './ask.js';
import { createFbi } from './fbi.js';
import { createTogether, policyUrl } from './together.js';
import { createUpdater, takeUpdatedFrom } from './update.js';
import { createNews } from './news.js';
import { fmt, fmtDuration } from './format.js';
import { t, localizePage, setLanguage, nextLanguage, DEVICE } from '../i18n/i18n.js';

const SAVE_EVERY = 3;       // seconds between autosaves
const WAKE_CHANCE = 0.35;   // boat ripples per moving frame

// Every word on the page in the player's language first.
localizePage();

// Never inside another site's page: framed, the game could be shown under
// something else and trick taps onto Join or Remove. GitHub Pages
// can't send a header that forbids framing, so the game refuses here and
// offers itself in a tab of its own.
if (window.top !== window.self) {
  const open = document.createElement('a');
  open.id = 'framed';
  open.href = location.href;
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = t('game.framed');
  document.body.replaceChildren(open);
  await new Promise(() => {}); // and go no further
}

const el = findElements();
el.verText.textContent = 'v' + VERSION;
window.MTE_VERSION = VERSION;  // for the crash report

// Nothing is drawn until the default texture pack is in. If it can't load,
// that's a crash: say exactly what broke.
const look = createLook();
// The player's own pack (if any) is read from this browser's database while
// the default one loads, not after it.
const savedPack = loadSavedPack();
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
// This browser's own conveniences: zoom, drag direction, music.
const savedView = loadView();
function keepView() {
  savedView.zoom = cam.zoom;
  savedView.invertDrag = input.invert;
  savedView.music = audio.music;
  saveView(savedView);
}
// What you gather flies to its pile in the yard (yard is made just below).
const fx = createEffects(look, (res) => yard.landing(res));
const yard = createYard({ fx, look });
const hud = createHud(el, look);
// Fewer pixels and no frosted glass on a device that can't keep up.
const quality = createQuality(savedView.quality, window.devicePixelRatio || 1, applyQuality);
function applyQuality() {
  cam.maxDpr = quality.dpr;
  document.documentElement.classList.toggle('no-glass', !quality.glass);
  savedView.quality = quality.level;
  saveView(savedView);
  resize();
}
const perf = createPerf(el, el.canvas, audio, quality);
// Plugging in the charger may give a hot or saving phone its speed back
// (where the browser says so: not Safari).
if (navigator.getBattery) {
  navigator.getBattery().then((b) => b.addEventListener('chargingchange', () => { if (b.charging) quality.retry(); }), () => {});
}
// The last touch, click, key or wheel: the map is drawn at full pace for a
// few seconds after one, and calmly (fewer frames, less heat) otherwise.
let lastTouch = 0;
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) {
  window.addEventListener(ev, () => { lastTouch = performance.now(); }, { capture: true, passive: true });
}

const loaded = loadGame();
let saveDue = false;
let saveError = null;

// The one place the current state lives. Everything else reads game.state.
const game = {
  state: loaded.state,
  saveSoon() { saveDue = true; },
  saveNow(force = false) {
    saveDue = false;
    // A shared world is saved to its room (and a copy here), never over your own.
    if (game.state.shared) return together.save(game.state);
    if (fork.open) return; // the player hasn't picked a world yet
    game.state.seen = Date.now(); // for what your buildings make while you're away (catchUp)
    const r = saveGame(game.state, force);
    if (r && r.conflict) return forked(r.conflict);
    const err = r && r.error;
    // Say so the moment saving starts failing (and again if it recovers and
    // fails later), so progress is never lost silently.
    if (err && !saveError) {
      console.error('Saving failed:', err);
      hud.toast(t('toast.saveFailed', { error: err.name || err }));
    }
    saveError = err;
  },
  // Swaps in a different world (embark, a shared world).
  replace(next) {
    game.state = next;
    fx.clear();
    yard.reset();
    controller.forget();
    perfect.forget();
    input.release();
    input.releasePerfect();
    sheet.close();
    lastTileKey = -1;
    region = shownRegion = null;
    hud.newWorld();
    hud.update(next);
    game.saveNow();
    game.changedMode();
  },
  // Just arrived in a world new to you (a friend's): what to go for.
  arrived() { showNext(); },
  // For playing together (together.js).
  facing: () => controller.facing,
  moving: () => moving,
  act: () => actor.sent,
  // Friends changed the world: what's shown around you may differ now.
  worldChanged() { hud.update(game.state); },
  // The room says you stand somewhere else (you came back from another
  // device, or after playing offline): you're moved there.
  moveTo(p) {
    const s = game.state;
    Object.assign(s.player, { x: p.x, y: p.y, z: p.z });
    s.underground.deepest = Math.min(s.underground.deepest, p.z);
    controller.forget();
    lastTileKey = -1;
    hud.update(s);
  },
  // Alone or together: the settings that differ.
  changedMode() {
    const shared = !!game.state.shared;
    el.invitesBtn.hidden = !shared;
    el.playersBtn.hidden = !shared;
    el.worldsBtn.hidden = !together.available;
    el.worldNow.textContent = together.worldName;
    together.refresh();
  }
};

// Another tab saved this world since this tab did: don't overwrite it, ask.
const fork = createFork(el.fork);
// The other tab may still be open and saving while this one asks, so the
// choice shows (and takes) its newest save, not the one that started it:
// adopting an older copy would only conflict again on the next save.
function forked(raw) {
  input.release();
  input.releasePerfect();
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
// Only while playing that world: in a shared one this tab never writes it,
// so there's nothing to choose (leaving reads the newest save anyway).
function checkFork() {
  const raw = !document.hidden && !game.state.shared && savedElsewhere();
  if (raw) forked(raw);
}
onSavedElsewhere(checkFork);

const ask = createAsk(el.ask);
const news = createNews(el.news);
el.privacyLink.href = policyUrl(); // in the player's language
const fbi = createFbi(el.fbi);
// Never an old version: a new deploy saves and reloads the game at once.
const updater = createUpdater({ save: () => game.saveNow() });
const together = createTogether({ game, hud, ask: ask.ask, el, fbi, checkUpdate: updater.check, closeSheet: () => sheet.close(), showPlayers: () => sheet.show('players'), onAway: (secs, made, fixed) => sayAway(secs, made, fixed) });
const actor = createActor(); // what the wanderer is doing, to animate it
// Players who gather a tap at a time are told, once, that holding keeps going.
const HOLD_TIP_AFTER = 8;   // single gathers before the tip
const HOLD_TIP_SECONDS = 6; // long enough to read
const ASIDE_SECONDS = 9;   // the note that your save was kept to one side
let singleGathers = 0;
function gathered(held) {
  if (savedView.holdTip) return;
  if (!held && (++singleGathers < HOLD_TIP_AFTER || hud.celebrating)) return;
  savedView.holdTip = true;  // found it, or told now: never again
  saveView(savedView);
  if (!held) hud.toast(t('tip.hold'), HOLD_TIP_SECONDS);
}
// Early on, opening the game (or arriving in a new world) says what the
// next milestone is, so a new player's first read is what to do.
const NEXT_SHOWN_BELOW = 3; // milestones reached, after which players know where to look
function showNext() {
  controller.checkGoals(); // one reached right here says what's next itself
  const next = Core.nextGoal(game.state);
  if (next && !hud.celebrating && game.state.goalIndex < NEXT_SHOWN_BELOW) hud.nextUp(next.text);
}
const controller = createController({ game, cam, fx, audio, hud, look, ask: ask.ask, actor, gathered });
const perfect = createPerfect({ game, controller, hud });

const worldMap = createWorldMap(el.worldMap, { getState: () => game.state, look });
const sheet = createSheet(el, {
  getState: () => game.state,
  look,
  onTab: (tab) => {
    if (tab === 'awards') hud.awardsSeen();
    if (tab === 'map') worldMap.show();
    if (tab === 'invites') together.listInvites();
    if (tab === 'worlds') together.listWorlds();
    if (tab === 'players') together.listPlayers();
  },
  actions: { buy: controller.buy, place: controller.place, placeProp: controller.placeProp, embark: controller.embark }
});

const textures = createTextures({
  el, look, defaultPack,
  changed: () => { hud.repaint(); sheet.render(); },
  toast: hud.toast
});

const trailTargets = (trail) => (trail && trail.leftButton ? Core.sweepTargets(game.state, trail.points) : []);

// Something on screen that needs the player: a sheet or a dialog. The
// Perfect button waits while one is up.
const blocked = () => sheet.isOpen || fork.open || ask.open || fbi.open || news.open;
const input = createInput({
  canvas: el.canvas, cam, el,
  handlers: {
    blocked,
    dismiss: () => sheet.close(),
    tap(x, y) {
      // On your sign: copy its link. Anywhere else: the world.
      const r = signRect;
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) together.copyLink();
      else controller.tap(x, y);
    },
    actionPressed: controller.press,
    perfectPressed: perfect.press,
    perfectReleased: perfect.release,
    trailEnded: controller.trailEnded,
    viewChanged: () => { hud.view(cam); keepView(); },
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
el.settings.addEventListener('click', () => sheet.toggle('settings'));
el.map.addEventListener('click', () => sheet.toggle('map'));
el.mapIn.addEventListener('click', () => worldMap.zoom(1.5));
el.mapOut.addEventListener('click', () => worldMap.zoom(1 / 1.5));
el.mapMe.addEventListener('click', () => worldMap.centre());
el.resources.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) sheet.showCollected(chip.dataset.res);
});
el.mine.addEventListener('click', controller.toggleMine);
el.worldsBtn.addEventListener('click', () => sheet.show('worlds'));
el.invitesBtn.addEventListener('click', () => sheet.show('invites'));
el.playersBtn.addEventListener('click', () => sheet.show('players'));
el.nerdsBtn.addEventListener('click', () => sheet.show('nerds'));
el.perfBtn.addEventListener('click', () => perf.toggle());
window.addEventListener('resize', together.refit);
// Which way a drag moves you: toward the finger (a joystick), or away from it,
// pulling the map along like scrolling.
function setDrag(invert) {
  input.invert = invert;
  el.dragMode.textContent = t(invert ? 'sheet.drag.pull' : 'sheet.drag.walk');
  el.drag.setAttribute('aria-pressed', String(invert));
}
el.drag.addEventListener('click', () => { setDrag(!input.invert); keepView(); });
const showMute = () => {
  el.muteState.textContent = t(audio.muted ? 'settings.off' : 'settings.on');
  el.mute.setAttribute('aria-pressed', String(!audio.muted));
};
el.mute.addEventListener('click', () => {
  audio.muted = !audio.muted;
  showMute();
});
showMute();
// Music: off, or the name of the track playing.
const showMusic = () => {
  const track = audio.track();
  el.musicState.textContent = !audio.music ? t('settings.off') : track ? t('music.' + track) : t('settings.on');
  el.music.setAttribute('aria-pressed', String(audio.music));
};
el.music.addEventListener('click', () => {
  audio.music = !audio.music;
  keepView();
  showMusic();
});
// The first time you hear a place's music, it tells you its name (except
// the very first tune, which plays over a world that says nothing yet).
audio.onTrack((id) => {
  showMusic();
  if (savedView.heard.includes(id)) return;
  savedView.heard.push(id);
  keepView();
  if (savedView.heard.length > 1) hud.toast(t('toast.newTrack', { name: t('music.' + id) }));
});
// The language button: the next language, the game saved first so the
// reload comes back to the same spot.
el.language.addEventListener('click', () => {
  game.saveNow();
  setLanguage(nextLanguage());
});

/* -------------------------------------------------------------- loop */

// Work that runs on its own cadence rather than every frame.
const timers = [
  { every: SAVE_EVERY, run: () => game.saveNow() },
  { every: 0.4, run: () => controller.checkGoals() },
  { every: 0.25, run: () => { hud.update(game.state); regionTick(game.state, 0.25); audio.scene(sceneHere(game.state)); } }
].map((t) => ({ ...t, left: t.every }));

let lastTileKey = -1;
let moving = false;

// The region you're in (see core/regions.js): its name shows as you walk
// into it, once it has held for REGION_SETTLE seconds (so stepping back and
// forth through a pass doesn't flash names), and its kind of land picks the
// music. Underground you're still under the region above, but no names show.
const REGION_SETTLE = 1;
let region = null, shownRegion = null, regionHeld = 0;
function regionTick(s, dt) {
  const here = Core.regionAt(s.world.seed, Math.floor(s.player.x), Math.floor(s.player.y));
  if (!region || here.key !== region.key) { region = here; regionHeld = 0; }
  regionHeld += dt;
  // A milestone banner first: the two would sit on top of each other.
  if (s.player.z === Core.SURFACE && regionHeld >= REGION_SETTLE && !hud.celebrating && (!shownRegion || shownRegion.key !== region.key)) {
    shownRegion = region;
    hud.place(region.kind, region.name);
  }
}

// Arrived on another layer: its name, briefly. Coming up into the forest
// names the region, which then counts as shown.
function layerArrived(s) {
  if (s.player.z === Core.SURFACE) {
    shownRegion = region = Core.regionAt(s.world.seed, Math.floor(s.player.x), Math.floor(s.player.y));
    hud.layer(s.player.z, region.name);
  } else hud.layer(s.player.z);
}

// Which place's music fits where the player stands (see music/score.js).
function sceneHere(s) {
  const land = Core.BIOMES[(shownRegion || region).biome].music;
  return sceneFor({ depth: -s.player.z, daylight: Core.daylight(s.time), land });
}

// An admin's copy says so, with whose character it is, all the time.
let copyText = '';
function showCopy() {
  const me = together.me;
  const text = me ? t('copy.badge', { name: me.name }) : t('copy.badgeWait');
  if (text === copyText) return;
  copyText = text;
  el.copyBadge.textContent = text;
  el.copyBadge.hidden = false;
}

function update(dt) {
  const s = game.state;
  const dir = input.moveVector();
  const moved = controller.steer(dt, dir);
  moving = moved;
  Core.step(s, dt);
  together.tick(dt);
  if (copy) showCopy();

  // Logistics reports auto-collections as events; show them as flyers.
  for (const e of s.events) if (e.z === s.player.z) fx.flyersFrom(e.x, e.y, e.res, e.amt);
  s.events.length = 0;

  const tileKey = Core.packKey(Math.floor(s.player.x), Math.floor(s.player.y), s.player.z);
  if (tileKey !== lastTileKey) {
    lastTileKey = tileKey;
    Core.revealAround(s);
  }

  const holdAt = input.holdPoint();
  controller.tick(dt, input.held && !input.trail, holdAt);
  // Perfect plays while held, unless you're steering, gathering or working a tile yourself.
  perfect.tick(dt, input.perfect && !input.held && !input.trail && !holdAt && !dir.x && !dir.y && !blocked());
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
  hud.perfect(perfect.badge, input.perfect);
  sheet.tick();
}

// Where the zoom pill sits on the canvas, so a friend's edge badge (and the
// distance under it) never hides beneath it.
function friendsClear() {
  const r = el.zoomControls.getBoundingClientRect(), c = el.canvas.getBoundingClientRect();
  return r.width ? { left: r.left - c.left, top: r.top - c.top, bottom: r.bottom - c.top } : null;
}

function view() {
  const s = game.state;
  const underground = Core.isUnderground(s);
  return {
    facing: controller.facing,
    moving,
    actor: actor.view(moving),
    yard,
    harvestTarget: input.perfect ? perfect.target : Core.harvestTarget(s),
    buildTargets: sheet.isOpen && sheet.tab === 'build'
      ? Core.DEPOSIT_EXTRACTORS.map((k) => Core.buildTarget(s, k)).filter(Boolean) : [],
    trail: input.trail,
    trailTargets: trailTargets(input.trail),
    underground,
    joy: input.joy,
    friends: together.view(),
    graves: together.graves(),
    keepClear: friendsClear(),   // the zoom pill, which friends' edge badges move out from under
    me: together.me,   // your name and colour in a shared world
    sign: together.sign,
    signFace: together.signFace,
    signCaption: t('together.sign'),
    device: DEVICE // what you hold, and whose screen lights the dark
  };
}

let last = 0;
let lastWall = 0; // Date.now() at the last frame shown

// Time away from a solo world (closed, asleep, in another app): what your
// buildings made meanwhile lands in your packs (Core.awayProduce), said in a toast.
// In a shared world the room works it out and says so (together.js 'away').
function catchUp(seconds) {
  const made = Core.awayProduce(game.state, seconds);
  if (made) sayAway(seconds, made);
}
// `fixed`: arriving in a shared world also set your numbers straight
// (together.js), so the toast says that too, and stays up longer.
function sayAway(seconds, made, fixed = false) {
  const parts = Core.RESOURCES.filter((r) => made[r] >= 1).map((r) => t('cost.item', { n: fmt(made[r]), res: Core.RESOURCE_LABEL[r] }));
  const away = t('toast.away', { time: fmtDuration(Math.min(seconds, Core.AWAY_CAP)), made: parts.join(', ') });
  if (parts.length) hud.toast(fixed ? away + '. ' + t('together.toast.fixed') : away, fixed ? 9 : undefined);
  hud.update(game.state);
  game.saveSoon();
}
let shownState = null, shownZ = 0; // the world and layer the last frame showed
let signRect = null;            // where your sign stood in the last frame, for taps on it
let fullPace = true;            // the last frame was drawn at full pace
function frame(now) {
  // Full pace while you play (a touch or key just now, Gather or Perfect
  // held, you or the view on the move, the trip between layers), calm while
  // you watch.
  const full = moving || input.held || input.perfect || now - lastTouch < CALM_AFTER_S * 1000 || descent.active;
  if (last && !frameDue(now - last, full ? FULL_FPS : CALM_FPS)) { requestAnimationFrame(frame); return; }
  if (full && !fullPace) quality.settle(); // calm frames are slow on purpose: don't judge by them
  fullPace = full;
  const intervalMs = last ? now - last : 0;
  const dt = Math.min(0.1, intervalMs / 1000); // the game never jumps more than this
  last = now;
  // Frames stop while the tab is hidden or the device sleeps: the gap is time away.
  if (!document.hidden) {
    const wall = Date.now();
    if (lastWall && !fork.open) catchUp((wall - lastWall) / 1000);
    lastWall = wall;
  }
  try {
    const t0 = performance.now();
    if (!document.hidden && !fork.open) update(dt);
    yard.update(game.state, dt);
    const t1 = performance.now();
    // Changed layers in this world since the last frame: show the trip.
    const z = game.state.player.z;
    if (game.state === shownState && z !== shownZ) {
      descent.start(shownZ, z);
      layerArrived(game.state);
    }
    shownState = game.state; shownZ = z;
    const stats = render(cam, game.state, fx, view(), look);
    signRect = stats.sign;
    descent.draw(cam, look, dt);
    if (intervalMs > 0) perf.frame(intervalMs, t1 - t0, performance.now() - t1, stats.tiles);
    if (full) quality.frame(intervalMs);
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
  quality.settle();
  cam.resize();
  hud.view(cam);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
window.addEventListener('pagehide', () => game.saveNow());
// A QR scanned while the game is already open in this tab.
// A copy link opened over this tab: copies start before anything reads
// storage (copy.js), so the page loads again for it.
window.addEventListener('hashchange', () => {
  if (!copy && new URLSearchParams(location.hash.slice(1)).has('copy')) return location.reload();
  together.joinFromLink();
});
// The network came back: reconnect to the shared world now.
window.addEventListener('online', () => together.online());
document.addEventListener('visibilitychange', () => {
  together.away(document.hidden);
  quality.settle();
  if (document.hidden) game.saveNow(); else checkFork();
});

cam.setZoom(savedView.zoom);
setDrag(savedView.invertDrag);
audio.music = savedView.music;
showMusic();
// The performance panel is for whoever is tuning the game, not for play:
// F3 or its switch in Nerds toggles it, and ?perf in the address opens it.
perf.toggle(new URLSearchParams(location.search).has('perf'));
applyQuality();
hud.repaint();
await textures.restore(savedPack);
hud.update(game.state);
hud.updateButtons(game.state);
hud.perfect(perfect.badge, false);
// Your save couldn't be opened (damaged, or made by another version): it's
// kept to one side, never written over, and comes back when a version that
// reads it loads (src/game/storage.js). Meanwhile a new world, and a word.
if (loaded.lost) {
  game.saveNow();
  hud.toast(t(loaded.lost === 'broken' ? 'save.aside.broken' : 'save.aside.format'), ASIDE_SECONDS);
}
game.changedMode();
showNext();
// Opened from a friend's QR: join them. Otherwise back into the shared world
// you were in, if any.
together.open();
updater.start();
// Just updated itself: thank the player and say what's new.
news.show(takeUpdatedFrom(), VERSION);
if (game.state.seen) catchUp((Date.now() - game.state.seen) / 1000);
requestAnimationFrame(frame);

// A small hook so the browser tests can inspect and adjust the real game.
window.MTE_GAME = {
  core: Core,
  look,
  textures,
  yard,
  getState: () => game.state,
  together,
  dialogs: { ask, fbi, news },
  save: () => game.saveNow(),
  setPlayer(x, y) { game.state.player.x = x; game.state.player.y = y; controller.forget(); lastTileKey = -1; },
  addRes(r, n) { game.state.inv[r] += n; hud.update(game.state); },
  flyers: () => fx.flyers,
  audioState: () => audio.state(),
  audio,
  zoom: () => cam.zoom,
  tilePx: () => cam.tilePx,
  setZoom(z) { cam.setZoom(z); hud.view(cam); },
  pitch: () => cam.pitch(),
  perf: () => perf.snapshot(),
  // Draws n frames back to back and returns the average ms each took,
  // pixels included (reading one back makes the browser finish drawing).
  bench(n) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { render(cam, game.state, fx, view(), look); cam.ctx.getImageData(0, 0, 1, 1); }
    return (performance.now() - t0) / n;
  },
  quality: () => quality.level,
  mapNames: () => worldMap.names(),
  perfVisible: () => perf.visible,
  project: (x, y, h) => cam.project(x, y, h),
  unproject: (sx, sy) => cam.unproject(sx, sy)
};
