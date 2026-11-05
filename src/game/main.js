/* MICA AND WIKI — browser entry point. Wires the modules together and runs
 * the frame loop: input -> controller -> core step -> effects -> render. */

// First: an admin's copy swaps this browser's storage before anything reads it.
import { copy } from './copy.js';
import { VERSION } from '../version.js';
import { findElements } from './dom.js';
import { createCamera } from './camera.js';
import { createWaking } from './sleep.js';
import { createEffects } from './effects.js';
import { createHudLayout } from './hud-layout.js';
import { createFullscreen } from './fullscreen.js';
import { createHud } from './hud.js';
import { createTooltips } from './tooltips.js';
import { createWiki } from './wiki.js';
import { createMessages } from './messages.js';
import { createHomeHint } from './home-hint.js';
import { createSwitches } from './switches.js';
import { createInput } from './input.js';
import { createTeleportMap } from './teleport-map.js';
import { createSheet } from './sheet.js';
import { createIncome } from './income.js';
import { createMapView } from './mapview.js';
import { createController } from './controller.js';
import { createPerfect } from './perfect.js';
import { createSimulation } from '../engine/simulation.js';
import { createTickClock } from '../engine/clock.js';
import { createPerf } from './perf-host.js';
import { createQuality } from './quality.js';
import { createYard } from './yard.js';
import { groundHeight } from './render/terrain.js';
import { createDescent } from './render/descent.js';
import { createActor } from './render/motion.js';
import {
  loadGame,
  saveGame,
  savedElsewhere,
  onSavedElsewhere,
  adopt,
  loadView,
  saveView,
  soloWorld,
  soloCount,
  visiting,
  keepStorage
} from './storage.js';
import { roomService } from '../net/config.js';
import { createFork, createForkGuard } from './fork.js';
import { createAsk } from './ask.js';
import { createBackup } from './backup.js';
import { createFbi } from './fbi.js';
import { createTogether } from './together.js';
import { policyUrl } from './identity.js';
import { createUpdater, takeUpdatedFrom } from './update.js';
import { createNews } from './news.js';
import { createBack } from './back.js';
import { createProblems } from './problems.js';
import { createBuildingCard } from './building-card.js';
import { createPlacing } from './placing.js';
import { createTips } from './tips.js';
import { listenToPage } from './page-events.js';
import { createLightButtons } from './light-buttons.js';
import { createRegionWatch } from './region-watch.js';
import { createFrameLoop } from './frame-loop.js';
import { createSyncHost } from './sync-host.js';
import { createTestHook } from './test-hook.js';
import { createGame } from './game-host.js';
import { inputHandlers, wireButtons, goBack } from './controls.js';
import { createPresenter } from './presenter.js';
import { refuseFraming, loadLook, replaying, onCharging, reportContext, onScreen } from './boot.js';
import { t, localizePage } from '../i18n/i18n.js';
// Last: shares what the lazy modules need with them (the deployed game).
import './share.js';

const ON_SCREEN_PX = 40; // margin around the screen a flyer still counts as seen in

// This browser's storage, or null where it's blocked.
function localStore() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

// Every word on the page in the player's language first.
localizePage();

// Never inside another site's page (boot.js).
if (refuseFraming()) await new Promise(() => {}); // and go no further

const el = findElements();
el.verText.textContent = 'v' + VERSION;
window.MTE_VERSION = VERSION; // for the crash report

// This browser's own conveniences: zoom, drag direction, sound, music.
const savedView = loadView();

// The sound, and the game asleep until a tap, listen for the first press
// from here on, before the pictures load (sleep.js).
const { audio, sleep } = createWaking(el, savedView);

// Nothing is drawn until the game's pictures are in (boot.js). The pack's
// URL carries this module's ?v= cache-busting hash.
const packUrl = new URL('../../packs/default/pack.json', import.meta.url);
packUrl.search = new URL(import.meta.url).search;
const look = await loadLook(packUrl.href);

// The developer viewer boots before loading or connecting any player world.
if (new URLSearchParams(location.search).has('autoplay')) {
  const { startAutoplayLab } = await import('./autoplay-lab.js');
  await startAutoplayLab({ el, look });
  await new Promise(() => {});
}

const cam = createCamera(el.canvas);
const descent = createDescent(el.canvas);
cam.relief = (x, y) => groundHeight(game.state.world, x, y, cam.z);
// Keeps one of those choices: `keepSaved('wiki')(value)`.
const keepSaved = (key) => (value) => {
  savedView[key] = value;
  saveView(savedView);
};
function keepView() {
  savedView.zoom = cam.zoom;
  savedView.invertDrag = input.invert;
  savedView.music = audio.music;
  savedView.sound = !audio.muted;
  saveView(savedView);
}
// Wiki, on Mica's hood, answers for the world; what it has told is kept here.
// What the game says, Wiki included, goes in the message log; whether it's
// open is this browser's, and each world keeps its own lines.
const messages = createMessages({
  world: () => (game.state ? game.state.shared || 'solo.' + game.state.seed : null),
  open: savedView.logOpen,
  keepOpen: keepSaved('logOpen')
});
// In Safari on an iPhone, once: add the game to the Home Screen, or Safari
// may forget every world (home-hint.js).
const homeHint = createHomeHint({
  store: localStore(),
  standalone:
    navigator.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches, // i18n-ok: a media query
  say: () => messages.add({ kind: 'wiki', name: t('homeHint.title'), text: t('homeHint.text') })
});
const wiki = createWiki({
  cam,
  state: () => game.state,
  saved: savedView.wiki,
  keep: keepSaved('wiki'),
  messages
});
// What you gather flies to its pile in the yard (yard and quality are made
// just below), as many at once as the device's quality allows.
const fx = createEffects(
  look,
  (res) => yard.landing(res),
  (x, y) => onScreen(cam.project(x, y), cam.width, cam.height, ON_SCREEN_PX),
  () => quality.flyers
);
const yard = createYard({ fx, look });
const hud = createHud(el, look, messages);
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
// A part of the game that throws is got past and kept as a report (Nerds).
const problems = createProblems({
  toast: (text) => hud.toast(text),
  list: el.problems,
  game: () =>
    reportContext({
      s: game.state,
      cam,
      canvas: el.canvas,
      quality: quality.level,
      frames: perf.snapshot(),
      open: { sheet: sheet.isOpen && sheet.tab, descent: descent.active, fork: fork.open }
    })
});
onCharging(() => quality.retry());
const loaded = loadGame(!navigator.webdriver || location.search.includes('visit'));

let simulation = null,
  simulationClock = null;
let syncing = null; // your own world on your other devices (sync-host.js), made at boot

// The one place the current state lives. Everything else reads game.state.
const game = createGame({
  state: loaded.state,
  store: { saveGame, soloWorld, soloCount, keepStorage },
  copy
});

// Another tab saved this world since this tab did: don't overwrite it, ask.
const fork = createFork(el.fork);
const forks = createForkGuard({
  fork,
  game,
  store: { adopt, savedElsewhere },
  release: () => {
    input.release();
    input.releasePerfect();
  }
});
const forked = forks.forked;
onSavedElsewhere(() => forks.check());

const ask = createAsk(el.ask);
// The version, always in view; tapping it shows what's new.
const news = createNews({
  badge: el.versionBtn,
  panel: el.newsPanel,
  version: VERSION,
  updatedFrom: takeUpdatedFrom()
});
el.privacyLink.href = policyUrl(); // in the player's language
const fbi = createFbi(el.fbi);
// Never an old version: a new deploy saves and reloads the game at once.
const updater = createUpdater({ save: () => game.saveNow() });
const together = createTogether({
  game,
  hud,
  ask: ask.ask,
  el,
  fbi,
  checkUpdate: updater.check,
  closeSheet: () => sheet.close(),
  showPlayers: () => sheet.show('players'),
  onAway: (secs, made, fixed) => game.sayAway(secs, made, fixed),
  asleep: () => sleep.asleep
});
const actor = createActor(); // what the wanderer is doing, to animate it
const acted = actor.act.bind(actor);
actor.act = (kind, context) => {
  problems.crumb('act ' + kind);
  return acted(kind, context);
};
// What the game tells a player once, as they need it (tips.js).
const tips = createTips({ hud, view: savedView, keep: () => saveView(savedView) });
const gathered = tips.gathered;
// AUTO plays while held; P with AUTO hidden does nothing.
function autoPressed() {
  if (!autoShown()) {
    input.perfect = false;
    return;
  }
  tips.autoDown();
  perfect.press();
}
function autoReleased() {
  perfect.release();
  tips.autoUp();
}
// Early on, opening the game (or arriving in a new world) says what the
// next milestone is, so a new player's first read is what to do.
function showNext() {
  controller.checkGoals(); // one reached right here says what's next itself
  tips.next(game.state);
}
const controller = createController({
  game,
  cam,
  fx,
  audio,
  hud,
  look,
  ask: ask.ask,
  actor,
  gathered
});
const perfect = createPerfect({ game, controller, hud });

const mapView = createMapView({
  cam,
  getState: () => game.state,
  el,
  changed: () => {
    hud.view(cam);
    keepView();
  }
});
const cultivate = controller.cultivate; // done, saved and said (controller-commands.js)
const teleportMap = createTeleportMap({ cam, mapView, hud, cultivate, state: () => game.state });
const income = createIncome();
const sheet = createSheet(el, {
  getState: () => game.state,
  look,
  income,
  onTab: (tab) => {
    if (tab === 'awards') hud.awardsSeen();
    if (tab === 'invites') together.listInvites();
    if (tab === 'worlds') together.listWorlds();
    if (tab === 'players') together.listPlayers();
    if (tab === 'news') news.render();
    if (tab === 'devices') syncing.showDevices();
  },
  // Place (a building, or a crystal-world one) closes the sheet and stands
  // it on the map to be put where you like (placing.js).
  actions: {
    cultivation: (cmd) => {
      if (cmd.type === 'build') return startPlacing({ kind: cmd.kind });
      if (cmd.type !== 'craft') sheet.close();
      return cultivate(cmd);
    },
    buy: controller.buy,
    place: (key) => startPlacing({ key }),
    placeProp: controller.placeProp
  }
});

// A building's own card, over it in the world. Its Move starts placing it.
const card = createBuildingCard({
  cam,
  state: () => game.state,
  approach: (x, y, run) => controller.approach(x, y, run),
  walking: () => controller.walking,
  work: (x, y) => controller.perform({ type: 'harvestAt', x, y }, false),
  run: (cmd) => {
    if (cmd.type === 'travel') return teleportMap.open();
    if (cmd.type !== 'move') return cultivate(cmd);
    const b = card.building();
    if (b) startPlacing(b.key ? { key: b.key } : { kind: b.kind }, b);
  }
});
// Placing or moving a building on the map returns directly to play.
// Its information/Move card opens only when the player selects it later.
const placing = createPlacing({
  cam,
  state: () => game.state,
  controller,
  cultivate,
  toast: (text) => hud.toast(text)
});
function startPlacing(what, from = null) {
  sheet.close();
  card.close();
  placing.start(what, from);
}
// The lantern and the ore flare (light-buttons.js).
const lights = createLightButtons({
  el,
  state: () => game.state,
  cultivate,
  saveSoon: () => game.saveSoon(),
  toast: (text) => hud.toast(text)
});

const backup = createBackup({ el, game, ask: ask.ask, toast: hud.toast, version: VERSION });

// Something on screen that needs the player: a sheet or a dialog. The
// Perfect button waits while one is up.
const blocked = () => sheet.isOpen || fork.open || ask.open || fbi.open;
const hudLayout = createHudLayout({
  el,
  messages,
  beforeOpen: () => {
    sheet.close();
    card.close();
  },
  openCrafting: () => sheet.show('upgrades')
});
const fullscreen = createFullscreen({
  button: el.fullscreen,
  state: el.fullscreenState,
  hint: el.fullscreenHint,
  changed: () => {
    resize();
    hudLayout.invalidate();
    hudLayout.tick();
  },
  report: (error) => problems.crumb('fullscreen: ' + String(error?.stack || error)) // i18n-ok: developer diagnostic breadcrumb.
});
// Back (Escape, or the phone's own Back): controls.js goBack.
const stepBack = () => goBack({ ask, placing, card, hudLayout, sheet });
const back = createBack({
  isOpen: () => sheet.isOpen || ask.open || card.open || placing.open || hudLayout.open,
  goBack: stepBack
});
const controls = {
  cam,
  sheet,
  mapView,
  teleportMap,
  placing,
  card,
  controller,
  wiki,
  problems,
  hud,
  perf,
  lights,
  hudLayout,
  together,
  blocked,
  keepView,
  autoPressed,
  autoReleased,
  goBack: stepBack,
  signRect: () => loop.signRect
};
const input = createInput({ canvas: el.canvas, cam, el, handlers: inputHandlers(controls) });
wireButtons(el, controls);
const { setDrag, showMusic, showAway, showAuto, autoShown } = createSwitches({
  el,
  game,
  input,
  audio,
  wiki,
  hud,
  together,
  savedView,
  keepView
});

let moving = false;
let autoPlaying = false; // AUTO is held and playing (its tag shows over you)
const regions = createRegionWatch({ hud });

// Every part of the game, for the parts that reach several others
// (game-host.js, presenter.js, test-hook.js). Functions read what changes.
const parts = {
  ...controls,
  el,
  look,
  fx,
  yard,
  audio,
  quality,
  messages,
  homeHint,
  income,
  perfect,
  actor,
  fork,
  forked,
  ask,
  fbi,
  news,
  backup,
  back,
  fullscreen,
  input,
  savedView,
  showAuto,
  showNext,
  copy,
  regions,
  cultivate,
  startPlacing,
  playtest: replaying(),
  moving: () => moving,
  autoPlaying: () => autoPlaying,
  simulation: () => simulation,
  clock: () => simulationClock,
  sync: () => syncing?.sync,
  syncSoon: () => syncing?.soon(),
  // What a world leaves behind when another replaces it.
  forgetWorld: [
    () => fx.clear(),
    () => yard.reset(),
    () => controller.forget(),
    () => perfect.forget(),
    () => input.release(),
    () => input.releasePerfect(),
    () => sheet.close(),
    () => placing.cancel(),
    () => card.close(),
    () => simulation?.invalidate(),
    () => simulationClock?.reset(),
    () => regions.reset()
  ]
};
game.attach(parts);

/* -------------------------------------------------------------- loop */

simulation = createSimulation({
  game,
  controller,
  autoplay: perfect,
  input,
  canAutoplay: () => !blocked() && !placing.open,
  afterCore: (dt) => {
    together.tick(dt);
    if (tips.danger(game.state, dt)) audio.dig();
  },
  onEvents(events, s) {
    for (const e of events) if (e.z === s.player.z) fx.flyersFrom(e.x, e.y, e.res, e.amt);
  }
});
simulationClock = createTickClock(() => {
  simulation.tick();
  moving = simulation.moving;
  autoPlaying = simulation.autoPlaying;
});

// What each drawn frame shows after the simulation (presenter.js).
const presenter = createPresenter({ ...parts, game });
const updateView = presenter.update;
const view = presenter.view;

const loop = createFrameLoop({
  ...parts,
  game,
  descent,
  perf,
  problems,
  paused: () => fork.open,
  asleep: sleep.rest, // asleep, or held while a crystal world's room can't be reached
  replaying: parts.playtest,
  away: (seconds) => game.catchUp(seconds),
  present: updateView,
  view,
  layerArrived: (s) => regions.arrived(s)
});

/* -------------------------------------------------------------- boot */

function resize() {
  quality.settle();
  cam.resize();
  hud.view(cam);
  hud.fit();
}
listenToPage({
  ...parts,
  game,
  loop,
  resize,
  checkFork: () => forks.check(),
  syncing: () => syncing
});

cam.setZoom(savedView.zoom);
setDrag(savedView.invertDrag);
audio.music = savedView.music;
showMusic();
together.setAwayProduce(savedView.awayProduce);
showAway();
// The performance panel is for whoever is tuning the game, not for play:
// F3 or its switch in Nerds toggles it, and ?perf in the address opens it.
perf.toggle(new URLSearchParams(location.search).has('perf') || perf.enabled());
applyQuality();
hud.repaint();
hud.update(game.state);
hud.updateButtons(game.state);
hud.perfect(perfect.badge, false);
// Your save couldn't be opened (damaged, or made by another version): it's
// kept to one side, never written over, and comes back when a version that
// reads it loads (src/game/storage.js). Meanwhile a new world, and a word.
if (loaded.lost) {
  game.saveNow();
  hud.toast(t(loaded.lost === 'broken' ? 'save.aside.broken' : 'save.aside.format'));
}

// Your own world on every device you link (sync-host.js, sync.js).
syncing = createSyncHost({
  ...parts,
  game,
  ask: ask.ask,
  toast: (text) => hud.toast(text),
  store: localStore(),
  service: roomService()
});
syncing.start();

game.changedMode();
showNext();
// Opened from a friend's QR: join them. Otherwise back into the shared world
// you were in, if any.
together.open();
syncing.linkFromHash();
updater.start();
// Just updated itself: the version number rolls over to the new one.
news.play();
if (game.state.seen) game.catchUp((Date.now() - game.state.seen) / 1000);
showAuto();
loop.start();
sleep.attach({ game, cam, input, wiki, loop, together, visiting });

createTooltips({
  canvas: el.canvas,
  cam,
  state: () => game.state,
  world: () => wiki.mode === 'off'
});

// A small hook so the browser tests can inspect and adjust the real game.
window.MTE_GAME = createTestHook({ ...parts, game, view, present: updateView, sleep });
