/* The multiplayer wire format, shared by the game and the room service
 * (server/). Everything that crosses the network is checked here on arrival,
 * on both ends: a message that doesn't fit exactly is dropped, never patched
 * up. No imports, so the room service can bundle it as is.
 *
 * Messages are small JSON objects with a type `t`:
 *   game -> room   hello {key}             proves who you are (once, first)
 *                  pos {p}                 where you are, several times a second
 *                  edits {e: [...]}        what you changed in the world
 *                  save {s}                your own progress in this world
 *                  away {a}                game hidden (true) or back (false)
 *   room -> game   welcome {...}           the world and everyone in it
 *                  pos {id, p}             a friend moved
 *                  edits {id, e: [...]}    the world changed (yours echoed too)
 *                  status {id, st, c, p?}  a friend's state changed
 *                  full / bad              why the room is closing on you
 */

export const LIMITS = Object.freeze({
  players: 4,            // in one room, ever (built for 4, tested with 2)
  messageBytes: 16384,   // any message after hello
  createBytes: 1048576,  // a whole world, when a room is made
  saveBytes: 65536,      // one player's progress
  editsPerMessage: 64,
  mods: 100000,          // richness edits in one world
  props: 20000,
  extractors: 4000,
  ratePerSecond: 30,     // messages from one connection, on average
  rateBurst: 60,
  editsPerSecond: 60,    // world edits from one player, on average
  editsBurst: 400,       // (a Trail sweep makes many at once)
  editReach: 24          // tiles from where you stand that you can change
});

export const STATUS = Object.freeze(['online', 'away', 'lost', 'offline']);

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
const COLORS = 8;

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

// A position: where, which way facing, walking or not, holding up the sign.
export function cleanPos(p) {
  if (!isObj(p) || !inXY(p.x) || !inXY(p.y) || !inZ(p.z)) return null;
  const f = (v) => (isNum(v) ? Math.max(-1, Math.min(1, round(v, 100))) : 0);
  return { x: round(p.x, 1000), y: round(p.y, 1000), z: p.z, fx: f(p.fx), fy: f(p.fy), m: p.m === true, sign: p.sign === true };
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

export function cleanStatus(st) {
  return STATUS.includes(st) ? st : null;
}

export function cleanColor(c) {
  return isInt(c) && c >= 0 && c < COLORS ? c : null;
}

export const COLOR_COUNT = COLORS;

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
