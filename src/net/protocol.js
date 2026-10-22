/* The multiplayer wire format, shared by the game and the room service
 * (server/). Everything that crosses the network is checked here on arrival,
 * on both ends: a message that doesn't fit exactly is dropped, never patched
 * up. No imports, so the room service can bundle it as is.
 *
 * Messages are small JSON objects with a type `t`:
 *   game -> room   hello {key, away}       proves who you are (once, first);
 *                                          `away` is the player's own choice
 *                                          for time away (freeze season: only
 *                                          true counts; a game from before
 *                                          the setting sends no field, and
 *                                          the room keeps what it knows)
 *                  pos {p}                 where you are (and what you play on), several times a second
 *                  edits {e: [...]}        what you changed in the world
 *                  save {s}                your own progress in this world
 *                  away {a}                game hidden (true) or back (false)
 *                  awayProduce {a}         changed your time-away choice (Settings)
 *                  invite {uses, life}     hold up the sign: your invite link, please, letting in
 *                                          at most `uses` people for `life` minutes (INVITE_USES, INVITE_LIVES)
 *                  invites                 the invite links you may see (the ones you made)
 *                  revoke {code}           stop an invite link (the ones you made; Watch stops any, admin route)
 *                  nuke                    (old games only) ignored: there is no nuke any more
 *   room -> game   welcome {...}           the world, its clock and everyone in it
 *                  pos {id, p}             a friend moved (several times a second when near
 *                                          you, every couple of seconds when far)
 *                  edits {id, e: [...]}    the world changed (yours echoed too)
 *                  status {id, st, c, p?}  a friend's state changed (c: their place, 0, 1, 2…)
 *                  place {p}               you're somewhere else than your game thinks (back from another
 *                                          device, or after playing offline): go there
 *                  invite {code, until}    the link for your sign
 *                  invites {list}          [code, by, made, until, uses, stopped, max] newest first
 *                  removed {id}            a player was taken out of the world
 *                  full / bad              why the room is closing on you
 * Every world is kept: nothing resets one (no nuke since 2026-10-18; the
 * welcome's `nuke` is always null, and the room never sends 'nuke' or closes
 * with 4004 'renewed' any more).
 *
 * The game (GitHub Pages) and the room service (Cloudflare) deploy on their
 * own, so for a while either can be a version ahead: new fields go at the
 * end of a message or list entry, and each side tolerates them missing.
 */

export const LIMITS = Object.freeze({
  players: 100,          // in one room, ever
  messageBytes: 16384,   // any message after hello
  createBytes: 1048576,  // a whole world, when a room is made
  saveBytes: 65536,      // one player's progress
  editsPerMessage: 64,
  actsPerMessage: 256,    // things a player did, in one 'acts' message (see src/core/acts.js)
  mods: 1000000,         // richness edits in one world (nothing grows back: they're kept)
  props: 20000,
  extractors: 4000,
  ratePerSecond: 30,     // messages from one connection, on average
  rateBurst: 60,
  editsPerSecond: 60,    // world edits from one player, on average
  editsBurst: 400,       // (a Trail sweep makes many at once)
  editReach: 24,         // tiles from where you stand that you can change
  invitesPerDay: 5       // people a player may bring in through their links in a day
});

// What an invite link may be, like Discord's: how many people it lets in
// (never unlimited) and for how many minutes it works. The player picks
// them in Invite links; the defaults are a few people for a day.
export const INVITE_USES = Object.freeze([1, 2, 3, 5, 10, 25]);
export const INVITE_LIVES = Object.freeze([30, 60, 360, 1440, 10080]); // up to a week, like Discord; five fit a small phone
export const INVITE_DEFAULT = Object.freeze({ uses: 3, life: 10080 });

// An invite request's uses and life, each one of the allowed values, or the
// default for anything else.
export function cleanInviteAsk(d) {
  return {
    uses: INVITE_USES.includes(d?.uses) ? d.uses : INVITE_DEFAULT.uses,
    life: INVITE_LIVES.includes(d?.life) ? d.life : INVITE_DEFAULT.life
  };
}

export const STATUS = Object.freeze(['online', 'away', 'lost', 'offline']);
// What a player is playing on, shown as what their character holds.
export const DEVICES = Object.freeze(['phone', 'laptop']);
// What a player can be seen doing (src/game/render/motion.js animates them).
export const ACTS = Object.freeze(['swing', 'pick', 'collect', 'build', 'cheer', 'down', 'up']);
export const ACT_COUNT = 1000;  // acts are counted round this, so a new one shows
// Is the connection still there? A game sends PING (plain text, not JSON)
// and the room answers PONG without even waking up. A connection can die
// without closing (a phone changing networks): only silence tells.
export const PING = 'ping';
export const PONG = 'pong';

// A room id is 16 random bytes in base64url: unguessable, so the link is the key.
export const ROOM_ID_RE = /^[A-Za-z0-9_-]{22}$/;
// A player's secret: 32 random bytes in hex. Never shown, never in a URL.
export const KEY_RE = /^[0-9a-f]{64}$/;
// A player's public id in a room (derived from the secret by the room).
export const ID_RE = /^[0-9a-f]{16}$/;
// Content names (buildings, props): the game checks them against its own tables.
const NAME_RE = /^[a-z][a-zA-Z0-9]{0,23}$/;

const XY_MAX = 2 ** 20 - 1;   // see src/core/coords.js packKey
const Z_MIN = -512, Z_MAX = 0;
const KEY_MAX = 2 ** 52;

const isInt = (v) => Number.isSafeInteger(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const inXY = (v) => isNum(v) && Math.abs(v) <= XY_MAX;
const inZ = (v) => isInt(v) && v >= Z_MIN && v <= Z_MAX;
const isKey = (v) => isInt(v) && v >= 0 && v < KEY_MAX;
const round = (v, d) => Math.round(v * d) / d;

// Bytes in a string as UTF-8, without allocating it.
export function byteLength(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3;
  }
  return n;
}

// A JSON object from a message, or null if it's too big, not JSON, or not an
// object with a string type.
export function parse(raw, maxBytes = LIMITS.messageBytes) {
  if (typeof raw !== 'string' || raw.length > maxBytes || byteLength(raw) > maxBytes) return null;
  let d;
  try { d = JSON.parse(raw); } catch { return null; }
  return isObj(d) && typeof d.t === 'string' ? d : null;
}

/* ------------------------------------------------------------- pieces */

// A position: where, which way facing, walking or not, holding up the sign,
// what they play on (null if unknown), optional basket/pick ownership bits,
// and their latest act with its count. Missing gear means a legacy client.
export function cleanPos(p) {
  if (!isObj(p) || !inXY(p.x) || !inXY(p.y) || !inZ(p.z)) return null;
  const f = (v) => (isNum(v) ? Math.max(-1, Math.min(1, round(v, 100))) : 0);
  return { x: round(p.x, 1000), y: round(p.y, 1000), z: p.z, fx: f(p.fx), fy: f(p.fy), m: p.m === true, sign: p.sign === true,
    dev: DEVICES.includes(p.dev) ? p.dev : null,
    ...(isInt(p.gear) && p.gear >= 0 && p.gear <= 3 ? { gear: p.gear } : {}),
    a: ACTS.includes(p.a) ? p.a : null, n: isInt(p.n) && p.n >= 0 && p.n < ACT_COUNT ? p.n : 0 };
}

// One world edit, or null:
//   ['m', key, richness]        a tile's richness changed
//   ['p', key, kind]            a prop placed
//   ['x', kind, x, y, z, owner] a building placed (owner set by the room)
export function cleanEdit(e) {
  if (!Array.isArray(e)) return null;
  if (e[0] === 'm' && e.length === 3 && isKey(e[1]) && isInt(e[2]) && e[2] >= 0 && e[2] <= 255) return ['m', e[1], e[2]];
  if (e[0] === 'p' && e.length === 3 && isKey(e[1]) && typeof e[2] === 'string' && NAME_RE.test(e[2])) return ['p', e[1], e[2]];
  if (e[0] === 'x' && (e.length === 5 || e.length === 6) && typeof e[1] === 'string' && NAME_RE.test(e[1]) &&
      isInt(e[2]) && Math.abs(e[2]) <= XY_MAX && isInt(e[3]) && Math.abs(e[3]) <= XY_MAX && inZ(e[4]) &&
      (e.length === 5 || (typeof e[5] === 'string' && ID_RE.test(e[5])))) {
    return e.slice(0, 6);
  }
  return null;
}

// What a player did (src/core/acts.js), or null: the kind, their play time
// in ms, where they stood, and the kind's own fields. Names are checked
// against the game's tables where it's done (src/core/replay.js).
const UPGRADE_RE = /^[a-z][a-zA-Z0-9]{0,23}$/;
export function cleanAct(a) {
  if (!Array.isArray(a) || !isInt(a[1]) || a[1] < 0 || !inXY(a[2]) || !inXY(a[3]) || !inZ(a[4])) return null;
  const head = [a[0], a[1], round(a[2], 1000), round(a[3], 1000), a[4]];
  const tile = (v) => isInt(v) && Math.abs(v) <= XY_MAX;
  if (a[0] === 'h' && a.length === 7 && tile(a[5]) && tile(a[6])) return [...head, a[5], a[6]];
  if ((a[0] === 'c' || a[0] === 'w') && a.length === 5) return head;
  if (a[0] === 'b' && a.length === 8 && typeof a[5] === 'string' && NAME_RE.test(a[5]) && tile(a[6]) && tile(a[7])) return [...head, a[5], a[6], a[7]];
  if (a[0] === 'p' && a.length === 6 && typeof a[5] === 'string' && NAME_RE.test(a[5])) return [...head, a[5]];
  if (a[0] === 'u' && a.length === 6 && typeof a[5] === 'string' && UPGRADE_RE.test(a[5])) return [...head, a[5]];
  return null;
}

export function cleanActs(list) {
  if (!Array.isArray(list) || list.length > LIMITS.actsPerMessage) return null;
  const out = [];
  for (const a of list) {
    const c = cleanAct(a);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

export function cleanEdits(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > LIMITS.editsPerMessage) return null;
  const out = [];
  for (const e of list) {
    const c = cleanEdit(e);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

// A whole shared world as sent when a room is made, or null. Buildings keep
// the owner the room gives them.
export function cleanWorld(w) {
  if (!isObj(w) || !isInt(w.seed) || w.seed < 1 || w.seed > 0xffffffff) return null;
  const mods = Array.isArray(w.mods) ? w.mods : [];
  const props = Array.isArray(w.props) ? w.props : [];
  const ext = Array.isArray(w.ext) ? w.ext : [];
  if (mods.length > LIMITS.mods || props.length > LIMITS.props || ext.length > LIMITS.extractors) return null;
  const out = { seed: w.seed, mods: [], props: [], ext: [] };
  for (const m of mods) {
    const c = Array.isArray(m) && cleanEdit(['m', m[0], m[1]]);
    if (!c) return null;
    out.mods.push([c[1], c[2]]);
  }
  for (const p of props) {
    const c = Array.isArray(p) && cleanEdit(['p', p[0], p[1]]);
    if (!c) return null;
    out.props.push([c[1], c[2]]);
  }
  for (const x of ext) {
    const c = Array.isArray(x) && cleanEdit(['x', ...x]);
    if (!c) return null;
    out.ext.push(c.slice(1));
  }
  return out;
}

// A player's progress: an opaque JSON object, small enough to keep. The game
// reads it back through its own save checks (src/core/save.js).
export function cleanSave(s) {
  if (typeof s !== 'string' || s.length > LIMITS.saveBytes || byteLength(s) > LIMITS.saveBytes) return null;
  try { return isObj(JSON.parse(s)) ? s : null; } catch { return null; }
}

// The world's clock: seconds of game time since its first dawn. One clock per
// The world's clock, kept by the room, so day and night are the same for everyone.
const TIME_MAX = 1e10;
export function cleanTime(v) {
  return isNum(v) && v >= 0 && v <= TIME_MAX ? round(v, 1000) : null;
}

// Whether a parsed message can make a room: the key, the world and the time,
// exactly what a room's create requires. The worker runs it on the raw body
// before any creation quota is charged or any room is touched, so flooding
// junk bodies costs nobody's quota and never reaches a room (server/src/worker.js).
export function cleanCreate(d) {
  if (!isObj(d) || d.t !== 'create' || typeof d.key !== 'string' || !KEY_RE.test(d.key)) return null;
  const world = cleanWorld(d.world);
  if (!world) return null;
  const time = d.time === undefined ? 0 : cleanTime(d.time);
  return time === null ? null : { key: d.key, world, time };
}

export function cleanStatus(st) {
  return STATUS.includes(st) ? st : null;
}

// A player's place in their world (0, 1, 2…, one each, given by the room in
// the order they joined): the game picks their colour and name from it.
export function cleanColor(c) {
  return isInt(c) && c >= 0 && c < LIMITS.players ? c : null;
}

// A tile key's (x, y, z), as src/core/coords.js packs them.
export function unpackKey(key) {
  const SPAN = 2 ** 21, OFF = 2 ** 20;
  const y = (key % SPAN) - OFF;
  const rest = Math.floor(key / SPAN);
  return { x: (rest % SPAN) - OFF, y, z: Math.floor(rest / SPAN) - 512 };
}

// Whether a checked edit is near enough to where its player stands: you
// change the world around you, never across the map or on another layer.
export function editInReach(e, p) {
  if (!p) return false;
  const t = e[0] === 'x' ? { x: e[2], y: e[3], z: e[4] } : unpackKey(e[1]);
  return t.z === p.z && Math.abs(t.x + 0.5 - p.x) <= LIMITS.editReach && Math.abs(t.y + 0.5 - p.y) <= LIMITS.editReach;
}

/* ------------------------------------------------------------ helpers */

// Hex of SHA-256 (Web Crypto: the browser, Node and Cloudflare all have it).
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A player's public id in one room: not the secret, and different in every
// room, so ids can't be followed from room to room.
export async function playerId(roomId, key) {
  return (await sha256Hex('mte-player|' + roomId + '|' + key)).slice(0, 16);
}

export function randomHex(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomRoomId() {
  const a = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
