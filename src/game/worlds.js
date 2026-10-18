/* The shared worlds this phone has been in: which ones, what they're called,
 * and the Worlds screen (Settings) that switches between them and your own.
 *
 * A world's name is made from its id (two words, like "Fern Valley"), the
 * same on every phone and in the player's language. Nobody types it, so no
 * player's words ever reach anyone else (Watch's call, 2026-10-18). */

import { ROOM_ID_RE } from '../net/protocol.js';
import { t } from '../i18n/i18n.js';

const ROOMS_STORE = 'mte.rooms';      // shared worlds you've been in, newest first
const MINE_STORE = 'mte.myWorlds';    // the ones among them you own
const KEPT = 12;                      // worlds remembered at most
// What this phone keeps for each of those worlds (together.js), dropped
// with the world when it leaves the list.
export const SAVE_PREFIX = 'mte.room.'; // your progress there (a copy)
export const FOG_PREFIX = 'mte.fog.';   // the map you've explored there
export const GEN_PREFIX = 'mte.gen.';   // which making of that world those are from (see the nuke)
const COPIES = [SAVE_PREFIX, FOG_PREFIX, GEN_PREFIX];

// The two words of a world's name (src/i18n: world.thing.*, world.place.*).
const THINGS = ['glowcap', 'fern', 'moss', 'amber', 'crystal', 'heron', 'otter', 'lynx', 'owl', 'willow', 'juniper', 'clover', 'firefly', 'mist', 'thunder', 'honey'];
const PLACES = ['hollow', 'valley', 'ridge', 'meadow', 'grove', 'marsh', 'hills', 'shore', 'falls', 'woods', 'heath', 'lake'];

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, value); } catch { /* full or blocked */ }
}
// Drops what's kept for worlds no longer on the list.
function tidy() {
  try {
    const keep = new Set(knownRooms());
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const p = k && COPIES.find((c) => k.startsWith(c));
      if (p && !keep.has(k.slice(p.length))) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
  } catch { /* storage blocked: nothing kept anyway */ }
}

function readList(key) {
  try {
    const list = JSON.parse(read(key) || '[]');
    return Array.isArray(list) ? list.filter((r) => typeof r === 'string' && ROOM_ID_RE.test(r)) : [];
  } catch { return []; }
}

// The world's name, from its id: the same id always gives the same name.
export function worldName(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return t('world.name', { thing: t('world.thing.' + THINGS[h % THINGS.length]), place: t('world.place.' + PLACES[(h >>> 8) % PLACES.length]) });
}

export function knownRooms() {
  return readList(ROOMS_STORE);
}

// Just played in: first on the list. `mine`: whether you own it now.
export function remember(room, mine) {
  write(ROOMS_STORE, JSON.stringify([room, ...knownRooms().filter((r) => r !== room)].slice(0, KEPT)));
  const owned = readList(MINE_STORE).filter((r) => r !== room && knownRooms().includes(r));
  write(MINE_STORE, JSON.stringify(mine ? [room, ...owned] : owned));
  tidy();
}

// Off the list: a world you can't go back to, or one you removed.
export function forget(room) {
  write(ROOMS_STORE, JSON.stringify(knownRooms().filter((r) => r !== room)));
  tidy();
}

// A world that turned you away for now (it froze your character): last on the list.
export function skip(room) {
  const list = knownRooms();
  if (list.includes(room)) write(ROOMS_STORE, JSON.stringify([...list.filter((r) => r !== room), room]));
}

const isMine = (room) => readList(MINE_STORE).includes(room);

// How many play in a world now, or null if the room service doesn't say
// (none set, out of reach, or from before it counted).
export async function onlineIn(service, id) {
  if (!service) return null;
  try {
    const res = await fetch(service + '/rooms/' + id, { cache: 'no-store' });
    const d = res.ok ? await res.json() : null;
    return Number.isSafeInteger(d?.online) && d.online >= 0 ? d.online : null;
  } catch { return null; }
}

/* --------------------------------------------------- the Worlds screen */

// Your own world first, then every shared world, newest first: its name,
// whose it is, how many are playing there now, and Play (or "You're here").
// `here`: the world you're in (null alone); `online(id)`: a promise of how
// many play there now, or null if the room service didn't say;
// `play(id)` (null: your own); `remove(id)`.
export function renderWorlds(box, { here, online, play, remove }) {
  const row = (name, sub, isHere, id) => {
    const r = document.createElement('div');
    r.className = 'world' + (isHere ? ' here' : '');
    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = name;
    const small = document.createElement('small');
    small.textContent = sub;
    text.append(title, small);
    r.append(text);
    if (isHere) {
      const tag = document.createElement('span');
      tag.textContent = t('worlds.here');
      r.append(tag);
    } else {
      r.append(button(t('worlds.play'), '', () => play(id)));
      if (id) r.append(button(t('worlds.remove'), 'stop', () => remove(id)));
    }
    return { r, small };
  };
  const own = row(t('worlds.own'), t('worlds.alone'), !here, null);
  const rows = knownRooms().map((id) => {
    const whose = t(isMine(id) ? 'worlds.mine' : 'worlds.friends');
    const x = row(worldName(id), whose, id === here, id);
    online(id).then((n) => { if (n !== null && x.r.isConnected) x.small.textContent = whose + ' · ' + t('worlds.online', { count: n }); });
    return x.r;
  });
  const hint = document.createElement('p');
  hint.className = 'empty';
  hint.textContent = t(rows.length ? 'worlds.hint' : 'worlds.none');
  box.replaceChildren(own.r, ...rows, hint);
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
