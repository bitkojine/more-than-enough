/* Safari on an iPhone or iPad deletes a site's storage after 7 days of use
 * without it being opened, unless the game was added to the Home Screen. So,
 * once per device, after the player has reached a milestone (Watch,
 * 2026-10-27: not in the opening), Wiki says to add it there. Only in Safari
 * on iOS, and never when the game already runs from the Home Screen. */

const STORE = 'mte.homeHint'; // set once Wiki has said it
const AFTER_MS = 60_000;      // a game opened past its first milestone waits this long

// Whether this browser is Safari on an iPhone, iPad or iPod, outside the Home Screen.
export function needsHomeScreen(nav, standalone) {
  if (!nav || standalone) return false;
  const ua = String(nav.userAgent || '');
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1); // iPadOS says Mac
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

// `say()` puts the line in the log; `check(milestonesReached, msOpen)` runs
// now and then.
export function createHomeHint({ store, nav = globalThis.navigator, standalone = false, say }) {
  let done = !needsHomeScreen(nav, standalone);
  try { if (!done && store.getItem(STORE)) done = true; } catch { done = true; }
  let atOpen = null; // milestones reached when the game opened
  return {
    // Says it as a milestone is reached, or a while after opening a game
    // already past one. True when it did.
    check(reached, msOpen) {
      if (done) return false;
      if (atOpen === null) atOpen = reached;
      if (reached < 1 || (reached === atOpen && msOpen < AFTER_MS)) return false;
      done = true;
      try { store.setItem(STORE, '1'); } catch { /* blocked: said this visit */ }
      say();
      return true;
    }
  };
}
