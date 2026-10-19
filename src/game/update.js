/* Always the newest game: nobody plays an old version.
 *
 * Each deploy has a build id: scripts/stage-site.sh stamps it onto every asset
 * URL (this module's own included, as ?v=<build>) and writes it to build.json
 * at the site root. The game asks for build.json when it starts, every minute
 * while it's in view, when it comes back into view or back online, and when a
 * friend joins a shared world (they most likely just loaded the newest one).
 * The moment the site's build differs from the one running, the game saves
 * and reloads. No asking. It notes the version it was on, so the new one can
 * roll the version badge over from it (src/game/news.js).
 *
 * Run from source there is no stamp, so nothing to compare: it stays off. */

import { VERSION } from '../version.js';

const CHECK_EVERY = 60_000;   // ms between checks while the game is in view
const RETRY_AFTER = 60_000;   // ms before reloading for the same build again
const RELOADED_STORE = 'mte.reloadedFor';
const FROM_STORE = 'mte.updatedFrom';  // the version played before the update

// The build stamped on a module URL, or null when run from source.
export function stampOf(url) {
  try { return new URL(url).searchParams.get('v'); } catch { return null; }
}

// The build the site serves now, or null if it can't be read.
async function siteBuild() {
  const res = await fetch('build.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) return null;
  const d = await res.json();
  return typeof d?.build === 'string' && d.build ? d.build : null;
}

// Reload into the new build: the page itself is fetched past the browser's
// cache first, so the reload can't come back with the old one.
async function hardReload() {
  try { await fetch(location.pathname + location.search, { cache: 'reload' }); } catch { /* reload anyway */ }
  location.reload();
}

// If the CDN still hands out the old page right after a deploy, the reload
// lands on the old build again: wait a minute before the next try rather
// than reloading in a loop.
function reloadedRecently(build, store, now) {
  try {
    const [b, at] = (store.getItem(RELOADED_STORE) || '').split(' ');
    return b === build && now - Number(at) < RETRY_AFTER;
  } catch { return false; }
}
function noteReload(build, store, now) {
  try { store.setItem(RELOADED_STORE, build + ' ' + now); } catch { /* storage off: no loop guard */ }
}

// The version this tab played before the game updated itself, or null; read
// once (the next start doesn't ask again).
export function takeUpdatedFrom(store = globalThis.sessionStorage) {
  try {
    const from = store.getItem(FROM_STORE);
    store.removeItem(FROM_STORE);
    return from || null;
  } catch { return null; }
}

export function createUpdater({
  save,
  version = VERSION,
  running = stampOf(import.meta.url),
  latest = siteBuild,
  reload = hardReload,
  store = globalThis.sessionStorage,
  now = Date.now
}) {
  let checking = false;
  let leaving = false;

  async function check() {
    if (!running || checking || leaving) return;
    checking = true;
    try {
      const build = await latest();
      if (!build || build === running || reloadedRecently(build, store, now())) return;
      leaving = true;
      noteReload(build, store, now());
      // Kept from the first of several updates in a row, so nothing is missed.
      try { if (!store.getItem(FROM_STORE)) store.setItem(FROM_STORE, version); } catch { /* no notes then */ }
      save();
      await reload();
    } catch { /* offline or mid-deploy: the next check tries again */ }
    finally { checking = false; }
  }

  function start() {
    if (!running) return;
    check();
    setInterval(() => { if (!document.hidden) check(); }, CHECK_EVERY);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    window.addEventListener('online', check);
  }

  return { check, start, running };
}
