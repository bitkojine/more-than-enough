/* Being in one shared world's room, without the page (0.207.0): the
 * connection, the friends you see, what waits to be sent and what the room
 * says, the welcome that lets you in, and each frame's part. together.js
 * puts the page around it (the sign, invite links, Worlds, toasts); the
 * company bots (scripts/bots/) play through it in Node exactly as a game in
 * the page does, so they speak what the game speaks (Watch chose a slim
 * Node player, 2026-11-08).
 *
 * Nothing here touches the DOM or a clock of its own: storage (`read`,
 * `write`), the socket (`open`), `timers`, `seconds` and whether the game is
 * hidden come in, and what only the page does goes out through `on`:
 *   broken()            the welcome didn't fit: leave
 *   mismatched(old)     the world plays another world format (old: this game)
 *   entered()           let in: the page remembers the world
 *   arrive(w, renewed)  into the world afresh: true if it opened
 *   welcomed()          all set up after a welcome
 *   closed(code, why)   the connection closed
 * `room()` is the world you're in or joining; `hello()` the rest of the
 * hello (the key, an invite code). */

import { LIMITS, parse } from '../net/protocol.js';
import { WORLD_FORMAT } from '../core/format.js';
import { playedTime, cleanWelcome } from './room-messages.js';
import { createRoomHandlers } from './room-handlers.js';
import { createRoomSender, createAwayTeller } from './room-sender.js';
import { checkMaking } from './arrival.js';
import { createFriends } from './friends.js';
import { createRoomLink } from './room-link.js';
import { createOutbox, resync as resyncState } from './outbox.js';

export const WELCOME_BYTES = 8_000_000; // the most a room's welcome may be

// What a hello says this game can do, beside who it is.
export const CAN = Object.freeze({
  crystal: true, // play a crystal room (0.194.0)
  seats: true, // machines side by side in it (cultivation-seats.js, 0.198.0)
  shares: true // does jobs others ask at its crystal (cultivation-share.js, 0.200.0)
});

export function createRoomSession({
  game,
  hud,
  read,
  write,
  room,
  hello,
  on,
  seconds,
  hidden = () => false,
  open,
  timers,
  actor,
  sign = null,
  invites = () => null,
  awayProduce = () => false,
  renderFriends = () => {},
  checkUpdate = () => {},
  onAway = () => {},
  turnedAway = () => {}
}) {
  let clock = null; // the world's clock: {t: its time, at: our time then}
  const outbox = createOutbox(); // edits, acts and progress sent, kept until the room has them
  const friends = createFriends({ clock: seconds, actor, limit: LIMITS.players });
  const link = createRoomLink({
    ...(open ? { open } : {}),
    ...(timers ? { timers } : {}),
    hello: () => ({ t: 'hello', away: awayProduce(), ...CAN, ...hello() }),
    onMessage: receive,
    onClosed: (code, reason) => {
      friends.unheard();
      on.closed(code, reason);
    }
  });
  const send = link.send;
  const sender = createRoomSender({ outbox, send, ready: () => link.ready, write });
  const sendAway = createAwayTeller({ send, hidden });
  const handlers = createRoomHandlers({
    game,
    hud,
    friends,
    outbox,
    sign,
    here: room,
    invites,
    onAway,
    renderFriends,
    checkUpdate,
    clock: seconds
  });

  function receive(raw) {
    const d = parse(raw, WELCOME_BYTES);
    if (!d) return;
    if (d.t === 'welcome') return welcome(d);
    // Turned away at the door: why the link no longer works, said before the close.
    if (!link.letIn && d.t === 'invite') turnedAway(d.why);
    if (link.letIn) handlers.handle(d);
  }

  function welcome(raw) {
    const w = cleanWelcome(raw);
    if (!w) return on.broken();
    // Made another way than this game makes worlds (an update is rolling
    // out): the same seed would grow different land here than for everyone
    // else, so not until both sides match.
    if (w.fmt !== WORLD_FORMAT) return on.mismatched(w.fmt > WORLD_FORMAT);
    link.welcome();
    friends.welcome(w.you, w.c, w.players, w.graves);
    on.entered();
    const here = room();
    const renewed = checkMaking(here, w, read, write);
    if (game.state.shared === here && !renewed) resync(w);
    else {
      outbox.newWorld(); // edits for another world, or one made again
      if (!on.arrive(w, renewed)) return;
    }
    const s = game.state;
    if (s.shared === here) {
      // The room works out your progress from what you do too (src/core/acts.js).
      s.acts ||= [];
      // ...moves too, when it says so (src/core/actions.js moveExtractor).
      s.roomMoves = w.moves;
      s.roomCollectAt = w.collectAt;
      // Everyone else's crystal buildings, as the room has them.
      if (s.cultivation) s.theirs = w.theirs;
    }
    if (w.time !== null) clock = { t: w.time, at: seconds() };
    keepTime();
    sender.reset();
    if (hidden()) sendAway(); // the room takes everyone in as here
    on.welcomed();
  }

  // Back after a lost connection: the room's world wins, your progress stays,
  // and what you changed meanwhile is sent again (outbox.js resync).
  function resync(w) {
    resyncState(game.state, w, friends.me, outbox, playedTime(w.save));
    game.worldChanged();
  }

  // The world's time of day is the room's: everyone in it sees the same sun.
  // The room sends its clock on every welcome; between those it runs here.
  function keepTime() {
    const s = game.state;
    if (s.shared === room() && clock) s.time = clock.t + seconds() - clock.at;
  }

  return {
    link,
    send,
    sender,
    friends,
    outbox,
    handlers,
    sendAway,
    save: sender.save,
    // Out of the world: nothing kept of it here.
    reset() {
      clock = null;
      outbox.reset();
      link.hangUp();
      friends.clear();
    },
    // Each frame, in the world: the clock, friends, and what to send.
    // `you`: how you're shown ({facing, moving, sign, act}).
    tick(dt, you) {
      const s = game.state;
      if (!s.shared) return;
      keepTime();
      sender.trim(s);
      friends.tick(dt);
      if (!link.ready) return sender.offline(s, dt);
      if (!link.tick(dt)) return; // the room went silent: dropped, and trying again
      sender.tick(s, dt, you);
    }
  };
}
