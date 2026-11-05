/* Who you are to the room service, kept in this browser's storage: your
 * secret key, the shared world the game opens into, and which privacy policy
 * you agreed to. Storage that is full or blocked never stops the game: a
 * read gives null and a write is dropped (the room still has your progress).
 *
 * `store` defaults to the page's localStorage; tests pass their own. */

import { KEY_RE, ROOM_ID_RE, randomHex } from '../net/protocol.js';
import { knownRooms, rememberAll } from './worlds.js';
import { t, LANG } from '../i18n/i18n.js';

export const KEY_STORE = 'mte.key'; // your secret: who you are to every room
export const KEY_BEFORE = 'mte.key.before.'; // one this device had before your other device's came (kept)
export const PLAYING_STORE = 'mte.playing'; // the shared world you're in, if any
export const PRIVACY_STORE = 'mte.privacy'; // the version of the privacy policy the player agreed to

// The privacy policy (privacy/index.html). Playing together means agreeing
// to it; a new version (after a change that matters) asks everyone again.
export const POLICY_VERSION = '2';
export const policyUrl = () => 'privacy/#' + LANG;

// The page's storage, or null where even reaching it throws (storage blocked
// in some private modes): every read and write below then quietly does nothing.
const page = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

export function read(key, store = page()) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

export function write(key, value, store = page()) {
  try {
    store.setItem(key, value);
  } catch {
    /* full or blocked: the room still has it */
  }
}

// Your key, made the first time it's needed and kept from then on.
export function myKey(store = page()) {
  let key = read(KEY_STORE, store);
  if (!key || !KEY_RE.test(key)) {
    key = randomHex(32);
    write(KEY_STORE, key, store);
  }
  return key;
}

// Your character, if this device has played in a shared world: its key and
// those worlds (sync.js keeps it for your other devices).
export function character(store = page()) {
  const key = read(KEY_STORE, store),
    rooms = knownRooms();
  return key && KEY_RE.test(key) && rooms.length ? { key, rooms } : null;
}

// Plays as your character from your other device here (sync.js), and adds
// the worlds it plays in. A different one this device had is kept beside it,
// never dropped; it sleeps in its world as every character does.
export function becomeCharacter(me, store = page(), now = Date.now()) {
  const old = read(KEY_STORE, store);
  if (old && old !== me.key) write(KEY_BEFORE + now, old, store);
  write(KEY_STORE, me.key, store);
  rememberAll(me.rooms);
}

// The shared world the game opens into, or null.
export function playing(store = page()) {
  const last = read(PLAYING_STORE, store);
  return last && ROOM_ID_RE.test(last) ? last : null;
}

// Whether the player has agreed to this version of the privacy policy, and
// recording that they have.
export const agreedToPolicy = (store = page()) => read(PRIVACY_STORE, store) === POLICY_VERSION;
export const agreeToPolicy = (store = page()) => write(PRIVACY_STORE, POLICY_VERSION, store);

// The question before going into a shared world (`kind` 'join') says that
// playing together accepts the privacy policy and links to it: yes accepts
// it, Cancel keeps you playing alone. No extra step.
export async function askToPlayTogether(ask, kind, world = '', store = page()) {
  const yes = await ask({
    title: t(`together.${kind}.title`, { world }),
    text: t(`together.${kind}.text`) + ' ' + t(`privacy.${kind}`),
    yes: t(`together.${kind}.yes`),
    link: { href: policyUrl(), text: t('privacy.link') }
  });
  if (yes) agreeToPolicy(store);
  return yes;
}
