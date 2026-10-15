/* The audit log: what every player does in a shared world, one small JSON
 * object per event, for catching cheats and learning how people play. The
 * room (room.js) records events; the Durable Object (worker.js) writes them
 * out in chunks and serves them to the moderator as JSON lines.
 *
 * Every event is {ts, p, e, ...}: when (ms), which player (their id in this
 * world: a hash, never their key, name or address) and what. The events and
 * their fields are listed in server/README.md ("Audit log"). Nothing a
 * player wrote is logged: names come only from the game's own list
 * (src/net/names.js) and invite codes only as a short prefix of a real
 * code, because the log is read by an AI reviewer and any text in it could
 * be made to read like an instruction. */

import { NAMES } from '../../src/net/names.js';
import { ROOM_ID_RE } from '../../src/net/protocol.js';

export const LOG_DAYS = 14;                 // events older than this are deleted
export const SECURITY_DAYS = 90;            // except the security trail, kept this long
// The security trail: cheats, bans, freezes, people turned away, connections cut.
export const SECURITY_EVENTS = new Set(['cheat', 'ban', 'freeze', 'thaw', 'deny', 'cut', 'drift']);
export const SAMPLE_MS = 15_000;            // where each moving player is, this often
export const PROG_MS = 60_000;              // a player's progress, at most this often
export const LOG_FLUSH_MS = 30_000;         // events reach storage this soon (and when the last player leaves)
export const LOG_FLUSH_EVENTS = 500;        // or once this many are waiting

const round = (v) => Math.round(v);

// The parts of a player's progress (their save, JSON from the game) worth
// following: how far along they are, what they have unlocked and built, and
// how much they hold. Only names the game has are kept; anything else is
// left out. Null if it isn't readable.
export function digestOf(save) {
  let d;
  try { d = JSON.parse(save); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const known = (o, names) => {
    if (!o || typeof o !== 'object') return [];
    return Object.keys(o).filter((k) => names.includes(k)).sort();
  };
  const nums = (o, names) => {
    const out = {};
    for (const k of known(o, names)) if (num(o[k])) out[k] = round(num(o[k]));
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
    unl: known(d.unlocks, NAMES.unlocks).filter((k) => d.unlocks[k] === true),
    tools: nums(d.tools, NAMES.tools),
    perks: nums(d.perks, NAMES.perks),
    inv: nums(d.inv, NAMES.inv),
    built: round(num(st.built)),
    played: round(num(st.playedMs) / 1000)
  };
}

// A building's kind as logged: one the game has, or '?'.
export const kindTag = (kind) => (NAMES.buildings.includes(kind) ? kind : '?');

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
export const codeTag = (code) => (typeof code === 'string' && ROOM_ID_RE.test(code) ? code.slice(0, 6) : null);

// Events as JSON lines.
export const toLines = (events) => events.map((e) => JSON.stringify(e)).join('\n');

// Whether any of these events belong to the security trail.
export const hasSecurity = (events) => events.some((e) => SECURITY_EVENTS.has(e.e));

// Only the security trail's lines of a chunk of JSON lines (for keeping it
// after the rest of the chunk is LOG_DAYS old).
export function securityOnly(lines) {
  return lines.split('\n').filter((line) => {
    try { return SECURITY_EVENTS.has(JSON.parse(line).e); } catch { return false; }
  }).join('\n');
}
