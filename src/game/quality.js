/* Quality that follows the device. Most of a frame's cost is pixels: the map
 * is drawn at the screen's own density (up to 2 device pixels per CSS pixel,
 * four times the pixels of 1), and the HUD's frosted glass blurs the moving
 * map under it again every frame. A new phone does both easily; an old one
 * can't keep up, and the game lags.
 *
 * So the game watches its own frame rate. While frames come too slowly, it
 * steps down a level at a time: the HUD drops its blur (its glass is nearly
 * opaque anyway) and the map is drawn with fewer and fewer pixels, softer
 * but never blocky. It never steps back up within a visit, so it can't flicker
 * between levels. The level it settled on is remembered and the next visit
 * starts there, so an old phone doesn't lag through the same steps on every
 * load. A big screen is also never drawn with more than MAX_PIXELS (a Retina
 * laptop window has several times a phone's pixels). */

export const LEVELS = [
  { dpr: 2, glass: true },
  { dpr: 1.5, glass: false },
  { dpr: 1, glass: false },
  { dpr: 0.75, glass: false }
];
export const MAX_PIXELS = 3_000_000; // device pixels the map is drawn with, at most
const SLOW_MS = 1000 / 40;  // an average gap between frames above this is too slow
const JUDGE_S = 1;          // seconds of frames each judgement averages
const SETTLE_S = 1.5;       // seconds not judged after starting, a step, or coming back
const HICCUP_MS = 250;      // a gap this long is a pause (a tab switch, a save), not the pace

/**
 * @param {number} remembered the level the last visit settled on (this one starts there)
 * @param {number} screenDpr the screen's own device pixels per CSS pixel
 * @param {() => void} changed called after each step down
 */
export function createQuality(remembered, screenDpr, changed) {
  // Two levels look the same on this screen if it draws them at the same
  // density (a laptop at 1x has nothing to gain from 1.5x): skip over those.
  const looks = (i) => Math.min(LEVELS[i].dpr, screenDpr) + (LEVELS[i].glass ? 'g' : '');
  const last = LEVELS.length - 1;
  let level = Math.min(last, Math.max(0, remembered | 0));
  let settle = 0, sum = 0, frames = 0;

  function start() { settle = SETTLE_S * 1000; sum = 0; frames = 0; }

  function stepDown() {
    const was = looks(level);
    while (level < last && looks(level) === was) level++;
    if (looks(level) !== was) changed();
  }

  const quality = {
    get level() { return level; },
    get dpr() { return LEVELS[level].dpr; },
    get glass() { return LEVELS[level].glass; },

    // One frame drawn, intervalMs after the last one.
    frame(intervalMs) {
      if (!(intervalMs > 0) || intervalMs > HICCUP_MS) return;
      if (settle > 0) { settle -= intervalMs; return; }
      sum += intervalMs; frames++;
      if (sum < JUDGE_S * 1000) return;
      if (sum / frames > SLOW_MS) stepDown();
      start();
    },

    // Frames just stopped or are about to stall for a moment (the tab was
    // hidden, the screen changed size): don't count the next few.
    settle: start
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
