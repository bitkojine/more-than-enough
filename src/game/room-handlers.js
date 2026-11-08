/* What the game does with each message the room sends once it has let you
 * in (together.js receives them; the welcome is its own). Every message has
 * been parsed already; each handler checks the parts it uses
 * (src/net/protocol.js) before anything touches the game.
 *
 * The game is reached only through `ctx`, so tests drive each handler with
 * stand-ins:
 *   game, hud, friends (friends.js), outbox (outbox.js), sign (invite-sign.js)
 *   here()            the shared world this connection is for
 *   invites()         the Invite links panel (invite-list.js)
 *   onAway(secs, made, fixed)  says what your buildings made while away
 *   renderFriends()   the chips, after a friend changed
 *   checkUpdate()     a friend just came online, likely on a newer game
 *   clock()           seconds, for spacing out notes */

import * as Core from '../core/index.js';
import {
  cleanPos,
  cleanEdits,
  cleanSave,
  cleanStatus,
  cleanColor,
  ROOM_ID_RE,
  ID_RE,
  BOT_LINES
} from '../net/protocol.js';
import { cleanGraves, cleanAway } from './room-messages.js';
import { undoneText } from './together-rules.js';
import { t } from '../i18n/i18n.js';

// What the log says of a shared crystal job: `side` 'took' (someone did it
// at yours), 'got' (you did it at theirs), 'not' (it couldn't be done).
export const HEAR_BOT = 24; // m: a company bot this close, on your layer, is heard

const sharedText = (side, req, got, name) =>
  t(`shared.${side}.${req.type}`, { name, n: Math.floor(got.n) });

// What the room passes on from its company bots.
function botHandlers({ game, hud, friends, here }) {
  return {
    // A company bot said one of its lines (0.210.0): into the message log,
    // if it is near you.
    said(d) {
      if (!BOT_LINES.includes(d.k) || game.state.shared !== here()) return;
      const at = game.state.player;
      const row = friends.rows(at).find((r) => r.id === d.id);
      if (!row?.bot || row.far === null || row.far > HEAR_BOT || row.dz !== 0) return;
      hud.toast(t('bots.say', { name: row.name, line: t('bots.say.' + d.k) }));
    }
  };
}

// Jobs at someone else's crystal (src/core/cultivation-share.js, 0.200.0).
function jobHandlers({ game, hud, friends, here, clock }) {
  let litSaid = -Infinity; // when the log last said someone's light cracked what you carry
  return {
    // Someone else's lantern or flare shone on what you carry ('lit', 0.202.0).
    lit(d) {
      const light = Core.cleanLit(d);
      if (!light || !Number.isSafeInteger(d.n) || !ID_RE.test(d.by)) return;
      const s = game.state;
      if (s.shared !== here() || !s.cultivation) return;
      const was = s.cultivation.quality;
      Core.takeLight(s, d.n, light.src, light.secs);
      game.worldChanged();
      if (s.cultivation.quality >= was || clock() - litSaid < UNDONE_QUIET) return;
      litSaid = clock();
      hud.toast(t('shared.lit', { name: friends.nameOf(d.by) }));
    },
    // Someone asked for a job at your crystal ('take', 0.200.0): done to
    // your building as it is, and said in the log.
    take(d) {
      const req = Core.cleanJob(d);
      if (!req || !Number.isSafeInteger(d.n) || !ID_RE.test(d.by)) return;
      if (game.state.shared !== here() || !game.state.cultivation) return;
      const got = Core.takeShared(game.state, d.n, req);
      game.worldChanged();
      if (got.ok) hud.toast(sharedText('took', req, got, friends.nameOf(d.by)));
    },
    // What came of a job you asked at someone's crystal ('given').
    given(d) {
      const req = Core.cleanJob(d),
        got = Core.cleanGot(d);
      if (!req || !got || !Number.isSafeInteger(d.n) || !ID_RE.test(d.by)) return;
      if (game.state.shared !== here() || !game.state.cultivation) return;
      Core.receiveShared(game.state, d.n, req, got);
      game.worldChanged();
      hud.toast(sharedText(got.ok ? 'got' : 'not', req, got, friends.nameOf(d.by)));
    }
  };
}

export const UNDONE_SECONDS = 8; // how long the note that the room took something back stays up
export const UNDONE_QUIET = 20; // seconds after one such note before the next

export function createRoomHandlers({
  game,
  hud,
  friends,
  outbox,
  sign,
  here,
  invites,
  onAway,
  renderFriends,
  checkUpdate,
  clock
}) {
  let undoneAt = -Infinity; // when the player was last told the room took something back (seconds)
  let fixed = false; // arrived to smaller numbers than this phone showed: the away toast says so too

  // Whether the next away toast should also say your numbers were set straight (once).
  function takeFixed() {
    const was = fixed;
    fixed = false;
    return was;
  }

  // The room took back something your game showed (an 'econ' answer).
  // Calm: an honest game ends up here too, say after a weak connection or a
  // friend building on the same spot first.
  function sayUndone(lost, why) {
    const text = undoneText(lost, why);
    if (!text) return;
    const now = clock();
    if (now - undoneAt < UNDONE_QUIET) return;
    undoneAt = now;
    hud.toast(text, UNDONE_SECONDS);
  }

  // Each kind of message the room sends once it has let you in, by its `t`.
  const handlers = {
    // The room has dealt with every batch of edits up to this one.
    ack: (d) => outbox.acked(d.n),
    pos(d) {
      const p = cleanPos(d.p);
      if (ID_RE.test(d.id) && p) friends.moved(d.id, p);
    },
    // The room has you somewhere else than this game does: go there.
    // (Your game walked on while the room couldn't hear it, say offline.)
    place(d) {
      const p = cleanPos(d.p);
      if (!p) return;
      game.moveTo(p);
      hud.toast(t('together.toast.placed'), UNDONE_SECONDS);
    },
    // What you really have, as the room works it out, as of the progress
    // your game sent at play time `ms`: what you got since stays yours.
    econ(d) {
      if (game.state.shared !== here() || !Number.isSafeInteger(d.ms) || !cleanSave(d.s)) return;
      // Which progress it answers, by its number (several can go at the
      // same play time, say while the game is hidden).
      const at = outbox.answered(d.n);
      const was = Core.sentOf(game.state);
      if (Core.correctProgress(game.state, d.s, at || null)) game.worldChanged();
      const away = d.away && cleanAway(d.away);
      if (away)
        onAway(away.secs, away.made, takeFixed()); // already in what it sent
      else sayUndone(Core.takenBack(was, game.state), d.why);
    },
    // What your buildings made while you were away, as the room worked it
    // out (server/src/shadow.js away): into your packs, as the room has it.
    away(d) {
      const away = cleanAway(d);
      if (game.state.shared !== here() || !away) return;
      for (const r of Core.RESOURCES) {
        if (!(away.made[r] > 0)) continue;
        Core.earn(game.state, r, away.made[r], 'buildings');
      }
      outbox.earnedAway(away.made);
      onAway(away.secs, away.made, takeFixed());
    },
    // Someone's crystal buildings, as they stand now (a crystal room, 0.199.0).
    built(d) {
      const list = ID_RE.test(d.id) && Core.cleanBuilt(d.b, d.id);
      if (list && game.state.shared === here() && Core.setTheirs(game.state, d.id, list))
        game.worldChanged();
    },
    ...jobHandlers({ game, hud, friends, here, clock }),
    ...botHandlers({ game, hud, friends, here }),
    edits(d) {
      const list = cleanEdits(d.e);
      if (list && game.state.shared === here() && Core.applyEdits(game.state, list))
        game.worldChanged();
    },
    status(d) {
      if (!ID_RE.test(d.id)) return;
      const st = cleanStatus(d.st),
        c = cleanColor(d.c);
      if (st === null || c === null) return;
      const said = friends.status(d.id, st, c, d.p ? cleanPos(d.p) : null, d.bot === true);
      if (!said) return;
      if (said.isNew && st === 'online')
        hud.toast(t('together.toast.joined', { name: friends.nameOf(d.id) }));
      // They most likely just loaded the newest game: make sure this is it too.
      if (said.arrived) checkUpdate();
      renderFriends();
    },
    removed(d) {
      if (typeof d.id !== 'string' || !ID_RE.test(d.id) || d.id === friends.me) return; // the close that follows says so
      if (friends.drop(d.id)) renderFriends();
      // Their buildings go with them (the room has taken them down too).
      const s = game.state;
      const kept = s.extractors.filter((b) => b.owner !== d.id);
      if (kept.length !== s.extractors.length) {
        s.extractors = kept;
        game.worldChanged();
      }
    },
    // Frozen (its progress was hacked): no longer asleep here, a tombstone
    // instead (the 'graves' that follows); its buildings stay.
    frozen(d) {
      if (typeof d.id !== 'string' || !ID_RE.test(d.id)) return;
      if (friends.drop(d.id, false)) renderFriends();
    },
    graves: (d) => friends.setGraves(cleanGraves(d.g)),
    invite(d) {
      if (typeof d.code !== 'string' || !ROOM_ID_RE.test(d.code) || !Number.isSafeInteger(d.until))
        return;
      sign.show(d.code, d.until);
    },
    invitesFull: () => hud.toast(t('invites.full')),
    invites: (d) => invites().received(d.list)
  };

  return {
    // Handles message `d`; says whether it was a kind this game knows.
    handle(d) {
      if (!Object.hasOwn(handlers, d.t)) return false;
      handlers[d.t](d);
      return true;
    },
    // Arrived to smaller numbers than this phone showed: the next away note
    // says so too.
    set fixed(on) {
      fixed = on;
    }
  };
}
