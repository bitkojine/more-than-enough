/* Headless host for the shipped AUTO button and player controller. Only
 * presentation and persistence are stubbed; all decisions, movement, cooldowns
 * and actions run through production game modules. No tuning or manual acts. */
import * as Core from '../src/core/index.js';
import { createAutoplaySession } from '../src/game/autoplay-session.js';
export { createAutoplaySession };
import { TICK_HZ, TICK_SECONDS } from '../src/engine/clock.js';


export function createProgressWatch() {
  let previous = null, lastProgress = 0, longest = 0;
  return {
    get longest() { return longest; },
    sample(seconds, s) {
      const now = { earned: Core.worldTotal(s), revealed: s.world.revealed, finds: s.stats.finds,
        built: s.stats.built, props: s.world.props.size, battery: s.battery };
      if (!previous || Object.keys(now).some((k) => now[k] > previous[k] + 1e-6)) lastProgress = seconds;
      previous = now;
      longest = Math.max(longest, seconds - lastProgress);
      return seconds - lastProgress >= 300;
    }
  };
}

export function createMovementWatch() {
  let signature = null, since = null, longest = 0;
  const tiles = new Set();
  return {
    get longest() { return longest; },
    sample(seconds, s, activity) {
      // Passive production is deliberately absent: buildings can pay while
      // AUTO paces forever between the same two mine tiles.
      const active = JSON.stringify([s.stats.gathers, s.stats.finds, s.stats.built, s.world.revealed,
        s.goalIndex, s.tools, s.resUp, s.abundanceLv, s.world.props.size, s.player.z]);
      if (active !== signature || !['moving', 'blocked'].includes(activity)) {
        signature = active; since = null; tiles.clear();
      }
      if (!['moving', 'blocked'].includes(activity)) return false;
      since ??= seconds;
      tiles.add(Core.packKey(Math.floor(s.player.x), Math.floor(s.player.y), s.player.z));
      if (tiles.size > 64) { since = seconds; tiles.clear(); }
      longest = Math.max(longest, seconds - since);
      return seconds - since >= 300;
    }
  };
}

export function createLayerWatch() {
  let signature = null, since = 0, up = 0, down = 0, longest = 0;
  return {
    get longest() { return longest; },
    sample(seconds, s, climbs, descents) {
      const active = JSON.stringify([s.stats.gathers, s.stats.finds, s.stats.built, s.world.revealed,
        s.goalIndex, s.tools, s.resUp, s.abundanceLv, s.world.props.size]);
      if (active !== signature) { signature = active; since = seconds; up = climbs; down = descents; }
      // Action totals see oscillation even when the player returns to the same
      // layer between one-second diagnostic samples. Passive income is absent.
      const repeated = climbs - up >= 10 && descents - down >= 10;
      if (repeated) longest = Math.max(longest, seconds - since);
      return repeated && seconds - since >= 300;
    }
  };
}


export function playAutoplay({ seed, hours, wallSeconds = 0, onProgress = () => {} }) {
  if (!Number.isFinite(wallSeconds) || wallSeconds < 0) throw new Error('Invalid wall-time budget');
  const behaviour = { refused: 0, nowhere: 0, walks: 0, waited: 0, layerChanges: 0, shortTrips: 0, goals: 0 };
  const milestones = {};
  const diagnostics = { actionCounts: {}, seconds: { moving: 0, blocked: 0, charging: 0, waiting: 0, working: 0 },
    longestNoProgress: 0, checkpoints: [], slowEpisodes: [], recent: [] };
  let lastAction = null;
  const session = createAutoplaySession(seed, (intent, result) => {
    lastAction = intent.type;
    diagnostics.actionCounts[intent.type] = (diagnostics.actionCounts[intent.type] || 0) + 1;
    diagnostics.recent.push({ time: session.state.time, ...intent, accepted: result });
    if (diagnostics.recent.length > 40) diagnostics.recent.shift();
    if (intent.type === 'walk') behaviour.walks++;
    if (result === false) behaviour.refused++;
  });
  const s = session.state;
  let ticks = 0, z = s.player.z, wentDown = 0, goalIndex = s.goalIndex;
  const dt = TICK_SECONDS;
  const limit = Math.ceil(hours * 3600 * TICK_HZ);
  const started = performance.now();
  let stalled = false, stopReason = null;
  const progress = createProgressWatch();
  const movement = createMovementWatch();
  const layers = createLayerWatch();
  const snapshot = () => ({ played: ticks * dt, badge: session.badge, goal: session.goal, player: { ...s.player },
    inv: { ...s.inv }, tools: { ...s.tools }, resUp: { ...s.resUp }, abundance: s.abundanceLv,
    buildings: s.extractors.length, battery: s.battery, seconds: { ...diagnostics.seconds } });
  let episode = null;
  const endEpisode = () => {
    if (!episode) return;
    const seconds = ticks * dt - episode.start;
    if (seconds >= 10) {
      diagnostics.slowEpisodes.push({ ...episode, seconds });
      diagnostics.slowEpisodes.sort((a, b) => b.seconds - a.seconds);
      diagnostics.slowEpisodes.length = Math.min(10, diagnostics.slowEpisodes.length);
    }
  };
  session.press(); // the only input for the whole world
  while (ticks < limit && !Core.canEmbark(s)) {
    if (wallSeconds && performance.now() - started >= wallSeconds * 1000) { stopReason = 'wall-budget'; break; }
    const bx = s.player.x, by = s.player.y;
    const priorActivity = session.badge === 'ui.wait' ? 'waiting' : lastAction === 'charge' ? 'charging' : 'working';
    // Keep diagnostics on their exact one-second boundaries. The shared
    // scheduler coalesces stationary time through the next AUTO/goal deadline.
    const span = session.advanceChunk(Math.min(limit - ticks, TICK_HZ - ticks % TICK_HZ));
    ticks += span;
    const moved = Math.hypot(s.player.x - bx, s.player.y - by) >= 0.0001;
    const activity = moved ? 'moving' : session.walking ? 'blocked' :
      session.badge === 'ui.wait' ? 'waiting' : lastAction === 'charge' ? 'charging' : 'working';
    // A coalesced stationary interval can execute one action at its final
    // tick. Classify the preceding quiet ticks separately from that action.
    diagnostics.seconds[priorActivity] += (span - 1) * dt;
    diagnostics.seconds[activity] += dt;
    const slow = ['waiting', 'charging', 'blocked'].includes(activity) ? activity : null;
    if (slow !== episode?.activity) {
      endEpisode();
      episode = slow ? { activity: slow, start: ticks * dt, state: snapshot() } : null;
    }
    if (activity === 'blocked') behaviour.nowhere++;
    if (priorActivity === 'waiting') behaviour.waited += (span - 1) * dt;
    if (activity === 'waiting') behaviour.waited += dt;
    if (ticks % TICK_HZ === 0) {
      // Movement and repeated decisions alone do not count as progress: a
      // loop through already explored land must not look like useful play.
      const stopped = progress.sample(ticks * dt, s);
      const looped = movement.sample(ticks * dt, s, activity);
      const layerLoop = layers.sample(ticks * dt, s, diagnostics.actionCounts.climb || 0, diagnostics.actionCounts.descend || 0);
      diagnostics.longestNoProgress = progress.longest;
      diagnostics.longestMovementLoop = movement.longest;
      diagnostics.longestLayerLoop = layers.longest;
      if ((stopped || looped || layerLoop) && !Core.canEmbark(s)) {
        stalled = true; stopReason = layerLoop ? 'layer-loop' : looped ? 'movement-loop' : 'no-progress'; break;
      }
    }
    if (ticks % (TICK_HZ * 3600) === 0) {
      const point = snapshot();
      diagnostics.checkpoints.push(point);
      onProgress(ticks * dt, point);
    }
    if (s.player.z !== z) {
      behaviour.layerChanges++;
      if (z === Core.SURFACE) wentDown = ticks * dt;
      else if (s.player.z === Core.SURFACE && ticks * dt - wentDown < 30) behaviour.shortTrips++;
      z = s.player.z;
    }
    if (s.goalIndex !== goalIndex) {
      for (const id of s.goalsDone) if (!(id in milestones)) milestones[id] = ticks * dt;
      goalIndex = s.goalIndex;
    }
  }
  endEpisode();
  session.release();
  Core.settleEconomy(s);
  const played = ticks * dt;
  const won = Core.canEmbark(s), saved = JSON.parse(Core.serialize(s));
  return { seed, played, embark: won ? played : null, stalled, stopReason, milestones, behaviour, diagnostics,
    final: snapshot(), ...(won ? { winningState: saved } : { failureState: saved }),
    abundance: s.abundanceLv, buildings: s.extractors.length, driver: 'shared fixed-tick engine + shipped AUTO', tickHz: TICK_HZ,
    engineWork: session.work,
    wallSeconds: (performance.now() - started) / 1000 };
}
