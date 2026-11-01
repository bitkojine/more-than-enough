/* A small hook so the browser tests (test/browser.e2e.js, test/layout.e2e.js)
 * can inspect and adjust the real game: window.MTE_GAME. Nothing in the game
 * reads it. `p` holds the game's parts (see main.js); `p.playtest` says
 * whether the local-only deterministic replay drives it. */

import * as Core from '../core/index.js';
import { render, mapNames } from './render/renderer.js';

export function createTestHook(p) {
  const { playtest, game, controller, cultivate, cam, fx, look, yard, together, ask, fbi } = p;
  const { news, income, hud, audio, perf, quality, savedView, showAuto, card, startPlacing } = p;
  const { mapView, wiki, messages, hudLayout, fullscreen, problems, view, clock } = p;
  const simulation = p.simulation;
  return {
    // No world replacement or grants: seed selection happens before boot via a
    // newly created, empty save. Production, movement and costs remain canonical.
    playtest: playtest
      ? {
          perform: (intent) => controller.perform(intent, false),
          cultivation: (cmd) => cultivate(cmd),
          ticks(count) {
            if (!Number.isSafeInteger(count) || count < 0 || count > 6000)
              throw new Error('playtest-tick-count'); // i18n-ok: developer diagnostic
            clock().advanceTicks(count);
          },
          present: () => p.present(0),
          faults: () => problems.faults.list()
        }
      : null,
    core: Core,
    look,
    yard,
    getState: () => game.state,
    together,
    dialogs: { ask, fbi },
    news,
    income,
    hud,
    save: () => game.saveNow(),
    setPlayer(x, y) {
      game.state.player.x = x;
      game.state.player.y = y;
      controller.forget();
      simulation().invalidate();
    },
    addRes(r, n) {
      game.state.inv[r] += n;
      hud.update(game.state);
    },
    setAuto(on) {
      savedView.showAuto = on;
      showAuto();
    },
    openCard: (x, y) => card.openAt(x, y),
    startPlacing: (what) => startPlacing(what), // { key } or { kind }, as Place does
    flyers: () => fx.flyers,
    audioState: () => audio.state(),
    audio,
    zoom: () => cam.zoom,
    tilePx: () => cam.tilePx,
    setZoom(z) {
      cam.setZoom(z);
      hud.view(cam);
    },
    pitch: () => cam.pitch(),
    perf: () => perf.snapshot(),
    // Draws n frames back to back and returns the average ms each took,
    // pixels included (reading one back makes the browser finish drawing).
    bench(n) {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        render(cam, game.state, fx, view(), look);
        cam.ctx.getImageData(0, 0, 1, 1);
      }
      return (performance.now() - t0) / n;
    },
    quality: () => quality.level,
    mapNames: () => mapNames(),
    mapLayer: () => mapView.shown(),
    mapOn: () => mapView.on(),
    perfVisible: () => perf.visible,
    wiki,
    messages,
    hudLayout,
    fullscreen,
    project: (x, y, h) => cam.project(x, y, h),
    unproject: (sx, sy) => cam.unproject(sx, sy)
  };
}
