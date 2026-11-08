/* The room's anti-cheat and moderation (room.js): watching each player's
 * steps, freezing and thawing characters, revoking links, tombstones.
 * Methods of Room, kept here by subject; `this` is the room. */

import { codeTag } from './audit.js';
import { newWatch, step, countCheat, CHEATS_TO_FREEZE } from './moves.js';
import * as Invites from './invites.js';

export const MAX_GRAVES = 300; // tombstones a world keeps (the oldest go first)

// What everyone is told of a character the moderator marked as a bot.
export const botMark = (pl) => (pl.bot ? { bot: true } : {});

export class RoomWatch {
  /* ------------------------------------------------------- anti-cheat */

  watchOf(id, now) {
    let w = this.watch.get(id);
    if (!w) this.watch.set(id, (w = newWatch(now)));
    return w;
  }

  // Whether player `pl` (id `id`) could step to `to` (moves.js step).
  canStep(id, pl, to, now) {
    return step(this.watchOf(id, now), pl.p, to, pl.at, now);
  }

  // A cheat by player `id` (moves.js countCheat): enough of them freeze the
  // character. `why` ('speed' or 'reach') and `detail` go in the audit log.
  cheat(id, now, why, detail = {}) {
    const w = this.watchOf(id, now);
    if (countCheat(w, now)) this.audit(now, id, 'cheat', { why, n: w.cheats, ...detail });
    if (w.cheats >= CHEATS_TO_FREEZE && this.players.has(id) && !this.players.get(id).frozen)
      return this.freeze(id, now, 'anti-cheat: ' + why, 'auto');
    return {}; // refused quietly: a socket isn't cut for it (see Bucket strikes)
  }

  // An invite link from Watch, through the moderator's route (0.194.0): how
  // anyone, Watch included, first gets into a world Watch made (a crystal
  // room, say) without holding its creator's key. Made by 'mod', like any
  // other link otherwise. {code, until} or {error}.
  inviteAny(ask, now) {
    if (this.copy) return { error: 'copy' }; // nobody else comes into a copy
    const { code, made, full } = Invites.linkFor(this.invites, 'mod', ask, now);
    if (full) return { error: 'full' };
    if (made) {
      this.dirty.meta = true;
      this.audit(now, null, 'invite', {
        code: codeTag(code),
        uses: ask.uses,
        life: ask.life,
        by: 'mod'
      });
    }
    return { code, until: this.invites.get(code).until };
  }

  // Watch stops any invite link, through the moderator's route. The room's
  // audit log says who decided. Error string or null.
  revokeAny(code, now) {
    const inv = typeof code === 'string' ? this.invites.get(code) : undefined;
    if (!inv) return 'link';
    if (!inv.off) {
      inv.off = true;
      this.dirty.meta = true;
      this.audit(now, null, 'revoke', { code: codeTag(code), by: 'mod' });
    }
    return null;
  }

  // Freezes a character: the moderator's call for progress that was clearly
  // hacked, or the anti-cheat's after CHEATS_TO_FREEZE cheats (`by` 'mod' or
  // 'auto'). The character stays in the world, asleep where it was, with
  // everything it has and built, but its key can't play it again: every try
  // shows the game's joke "FBI" notice. The links they made stop; nobody
  // else is touched. Thawing undoes all of it, so nothing is ever lost.
  // Returns {kick, frozen, toAll}, or {error}.
  freeze(id, now, why, by = 'mod') {
    const pl = this.players.get(id);
    if (!pl) return { error: 'player' };
    if (pl.frozen) return { error: 'frozen' };
    this.sample(id, now, true);
    this.audit(now, id, 'freeze', { by, why: String(why || '').slice(0, 200) });
    this.bury(id, pl, 'ice');
    pl.frozen = now;
    pl.st = 'offline';
    pl.lostAt = 0;
    this.dirty.players.add(id);
    this.acts.delete(id);
    this.shadow?.forget(id);
    this.watch.delete(id);
    for (const inv of this.invites.values()) if (inv.by === id) inv.off = true;
    this.dirty.meta = true;
    // Friends see a tombstone where the character slept ('frozen': its
    // buildings stay, unlike 'removed').
    const toAll = [{ t: 'frozen', id }, this.gravesMsg()];
    return { kick: id, frozen: true, toAll };
  }

  // Undoes a freeze: the player may come back to that character, asleep
  // again where the tombstone was. Returns {toAll} or {error}.
  thaw(id, now) {
    const pl = this.players.get(id);
    if (!pl) return { error: 'player' };
    if (!pl.frozen) return { error: 'not frozen' };
    delete pl.frozen;
    this.dirty.players.add(id);
    this.graves = this.graves.filter((g) => g[0] !== id);
    this.dirty.meta = true;
    this.audit(now, id, 'thaw', {});
    return { toAll: [this.gravesMsg(), this.statusOf(id)] };
  }

  // A tombstone for player `id` where they last stood (none if they never
  // stood anywhere), replacing one they already had.
  bury(id, pl, kind) {
    this.graves = this.graves.filter((g) => g[0] !== id);
    if (pl.p) this.graves.push([id, pl.c, pl.p.x, pl.p.y, pl.p.z, kind]);
    if (this.graves.length > MAX_GRAVES) this.graves.shift();
    this.dirty.meta = true;
  }

  // The moderator marks a character as one of the room's company bots (or
  // takes the mark off, 0.206.0): everyone's game tags it 'bot', so the tag
  // comes from the room and nobody can claim it. Returns {toAll} or {error}.
  markBot(id, bot, now) {
    const pl = this.players.get(id);
    if (!pl) return { error: 'player' };
    if (bot) pl.bot = true;
    else delete pl.bot;
    this.dirty.players.add(id);
    this.audit(now, id, 'bot', { bot: !!bot });
    return { toAll: [this.statusOf(id)] };
  }

  gravesMsg() {
    return { t: 'graves', g: this.graves };
  }
}
