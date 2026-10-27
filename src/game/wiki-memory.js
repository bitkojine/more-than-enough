/* What Wiki has already told this player, and when it may speak up. Pure:
 * the caller passes the time and keeps the saved copy. Wiki's memory is
 * knowledge, so it belongs to the player, not to one world: a new world
 * starts empty-handed, but Wiki doesn't explain stone twice. */
export const WIKI_MODES = ['chatty', 'quiet', 'off'];
// Remarks nobody asked for are spaced out: at most one this often.
export const UNPROMPTED_GAP_S = 60;

export function createWikiMemory(saved = null) {
  const mode = WIKI_MODES.includes(saved?.mode) ? saved.mode : 'chatty';
  const known = new Set(Array.isArray(saved?.known) ? saved.known.filter((k) => typeof k === 'string').slice(-500) : []);
  let lastUnprompted = -Infinity;
  return {
    mode,
    known,
    // 'speak' or 'glance' (look at it, say nothing). how: 'asked' (a press
    // and hold on the world), 'pointed' (Wiki's own hello) or 'nearby'
    // (Mica walked up to it).
    decide(kind, how, now) {
      if (this.mode === 'off' || !kind) return 'glance';
      if (how === 'asked') return 'speak';
      if (this.mode !== 'chatty' || known.has(kind)) return 'glance';
      if (how === 'nearby' && now - lastUnprompted < UNPROMPTED_GAP_S) return 'glance';
      return 'speak';
    },
    told(kind, how, now) {
      if (kind) { known.delete(kind); known.add(kind); }
      if (how === 'nearby') lastUnprompted = now;
    },
    save() { return { mode: this.mode, known: [...known].slice(-500) }; }
  };
}
