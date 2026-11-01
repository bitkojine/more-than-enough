/* The parts the browser entry point (src/game/main.js) is wired from, each
 * on its own with stand-ins for the page: the one game state and its saving
 * (game-host.js), what presses do (controls.js), each frame's presentation
 * (presenter.js), the tips (tips.js), the light buttons (light-buttons.js),
 * the region names (region-watch.js), the fork question (fork.js), the
 * page's events (page-events.js), device sync's host (sync-host.js) and boot
 * (boot.js). The browser suite (test/browser.e2e.js) drives them together. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../../src/core/index.js';
import { createGame } from '../../src/game/game-host.js';
import { inside, inputHandlers, wireButtons, goBack } from '../../src/game/controls.js';
import { createCadence, wakeOf, clearOf, createPresenter } from '../../src/game/presenter.js';
import {
  createTips,
  crystalDanger,
  awayNote,
  cultivationNote,
  HOLD_TIP_AFTER,
  AUTO_TAP_S,
  DANGER_EVERY
} from '../../src/game/tips.js';
import { flareClock, flareNote, createLightButtons } from '../../src/game/light-buttons.js';
import { createRegionWatch, REGION_SETTLE } from '../../src/game/region-watch.js';
import { createForkGuard } from '../../src/game/fork.js';
import { listenToPage } from '../../src/game/page-events.js';
import { createSyncHost, syncNote, LINK_HASH } from '../../src/game/sync-host.js';
import { reportContext, onScreen, replaying, onCharging } from '../../src/game/boot.js';
import { t } from '../../src/i18n/i18n.js';

import syncEn from '../../src/i18n/sync/en.js';
import syncLt from '../../src/i18n/sync/lt.js';

const syncStrings = { en: syncEn, lt: syncLt };

// Records calls by name: `calls.log` lists them, `calls.fn(name)` makes one.
function recorder() {
  const log = [];
  return {
    log,
    fn:
      (name, value) =>
      (...args) => (log.push([name, ...args]), value)
  };
}

/* ------------------------------------------------------- the one state */

function gameHarness({ save = () => ({}), forkOpen = false } = {}) {
  const r = recorder();
  const toasts = [];
  const game = createGame({
    state: Core.createState(3),
    store: {
      saveGame: (s, force) => (r.log.push(['saveGame', force]), save(s)),
      soloWorld: (seed) => (seed === 9 ? Core.createState(9) : null),
      soloCount: () => 1,
      keepStorage: r.fn('keepStorage')
    }
  });
  const el = new Proxy({}, { get: (o, k) => (o[k] ||= { hidden: false, textContent: '' }) });
  const sync = { played: r.fn('played'), saved: r.fn('saved'), touched: r.fn('touched') };
  game.attach({
    el,
    hud: { toast: (m) => toasts.push(m), update: r.fn('update'), newWorld: r.fn('newWorld') },
    together: {
      save: r.fn('roomSave'),
      switchTo: r.fn('switchTo'),
      refresh: r.fn('refresh'),
      available: false,
      worldName: 'W'
    },
    fork: { open: forkOpen },
    forked: r.fn('forked'),
    problems: { crumb: r.fn('crumb') },
    controller: { forget: r.fn('forget'), facing: { x: 1, y: 0 } },
    actor: { sent: { a: null, n: 0 } },
    backup: { changedMode: r.fn('backupMode') },
    savedView: { awayProduce: false },
    showAuto: r.fn('showAuto'),
    showNext: r.fn('showNext'),
    moving: () => false,
    simulation: () => null,
    sync: () => sync,
    syncSoon: r.fn('syncSoon'),
    forgetWorld: [r.fn('forgetA'), r.fn('forgetB')]
  });
  return { game, log: r.log, toasts, el };
}

test('game: a shared world saves to its room, never over your own', () => {
  const { game, log } = gameHarness();
  game.state.shared = 'R';
  game.saveNow();
  assert.deepEqual(
    log.map((l) => l[0]),
    ['roomSave']
  );
});

test('game: nothing is saved while the player is picking which tab’s world to keep', () => {
  const { game, log } = gameHarness({ forkOpen: true });
  game.saveNow();
  assert.equal(log.length, 0);
  assert.equal(game.keep(), false, 'not safe to leave');
});

test('game: a newer save from another tab asks instead of writing over it', () => {
  const { game, log } = gameHarness({ save: () => ({ conflict: 'raw' }) });
  game.saveNow();
  assert.deepEqual(log.at(-1), ['forked', 'raw']);
});

test('game: failing to save is said once, again only after it recovered', () => {
  let fail = true;
  const err = new Error('full');
  const { game, toasts } = gameHarness({ save: () => (fail ? { error: err } : {}) });
  const quiet = console.error;
  console.error = () => {};
  try {
    game.saveNow();
    game.saveNow();
    assert.equal(toasts.length, 1);
    assert.equal(game.keep(), false, 'a world that won’t save is not left');
    fail = false;
    game.saveNow();
    assert.equal(game.keep(), true);
    fail = true;
    game.saveNow();
    assert.equal(toasts.length, 2);
  } finally {
    console.error = quiet;
  }
});

test('game: saving soon marks it due, and the next save clears that', () => {
  const { game, log } = gameHarness();
  assert.equal(game.saveDue, false);
  game.saveSoon();
  assert.equal(game.saveDue, true);
  assert.ok(log.some((l) => l[0] === 'played'));
  game.saveNow();
  assert.equal(game.saveDue, false);
  assert.ok(game.state.seen > 0, 'stamped for time away');
});

test('game: another world clears what the last one left and counts as played unless it came from elsewhere', () => {
  const { game, log } = gameHarness();
  const next = Core.createState(5);
  game.replace(next);
  assert.equal(game.state, next);
  const names = log.map((l) => l[0]);
  assert.ok(names.includes('forgetA') && names.includes('forgetB'));
  assert.ok(names.includes('touched'));
  log.length = 0;
  game.replace(Core.createState(6), 'cloud');
  assert.ok(!log.some((l) => l[0] === 'touched'), 'your other device’s world is not your play');
});

test('game: your own world from the Worlds screen, only once the one you leave is kept', () => {
  const { game } = gameHarness();
  const was = game.state;
  game.playSolo(was.seed);
  assert.equal(game.state, was, 'already here');
  game.playSolo(9);
  assert.equal(game.state.seed, 9);
});

test('game: the room moving you keeps the deepest layer you reached', () => {
  const { game } = gameHarness();
  game.state.underground.deepest = -1;
  game.moveTo({ x: 4, y: 5, z: -3 });
  assert.equal(game.state.player.x, 4);
  assert.equal(game.state.underground.deepest, -3);
});

test('game: time away makes nothing in freeze season, and a note says what it made', () => {
  const { game, toasts } = gameHarness();
  game.catchUp(3600);
  assert.equal(toasts.length, 0, 'freeze season');
  game.sayAway(60, { stone: 3 });
  assert.equal(toasts.length, 1);
  game.sayAway(60, { stone: 0.2 });
  assert.equal(toasts.length, 1, 'nothing worth saying');
});

/* --------------------------------------------------------------- controls */

test('controls: a tap on your sign copies its link; elsewhere it goes to the world', () => {
  const r = recorder();
  const p = {
    cam: { unproject: () => ({ x: 3.7, y: 4.2, z: 0 }), zoom: 1 },
    sheet: { close() {}, toggle: r.fn('toggle') },
    mapView: { on: () => false },
    placing: { tap: () => false },
    card: { tap: () => 'work' },
    controller: { work: r.fn('work'), tap: r.fn('tap') },
    wiki: {},
    problems: { crumb() {} },
    together: { copyLink: r.fn('copy') },
    signRect: () => ({ x: 0, y: 0, w: 10, h: 10 }),
    perf: { toggle: r.fn('perf') },
    lights: { toggleLantern: r.fn('lantern'), useFlare: r.fn('flare') },
    hudLayout: { toggle: r.fn('layout') },
    goBack: r.fn('back')
  };
  const h = inputHandlers(p);
  h.tap(5, 5);
  h.tap(50, 50);
  assert.deepEqual(r.log, [['copy'], ['work', 3, 4]]);
  r.log.length = 0;
  // The rest hand straight over to the part they belong to.
  Object.assign(p.placing, { grab: r.fn('grab'), drag: r.fn('drag'), drop: r.fn('drop') });
  Object.assign(p.wiki, {
    longPress: r.fn('long'),
    longPressMove: r.fn('longMove'),
    longPressEnd: r.fn('longEnd')
  });
  p.sheet.close = r.fn('close');
  p.hud = { view: r.fn('view') };
  p.keepView = r.fn('keepView');
  const all = inputHandlers(p);
  all.grab(1, 2);
  all.grabMove(1, 2);
  all.grabEnd();
  all.longPress(1, 2);
  all.longPressMove(1, 2);
  all.longPressEnd();
  all.dismiss();
  all.viewChanged();
  assert.deepEqual(
    r.log.map((l) => l[0]),
    ['grab', 'drag', 'drop', 'long', 'longMove', 'longEnd', 'close', 'view', 'keepView']
  );
  r.log.length = 0;
  for (const cmd of ['perf', 'back', 'lantern', 'flare', 'upgrades', 'build']) h.command(cmd);
  assert.deepEqual(
    r.log.map((l) => l[0]),
    ['perf', 'back', 'lantern', 'flare', 'layout', 'toggle']
  );
  assert.equal(inside(null, 1, 1), false);
  assert.equal(inside({ x: 0, y: 0, w: 2, h: 2 }, 2, 2), true);
});

test('controls: Back closes the topmost thing first', () => {
  const r = recorder();
  const open = (name, isOpen) => ({ open: isOpen, cancel: r.fn(name), close: r.fn(name) });
  const parts = {
    ask: open('ask', false),
    placing: open('placing', true),
    card: open('card', true),
    hudLayout: open('layout', false),
    sheet: { back: r.fn('sheet') }
  };
  goBack(parts);
  parts.placing.open = false;
  goBack(parts);
  parts.card.open = false;
  goBack(parts);
  assert.deepEqual(
    r.log.map((l) => l[0]),
    ['placing', 'card', 'sheet']
  );
});

/* ----------------------------------------------------------- presenting */

test('presenter: a cadence runs each job once per period and catches up a step at a time', () => {
  const runs = [];
  const advance = createCadence([
    { every: 1, run: () => runs.push('a') },
    { every: 0.25, run: () => runs.push('b') }
  ]);
  advance(0.2);
  assert.deepEqual(runs, []);
  advance(0.1);
  assert.deepEqual(runs, ['b']);
  advance(0.75);
  assert.deepEqual(runs, ['b', 'a', 'b'], 'one step per frame, not a burst');
  assert.deepEqual(wakeOf({ x: 3, y: 4 }), { x: 0.6, y: 0.8 });
  assert.deepEqual(wakeOf({ x: 0, y: 0 }), { x: 0, y: 0 });
  assert.equal(clearOf({ width: 0 }, {}), null);
  assert.deepEqual(clearOf({ width: 5, left: 15, top: 30, bottom: 40 }, { left: 10, top: 20 }), {
    left: 5,
    top: 10,
    bottom: 20
  });
});

/* ------------------------------------------------------------------ tips */

test('tips: holding is suggested after a few single gathers, and never again once found', () => {
  const toasts = [];
  const view = {};
  let kept = 0;
  const tips = createTips({ hud: { toast: (m) => toasts.push(m) }, view, keep: () => kept++ });
  for (let i = 0; i < HOLD_TIP_AFTER - 1; i++) tips.gathered(false);
  assert.equal(toasts.length, 0);
  tips.gathered(false);
  assert.deepEqual(toasts, [t('tip.hold')]);
  tips.gathered(false);
  assert.equal(toasts.length, 1);
  assert.equal(view.holdTip, true);
  assert.equal(kept, 1);
  const other = createTips({ hud: { toast: (m) => toasts.push(m) }, view: {}, keep() {} });
  other.gathered(true);
  assert.equal(toasts.length, 1, 'found it by holding: nothing to say');
});

test('tips: a quick tap on AUTO says it plays while held; a long hold does not', () => {
  const shown = [];
  let now = 0;
  const tips = createTips({
    hud: { autoTip: (s) => shown.push(s) },
    view: {},
    keep() {},
    now: () => now
  });
  tips.autoDown();
  now = (AUTO_TAP_S / 2) * 1000;
  tips.autoUp();
  tips.autoDown();
  now += AUTO_TAP_S * 2000;
  tips.autoUp();
  assert.deepEqual(shown, [0, 4, 0]);
});

test('tips: a crystal world in danger is warned about, spaced out', () => {
  const toasts = [];
  const tips = createTips({ hud: { toast: (m) => toasts.push(m) }, view: {}, keep() {} });
  const s = {
    inv: { crystal: 0 },
    cultivation: { starter: { health: 20 }, quality: 80, facilities: [] }
  };
  assert.equal(crystalDanger(s), true);
  assert.equal(tips.danger(s, 0.1), true);
  assert.equal(tips.danger(s, 0.1), false, 'not again so soon');
  assert.equal(tips.danger(s, DANGER_EVERY), true);
  assert.equal(crystalDanger({ inv: {}, cultivation: null }), false);
  const hot = {
    inv: { crystal: 0 },
    cultivation: { quality: 90, facilities: [{ health: 5, temperature: 30 }] }
  };
  assert.equal(crystalDanger(hot), true);
  const fine = {
    inv: { crystal: 2 },
    cultivation: { starter: { health: 90 }, quality: 50, facilities: [] }
  };
  assert.equal(crystalDanger(fine), false);
});

test('tips: notes for time away and crystal-world commands', () => {
  assert.equal(awayNote(60, {}), null);
  assert.ok(awayNote(60, { stone: 2 }).length > 0);
  assert.ok(awayNote(60, { stone: 2 }, true).endsWith(t('together.toast.fixed')));
  assert.equal(cultivationNote('ok', 0), null);
  assert.equal(cultivationNote('activated', 0), t('cr.activated'));
  assert.equal(cultivationNote('discovery', 2), t('cr.discovery.2'));
  assert.equal(cultivationNote('locked', 0), t('cr.reason.locked'));
});

/* --------------------------------------------------------------- lights */

test('lights: the flare reads as a clock while it burns, and says why it can’t', () => {
  assert.equal(flareClock(120), '2:00');
  assert.equal(flareClock(65.2), '1:06');
  assert.equal(flareClock(0.1), '0:01');
  const s = { stats: { flares: 1 } };
  assert.equal(flareNote('locked', s), t('progression.requirement'));
  assert.equal(flareNote('materials', s), t('toast.flare.materials'));
  assert.equal(flareNote('lit', s), t('toast.flare.first'));
  assert.equal(flareNote('lit', { stats: { flares: 2 } }), null, 'the first one only');
  assert.equal(flareNote('out', s), null);
});

/* -------------------------------------------------------------- regions */

test('regions: a name shows once it has held, only on the surface, and once', () => {
  const said = [];
  const watch = createRegionWatch({
    hud: {
      place: (kind, name) => said.push(name),
      layer: (z, name) => said.push('layer ' + z + (name ? ' ' + name : ''))
    }
  });
  const s = Core.createState(11);
  watch.tick(s, REGION_SETTLE / 2);
  assert.equal(said.length, 0, 'not yet');
  watch.tick(s, REGION_SETTLE);
  assert.equal(said.length, 1);
  watch.tick(s, REGION_SETTLE);
  assert.equal(said.length, 1, 'once');
  s.player.z = -1;
  watch.arrived(s);
  assert.equal(said.at(-1), 'layer -1');
  assert.ok(watch.scene(s));
  watch.reset();
  assert.ok(watch.scene(s), 'music still fits right after another world comes in');
});

/* ------------------------------------------------------------------ fork */

test('fork: the choice takes the other tab’s newest save, and is asked only on screen alone', () => {
  const shown = [];
  let elsewhere = 'newest';
  const replaced = [];
  const game = {
    state: { shared: null },
    replace: (s) => replaced.push(s),
    saveNow: () => {}
  };
  const guard = createForkGuard({
    fork: { show: (mine, other, choices) => shown.push(choices) },
    game,
    store: { adopt: (raw) => ({ from: raw }), savedElsewhere: () => elsewhere },
    release() {},
    reload() {}
  });
  const raw = Core.serialize(Core.createState(2));
  elsewhere = raw;
  guard.check(true);
  assert.equal(shown.length, 0, 'hidden: not now');
  guard.check(false);
  assert.equal(shown.length, 1);
  elsewhere = 'even newer';
  shown[0].keepOther();
  assert.deepEqual(replaced, [{ from: 'even newer' }]);
  game.state.shared = 'R';
  guard.check(false);
  assert.equal(shown.length, 1, 'a shared world is never written here');
});

/* ------------------------------------------------------------ the page */

function fakeTarget() {
  const on = {};
  return {
    on,
    addEventListener: (type, fn) => (on[type] ||= []).push(fn),
    fire: (type) => (on[type] || []).forEach((fn) => fn({}))
  };
}

test('page: hidden saves and lets go; back checks the other tab and syncs', () => {
  const r = recorder();
  const win = fakeTarget();
  win.location = { hash: '', reload: r.fn('reload') };
  const doc = fakeTarget();
  doc.hidden = true;
  listenToPage(
    {
      game: { saveNow: r.fn('save') },
      together: {
        refit() {},
        away: r.fn('away'),
        online: r.fn('online'),
        joinFromLink: r.fn('join')
      },
      perf: { suspend() {} },
      quality: { settle() {} },
      loop: { resume: r.fn('resume') },
      resize() {},
      clock: () => ({ reset() {} }),
      sync: () => ({ flush: r.fn('flush') }),
      syncSoon: r.fn('syncSoon'),
      checkFork: r.fn('checkFork'),
      syncing: () => ({ linkFromHash: r.fn('link') })
    },
    win,
    doc
  );
  doc.fire('visibilitychange');
  doc.hidden = false;
  doc.fire('visibilitychange');
  assert.deepEqual(
    r.log.map((l) => l[0]),
    ['resume', 'away', 'save', 'flush', 'resume', 'away', 'checkFork', 'syncSoon']
  );
  r.log.length = 0;
  win.fire('hashchange');
  assert.deepEqual(
    r.log.map((l) => l[0]),
    ['join', 'link']
  );
  r.log.length = 0;
  win.location.hash = '#copy=abc';
  win.fire('hashchange');
  assert.deepEqual(
    r.log.map((l) => l[0]),
    ['reload'],
    'a copy link reloads so the copy starts before storage is read'
  );
});

/* ------------------------------------------------------------- syncing */

test('sync host: loads only when needed, and a link is asked about before it is followed', async () => {
  let loads = 0,
    linked = null;
  const asked = [];
  const history = { replaceState() {} };
  const page = { hash: '#link=' + 'a'.repeat(64), pathname: '/', search: '' };
  const fakeSync = {
    link: async (key) => ((linked = key), true)
  };
  const host = createSyncHost({
    game: { state: {} },
    el: {},
    ask: async (q) => (asked.push(q), true),
    toast() {},
    fork: { open: false },
    input: {},
    copy: null,
    store: { getItem: () => null },
    service: 'https://rooms.test',
    page,
    history,
    load: async () => (
      loads++,
      { strings: syncStrings, createSync: () => fakeSync, linkFrom: () => 'K' }
    )
  });
  host.start();
  assert.equal(loads, 0, 'never linked: nothing loaded');
  assert.equal(host.sync, null);
  await host.linkFromHash();
  assert.equal(loads, 1);
  assert.equal(asked.length, 1);
  assert.equal(linked, 'K');
  page.hash = '';
  await host.linkFromHash();
  assert.equal(loads, 1, 'loaded once');
  assert.ok(LINK_HASH.test('#link=' + 'f'.repeat(64)));
  assert.equal(syncNote('arrived'), t('sync.arrived'));
  assert.equal(syncNote('anything'), t('sync.full'));
});

/* ----------------------------------------------------------------- boot */

test('boot: a problem report says the moment, in English for developers', () => {
  const s = Core.createState(4);
  const report = reportContext({
    s,
    cam: { zoom: 1.5, tilePx: 32, dpr: 2 },
    canvas: { width: 800, height: 600 },
    quality: 2,
    frames: { fps: 29.6, worstMs: 50.2 },
    open: { sheet: 'build', descent: false, fork: false }
  });
  assert.match(report.world, /^solo, .*seed 4$/);
  assert.match(report.view, /zoom 1\.50x/);
  assert.equal(report.frames, '30 fps, worst 50 ms');
  assert.equal(report.open, 'sheet build');
  assert.equal(
    reportContext({
      s,
      cam: { zoom: 1, tilePx: 1, dpr: 1 },
      canvas: { width: 1, height: 1 },
      quality: 0,
      frames: { fps: 0, worstMs: 0 },
      open: {}
    }).open,
    'the map'
  );
});

test('boot: what counts as on screen, the local replay, and the charger', async () => {
  assert.equal(onScreen({ x: -39, y: 10 }, 100, 100, 40), true);
  assert.equal(onScreen({ x: -41, y: 10 }, 100, 100, 40), false);
  assert.equal(replaying({ hostname: 'localhost', search: '?playtestReplay' }), true);
  assert.equal(replaying({ hostname: 'play.robertasrudys.com', search: '?playtestReplay' }), false);
  let retried = 0;
  const battery = { charging: false, ...{ on: null } };
  battery.addEventListener = (type, fn) => (battery.on = fn);
  onCharging(() => retried++, { getBattery: async () => battery });
  await new Promise((r) => setTimeout(r, 0));
  battery.on();
  battery.charging = true;
  battery.on();
  assert.equal(retried, 1, 'only when it starts charging');
  onCharging(() => retried++, {}); // Safari: no battery to ask
});

/* ------------------------------------------ the parts with page elements */

// An element that keeps what is done to it, and runs its click listeners.
function element() {
  const on = {},
    classes = new Set();
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    innerHTML: '',
    dataset: {},
    attrs: {},
    style: {
      props: {},
      setProperty(k, v) {
        this.props[k] = v;
      }
    },
    classList: {
      toggle: (c, yes) => (yes ? classes.add(c) : classes.delete(c)),
      has: (c) => classes.has(c)
    },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    addEventListener: (type, fn) => (on[type] ||= []).push(fn),
    click: (e = {}) => (on.click || []).forEach((fn) => fn(e)),
    fire: (type, e = {}) => (on[type] || []).forEach((fn) => fn(e))
  };
}
const elements = () => new Proxy({}, { get: (o, k) => (o[k] ||= element()) });

test('light buttons: the lantern shows once made, and the flare button follows the flare', () => {
  const el = elements();
  const toasts = [],
    commands = [];
  let saves = 0;
  const s = Core.createState(5);
  const lights = createLightButtons({
    el,
    state: () => s,
    cultivate: (cmd) => commands.push(cmd.type),
    saveSoon: () => saves++,
    toast: (m) => toasts.push(m)
  });
  lights.show(s);
  assert.equal(el.lantern.hidden, true, 'no lantern made yet');
  assert.equal(el.flare.hidden, false, 'the flare button is there in a world of your own');
  el.lantern.click();
  assert.deepEqual(commands, [], 'nothing to switch');
  s.cultivation = { gear: { lantern: true } };
  el.lantern.click();
  assert.deepEqual(commands, ['lantern']);
  assert.equal(el.lantern.hidden, false);
  el.flare.click();
  assert.ok(toasts.length >= 1, 'pressing the flare says why it did or didn’t light');
  assert.ok(el.flareLabel.innerHTML.length > 0);
  s.shared = 'R';
  lights.show(s);
  assert.equal(el.flare.hidden, true, 'never in a shared world');
});

test('light buttons: a flare that burns out on its own is said, once', () => {
  const el = elements();
  const toasts = [];
  const s = Core.createState(5);
  const lights = createLightButtons({
    el,
    state: () => s,
    cultivate() {},
    saveSoon() {},
    toast: (m) => toasts.push(m)
  });
  s.flare = 3;
  lights.show(s);
  s.flare = 0;
  lights.show(s);
  lights.show(s);
  assert.deepEqual(toasts, [t('toast.flare.burntOut')]);
});

test('presenter: each frame settles, ticks the parts and saves when due; the view carries what is drawn', () => {
  const r = recorder();
  const el = elements();
  el.zoomControls.getBoundingClientRect = () => ({ width: 0 });
  el.canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
  const state = Core.createState(6);
  let due = true;
  const p = {
    game: {
      state,
      get saveDue() {
        return due;
      },
      saveNow: () => ((due = false), r.log.push(['save']))
    },
    el,
    hud: {
      update: r.fn('hud.update'),
      tick() {},
      updateButtons() {},
      perfect() {}
    },
    fx: { update: r.fn('fx'), wake: r.fn('wake') },
    input: { perfect: false, trail: null, joy: null },
    perfect: { badge: '', target: null },
    controller: { facing: { x: 0, y: 1 } },
    placing: { open: true, tick() {}, cancel: r.fn('cancel'), view: () => null, focus: () => null },
    card: { tick() {}, focus: () => null },
    together: { view: () => [], graves: () => [], me: null, sign: 0, signFace: null },
    sheet: { tick() {} },
    back: { tick() {} },
    lights: { show: r.fn('lights') },
    hudLayout: { tick() {} },
    blocked: () => true,
    income: { note() {} },
    regions: { tick: r.fn('regions'), scene: () => 'forest' },
    audio: { scene() {} },
    messages: { tick() {} },
    homeHint: { check() {} },
    copy: null,
    actor: { view: () => ({}) },
    yard: {},
    wiki: { pose: () => null },
    mapView: { look: () => null },
    moving: () => false,
    autoPlaying: () => true
  };
  const presenter = createPresenter(p);
  presenter.update(0.3);
  const names = r.log.map((l) => l[0]);
  assert.ok(names.includes('save'), 'a due save goes at once');
  assert.ok(names.includes('cancel'), 'placing gives way to a sheet or a question');
  assert.ok(names.includes('regions'), 'the slower updates ran');
  assert.ok(names.includes('lights'));
  const v = presenter.view();
  assert.equal(v.auto, t('button.perfect'), 'AUTO’s tag shows while it plays');
  assert.deepEqual(v.trailTargets, []);
  assert.equal(v.keepClear, null);
  assert.equal(v.underground, false);
});

test('buttons: each opens what it says', () => {
  const r = recorder();
  const el = elements();
  wireButtons(el, {
    sheet: { toggle: r.fn('toggle'), show: r.fn('show'), showStatement: r.fn('statement') },
    mapView: { button: r.fn('map'), layer: r.fn('layer') },
    perf: { toggle: r.fn('perf'), details: r.fn('details') },
    controller: { toggleMine: r.fn('mine') },
    problems: { show: r.fn('problems') }
  });
  el.build.click();
  el.mapUp.click();
  el.nerdsBtn.click();
  el.resources.click({ target: { closest: () => ({ dataset: { res: 'stone' } }) } });
  el.resources.click({ target: { closest: () => null } });
  el.perf.fire('perfdetails');
  assert.deepEqual(r.log, [
    ['toggle', 'build'],
    ['layer', 1],
    ['problems'],
    ['show', 'nerds'],
    ['statement', 'stone'],
    ['show', 'performance'],
    ['details']
  ]);
});
