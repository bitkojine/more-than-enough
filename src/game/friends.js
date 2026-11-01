/* The other players in the shared world you're in, as this game knows them:
 * where each one is and is shown, how they're doing (online, away,
 * connection lost, offline), their colour and their name, and the
 * tombstones of frozen characters. together.js feeds it what the room says;
 * the renderer, the friend chips and the Players screen read it.
 *
 * No DOM and no network: `clock` (seconds) and `actor` (render/motion.js
 * createActor) are passed in, so it runs under Node as it does in the page.
 * Every message it takes has been checked already (src/net/protocol.js). */

import { nameNumbers, nameWord } from '../net/naming.js';
import { t } from '../i18n/i18n.js';

export const QUIET_IS_LOST = 6; // seconds without a word: shown as lost
export const JUMP_OVER = 6; // tiles: farther than this a friend jumps instead of gliding
const GLIDE_RATE = 12; // how fast a shown friend catches up with where they are

// Friends' colours, by the colour number the room gives them.
const FRIEND_COLORS = [
  '#7fd07a',
  '#ffb347',
  '#6fb7ff',
  '#ff7aa8',
  '#c9a6ff',
  '#ffe066',
  '#5fe0d0',
  '#ff8a65'
];
// A player's colour, from their place in the world (it comes round again
// after eight: the name tells players apart).
export const friendColor = (c) => FRIEND_COLORS[c % FRIEND_COLORS.length];

// What a friend's chip and the Players screen say about them: online but
// unheard for a while reads as a lost connection.
export const stateOf = (f) => (f.st === 'online' && f.quiet ? 'lost' : f.st);

const RANK = { online: 0, lost: 1, away: 2, offline: 3 };

/**
 * Moves what's shown of a friend toward where they are: a glide, or a jump
 * when they're far or on another layer. Returns the new shown position.
 */
export function glide(shown, p, dt) {
  if (!shown || shown.z !== p.z || Math.hypot(p.x - shown.x, p.y - shown.y) > JUMP_OVER)
    return { ...p };
  const k = Math.min(1, dt * GLIDE_RATE);
  shown.x += (p.x - shown.x) * k;
  shown.y += (p.y - shown.y) * k;
  shown.fx = p.fx;
  shown.m = p.m;
  shown.sign = p.sign;
  shown.gear = p.gear;
  return shown;
}

export function createFriends({ clock, actor, limit = Infinity }) {
  const friends = new Map(); // id -> {c, st, p, shown, heard, since, quiet, actor}
  let me = null,
    myColor = 0;
  let graves = []; // tombstones of banned and frozen characters (room-messages.js cleanGraves)
  let roster = null; // id -> name number, or null when it needs working out

  const fresh = (fields) => ({
    p: null,
    shown: null,
    heard: clock(),
    since: 0,
    quiet: false,
    ...fields,
    actor: actor()
  });

  // Everyone's name in this room, by id (src/net/naming.js), shown in the
  // game's language. Worked out once per change of who's in the world.
  function nameOf(id) {
    if (!roster) {
      const players = [...friends.entries()].map(([pid, f]) => [pid, f.c]);
      if (me) players.push([me, myColor]);
      // A tombstone keeps its character's name, so nobody else gets it.
      for (const g of graves) if (g.id !== me && !friends.has(g.id)) players.push([g.id, g.c]);
      roster = nameNumbers(players);
    }
    const k = roster.get(id);
    if (k === undefined) return '';
    const { key, n } = nameWord(k);
    return n ? t(key) + ' ' + n : t(key);
  }

  return {
    get me() {
      return me;
    },
    get myColor() {
      return myColor;
    },
    get size() {
      return friends.size;
    },
    has: (id) => friends.has(id),
    get: (id) => friends.get(id),
    colorOf: (id) => (id === me ? myColor : friends.get(id)?.c),
    nameOf,

    // The room let you in: you, everyone it has, and the tombstones.
    welcome(you, color, players, tombs) {
      me = you;
      myColor = color;
      friends.clear();
      for (const [id, p] of players) friends.set(id, fresh(p));
      graves = tombs;
      roster = null;
    },

    // Out of the shared world: nobody.
    clear() {
      me = null;
      friends.clear();
      graves = [];
      roster = null;
    },

    // The connection dropped: everyone counts as unheard until it's back.
    unheard() {
      for (const f of friends.values()) f.heard = -Infinity;
    },

    // Where a friend is now (a 'pos'). False for someone the room never
    // said was here.
    moved(id, p) {
      const f = friends.get(id);
      if (!f) return false;
      if (f.st !== 'online') {
        f.st = 'online';
        f.since = 0;
      }
      f.p = p;
      f.actor.heard(p.a, p.n);
      f.heard = clock();
      return true;
    },

    // How a player is doing (a 'status'). Says whether they're new here and
    // whether they've just come online; null when it was dropped (yourself,
    // or a full world).
    status(id, st, c, p = null) {
      if (id === me) return null;
      let f = friends.get(id);
      const isNew = !f;
      const arrived = st === 'online' && (!f || f.st !== 'online');
      if (!f) {
        if (friends.size >= limit) return null;
        f = fresh({ c, st, heard: 0 });
        friends.set(id, f);
        roster = null;
      }
      if (f.c !== c) roster = null;
      f.since = arrived ? 0 : f.since;
      f.c = c;
      f.st = st;
      if (p) f.p = p;
      f.heard = clock();
      return { isNew, arrived };
    },

    // Gone from the world (removed, or frozen and now a tombstone). Says
    // whether they were here. A frozen one keeps the names as they are
    // (`rename` false) until its tombstone comes, so nobody else's changes.
    drop(id, rename = true) {
      if (id === me || !friends.delete(id)) return false;
      if (rename) roster = null;
      return true;
    },

    setGraves(list) {
      graves = list;
      roster = null;
    },

    // Each frame: who has gone quiet, how long each has been as they are,
    // and where they're shown.
    tick(dt) {
      const now = clock();
      for (const f of friends.values()) {
        f.quiet = f.st === 'online' && now - f.heard > QUIET_IS_LOST;
        f.since += dt;
        if (f.p) f.shown = glide(f.shown, f.p, dt);
      }
    },

    // A chip per friend: those awake first, then by colour.
    chips() {
      const awake = (f) => (f.st === 'offline' ? 1 : 0);
      return [...friends.entries()]
        .sort(([, a], [, b]) => awake(a) - awake(b) || a.c - b.c)
        .map(([id, f]) => ({ id, name: nameOf(id), st: stateOf(f), color: friendColor(f.c) }));
    },

    // The Players screen: you first, then by how they're doing and how far
    // they are from `at`.
    rows(at) {
      const rows = [];
      if (me)
        rows.push({
          id: me,
          name: nameOf(me),
          color: friendColor(myColor),
          st: 'online',
          you: true,
          far: null,
          dz: 0
        });
      for (const [id, f] of friends) {
        const p = f.shown || f.p;
        rows.push({
          id,
          name: nameOf(id),
          color: friendColor(f.c),
          st: stateOf(f),
          you: false,
          far: p ? Math.hypot(p.x - at.x, p.y - at.y) : null,
          dz: p ? p.z - at.z : 0
        });
      }
      return rows.sort(
        (a, b) =>
          b.you - a.you || RANK[a.st] - RANK[b.st] || (a.far ?? Infinity) - (b.far ?? Infinity)
      );
    },

    // Friends as the renderer draws them (where they're shown, not where the
    // last message said), with how long they've been in their state.
    view() {
      const out = [];
      for (const [id, f] of friends) {
        if (f.shown)
          out.push({
            id,
            c: f.c,
            color: friendColor(f.c),
            name: nameOf(id),
            st: stateOf(f),
            since: f.since,
            ...f.shown,
            actor: f.actor.view(f.shown.m, f.shown)
          });
      }
      return out;
    },

    // The tombstones, as the renderer draws them.
    graves() {
      return graves.map((g) => ({
        x: g.x,
        y: g.y,
        z: g.z,
        k: g.k,
        color: friendColor(g.c),
        name: nameOf(g.id)
      }));
    }
  };
}
