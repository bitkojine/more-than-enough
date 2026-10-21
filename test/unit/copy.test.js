/* An admin's copy of a shared world (server/src/copy.js): played as one of
 * its players, it comes back the way they would, and nothing done in it
 * reaches the real room, the real player or anyone else. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket } from '../../server/src/room.js';
import { snapshot, copyEntries, COPY_MS } from '../../server/src/copy.js';
import { C, T, createBot } from './helpers.js';

const T0 = 1_700_000_000_000;
const HOUR = 3600_000;

// Everything the room holds, and everything it would still write or log.
const stateOf = (r) => JSON.stringify({ entries: [...r.entries()], log: r.log, dirty: r.isDirty, players: [...r.players], watch: [...r.watch.keys()] });

// A world with its maker's garden, a friend in it, and the maker gone for
// two hours; the copy is made then, of the maker.
async function world() {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world: { seed: 12345, mods: [], props: [], ext: [] } }), T0), null);
  const j = await r.join(key, undefined, T0, true);
  const id = j.id;
  const s = C.joinState(j.welcome, r.id, null, null);
  s.acts = [];
  const edits = new Bucket(T0, 1e9, 1e9);
  const now = () => T0 + Math.round(s.stats.playedMs);
  const send = (m) => r.message(id, JSON.stringify(m), now(), edits);
  const sync = (force = false) => {
    C.advanceGoals(s);
    r.players.get(id).p = P.cleanPos(s.player);
    const acts = C.takeActs(s);
    for (let i = 0; i < acts.length; i += P.LIMITS.actsPerMessage) send({ t: 'acts', ms: Math.round(s.stats.playedMs), a: acts.slice(i, i + P.LIMITS.actsPerMessage) });
    const list = C.takeEdits(s);
    if (list.length) send({ t: 'edits', e: list });
    if (force) send({ t: 'save', s: C.progressOf(s) });
  };
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST)); assert.ok(C.place(s, 'garden').ok);
  sync(true);
  const friendKey = P.randomHex(32);
  const code = r.message(id, JSON.stringify({ t: 'invite' }), now()).toSelf[0].code;
  const friend = await r.join(friendKey, code, now());
  r.left(id, true, now());
  const at = now() + 2 * HOUR;
  r.takeWrites(); r.takeLog(); // as the Durable Object writes them out
  return { r, id, key, friendKey, friend, at, rate: C.extractorRate(s, 'garden') };
}

// The copy as the copy route makes it, and the key that plays it.
async function copyOf(r, as, now) {
  const copyId = P.randomRoomId(), adminKey = P.randomHex(32);
  const entries = copyEntries(snapshot(r), as, await P.playerId(copyId, adminKey), now + COPY_MS);
  return { c: Room.restore(copyId, entries, now), adminKey };
}

test('copy: plays as the player coming back now, with their progress and time away', async () => {
  const { r, id, at, rate } = await world();
  const { c, adminKey } = await copyOf(r, id, at);
  const j = await c.join(adminKey, undefined, at, true);
  assert.equal(j.id, id, 'the new key plays the copied player');
  assert.equal(j.welcome.you, id);
  assert.equal(j.welcome.save, r.players.get(id).save, 'their progress, as the room keeps it');
  assert.deepEqual(j.welcome.ext, r.ext, 'their buildings');
  assert.equal(j.welcome.time, r.clock(at), 'the world\'s own clock');
  // Their game sends its first progress: the room credits the two hours.
  const s = C.joinState(j.welcome, c.id, null, null);
  const out = c.message(id, JSON.stringify({ t: 'save', s: C.progressOf(s) }), at);
  const away = (out.toSelf || []).find((m) => m.t === 'away');
  assert.ok(away, 'what their garden made while they were away: ' + JSON.stringify(out));
  assert.ok(Math.abs(away.secs - 7200) <= 1);
  assert.ok(Math.abs(away.made.mycelium - rate * 7200) < 1);
});

test('copy: nothing done in it reaches the real room', async () => {
  const { r, id, key, at } = await world();
  const before = stateOf(r);
  const { c, adminKey } = await copyOf(r, id, at);
  assert.equal(stateOf(r), before, 'making the copy only reads');
  const j = await c.join(adminKey, undefined, at);
  const s = C.joinState(j.welcome, c.id, null, null);
  // Play in it: progress, steps, digging, building, taking the friend out
  // (what the moderator's ban does).
  c.message(id, JSON.stringify({ t: 'save', s: C.progressOf(s) }), at);
  c.message(id, JSON.stringify({ t: 'pos', p: { x: s.player.x + 1, y: s.player.y, z: 0 } }), at + 1000);
  c.message(id, JSON.stringify({ t: 'edits', e: [['m', C.packKey(Math.round(s.player.x) + 1, Math.round(s.player.y), 0), 0]] }), at + 1100);
  c.made(id, [['x', 'garden', Math.round(s.player.x) + 3, Math.round(s.player.y) + 3, 0]], at + 1200);
  const friend = [...c.players.keys()].find((p) => p !== id);
  c.ban(friend, at + 1300, 'mod', 'took them out in the copy');
  assert.equal(c.ext.length, r.ext.length + 1, 'the copy has a building the real world hasn\'t');
  assert.equal(c.players.size, r.players.size - 1, 'and lost the friend Watch took out there');
  c.left(id, true, at + 2000);
  c.takeWrites();
  assert.equal(stateOf(r), before, 'the real room is exactly as it was');
  // ...and the real player still comes back to it as before, with their own key.
  const back = await r.join(key, undefined, at);
  assert.equal(back.id, id);
});

test('copy: nobody else gets in, it makes no links and keeps no log', async () => {
  const { r, id, key, friendKey, at } = await world();
  const { c, adminKey } = await copyOf(r, id, at);
  assert.deepEqual(await c.join(key, undefined, at), { error: 'invite' }, 'not the player\'s own key');
  assert.deepEqual(await c.join(friendKey, undefined, at), { error: 'invite' }, 'nor a friend\'s');
  assert.equal(c.invites.size, 0, 'the real links aren\'t in it');
  await c.join(adminKey, undefined, at);
  assert.deepEqual(c.message(id, JSON.stringify({ t: 'invite' }), at).toSelf, [{ t: 'invitesFull' }], 'and it makes none');
  // Cheating in the copy is still refused there, but nothing is written down.
  for (let i = 0; i < 3; i++) c.message(id, JSON.stringify({ t: 'pos', p: { x: 5000 + i * 900, y: 0, z: 0 } }), at + 2000 + i * 1500);
  assert.deepEqual(c.log, [], 'no audit log of the real player');
});

test('copy: goes after COPY_MS, kept in storage as a copy until then', async () => {
  const { r, id, at } = await world();
  const { c } = await copyOf(r, id, at);
  assert.equal(c.expired(at + COPY_MS - 1), false);
  assert.equal(c.expired(at + COPY_MS), true);
  c.dirty.meta = true;
  const meta = c.takeWrites().get('meta');
  assert.equal(meta.copy.as, id, 'a restart still knows it\'s a copy');
  assert.equal(Room.restore(c.id, new Map([['meta', meta]]), at).copy.until, at + COPY_MS);
  assert.equal(copyEntries(snapshot(r), 'f'.repeat(16), 'a'.repeat(16), at), null, 'no copy of a player who isn\'t there');
});
