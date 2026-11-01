/* Lazy modules that survive a deploy and a waking phone.
 *
 * A few modules load only when they're needed (the 3D character, the sync
 * with your other devices, the QR library, the changelog, the earnings
 * statement, the performance panel). Each import can fail where the first
 * load didn't: iOS Safari restores a tab before its network is back, or
 * brings back an old page from its cache after a deploy and the module it
 * asks for is a newer one. Safari only says "Importing a module script
 * failed" (2026-11-01, an iPhone on 0.182.0 an hour after 0.183.0 went
 * live).
 *
 * So every lazy import goes through here:
 * - its URL carries the running build's ?v= (copied from this module's own
 *   URL: in the deployed bundle that is main.js?v=<build>);
 * - a failure is tried once more after a short wait, on a new URL, because
 *   a browser remembers a failed module URL and never fetches it again;
 * - if that fails too, the game asks whether a new build is live
 *   (src/game/update.js), which saves and reloads into it, never a dialog;
 * - the caller still gets the rejection, to fall back or to try again later
 *   (each later try gets a new URL too).
 *
 * Paths are relative to src/game/, where this file and every caller live. */

const RETRY_WAIT = 1000; // ms before the second try: the network wakes up

let stale = null;
const attempts = new Map();

// Called when a lazy module can't be loaded twice in a row: main.js hands in
// the updater's check, so a page left behind by a deploy reloads.
export function onLazyFailure(fn) {
  stale = fn;
}

// The URL for one try at `path`: the running build's ?v=, plus ?retry=N
// from the second try on.
export function lazyUrl(path, base, attempt) {
  const url = new URL(path, base);
  url.search = new URL(base).search;
  if (attempt) url.searchParams.set('retry', String(attempt));
  return url.href;
}

export async function lazy(
  path,
  {
    base = import.meta.url,
    load = (href) => import(href),
    wait = (ms) => new Promise((done) => setTimeout(done, ms))
  } = {}
) {
  const next = () => {
    const n = attempts.get(path) || 0;
    attempts.set(path, n + 1);
    return lazyUrl(path, base, n);
  };
  try {
    return await load(next());
  } catch (first) {
    await wait(RETRY_WAIT);
    try {
      return await load(next());
    } catch {
      try {
        stale?.(first);
      } catch {
        /* the check is best effort */
      }
      throw first;
    }
  }
}
