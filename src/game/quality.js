/* Quality that follows the device, and a frame rate that saves its battery.
 *
 * Most of a frame's cost is pixels: the map is drawn at the screen's own
 * density (up to 2 device pixels per CSS pixel, four times the pixels of 1),
 * and the HUD's frosted glass blurs the moving map under it again every
 * frame. A new phone does both easily; an old one can't keep up, and the game
 * lags. A phone that gets hot slows itself down for a while, and speeds up
 * again once it cools or is plugged in.
 *
 * So the game watches its own frame rate. While frames come too slowly, it
 * steps down a level at a time: the HUD drops its blur (its glass is nearly
 * opaque anyway), the map is drawn with fewer and fewer pixels, softer
 * but never blocky, and fewer gathered resources float home at once. After UP_AFTER_S of smooth frames it tries one level
 * better. If that is too slow it steps back down at once and waits twice as
 * long before trying again (up to UP_MAX_S), so it never flickers between
 * levels; plugging in the charger tries again soon. The level it settled on
 * is remembered and the next visit starts there, so an old phone doesn't lag
 * through the same steps on every load. A big screen is also never drawn with
 * more than MAX_PIXELS (a Retina laptop window has several times a phone's
 * pixels).
 *
 * Rendering always targets 30 FPS, whether the player is acting or standing
 * still, on every device. Adaptive quality changes detail, never the target. */

// `flyers`: how many gathered resources float home at once (Watch: busy
// bases look fuller on fast phones, slow ones save a little more).
export const LEVELS = [
  { dpr: 2, glass: true, flyers: 80 },
  { dpr: 1.5, glass: false, flyers: 60 },
  { dpr: 1, glass: false, flyers: 40 },
  { dpr: 0.75, glass: false, flyers: 20 }
];
export const MAX_PIXELS = 3_000_000; // device pixels the map is drawn with, at most
export const RENDER_FPS = 30; // one rendering target for all devices and activity states
const SLOW = 2 / 3;       // of the pace: an average frame rate under this is too slow
const SMOOTH = 13 / 15;     // ... and at or over this, smooth (room to try better)
const JUDGE_S = 1;          // seconds of frames each judgement averages
const SETTLE_S = 1.5;       // seconds not judged after starting, a step, or coming back
const HICCUP_MS = 250;      // a gap this long is a pause (a tab switch, a save), not the pace
export const UP_AFTER_S = 20;  // seconds of smooth frames before trying a level better
export const UP_MAX_S = 600;   // the longest wait between tries, after failed ones
const RETRY_S = 5;          // smooth seconds before a try once the charger is plugged in

// Strict admission: never draw early, even when a caller requests a higher rate.
export const frameDue = sinceMs => sinceMs >= 1000 / RENDER_FPS;

// Near a deadline, wait the remaining milliseconds instead of drawing early
// or missing a whole display refresh. -1 means wait for the next animation frame.
export function frameWait(sinceMs) {
  const remaining = 1000 / RENDER_FPS - sinceMs;
  return remaining <= 0 ? 0 : remaining <= 16 ? Math.ceil(remaining) : -1;
}

/**
 * @param {number} remembered the level the last visit settled on (this one starts there)
 * @param {number} screenDpr the screen's own device pixels per CSS pixel
 * @param {() => void} changed called after each step down or up
 */
export function createQuality(remembered, screenDpr, changed) {
  const SLOW_MS = 1000 / (RENDER_FPS * SLOW), SMOOTH_MS = 1000 / (RENDER_FPS * SMOOTH);
  // Two levels look the same on this screen if it draws them at the same
  // density (a laptop at 1x has nothing to gain from 1.5x): skip over those.
  const looks = (i) => Math.min(LEVELS[i].dpr, screenDpr) + (LEVELS[i].glass ? 'g' : '');
  const last = LEVELS.length - 1;
  let level = Math.min(last, Math.max(0, remembered | 0));
  let settle = 0, sum = 0, frames = 0;
  let smooth = 0;           // ms of smooth frames in a row at this level
  let upAfter = UP_AFTER_S * 1000;
  let trying = false;       // this level is a try, not yet proven

  function start() { settle = SETTLE_S * 1000; sum = 0; frames = 0; }

  // Moves `dir` (+1 down, -1 up) to the next level that looks different.
  function step(dir) {
    const was = looks(level);
    let to = level;
    do to += dir; while (to > 0 && to < last && looks(to) === was);
    if (to < 0 || to > last || looks(to) === was) return false;
    level = to;
    smooth = 0;
    start();
    changed();
    return true;
  }

  function judge(avg, ms) {
    if (avg > SLOW_MS) {
      smooth = 0;
      // A failed try: back down, and wait longer before the next.
      if (trying) upAfter = Math.min(UP_MAX_S * 1000, upAfter * 2);
      trying = false;
      step(+1);
      return;
    }
    if (avg > SMOOTH_MS) { smooth = 0; return; }
    smooth += ms;
    if (trying && smooth >= UP_AFTER_S * 1000) { trying = false; upAfter = UP_AFTER_S * 1000; }
    if (!trying && smooth >= upAfter && step(-1)) trying = true;
  }

  const quality = {
    get level() { return level; },
    get dpr() { return LEVELS[level].dpr; },
    get glass() { return LEVELS[level].glass; },
    get flyers() { return LEVELS[level].flyers; },

    // One frame drawn at full pace, intervalMs after the last one.
    frame(intervalMs) {
      if (!(intervalMs > 0) || intervalMs > HICCUP_MS) return;
      if (settle > 0) { settle -= intervalMs; return; }
      sum += intervalMs; frames++;
      if (sum < JUDGE_S * 1000) return;
      const avg = sum / frames, ms = sum;
      sum = 0; frames = 0;
      judge(avg, ms);
    },

    // Frames just stopped or are about to stall for a moment (the tab was
    // hidden, the screen changed size, the pace changed): don't count the next few.
    settle: start,

    // The device may have more to give now (the charger went in): try a
    // better level after a few smooth seconds.
    retry() {
      upAfter = UP_AFTER_S * 1000;
      smooth = Math.max(smooth, upAfter - RETRY_S * 1000);
    }
  };
  start();
  return quality;
}

// The density to draw a cssWidth x cssHeight map at: the level's, the
// screen's own, and no more than MAX_PIXELS in all (but never below 1x for
// that alone: under 1x is only for a device that can't keep up).
export function drawDpr(levelDpr, screenDpr, cssWidth, cssHeight) {
  const fit = Math.max(1, Math.sqrt(MAX_PIXELS / Math.max(1, cssWidth * cssHeight)));
  return Math.min(levelDpr, screenDpr, fit);
}
