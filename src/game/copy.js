/* An admin's copy of a shared world (server/src/copy.js), opened from the
 * link the moderator's copy route hands out: #copy=<room>.<key>. The game
 * then plays that room as the player it copies, and keeps nothing: this
 * browser's storage is swapped for one in memory before any other module
 * reads it, so the admin's own worlds, key and settings stay as they were,
 * and closing the tab forgets the copy. Only the language and the privacy
 * notice already seen are taken along, so the copy reads like the game.
 *
 * What only the player's phone knew can be played too, from the link:
 * `&was=0.89.0`, the version their open tab last ran (the version badge then
 * rolls over from it and What's new marks what came since), and `&shown=mycelium:1.4e14,ore:2e13`,
 * the numbers their phone last showed (the arrival then says those weren't
 * real when they're far over the room's).
 *
 * main.js imports this first. It imports nothing, so nothing reads storage
 * before it has run. */

const COPY_RE = /^([A-Za-z0-9_-]{22})\.([0-9a-f]{64})$/;
const TAKEN = ['mte.lang', 'mte.privacy'];
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const SHOWN_RE = /^[a-z]{1,16}:\d+(\.\d+)?(e\d{1,3})?$/;

// The numbers the player's phone last showed, from `&shown=` ({inv}), or null.
function shownOn(raw) {
  const parts = (raw || '').split(',').filter(Boolean);
  if (!parts.length || parts.length > 8 || !parts.every((p) => SHOWN_RE.test(p))) return null;
  return { inv: Object.fromEntries(parts.map((p) => { const [k, v] = p.split(':'); return [k, Number(v)]; })) };
}

function linked() {
  try {
    const q = new URLSearchParams(location.hash.slice(1));
    const m = q.get('copy')?.match(COPY_RE);
    const of = q.get('of');
    return m ? { room: m[1], key: m[2], of: of && /^[A-Za-z0-9_-]{22}$/.test(of) ? of : null, was: VERSION_RE.test(q.get('was') || '') ? q.get('was') : null, shown: shownOn(q.get('shown')) } : null;
  } catch { return null; }
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

// The copy this page plays ({room, of: the real world's id, for its name}),
// or null for the ordinary game.
export const copy = (() => {
  const m = typeof location !== 'undefined' && linked();
  if (!m) return null;
  let real = null;
  try { real = globalThis.localStorage; } catch { /* blocked */ }
  const store = memoryStorage(real);
  store.setItem('mte.key', m.key);
  store.setItem('mte.playing', m.room);
  if (m.shown) store.setItem('mte.room.' + m.room, JSON.stringify(m.shown));
  const session = memoryStorage(null);
  if (m.was) session.setItem('mte.updatedFrom', m.was);
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true });
  // Another tab's saves are its own: this page never hears of them.
  addEventListener('storage', (e) => e.stopImmediatePropagation(), true);
  return { room: m.room, of: m.of };
})();
