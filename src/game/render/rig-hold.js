/* When Mica's last picture can stand in for a new render.
 *
 * Rendering the rig is the biggest job in a frame: two WebGL passes, then a
 * copy into the 2D map that makes the browser finish them (Lighthouse,
 * 2026-11-01: most of the main-thread time on a phone profile). Standing
 * still, the only things that move are slow idle ones (breathing, a glance, a
 * blink), so the picture is redrawn at IDLE_FPS instead of every frame.
 * Walking, working, or Wiki talking always render every frame. */

export const IDLE_FPS = 15;
const IDLE_MS = 1000 / IDLE_FPS;
// Wiki's mouth moves only this long into a line (wiki-motion.js).
const TALK_S = 1.6;

const talking = (wiki) =>
  !!wiki && wiki.talk !== null && wiki.talk !== undefined && wiki.talk >= 0 && wiki.talk < TALK_S;

/** Whether this pose is a still one, whose only motion is the slow idle kind. */
export function stillPose(options) {
  return !options.walking && !options.action && !talking(options.wiki);
}

/** The pose without its clocks: two still poses with the same shape differ
 * only by idle motion. `wiki.focus` is for the HUD, the rig never reads it. */
export function poseShape(options) {
  const { time: _time, wiki, ...rest } = options;
  if (!wiki) return JSON.stringify(rest);
  const { focus: _focus, talk: _talk, ...still } = wiki;
  return JSON.stringify({ ...rest, wiki: still });
}

/** Whether the picture rendered `elapsedMs` ago, whose shape was
 * `lastShape`, can be shown again for `options` of shape `shape`. */
export function holdsPicture(lastShape, shape, options, elapsedMs) {
  return (
    lastShape !== null &&
    lastShape === shape &&
    elapsedMs >= 0 &&
    elapsedMs < IDLE_MS &&
    stillPose(options)
  );
}
