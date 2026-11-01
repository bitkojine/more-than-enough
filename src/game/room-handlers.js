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
  ID_RE
} from '../net/protocol.js';
import { cleanGraves, cleanAway } from './room-messages.js';
import { undoneText } from './together-rules.js';
import { t } from '../i18n/i18n.js';

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
      const said = friends.status(d.id, st, c, d.p ? cleanPos(d.p) : null);
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
