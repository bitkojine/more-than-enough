/* One gameplay update path for the browser and headless playtests. No DOM,
 * drawing, wall clock, sound, storage or animation-frame scheduling here.
 * Hosts supply input and the existing command/controller interfaces. */
import * as Core from '../core/index.js';
import { TICK_HZ } from './clock.js';

export function createSimulation({ game, controller, autoplay, input, canAutoplay = () => true,
  afterCore = null, onEvents = null }) {
  let state = null, tile = -1, goalTicks = 0, moving = false, autoPlaying = false, economyStarted = false;
  const options = { visualEvents: onEvents !== null };
  let revealedX = NaN, revealedY = NaN, revealedRadius = -1;
  const work = { ticks: 0, updates: 0, idleTicksSkipped: 0 };
  function run(count) {
    work.ticks += count; work.updates++; work.idleTicksSkipped += count - 1;
    const dt = count / TICK_HZ;
    const s = game.state;
    if (s !== state) { state = s; tile = -1; goalTicks = 0; economyStarted = false; }
    const allowed = canAutoplay();
    if (!allowed) autoplay.suspend?.();
    const dir = input.moveVector();
    moving = controller.steer(dt, dir);
    Core.step(s, dt, options);
    if (!economyStarted && Core.haulingEconomyAvailable(s)) {
      // Old saves may hold whole output units. The legacy tick above hauls
      // them before the cumulative ledger captures fractional starting phases.
      Core.startEventEconomy(s); economyStarted = true;
    }
    if (afterCore) afterCore(dt);
    if (onEvents && s.events.length) onEvents(s.events, s);
    s.events.length = 0;
    const current = Core.packKey(Math.floor(s.player.x), Math.floor(s.player.y), s.player.z);
    const radius = Core.exploreRadius(s) * Core.lightScale(s);
    if (tile !== current || s.player.x !== revealedX || s.player.y !== revealedY || radius > revealedRadius) {
      tile = current; revealedX = s.player.x; revealedY = s.player.y; revealedRadius = radius;
      Core.revealAround(s, radius);
    }
    const hold = input.holdPoint();
    controller.tick(dt, input.held && !input.trail, hold);
    autoPlaying = input.perfect && !input.held && !input.trail && !hold && !dir.x && !dir.y && allowed;
    autoplay.tick(dt, autoPlaying);
    goalTicks += count;
    if (goalTicks === Math.round(0.4 * TICK_HZ)) { goalTicks = 0; controller.checkGoals(); }
  }
  function batchSize(limit) {
    const s = game.state;
    // Motion, user input, room callbacks and visible feedback retain fine
    // steps. Coalesced intervals end at the earliest action/goal deadline.
    if (s !== state || afterCore || onEvents || controller.walking || !input.perfect || input.held ||
        input.trail || input.holdPoint() || !canAutoplay() || !Core.canBatchEconomy(s, 1)) return 1;
    const dir = input.moveVector();
    if (dir.x || dir.y || Core.worldMastered(s)) return 1; // retain first Embark eligibility tick
    const deadline = Math.ceil((autoplay.secondsUntilAct - 1e-9) * TICK_HZ);
    if (!Number.isFinite(deadline)) return 1;
    const count = Math.max(1, Math.min(limit, 15, deadline, Math.round(0.4 * TICK_HZ) - goalTicks));
    return Core.canBatchEconomy(s, count) ? count : 1;
  }
  function advanceChunk(limit) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('simulation-tick-count');
    const count = batchSize(limit); run(count); return count;
  }
  return {
    tick() { run(1); },
    advanceChunk,
    advanceTicks(count) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('simulation-tick-count');
      let advanced = 0;
      while (advanced < count) advanced += advanceChunk(count - advanced);
      return advanced;
    },
    get moving() { return moving; },
    get autoPlaying() { return autoPlaying; },
    get work() { return { ...work }; },
    invalidate() { state = null; tile = -1; }
  };
}
