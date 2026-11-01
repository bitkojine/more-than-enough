/* The connection to one shared world's room: one WebSocket at a time, the
 * hello that opens it, the pings that show it's still there, and how long to
 * wait before trying again. What the room says, and what a close means for
 * the game, is together.js's; this only keeps the line.
 *
 * `open(url)` makes the socket (WebSocket in the page, a fake in tests), and
 * `timers` is {set, clear} (setTimeout/clearTimeout), so every ordering of
 * events can be forced under Node. */

import { PING } from '../net/protocol.js';

export const RECONNECT_MAX = 15; // seconds between tries, at most
export const PING_EVERY = 5; // seconds of play between asking the room if it's there
export const SILENT_IS_DEAD = 15; // seconds of play without a word from the room: the connection is gone

// Seconds before try number `retry` (counted from 0): doubling, capped.
export const reconnectWait = (retry) => Math.min(RECONNECT_MAX, 2 ** retry);

// The address of a room's socket on the room service.
export const socketUrl = (service, room) =>
  service.replace(/^http/, 'ws') + '/rooms/' + room + '/ws';

export function createRoomLink({
  open = (url) => new WebSocket(url),
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  hello,
  onMessage,
  onClosed
}) {
  let ws = null;
  let welcomed = false; // the room has sent this connection its world
  let retry = 0,
    retryTimer = null;
  // Is the room still there? Seconds of play since it last said anything,
  // and until the next ping.
  let silence = 0,
    pingT = 0;

  const ready = () => !!ws && ws.readyState === 1 && welcomed;

  // Closes the connection, saying goodbye.
  function hangUp() {
    timers.clear(retryTimer);
    retryTimer = null;
    if (ws) {
      const s = ws;
      ws = null;
      try {
        s.close(1000, 'bye');
      } catch {
        /* closed */
      }
    }
    welcomed = false;
  }

  // One connection at a time: a newer one replaces any still open, so a
  // forgotten socket can't stay in a world as you, or take this one's place
  // there ("open on another screen").
  function connect(url) {
    hangUp();
    if (!url) return;
    const socket = open(url);
    ws = socket;
    silence = 0;
    socket.onopen = () => socket.send(JSON.stringify(hello()));
    socket.onmessage = (e) => {
      if (ws !== socket) return;
      silence = 0;
      onMessage(e.data);
    };
    socket.onclose = (e) => {
      if (ws === socket) dropped(e.code, e.reason);
    };
  }

  function dropped(code, reason) {
    ws = null;
    welcomed = false;
    onClosed(code, reason);
  }

  return {
    connect,
    hangUp,
    get ready() {
      return ready();
    },
    // Whether a socket is open or opening (not waiting to try again).
    get open() {
      return !!ws;
    },
    get waiting() {
      return !!retryTimer;
    },

    // Whether the room has let this connection in (sent its world).
    get letIn() {
      return welcomed;
    },
    // The room sent this connection its world: from now on it hears us.
    welcome() {
      welcomed = true;
      retry = 0;
      pingT = PING_EVERY;
    },

    send(msg) {
      if (ready()) ws.send(JSON.stringify(msg));
    },

    // Lost the connection: try again after a wait that doubles each time.
    // Says whether this is the first try since it was last in (so the
    // player is told once, not every try).
    retryLater(reconnect) {
      const first = retry === 0;
      const wait = reconnectWait(retry);
      retry++;
      retryTimer = timers.set(reconnect, wait * 1000);
      return first;
    },
    resetRetry() {
      retry = 0;
    },

    // Each tick of play while connected. Counted in play time, so a game
    // that was hidden doesn't come back thinking the room went quiet. The
    // room said nothing for too long (not even to a ping): the connection
    // died without closing, and is dropped as if it had closed, so the game
    // reconnects instead of playing on into nothing. Says whether the line
    // is still up.
    tick(dt) {
      if (!ready()) return false;
      silence += dt;
      if (silence > SILENT_IS_DEAD) {
        const s = ws;
        ws = null;
        try {
          s.close(4000, 'silent');
        } catch {
          /* gone */
        }
        dropped(1006, 'silent');
        return false;
      }
      if ((pingT -= dt) <= 0) {
        pingT = PING_EVERY;
        ws.send(PING);
      }
      return true;
    }
  };
}
