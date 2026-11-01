/* What this game tells the room while you play a shared world, and when:
 * where you are (8 times a second when it changes, and a heartbeat every 2 s
 * standing still), what you did and the world edits it made (4 times a
 * second, acts first), and your progress (every 10 s, and on leaving). Your
 * progress, map and unsent acts are kept on this phone too, so a game that
 * closes before the room hears it loses none of it.
 *
 * `send` takes a message, `ready()` says whether the room hears us, `write`
 * keeps a key on the phone, and `outbox` (outbox.js) numbers and keeps what
 * went until the room answers. No page and no socket: tests drive it. */

import * as Core from '../core/index.js';
import { cleanSave } from '../net/protocol.js';
import { positionOf, editBatches } from './together-rules.js';
import { SAVE_PREFIX, FOG_PREFIX, ACTS_PREFIX } from './worlds.js';

export const POS_EVERY = 0.125; // seconds between position updates
export const HEARTBEAT = 2; // seconds: say where you are even standing still
export const EDITS_EVERY = 0.25;
export const SAVE_EVERY = 10;
export const FOG_EVERY = 15;
export const ACTS_WRITE_EVERY = 5; // seconds of play between keeping unsent acts on the phone while offline
export const MAX_PENDING_EDITS = 20000; // kept while the connection is down

export function createRoomSender({ outbox, send, ready, write }) {
  const timers = { pos: 0, beat: 0, edits: 0, save: 0, fog: 0 };
  let lastPos = '',
    lastSave = '',
    sentZ = null; // sentZ: the layer the room last heard you on
  let actsT = 0; // seconds until unsent acts are next kept on the phone (offline)

  // What the room may not have yet (sent lately, or waiting to be sent),
  // kept on this phone, so a game closed before it reconnects loses none of
  // it (issue #4).
  function keepActs(s) {
    if (!s.shared || !s.acts) return;
    write(ACTS_PREFIX + s.shared, outbox.kept(s));
  }

  // What you did since last time, with your play time now (see src/core/acts.js).
  // Kept while there's no connection to send them on, and a long backlog
  // goes ACTS_PER_TICK messages at a time, each as of its last act, so the
  // room never runs ahead of what's still to come. Returns whether all went.
  function sendActs(s) {
    if (!ready() || !s.acts) return false;
    const { messages, done } = outbox.takeActs(s);
    for (const m of messages) send({ t: 'acts', ...m });
    if (messages.length && outbox.keptWaiting) keepActs(s);
    return done;
  }

  function sendSave(s, force) {
    const progress = Core.progressOf(s);
    write(SAVE_PREFIX + s.shared, progress);
    if (force || timers.fog <= 0) {
      timers.fog = FOG_EVERY;
      write(FOG_PREFIX + s.shared, JSON.stringify(Core.fogOf(s)));
    }
    if (timers.save > 0 && !force) return;
    timers.save = SAVE_EVERY;
    if (progress === lastSave || !cleanSave(progress)) return;
    lastSave = progress;
    // The room checks this against what you did, so that goes first, all of it.
    if (s.acts && !sendActs(s)) {
      lastSave = '';
      timers.save = 0;
      return;
    }
    send({ t: 'save', s: progress, n: outbox.save(s) });
  }

  // Your progress: kept on this phone and sent to the room, and what you
  // did that the room may not have yet kept too.
  function save(s, force = false) {
    if (!s.shared) return;
    sendSave(s, force);
    keepActs(s);
  }

  return {
    save,

    // A new welcome: the room has heard nothing from this connection yet.
    reset() {
      lastPos = '';
      lastSave = '';
      sentZ = null;
    },

    // While there's no connection: edits wait in memory, at most
    // MAX_PENDING_EDITS of the newest, and what you did is kept on the phone.
    offline(s, dt) {
      if ((actsT -= dt) <= 0) {
        actsT = ACTS_WRITE_EVERY;
        keepActs(s);
      }
    },

    // Drops the oldest edits past MAX_PENDING_EDITS.
    trim(s) {
      const edits = s.world.edits;
      if (edits && edits.length > MAX_PENDING_EDITS)
        edits.splice(0, edits.length - MAX_PENDING_EDITS);
    },

    // Each tick of play while the room hears us. `you`: {facing, moving,
    // sign, act} as friends should see you.
    tick(s, dt, you) {
      for (const k in timers) timers[k] -= dt;
      // A new layer goes to the room at once, before any edit made there (an
      // arrival opens a cave around you): edits are checked against where the
      // room last had you.
      if (timers.pos <= 0 || sentZ !== s.player.z) {
        timers.pos = POS_EVERY;
        const pos = positionOf(s, you.facing, you.moving, you.sign, you.act);
        const text = JSON.stringify(pos);
        if (text !== lastPos || timers.beat <= 0) {
          lastPos = text;
          sentZ = s.player.z;
          timers.beat = HEARTBEAT;
          send({ t: 'pos', p: pos });
        }
      }
      if (timers.edits <= 0) {
        timers.edits = EDITS_EVERY;
        sendActs(s); // before the edits they made: the room does them on the world as it was
        const { batches, later } = editBatches(Core.takeEdits(s));
        if (later.length) s.world.edits.unshift(...later);
        for (const batch of batches) send({ t: 'edits', e: batch, n: outbox.edit(batch) });
      }
      if (timers.save <= 0) save(s);
    }
  };
}

export const AWAY_EVERY = 2100; // ms between away/back changes (the room takes one per STATUS_MS)

// Away or back, as the screen is now. The room takes one change every
// STATUS_MS and ignores the rest, so one that comes too soon waits: a quick
// look away and back must not leave friends seeing the wrong one.
// `hidden()` reads the screen when the message goes, not when it was asked.
export function createAwayTeller({
  send,
  hidden,
  now = () => performance.now(),
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) }
}) {
  let at = -Infinity,
    timer = 0;
  return function tell() {
    timers.clear(timer);
    const wait = at + AWAY_EVERY - now();
    if (wait > 0) {
      timer = timers.set(tell, wait);
      return;
    }
    at = now();
    send({ t: 'away', a: hidden() });
  };
}
