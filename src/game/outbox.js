/* What this phone sends a shared world's room and must not lose
 * (src/game/together.js sends it; server/src/room.js and shadow.js take it).
 *
 * Three queues, one per kind of message:
 *   - edits: numbered batches kept until the room answers 'ack' with their
 *     number, so after a lost connection those it never dealt with are sent
 *     again (unless the room already has something there);
 *   - acts: what the player did (src/core/acts.js), sent in order and kept
 *     for a minute after, since a dying connection or a restarted room may
 *     not have them; kept on the phone too while offline (issue #4);
 *   - saves: the progress sent, numbered, so the room's correction ('econ')
 *     is matched to the save it answers, not to one at the same play time.
 *
 * No DOM, no storage, no clocks: together.js does the sending and keeping,
 * and Node tests drive these queues through every ordering
 * (test/unit/outbox.test.js). */

import * as Core from '../core/index.js';
import { LIMITS } from '../net/protocol.js';

export const SENT_KEPT = 6;          // progress sent, remembered for the room's answer to it
export const ACTS_KEPT_MS = 60_000;  // play time of acts kept after sending, to send again if the room missed them
export const ACTS_KEPT_MAX = 6000;   // and at most this many
export const MAX_UNACKED = 400;      // batches of edits sent and not yet answered, kept to send again
export const ACTS_PER_TICK = 4;      // 'acts' messages at most per frame (the room allows 30 messages a second)

export function createOutbox() {
  let editSeq = 0, unacked = [];
  let saveSeq = 0, sent = [];  // {n, ms, ...Core.sentOf} of the last progress sent
  let sentActs = [];           // acts sent lately: the room may not have them
  let keptWaiting = false;     // the phone holds acts as still to send

  return {
    // Leaving the shared world: nothing of it is still to send.
    reset() { unacked = []; sent = []; sentActs = []; },

    // Arriving in a world other than the one these were for (or one made again).
    newWorld() { unacked = []; sentActs = []; },

    /* ------------------------------------------------------------ edits */

    // A batch of edits about to go: its number, for the message.
    edit(batch) {
      const n = ++editSeq;
      unacked.push({ n, e: batch });
      if (unacked.length > MAX_UNACKED) unacked.shift();
      return n;
    },

    // The room has dealt with every batch up to `n`.
    acked(n) {
      if (Number.isSafeInteger(n)) unacked = unacked.filter((u) => u.n > n);
    },

    // Back after a lost connection, in a world `w` (the welcome): the edits
    // sent that the room never answered and has nothing in place of. The
    // queue is emptied: they go out again as new edits.
    lostEdits(w) {
      const has = new Set([...w.mods.map(([k]) => 'm' + k), ...w.props.map(([k]) => 'p' + k), ...w.ext.map((e) => 'x' + e[1] + ',' + e[2] + ',' + e[3])]);
      const lost = unacked.flatMap((u) => u.e).filter((e) => !has.has(e[0] === 'x' ? 'x' + e[2] + ',' + e[3] + ',' + e[4] : e[0] + e[1]));
      unacked = [];
      return lost;
    },

    get unacked() { return unacked.length; },

    /* ------------------------------------------------------------- acts */

    // What player state `s` did since last time, as 'acts' messages
    // ({ms, a}) to send now: a long backlog goes ACTS_PER_TICK messages at a
    // time, each as of its last act, so the room never runs ahead of what's
    // still to come; the last carries the play time now. `done`: none waits.
    takeActs(s) {
      if (!s.acts?.length) return { messages: [], done: true };
      const acts = Core.takeActs(s);
      const n = LIMITS.actsPerMessage;
      const now = acts.slice(0, n * ACTS_PER_TICK);
      s.acts.unshift(...acts.slice(now.length));
      const keepFrom = s.stats.playedMs - ACTS_KEPT_MS;
      sentActs = [...sentActs, ...now].filter((a) => a[1] >= keepFrom).slice(-ACTS_KEPT_MAX);
      const done = !s.acts.length;
      const messages = [];
      for (let i = 0; i < now.length; i += n) {
        const a = now.slice(i, i + n);
        messages.push({ ms: done && i + n >= now.length ? Math.round(s.stats.playedMs) : a[a.length - 1][1], a });
      }
      return { messages, done };
    },

    // Back after a lost connection, the room's copy as of play time `upTo`:
    // acts sent after that go again, ahead of those still waiting.
    resendActs(s, upTo) {
      if (s.acts) s.acts = [...sentActs.filter((a) => a[1] > upTo), ...s.acts];
      sentActs = [];
    },

    // What to keep on the phone for state `s` (JSON), so a game closed before
    // it reconnects loses none of it.
    kept(s) {
      keptWaiting = s.acts.length > 0;
      return JSON.stringify({ sent: sentActs, waiting: s.acts });
    },

    // Whether the phone holds acts as still to send (then they're kept
    // again once sent, so none goes twice).
    get keptWaiting() { return keptWaiting; },

    /* ------------------------------------------------------------ saves */

    // Progress of state `s` about to go: its number, for the message.
    save(s) {
      sent.push({ n: ++saveSeq, ms: Math.round(s.stats.playedMs), ...Core.sentOf(s) });
      if (sent.length > SENT_KEPT) sent.shift();
      return saveSeq;
    },

    // The room put `made` (resource -> amount, made while away) in your
    // packs, from the progress it answered on: any it answers later had it
    // too, so a correction keeps it once.
    earnedAway(made) {
      for (const x of sent) {
        if (!x.inv) continue;
        for (const r of Core.RESOURCES) if (made[r] > 0) x.inv[r] = (x.inv[r] || 0) + made[r];
      }
    },

    // The progress sent as number `n`, if it's still remembered.
    answered(n) {
      return Number.isSafeInteger(n) ? sent.find((x) => x.n === n) || null : null;
    }
  };
}

// Acts kept on the phone (`raw`, what kept() made) that a room whose copy
// is as of play time `upTo` hasn't done: all still waiting, and those sent
// after `upTo`. Anything malformed is left out.
export function keptActsFrom(raw, upTo) {
  let kept;
  try { kept = JSON.parse(raw || '{}'); } catch { kept = {}; }
  const ok = (a) => Array.isArray(a) && Core.ACT_KINDS.includes(a[0]) && Number.isFinite(a[1])
    && Number.isFinite(a[2]) && Number.isFinite(a[3]) && Number.isInteger(a[4]);
  const list = (v) => (Array.isArray(v) ? v.filter(ok) : []);
  return [...list(kept?.sent).filter((a) => a[1] > upTo), ...list(kept?.waiting)];
}

// Brings the room's copy of your progress (`s`, just arrived) forward over
// `acts` the room has yet to do, the way the room will do them when they
// arrive (server/src/shadow.js acts): same rules, same clock, so new acts
// come after them and the room takes them in order. The land isn't changed
// here: the room's world is the truth for that. Where the two still differ
// the room's answer ('econ') sets the game straight.
export function catchUp(s, acts, roomTime) {
  const { mods, props, edits } = s.world;
  s.world.mods = new Map(mods); s.world.props = new Map(props); s.world.edits = null;
  s.acts = null; // doing them again writes none down
  const last = acts[acts.length - 1][1];
  if (roomTime !== null) s.time = roomTime - Math.max(0, last - s.stats.playedMs) / 1000;
  for (const a of acts) {
    if (a[1] < s.stats.playedMs - 1) continue; // out of order: the room refuses it too
    if (a[1] > s.stats.playedMs) Core.playFor(s, (a[1] - s.stats.playedMs) / 1000);
    Core.replayAct(s, a);
  }
  Core.advanceGoals(s);
  s.world.mods = mods; s.world.props = props; s.world.edits = edits;
}

// Back after a lost connection to the world `w` (the welcome), as player
// `me`: the room's world wins, your progress stays, and what you changed
// meanwhile goes again (edits the room never answered, acts it may not
// have). `playedUpTo`: the play time of the room's copy of your progress.
export function resync(s, w, me, outbox, playedUpTo) {
  const waiting = new Map(s.extractors.filter((e) => e.owner === me).map((e) => [e.x + ',' + e.y + ',' + e.z, e.buffer]));
  const lost = outbox.lostEdits(w);
  outbox.resendActs(s, playedUpTo);
  const pending = [...lost, ...Core.takeEdits(s)];
  s.world.mods = new Map();
  s.world.props = new Map();
  s.extractors = [];
  Core.applyEdits(s, [...w.mods.map(([k, v]) => ['m', k, v]), ...w.props.map(([k, v]) => ['p', k, v]), ...w.ext.map((e) => ['x', ...e])]);
  for (const e of s.extractors) if (e.owner === me) e.buffer = waiting.get(e.x + ',' + e.y + ',' + e.z) || 0;
  s.world.edits = pending;
  for (const e of pending) Core.applyEdits(s, [e[0] === 'x' ? [...e, me] : e]);
}
