/* One company bot (bot plan phase 3): a player of a shared crystal world
 * that is the game itself without the page. It goes in through the game's
 * own room session (src/game/room-session.js), so it says exactly what a
 * game says, and plays with the game's own AUTO (src/game/autoplay-session.js,
 * the crystal brain), so every act goes through the same rules and the
 * room's checks as a person's. Watch chose this over a browser, 2026-11-08.
 *
 * No clock and no network of its own: `open(url)` makes the socket,
 * `seconds()` is the time, `timers` waits, and `frame(dt)` plays dt seconds,
 * so a test can run it against a room in the same process (test/unit/
 * bots.test.js) and run.mjs against the live room service. */

import { createRoomSession } from '../../src/game/room-session.js';
import { createAutoplaySession } from '../../src/game/autoplay-session.js';
import { arrivalState } from '../../src/game/arrival.js';
import { socketUrl } from '../../src/game/room-link.js';
import { TICK_HZ } from '../../src/engine/clock.js';
import { createLines } from './lines.mjs';

// An actor that keeps nothing: a bot draws nobody.
const actor = () => ({ heard() {}, view: () => ({ kind: null }) });
const quiet = () => {};

export function createBot({
  service,
  room,
  key,
  code = null,
  open,
  seconds,
  timers,
  log = quiet,
  wait = 0
}) {
  const kept = new Map(); // what the game would keep in the page's storage
  let auto = null; // AUTO, on the world the bot is in
  let invite = code; // the link it came in by, used once
  let ticks = 0; // play owed to the rules, in 1/TICK_HZ s
  // Seconds in the world before AUTO starts, so bots that came in together
  // don't walk to the same tile at the same moment: the room takes the first
  // and refuses the rest, who hadn't heard of it yet.
  let idle = wait;
  let closedWhy = null;
  const toasts = [];
  const lines = createLines(); // what it says (lines.mjs)
  const said = [];
  const game = {
    state: { shared: null },
    replace(state) {
      game.state = state;
      auto = createAutoplaySession(0, quiet, { state });
      auto.press(); // AUTO held down, as a person's held key
      lines.start(state);
    },
    worldChanged: quiet,
    changedMode: quiet,
    arrived: quiet,
    moveTo: (p) => Object.assign(game.state.player, p),
    facing: () => auto?.facing ?? 1,
    moving: () => !!auto?.walking,
    act: () => null
  };
  const session = createRoomSession({
    game,
    hud: { toast: (text) => toasts.push(text) },
    read: (k) => kept.get(k) ?? null,
    write: (k, v) => (v ? kept.set(k, v) : kept.delete(k)),
    room: () => room,
    hello: () => ({ key, ...(invite ? { code: invite } : {}) }),
    seconds,
    open,
    timers,
    actor,
    on: {
      closed(c, why) {
        closedWhy = { code: c, why };
        log('closed ' + c + ' ' + (why || ''));
        // Lost: back as soon as it can, as a game does. Turned away: done.
        if (c !== 1008 && c !== 4005 && c < 4001) session.link.retryLater(connect);
      },
      broken: () => log('the welcome did not fit'),
      mismatched: (old) => log(old ? 'a newer game is out' : 'the room is updating'),
      entered() {
        invite = null;
      },
      arrive(w, renewed) {
        const made = arrivalState(room, w, renewed, (k) => kept.get(k) ?? null);
        if (!made || !made.state.cultivation) {
          log(made ? 'not a crystal world' : 'could not open the world');
          return false;
        }
        game.replace(made.state);
        log('in, at ' + JSON.stringify(made.state.player));
        return true;
      },
      welcomed: quiet
    }
  });

  function connect() {
    closedWhy = null;
    session.link.connect(socketUrl(service, room));
  }

  return {
    connect,
    session,
    get game() {
      return game;
    },
    get closed() {
      return closedWhy;
    },
    get inWorld() {
      return game.state.shared === room && session.link.ready;
    },
    toasts,
    said, // the lines it said, in order
    // Plays `dt` seconds: AUTO and the rules, then what the room is told.
    // A crystal world plays only while the room hears it (Watch, 2026-11-05).
    frame(dt) {
      if (auto && session.link.ready && (idle -= dt) < 0) {
        idle = 0;
        ticks += dt * TICK_HZ;
        const n = Math.floor(ticks);
        ticks -= n;
        if (n) auto.advanceTicks(n);
      }
      session.tick(dt, { facing: game.facing(), moving: game.moving(), sign: false, act: null });
      if (!auto || !session.link.ready) return;
      const k = lines.seen(game.state, session.friends.rows(game.state.player), seconds());
      if (!k) return;
      session.send({ t: 'say', k });
      said.push(k);
      log('says ' + k);
    },
    // Leaves, saying goodbye: it sleeps where it stands.
    leave() {
      if (game.state.shared) session.save(game.state, true);
      session.link.hangUp();
    }
  };
}
