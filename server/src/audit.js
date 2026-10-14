/* The audit log: what every player does in a shared world, one small JSON
 * object per event, for catching cheats and learning how people play. The
 * room (room.js) records events; the Durable Object (worker.js) writes them
 * out in chunks and serves them to the moderator as JSON lines.
 *
 * Every event is {ts, p, e, ...}: when (ms), which player (their id in this
 * world: a hash, never their key, name or address) and what. The events and
 * their fields are listed in server/README.md ("Audit log"). Nothing a
 * player typed is logged, because players can't type anything. */

export const LOG_DAYS = 14;                 // events older than this are deleted
export const SAMPLE_MS = 15_000;            // where each moving player is, this often
export const PROG_MS = 60_000;              // a player's progress, at most this often
export const LOG_FLUSH_MS = 30_000;         // events reach storage this soon (and when the last player leaves)
export const LOG_FLUSH_EVENTS = 500;        // or once this many are waiting

const round = (v) => Math.round(v);

// The parts of a player's progress (their save, JSON from the game) worth
// following: how far along they are, what they have unlocked and built, and
// how much they hold. Null if it isn't readable.
export function digestOf(save) {
  let d;
  try { d = JSON.parse(save); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const keysWhere = (o, ok) => (o && typeof o === 'object' ? Object.keys(o).filter((k) => ok(o[k])).sort() : []);
  const nums = (o) => {
    const out = {};
    if (o && typeof o === 'object') for (const k of Object.keys(o).slice(0, 32)) if (num(o[k])) out[k] = round(num(o[k]));
    return out;
  };
  const st = d.stats && typeof d.stats === 'object' ? d.stats : {};
  return {
    goal: num(d.goalIndex),
    ever: round(num(d.totalEver)),
    pres: num(d.prestiges),
    ins: round(num(d.insight)),
    ab: num(d.abundanceLv),
    deep: num(d.underground && d.underground.deepest),
    unl: keysWhere(d.unlocks, (v) => v === true),
    tools: nums(d.tools),
    perks: nums(d.perks),
    inv: nums(d.inv),
    built: round(num(st.built)),
    played: round(num(st.playedMs) / 1000)
  };
}

// What changed between two digests, as the fields of a `prog` event: the
// numbers now, and which unlocks are new.
export function progressEvent(before, now) {
  const { unl, ...rest } = now;
  const had = new Set(before ? before.unl : []);
  const gained = unl.filter((k) => !had.has(k));
  return { ...rest, nU: unl.length, ...(gained.length ? { gained } : {}) };
}

// Whether a digest says anything new (so an idle player's saves aren't logged).
export function sameDigest(a, b) {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

// A short, safe prefix of an invite code: enough to tell links apart in the
// log, not enough to use one.
export const codeTag = (code) => (typeof code === 'string' ? code.slice(0, 6) : null);

// Events as JSON lines.
export const toLines = (events) => events.map((e) => JSON.stringify(e)).join('\n');
