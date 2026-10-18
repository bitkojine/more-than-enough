/* An admin's copy of a shared world (server/src/copy.js), opened from the
 * link the moderator's copy route hands out: #copy=<room>.<key>. The game
 * then plays that room as the player it copies, and keeps nothing: this
 * browser's storage is swapped for one in memory before any other module
 * reads it, so the admin's own worlds, key and settings stay as they were,
 * and closing the tab forgets the copy. Only the language and the privacy
 * notice already seen are taken along, so the copy reads like the game.
 *
 * main.js imports this first. It imports nothing, so nothing reads storage
 * before it has run. */

const COPY_RE = /^([A-Za-z0-9_-]{22})\.([0-9a-f]{64})$/;
const TAKEN = ['mte.lang', 'mte.privacy'];

function linked() {
  try { return new URLSearchParams(location.hash.slice(1)).get('copy')?.match(COPY_RE) || null; } catch { return null; }
}

// Storage that lives only as long as the page.
function memoryStorage(from) {
  const m = new Map();
  for (const k of TAKEN) {
    try { const v = from?.getItem(k); if (v !== null && v !== undefined) m.set(k, v); } catch { /* blocked */ }
  }
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear()
  };
}

// The copy this page plays ({room}), or null for the ordinary game.
export const copy = (() => {
  const m = typeof location !== 'undefined' && linked();
  if (!m) return null;
  let real = null;
  try { real = globalThis.localStorage; } catch { /* blocked */ }
  const store = memoryStorage(real);
  store.setItem('mte.key', m[2]);
  store.setItem('mte.playing', m[1]);
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true });
  // Another tab's saves are its own: this page never hears of them.
  addEventListener('storage', (e) => e.stopImmediatePropagation(), true);
  return { room: m[1] };
})();
