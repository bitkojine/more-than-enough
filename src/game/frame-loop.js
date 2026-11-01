/* The frame loop: every animation frame advances the simulation by the time
 * that passed (a fixed-tick clock, src/engine/clock.js), and the frame pacer
 * (quality.js) picks which frames draw. Drawing observes the state after the
 * simulation; its cadence never changes movement, production or AUTO.
 *
 * Time the page was hidden or the device slept is time away, not play: it
 * goes to `away(seconds)` (what buildings made, if anything) and the clock
 * starts again. A frame that throws is skipped; only frames that keep
 * failing stop the game (problems.js).
 *
 * `deps` are the game's parts; see main.js for what each is. */

import * as Core from '../core/index.js';
import { render } from './render/renderer.js';
import { createFramePacer, RENDER_FPS, createFrameTiming } from './quality.js';

const MAX_STEP = 0.1; // seconds: the drawing never jumps more than this

export function createFrameLoop({
  game,
  clock, // () -> the simulation's tick clock
  paused, // () -> whether play is held (a question about which world to keep)
  replaying, // the local deterministic replay drives ticks itself
  away, // (seconds) time away from a solo world
  present, // (dt) presentation after the simulation (main.js updateView)
  view, // () -> what the renderer draws besides the state
  cam,
  look,
  fx,
  yard,
  wiki,
  mapView,
  descent,
  perf,
  quality,
  problems,
  layerArrived, // (state) the player is on another layer now
  moving // () -> whether the wanderer walks
}) {
  const frameTiming = createFrameTiming(),
    pacer = createFramePacer();
  let last = 0;
  let lastSimulationNow = 0,
    simulationMs = 0;
  let lastWall = 0; // Date.now() at the last frame shown
  let shownState = null,
    shownZ = 0; // the world and layer the last frame showed
  let signRect = null; // where your sign stood in the last frame, for taps on it

  // Every callback is an animation frame; the pacer picks which ones draw, by
  // their vsync timestamp. Diagnostics see the work done inside each callback.
  function request() {
    requestAnimationFrame((stamp) => {
      const now = performance.now();
      frameTiming.enter(now, stamp);
      try {
        frame(now, stamp);
      } finally {
        frameTiming.leave(performance.now());
      }
    });
  }

  function simulate(now) {
    const simStart = performance.now();
    const elapsed = lastSimulationNow ? (now - lastSimulationNow) / 1000 : 0;
    lastSimulationNow = now;
    if (document.hidden || paused() || replaying) {
      clock().reset();
      perf.suspend();
      frameTiming.reset();
      if (paused() && !document.hidden) lastWall = Date.now();
    } else {
      const wall = Date.now();
      if (lastWall) away((wall - lastWall) / 1000);
      lastWall = wall;
      // A suspended device's gap is away time, not active simulation time.
      if (elapsed >= Core.AWAY_MIN) clock().reset();
      else clock().advance(elapsed);
    }
    simulationMs += performance.now() - simStart;
  }

  function draw(stamp) {
    const intervalMs = last ? stamp - last : 0;
    const dt = Math.min(MAX_STEP, intervalMs / 1000);
    last = stamp;
    const pacing = frameTiming.rendered(stamp);
    const t0 = performance.now();
    const playing = !document.hidden && !paused();
    if (playing) {
      present(dt);
      wiki.update(dt);
    }
    mapView.tick(dt);
    yard.update(game.state, dt);
    const t1 = performance.now();
    // Changed layers in this world since the last frame: show the trip.
    const z = game.state.player.z;
    if (game.state === shownState && z !== shownZ) {
      problems.crumb(`layer ${shownZ} -> ${z}`);
      descent.start(shownZ, z);
      layerArrived(game.state);
    }
    shownState = game.state;
    shownZ = z;
    const phases = perf.visible ? {} : null;
    const stats = render(cam, game.state, fx, view(), look, problems.faults.layer, phases);
    signRect = stats.sign;
    descent.draw(cam, look, dt);
    const drawMs = performance.now() - t1;
    if (phases)
      phases.other =
        (phases.other || 0) +
        Math.max(0, drawMs - Object.values(phases).reduce((a, b) => a + b, 0));
    if (intervalMs > 0 && playing && !replaying)
      perf.frame(intervalMs, simulationMs + t1 - t0, drawMs, stats.tiles, {
        simulation: simulationMs,
        phases,
        target: RENDER_FPS,
        pacing,
        context: context(z)
      });
    simulationMs = 0;
    quality.frame(intervalMs);
    perf.tick(dt);
    problems.faults.frameDone();
  }

  // Where a slow frame happened, for the performance panel.
  function context(z) {
    const s = game.state;
    return {
      seed: s.world.seed,
      layer: z,
      gameTime: s.time,
      daylight: Core.daylight(s.time),
      x: s.player.x,
      y: s.player.y,
      viewLayer: cam.z,
      zoom: cam.zoom,
      moving: moving(),
      quality: quality.level
    };
  }

  function frame(now, stamp = now) {
    try {
      simulate(now);
      if (pacer.due(stamp)) draw(stamp);
    } catch (err) {
      // Skip the rest of this frame and go on; only frames that keep failing
      // stop the game, with the crash screen and the report.
      if (problems.frameFailed(err)) return;
    }
    request();
  }

  return {
    start: request,
    // The page was hidden or shown: the clock starts again from here.
    resume() {
      lastSimulationNow = 0;
    },
    // Where your sign stood in the last frame drawn (for taps on it), or null.
    get signRect() {
      return signRect;
    }
  };
}
