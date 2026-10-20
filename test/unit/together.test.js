/* Playing together: the wire format's checks (src/net/protocol.js), the
 * room's rules (server/src/room.js) and the shared world in the core
 * (src/core/shared.js). Most of these are the security rules: a room must
 * hold whatever a hostile player throws at it. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket, editBucket, LOST_TO_OFFLINE_MS, INVITE_MS, EXPIRE_MS, FAR_MS, MAX_SPEED, MOVE_BURST, CHEATS_TO_BAN, PLAYER_BUILDINGS, PLAYER_TILES, MOD_BUCKETS, STRIKE_FORGIVE_MS, visitor } from '../../server/src/room.js';
import * as Core from '../../src/core/index.js';
import { WORLD_FORMAT } from '../../src/core/format.js';

const key = () => P.randomHex(32);
const T0 = 1_700_000_000_000;

async function makeRoom(extra = {}) {
  const r = new Room(P.randomRoomId(), T0);
  const maker = key();
  const err = await r.init(JSON.stringify({ t: 'create', key: maker, world: { seed: 42, mods: [], props: [], ext: [] }, ...extra }), T0);
  assert.equal(err, null);
  put(r, await P.playerId(r.id, maker), 3, 3, T0);
  return { r, maker };
}

// Building `kind` going up at (x, y), as the room's copy of player `id`'s
// progress works it out from what they did (server/src/shadow.js).
function put(r, id, x, y, now = T0, kind = 'garden') {
  return r.made(id, [['x', kind, x, y, 0]], now);
}

// A fresh invite code, as the room hands one out to `id`.
function invite(r, id, now = T0, ask = {}) {
  return r.message(id, JSON.stringify({ t: 'invite', ...ask }), now).toSelf[0].code;
}

/* ------------------------------------------------------------ protocol */

test('protocol: messages are size-capped JSON objects with a type', () => {
  assert.equal(P.parse('x'.repeat(P.LIMITS.messageBytes + 1)), null);
  assert.equal(P.parse('{"t":1}'), null);
  assert.equal(P.parse('[1]'), null);
  assert.equal(P.parse('not json'), null);
  assert.deepEqual(P.parse('{"t":"pos"}'), { t: 'pos' });
  // Multi-byte text counts in bytes, not characters.
  assert.equal(P.parse('{"t":"' + 'ž'.repeat(P.LIMITS.messageBytes / 2) + '"}'), null);
});

test('protocol: positions are bounded and stripped to known fields', () => {
  assert.equal(P.cleanPos({ x: 1e9, y: 0, z: 0 }), null);
  assert.equal(P.cleanPos({ x: 0, y: 0, z: 1 }), null);
  assert.equal(P.cleanPos({ x: 0, y: NaN, z: 0 }), null);
  assert.equal(P.cleanPos({ x: '1', y: 0, z: 0 }), null);
  const p = P.cleanPos({ x: 1.23456, y: 2, z: -3, fx: 9, fy: -9, m: 'yes', sign: true, dev: 'phone', evil: '<script>' });
  assert.deepEqual(p, { x: 1.235, y: 2, z: -3, fx: 1, fy: -1, m: false, sign: true, dev: 'phone', a: null, n: 0 });
  assert.equal(P.cleanPos({ x: 0, y: 0, z: 0, dev: 'toaster' }).dev, null);
  const acting = P.cleanPos({ x: 0, y: 0, z: 0, a: 'swing', n: 7 });
  assert.deepEqual([acting.a, acting.n], ['swing', 7]);
  const junk = P.cleanPos({ x: 0, y: 0, z: 0, a: 'dance', n: 1e6 });
  assert.deepEqual([junk.a, junk.n], [null, 0], 'unknown acts and counts are dropped');
});

test('protocol: edits must match one of three exact shapes', () => {
  assert.deepEqual(P.cleanEdit(['m', 5, 3]), ['m', 5, 3]);
  for (const bad of [['m', -1, 3], ['m', 5, 256], ['m', 5.5, 3], ['m', 5, 3, 1], ['p', 5, '<img>'], ['p', 5, 'Glow'],
    ['x', 'garden', 1, 2, 1], ['x', 'garden', 1, 2, 0, 'not-an-id'], ['q', 1, 1], 'm', null, ['x', '__proto__', 1, 2, 0]]) {
    assert.equal(P.cleanEdit(bad), null, JSON.stringify(bad));
  }
  assert.equal(P.cleanEdits(Array(P.LIMITS.editsPerMessage + 1).fill(['m', 1, 1])), null);
  assert.equal(P.cleanEdits([['m', 1, 1], ['bad']]), null, 'one bad edit drops the whole message');
});

test('protocol: a world is capped and checked entry by entry', () => {
  assert.equal(P.cleanWorld({ seed: 0 }), null);
  assert.equal(P.cleanWorld({ seed: 1, mods: Array(P.LIMITS.mods + 1).fill([1, 1]) }), null);
  assert.equal(P.cleanWorld({ seed: 1, mods: [[1, 999]] }), null);
  assert.deepEqual(P.cleanWorld({ seed: 7, ext: [['garden', 1, 2, 0]] }), { seed: 7, mods: [], props: [], ext: [['garden', 1, 2, 0]] });
});

test('protocol: a create is only real once the key, world and time check out', () => {
  const key = 'ab'.repeat(32);
  assert.deepEqual(P.cleanCreate({ t: 'create', key, world: { seed: 7 }, time: 5 }),
    { key, world: { seed: 7, mods: [], props: [], ext: [] }, time: 5 });
  assert.equal(P.cleanCreate({ t: 'create', key, world: { seed: 7 } }).time, 0, 'time is optional');
  for (const bad of [null, 'junk', {}, { t: 'hello', key, world: { seed: 7 } },
    { t: 'create', key: 'short', world: { seed: 7 } }, { t: 'create', key, world: null },
    { t: 'create', key, world: { seed: 0 } }, { t: 'create', key, world: { seed: 7 }, time: -1 }]) {
    assert.equal(P.cleanCreate(bad), null, JSON.stringify(bad));
  }
});

test('protocol: tile keys unpack exactly as the core packs them', () => {
  for (const [x, y, z] of [[0, 0, 0], [-5, 9, -2], [1000000, -1000000, -512], [123, 456, 0]]) {
    assert.deepEqual(P.unpackKey(Core.packKey(x, y, z)), { x, y, z });
  }
});

test('protocol: ids are random, and a player id is per room and not the key', async () => {
  const k = key();
  assert.match(P.randomRoomId(), P.ROOM_ID_RE);
  assert.notEqual(P.randomRoomId(), P.randomRoomId());
  const a = await P.playerId('room-a', k), b = await P.playerId('room-b', k);
  assert.match(a, P.ID_RE);
  assert.notEqual(a, b);
  assert.ok(!k.includes(a));
});

/* --------------------------------------------------------------- room */

test('room: made once, from the creator\'s seed alone: everyone starts from nothing', async () => {
  const { r, maker } = await makeRoom();
  assert.ok(r.players.has(await P.playerId(r.id, maker)), 'the maker is the first player');
  assert.equal(await r.init(JSON.stringify({ t: 'create', key: key(), world: { seed: 1 } }), T0), 'exists');
  const fresh = new Room(P.randomRoomId(), T0);
  assert.equal(await fresh.init('{"t":"create","key":"short","world":{"seed":1}}', T0), 'bad');
  // An older game still sends its world and progress: neither is taken.
  const old = new Room(P.randomRoomId(), T0);
  const save = JSON.stringify({ v: WORLD_FORMAT, seed: 7, inv: { stone: 5e8 } });
  assert.equal(await old.init(JSON.stringify({ t: 'create', key: maker, world: { seed: 7, mods: [[Core.packKey(1, 1, 0), 0]], props: [], ext: [['garden', 3, 3, 0]] }, save, pos: { x: 9.5, y: 9.5, z: 0 } }), T0), null);
  assert.deepEqual([old.seed, old.mods.size, old.ext.length], [7, 0, 0]);
  const oldId = await P.playerId(old.id, maker);
  assert.deepEqual([old.players.get(oldId).save, old.players.get(oldId).p], [null, null]);
});

test('room: new players need a live invite; members come back with their key', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  assert.equal(o.id, await P.playerId(r.id, maker), 'the maker needs no invite');
  assert.equal((await r.join(key(), undefined, T0)).error, 'invite');
  assert.equal((await r.join(key(), 'A'.repeat(22), T0)).error, 'invite');
  const code = invite(r, o.id);
  const late = await r.join(key(), code, T0 + INVITE_MS + 1);
  assert.deepEqual([late.error, late.why], ['invite', 'expired'], 'invites expire, and the joiner hears why');
  assert.equal((await r.join(key(), 'A'.repeat(22), T0)).why, undefined, 'a made-up code is told nothing more');
  const friendKey = key();
  const f = await r.join(friendKey, code, T0 + 1000);
  assert.ok(f.id && f.welcome.you === f.id);
  assert.equal(f.welcome.save, null);
  assert.equal(JSON.stringify(f.welcome).includes(friendKey), false, 'the key never comes back');
  // Back later, long after the invite: the key alone is enough.
  assert.equal((await r.join(friendKey, undefined, T0 + 10 * INVITE_MS)).id, f.id);
  // A stopped link stops letting anyone new in.
  const code2 = invite(r, o.id);
  r.message(o.id, JSON.stringify({ t: 'revoke', code: code2 }), T0);
  assert.equal((await r.join(key(), code2, T0)).why, 'stopped');
  // A full link says so.
  const one = invite(r, o.id, T0, { uses: 1 });
  assert.ok((await r.join(key(), one, T0)).id);
  assert.equal((await r.join(key(), one, T0)).why, 'usedUp', 'a used-up link says so');
});

test('room: invite links last a day, count who joined, and can be listed and stopped', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  assert.ok(INVITE_MS >= 12 * 3600_000, 'a link works for at least 12 hours');
  const code = invite(r, o.id);
  assert.equal(invite(r, o.id, T0 + 3600_000), code, 'holding the sign up again shows the same link');
  const a = await r.join(key(), code, T0 + 11 * 3600_000);
  const b = await r.join(key(), code, T0 + 12 * 3600_000);
  assert.ok(a.id && b.id, 'one link lets several friends in, for hours');
  const mine = r.message(o.id, JSON.stringify({ t: 'invites' }), T0).toSelf[0];
  assert.deepEqual(mine.list.map((e) => [e[0], e[1], e[4], e[5]]), [[code, o.id, 2, false]], 'the maker sees who made it and its uses');
  const theirs = invite(r, a.id);
  assert.notEqual(theirs, code);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'invites' }), T0).toSelf[0].list.length, 1, 'everyone sees only their own links');
  assert.deepEqual(r.message(a.id, JSON.stringify({ t: 'invites' }), T0).toSelf[0].list.map((e) => e[0]), [theirs], 'so do others');
  assert.ok(r.message(b.id, JSON.stringify({ t: 'revoke', code: theirs }), T0).drop, "nobody stops someone else's link");
  assert.equal(r.revokeAny(theirs, T0), null, 'Watch stops any link, through the admin route');
  const after = r.message(a.id, JSON.stringify({ t: 'invites' }), T0).toSelf[0];
  assert.equal(after.list.find((e) => e[0] === theirs)[5], true);
  assert.equal((await r.join(key(), theirs, T0)).error, 'invite', 'a stopped link lets nobody in');
  assert.notEqual(invite(r, a.id), theirs, 'a stopped link is not shown again');
});

test('room: holds at most LIMITS.players players', async () => {
  const { r, maker } = await makeRoom();
  // Each player brings in the next: nobody hits their invites-per-day share.
  let host = (await r.join(maker, undefined, T0)).id;
  for (let i = 1; i < P.LIMITS.players; i++) {
    const p = await r.join(key(), invite(r, host, T0), T0);
    assert.ok(p.id, 'one more fits');
    host = p.id;
  }
  assert.equal((await r.join(key(), invite(r, host, T0), T0)).error, 'full');
  assert.equal(r.players.size, P.LIMITS.players);
  assert.equal(new Set([...r.players.values()].map((p) => p.c)).size, P.LIMITS.players, 'everyone gets their own colour');
});

test('room: steps go to everyone only every FAR_MS, to players nearby always', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const step = (t) => r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 1.5, y: 1.5, z: 0 } }), t);
  assert.equal(step(T0).near, null, 'the first step reaches the whole world');
  assert.equal(step(T0 + 100).near?.x, 1.5, 'the next only those nearby');
  assert.equal(step(T0 + FAR_MS).near, null);
});

test('room: edits are checked, owned by the sender, near the sender, and budgeted', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const f = await r.join(key(), invite(r, o.id), T0);
  const msg = (e) => JSON.stringify({ t: 'edits', e });
  // No position yet: nothing applies.
  assert.deepEqual(r.message(f.id, msg([['m', Core.packKey(1, 1, 0), 0]]), T0), {});
  r.message(f.id, JSON.stringify({ t: 'pos', p: { x: 10.5, y: 10.5, z: 0 } }), T0);
  const near = Core.packKey(12, 9, 0), far = Core.packKey(500, 9, 0), below = Core.packKey(12, 9, -1);
  const out = r.message(f.id, msg([['m', near, 0], ['m', far, 0], ['m', below, 0], ['x', 'garden', 11, 11, 0, o.id], ['p', Core.packKey(11, 10, -1), 'glowcap']]), T0);
  assert.deepEqual(out.toAll[0].e, [['m', near, 0]], 'far and other-layer edits are dropped, and buildings and props only come from what the room worked out');
  assert.equal(r.mods.has(far), false);
  assert.equal(r.ext.length, 1);
  // A building can't go where one stands.
  assert.deepEqual(put(r, f.id, 11, 11), { toAll: [{ t: 'edits', id: f.id, e: [['x', 'garden', 11, 11, 0, f.id]] }] });
  assert.deepEqual(put(r, f.id, 11, 11), {});
  assert.equal(r.message(f.id, msg([['m', near, 0, 'extra']]), T0).drop, true);
  // The edit budget: a flood is cut off.
  const budget = editBucket(T0);
  let refused = 0;
  for (let i = 0; i < 20; i++) if (r.message(f.id, msg(Array(64).fill(['m', near, 1])), T0, budget).drop) refused++;
  assert.ok(refused >= 13, 'only the burst gets through at once');
});

test('room: only your own progress is big; anything else oversized is dropped', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const big = JSON.stringify({ stuff: 'x'.repeat(30000) });
  assert.ok(!r.message(o.id, JSON.stringify({ t: 'save', s: big }), T0).drop);
  assert.notEqual(r.players.get(o.id).save, big, 'the room keeps its own count of your progress');
  assert.equal(r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 1, y: 1, z: 0 }, pad: 'x'.repeat(20000) }), T0).drop, true);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'save', s: 'x'.repeat(P.LIMITS.saveBytes + 10) }), T0).drop, true);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'save', s: '[1,2]' }), T0).drop, true);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'whatever' }), T0).drop, true);
});

test('room: lost connections turn offline after a minute; clean leaves at once', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  assert.equal(r.left(o.id, false, T0).st, 'lost');
  assert.deepEqual(r.expireLost(T0 + 1000), []);
  assert.equal(r.nextLostDeadline(), T0 + LOST_TO_OFFLINE_MS);
  assert.equal(r.expireLost(T0 + LOST_TO_OFFLINE_MS)[0].st, 'offline');
  await r.join(maker, undefined, T0);
  assert.equal(r.left(o.id, true, T0).st, 'offline');
  assert.equal(r.expired(T0 + 100 * EXPIRE_MS), false, 'a players\' world is never deleted (worlds-kept.test.js)');
});

test('room: numbered edits are answered with their number, applied or refused; others as before', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  assert.equal(o.welcome.pong, true);
  assert.equal(o.welcome.ack, true);
  r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 0.5, y: 0.5, z: 0 } }), T0);
  const k = Core.packKey(1, 0, 0);
  const a = r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', k, 0]], n: 7 }), T0);
  assert.deepEqual(a.toSelf, [{ t: 'ack', n: 7 }]);
  assert.equal(a.toAll[0].t, 'edits');
  // A prop where there already is one: refused, still answered.
  r.message(o.id, JSON.stringify({ t: 'edits', e: [['p', k, 'glowcap']] }), T0);
  const b = r.message(o.id, JSON.stringify({ t: 'edits', e: [['p', k, 'glowcap']], n: 8 }), T0);
  assert.deepEqual(b, { toSelf: [{ t: 'ack', n: 8 }] });
  const c = r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', k, 0]] }), T0);
  assert.equal(c.toSelf, undefined, 'unnumbered edits get no answer (games from before)');
  const d = r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', 'bad', 2]], n: 9 }), T0);
  assert.deepEqual(d, { drop: true }, 'a malformed batch is dropped, not answered');
});

test('room: a write that fails is written again next time, with whatever changed since', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  r.takeWrites();
  const guest = await r.join(key(), invite(r, o.id), T0);
  r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 0.5, y: 0.5, z: 0 } }), T0);
  r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(1, 1, 0), 0]] }), T0);
  r.ban(guest.id, T0, 'mod', 'test'); // the player goes and the ban comes in the same write
  const failed = r.takeWrites();
  const gone = [...failed].filter(([, v]) => v === null).map(([k]) => k);
  assert.ok(gone.includes('p:' + guest.id) && failed.has('meta'));
  // Storage refused it: nothing landed.
  r.redo(new Map([...failed].filter(([, v]) => v !== null)), gone);
  assert.equal(r.isDirty, true);
  r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(2, 1, 0), 0]] }), T0 + 10);
  const retry = r.takeWrites();
  assert.deepEqual([...retry.keys()].sort(), [...failed.keys()].sort(), 'the same keys again, none lost');
  assert.equal(retry.get('p:' + guest.id), null, 'the banned player is still deleted');
  assert.ok(retry.get('meta').bans.includes(guest.id), 'together with the ban');
  assert.equal(retry.get('mods:' + (Core.packKey(2, 1, 0) % MOD_BUCKETS)).length > 0, true, 'and the newer edit rides along');
});

test('room: a world stored in fewer pieces loads whole and is spread over the new ones', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 1.5, y: 1.5, z: 0 } }), T0);
  const e = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 2; x++) e.push(['m', Core.packKey(x, y, 0), 0]);
  r.message(o.id, JSON.stringify({ t: 'edits', e }), T0);
  const stored = new Map([['id', r.id], ...r.takeWrites()]);
  // As worlds were stored before v0.126.0: 16 pieces.
  const all = [...r.mods];
  assert.ok(all.some(([k]) => k % 16 !== k % MOD_BUCKETS), 'some edit lives in another piece now');
  for (const k of [...stored.keys()]) if (k.startsWith('mods:')) stored.delete(k);
  for (let b = 0; b < 16; b++) stored.set('mods:' + b, all.filter(([k]) => k % 16 === b));
  const back = Room.restore(r.id, stored, T0);
  assert.deepEqual([...back.mods].sort(), all.sort(), 'every edit is there');
  const w = back.takeWrites();
  for (let b = 0; b < MOD_BUCKETS; b++) assert.ok(w.has('mods:' + b), 'every piece is written again');
  for (const [k, v] of w) if (k.startsWith('mods:')) for (const [key] of v) assert.equal(key % MOD_BUCKETS, Number(k.slice(5)));
  const again = Room.restore(r.id, new Map([...stored, ...w]), T0);
  assert.deepEqual([...again.mods].sort(), all.sort());
  assert.equal(again.isDirty, false, 'and from then on it is stored as it should be');
});

test('room: what it writes to storage brings it back the same', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 1.5, y: 1.5, z: 0 } }), T0);
  r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(2, 2, 0), 1], ['p', Core.packKey(1, 1, 0), 'glowcap']] }), T0);
  const code = invite(r, o.id);
  const stored = new Map([['id', r.id], ...r.takeWrites()]);
  assert.equal(r.isDirty, false);
  const back = Room.restore(r.id, stored, T0);
  assert.deepEqual([...back.mods], [...r.mods]);
  assert.deepEqual([...back.props], [...r.props]);
  assert.deepEqual(back.ext, r.ext);
  assert.equal(back.invites.get(code), r.invites.get(code));
  assert.equal(back.clock(T0 + 5000), r.clock(T0 + 5000));
});

test('room: one clock for the whole world, going on from the creator\'s time of day', async () => {
  const { r, maker } = await makeRoom({ time: 100 });
  const o = await r.join(maker, undefined, T0 + 5000);
  assert.equal(o.welcome.time, 105);
  const code = invite(r, o.id);
  const f = await r.join(key(), code, T0 + 65_000);
  assert.equal(f.welcome.time, 165, 'a friend joining later sees the same clock');
  assert.equal(P.cleanTime(-1), null);
  assert.equal(P.cleanTime(Infinity), null);
  assert.equal(P.cleanTime('5'), null);
  const fresh = new Room(P.randomRoomId(), T0);
  assert.equal(await fresh.init(JSON.stringify({ t: 'create', key: key(), world: { seed: 1 }, time: -3 }), T0), 'bad');
});

test('rate buckets refill over time', () => {
  const b = new Bucket(T0);
  let ok = 0;
  for (let i = 0; i < 100; i++) if (b.take(T0)) ok++;
  assert.equal(ok, P.LIMITS.rateBurst);
  assert.equal(b.take(T0 + 1000), true);
});

/* ------------------------------------------------------- shared world */

test('shared world: made from yours, joined back with your progress and fog', () => {
  const s = Core.createState(99);
  s.inv.mycelium = 123;
  const world = Core.worldOf(s);
  const me = '0123456789abcdef';
  const welcome = { you: me, seed: world.seed, mods: world.mods, props: world.props, ext: world.ext.map((e) => [...e, me]), save: Core.progressOf(s) };
  const back = Core.joinState(welcome, 'room', Core.fogOf(s), null);
  assert.equal(back.inv.mycelium, 123);
  assert.equal(back.shared, 'room');
  assert.equal(back.me, me);
  assert.deepEqual(back.player, s.player);
  assert.equal(back.world.explored.size, s.world.explored.size);
  assert.equal(Core.canEmbark(back), false, 'no Embark in a shared world');
});

test('shared world: a new player starts fresh next to their friend', () => {
  const near = { x: 7.5, y: -3.5, z: -2 };
  const s = Core.joinState({ you: 'aaaaaaaaaaaaaaaa', seed: 5, mods: [], props: [], ext: [], save: null }, 'r', null, near);
  assert.equal(s.inv.mycelium, 0);
  assert.deepEqual(s.player, near, 'shut in by rock: right where they are');
  assert.equal(s.underground.deepest, -2);
});

test('shared world: a new player arrives a step beside their friend, not inside them', () => {
  const near = { x: 0.5, y: 0.5, z: 0 };
  const s = Core.joinState({ you: 'aaaaaaaaaaaaaaaa', seed: 5, mods: [], props: [], ext: [], save: null }, 'r', null, near);
  assert.equal(Math.hypot(s.player.x - near.x, s.player.y - near.y), 1);
  assert.equal(s.player.z, 0);
  assert.ok(Core.walkable(s.world, Math.floor(s.player.x), Math.floor(s.player.y), 0));
});

test('shared world: friends joining one after another each get a spot of their own', () => {
  const near = { x: 0.5, y: 0.5, z: 0 };
  const players = new Map([['o', { st: 'online', p: near }]]);
  const spots = [];
  for (let i = 0; i < 3; i++) {
    const s = Core.joinState({ you: 'aaaaaaaaaaaaaaaa', seed: 5, mods: [], props: [], ext: [], save: null, players }, 'r', null, near);
    assert.ok(Math.hypot(s.player.x - near.x, s.player.y - near.y) <= 2, 'beside their friend');
    assert.ok(Core.walkable(s.world, Math.floor(s.player.x), Math.floor(s.player.y), 0));
    spots.push(s.player.x + ',' + s.player.y);
    players.set('j' + i, { st: 'online', p: s.player });
  }
  assert.equal(new Set(spots).size, 3, 'nobody arrives on top of another: ' + spots.join(' '));
});

test("shared world: friends' buildings stand but work only for their owner", () => {
  const s = Core.joinState({ you: 'aaaaaaaaaaaaaaaa', seed: 5, mods: [], props: [], ext: [], save: null }, 'r', null, null);
  Core.applyEdits(s, [['x', 'garden', s.player.x | 0, (s.player.y | 0) + 1, 0, 'bbbbbbbbbbbbbbbb'], ['x', 'nonsense', 1, 1, 0, 'bbbbbbbbbbbbbbbb'], ['p', 5, 'nonsense']]);
  assert.equal(s.extractors.length, 1, 'unknown kinds are ignored');
  s.unlocks.logistics = true;
  for (let i = 0; i < 600; i++) Core.step(s, 0.1);
  assert.equal(s.extractors[0].buffer, 0);
  assert.equal(s.stats.collected, 0);
  assert.equal(Core.extractorCount(s, 'garden'), 0);
});

test('shared world: your changes are recorded for the room', () => {
  const s = Core.joinState({ you: 'aaaaaaaaaaaaaaaa', seed: 5, mods: [], props: [], ext: [], save: null }, 'r', null, null);
  Core.setRichness(s.world, 1, 2, 0, 0);
  const edits = Core.takeEdits(s);
  assert.deepEqual(edits, [['m', Core.packKey(1, 2, 0), 0]]);
  assert.deepEqual(Core.takeEdits(s), []);
  // Alone, nothing is recorded.
  const solo = Core.createState(5);
  Core.setRichness(solo.world, 1, 2, 0, 0);
  assert.equal(solo.world.edits, null);
});

/* ---------------------------------------------------------- the page */

test("the page's Content-Security-Policy allows exactly its own inline script", () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  const hash = createHash('sha256').update(scripts[0]).digest('base64');
  assert.ok(csp.includes(`'sha256-${hash}'`), 'update the CSP hash in index.html to sha256-' + hash);
  assert.ok(!/'unsafe-eval'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp));
  assert.doesNotMatch(html, /\son[a-z]+="/, 'no inline event handlers (the CSP would block them)');
});

test('nothing from the network is put into the page as HTML', () => {
  const src = readFileSync(new URL('../../src/game/together.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
});

test('the vendored QR library is the published file, unchanged', () => {
  const src = readFileSync(new URL('../../src/vendor/qrcode.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('\n') + 1);
  const sum = createHash('sha256').update(body).digest('hex');
  assert.match(src.split('\n')[0], new RegExp('sha256 ' + sum));
});

/* ------------------------------------------------------------ security */

test('room: an invite lets in only as many people as asked, never unlimited, for as long as asked', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const ask = (d) => r.message(o.id, JSON.stringify({ t: 'invite', ...d }), T0).toSelf[0];
  const two = ask({ uses: 2, life: 30 });
  assert.equal(two.until, T0 + 30 * 60_000);
  assert.ok((await r.join(key(), two.code, T0)).id);
  assert.ok((await r.join(key(), two.code, T0)).id);
  assert.equal((await r.join(key(), two.code, T0)).error, 'invite', 'used up');
  assert.equal((await r.join(key(), ask({ uses: 1, life: 30 }).code, T0 + 31 * 60_000)).error, 'invite', 'expired');
  const odd = ask({ uses: 1e9, life: 1e9 });
  const inv = r.invites.get(odd.code);
  assert.deepEqual([inv.max, inv.until - T0], [P.INVITE_DEFAULT.uses, P.INVITE_DEFAULT.life * 60_000], 'anything not on the list is the default');
  assert.ok(P.INVITE_USES.every((n) => Number.isSafeInteger(n) && n >= 1), 'never unlimited');
  const week = ask({ uses: 1, life: 7 * 1440 });
  assert.equal(week.until, T0 + 7 * 24 * 3600_000, 'a link can work for a week');
  assert.ok((await r.join(key(), week.code, T0 + 6.9 * 24 * 3600_000)).id, 'still works on day seven');
  assert.equal(Math.max(...P.INVITE_LIVES), 7 * 1440, 'but never longer than a week');
  const listed = r.message(o.id, JSON.stringify({ t: 'invites' }), T0).toSelf[0].list.find((e) => e[0] === two.code);
  assert.deepEqual([listed[4], listed[6]], [2, 2], 'the list says how many of how many');
});

test('room: a removed player stays out, the links they used and made stop, and their buildings go', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const code = r.message(o.id, JSON.stringify({ t: 'invite', uses: 10 }), T0).toSelf[0].code;
  const gKey = key();
  const g = await r.join(gKey, code, T0);
  put(r, g.id, 11, 11);
  assert.equal(r.ext.filter((e) => e[4] === g.id).length, 1);
  const theirs = [invite(r, g.id, T0, { uses: 25 }), invite(r, g.id, T0, { uses: 5, life: 60 })];
  const out = r.ban(g.id, T0, 'mod', 'removed by the moderator');
  assert.equal(out.kick, g.id);
  assert.deepEqual(out.toAll, [{ t: 'removed', id: g.id }, { t: 'graves', g: r.graves }]);
  assert.equal(r.ext.some((e) => e[4] === g.id), false, 'their buildings are gone');
  assert.equal(r.extTiles.has('11,11,0'), false, 'and their tiles are free');
  assert.equal((await r.join(gKey, code, T0)).error, 'invite', 'not back with the same key');
  assert.equal((await r.join(key(), code, T0)).error, 'invite', 'nor with a new key on the same link');
  for (const c of theirs) assert.equal((await r.join(key(), c, T0)).error, 'invite', 'nor through a link they made');
  // The ban survives a restart.
  const back = Room.restore(r.id, new Map(r.takeWrites()), T0);
  assert.equal((await back.join(gKey, invite(back, o.id), T0)).error, 'invite');
});

test("room: a player brings in at most LIMITS.invitesPerDay people a day", async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const m = await r.join(key(), invite(r, o.id), T0);
  const link = invite(r, m.id, T0, { uses: 25 });
  for (let i = 0; i < P.LIMITS.invitesPerDay; i++) assert.ok((await r.join(key(), link, T0 + i)).id);
  assert.deepEqual(await r.join(key(), link, T0 + 100), { error: 'invite', why: 'limit' }, 'the sixth is turned away, saying why');
  assert.ok((await r.join(key(), invite(r, m.id, T0, { uses: 10, life: 60 }), T0 + 200)).error, 'a new link of theirs makes no difference');
  assert.equal(r.takeLog().filter((x) => x.e === 'deny' && x.why === 'limit').length, 2);
  const later = T0 + 24 * 3600_000 + 10;
  assert.ok((await r.join(key(), invite(r, m.id, later, { uses: 5 }), later)).id, 'a day later there is room again');
  const own = invite(r, o.id, T0, { uses: 25 });
  for (let i = 0; i < P.LIMITS.invitesPerDay - 1; i++) assert.ok((await r.join(key(), own, T0 + i)).id, 'the maker brings in their share too');
  assert.deepEqual(await r.join(key(), own, T0 + 100), { error: 'invite', why: 'limit' }, 'and hits the same limit');
  // The count survives a restart.
  const back = Room.restore(r.id, new Map([...Room.keysFor(r)].map((k) => [k, null]).concat([...r.takeWrites()])), T0);
  assert.equal(back.players.get(m.id).brought.length, 1);
});

test("room: a ban takes everyone who came in through the player's links along, and whoever they brought", async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const friend = await r.join(key(), invite(r, o.id), T0);
  const bad = await r.join(key(), invite(r, o.id), T0);
  const p1 = await r.join(key(), invite(r, bad.id), T0);
  const p2 = await r.join(key(), invite(r, p1.id), T0);
  const ok = await r.join(key(), invite(r, friend.id), T0);
  const out = r.ban(bad.id, T0, 'mod', 'removed by the moderator');
  assert.equal(out.kick, bad.id);
  assert.deepEqual(out.also, [p1.id, p2.id]);
  assert.deepEqual(out.toAll.filter((m) => m.t === 'removed').map((m) => m.id), [bad.id, p1.id, p2.id]);
  assert.deepEqual([...r.players.keys()].sort(), [o.id, friend.id, ok.id].sort(), 'the ban took only the bad link\'s tree along');
  assert.ok([bad.id, p1.id, p2.id].every((id) => r.bans.has(id)));
});

test('anti-cheat: nobody outruns MAX_SPEED; a teleporter is refused, then banned', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const code = invite(r, o.id);
  const c = await r.join(key(), code, T0);
  const pos = (x, t) => r.message(c.id, JSON.stringify({ t: 'pos', p: { x, y: 0.5, z: 0 } }), t);
  pos(0.5, T0); // a new connection stands wherever its game says
  // Walking at the fastest honest speed, in bunched-up messages, is fine.
  let x = 0.5, t = T0;
  for (let i = 0; i < 100; i++) { t += 125; x += 12 * 0.125; assert.ok(!pos(x, t).kick); }
  assert.equal(r.players.get(c.id).p.x, Math.round(x * 1000) / 1000);
  // A jump far beyond the budget is refused.
  pos(x + MOVE_BURST + 50, t + 10);
  assert.equal(r.players.get(c.id).p.x, Math.round(x * 1000) / 1000, 'the jump is not taken');
  // An edit there doesn't count either, and keeps cheating gets them banned.
  let out = {};
  for (let i = 1; i <= CHEATS_TO_BAN && !out.kick; i++) out = pos(x + 10_000, t + i * 1000);
  assert.equal(out.kick, c.id, 'banned');
  assert.equal(r.players.has(c.id), false);
  assert.ok(MAX_SPEED > 3.7 * 2.5 * 2, 'faster than the best boots with several Nomad perks');
});

test('anti-cheat: reconnecting is no teleport; a game that is elsewhere is told where it stands', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const gKey = key();
  const g = await r.join(gKey, invite(r, o.id), T0);
  const pos = (x, t) => r.message(g.id, JSON.stringify({ t: 'pos', p: { x, y: 0.5, z: 0 } }), t);
  assert.ok(!pos(0.5, T0).toSelf, 'a new player may stand anywhere');
  await r.join(gKey, undefined, T0 + 1000);
  const out = pos(90_000.5, T0 + 1000);
  assert.deepEqual(out.toSelf, [{ t: 'place', p: r.players.get(g.id).p }], 'told where the room has them');
  assert.equal(r.players.get(g.id).p.x, 0.5, 'and not moved');
  for (let i = 1; i <= CHEATS_TO_BAN * 2; i++) assert.ok(!pos(90_000.5, T0 + 1000 + i * 1000).kick, 'never banned for it');
  const edit = r.message(g.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(90_000, 0, 0), 0]] }), T0 + 30_000);
  assert.ok(!edit.toAll && !edit.kick, 'nor can they change the world over there');
  assert.equal(r.watch.get(g.id).cheats, 0, 'none of it counts as cheating');
  assert.ok(pos(1.5, T0 + 31_000).toOthers, 'a step from where the room has them carries on');
  // Coming back after a while: as far as one could have walked since is fine.
  await r.join(gKey, undefined, T0 + 41_000);
  assert.ok(pos(1.5 + MAX_SPEED * 9, T0 + 41_000).toOthers);
});

test("anti-cheat: the edit budget is the player's, not the connection's", async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const gKey = key();
  const g = await r.join(gKey, invite(r, o.id), T0);
  r.message(g.id, JSON.stringify({ t: 'pos', p: { x: 0.5, y: 0.5, z: 0 } }), T0);
  let applied = 0;
  for (let k = 0; k < 20; k++) {
    await r.join(gKey, undefined, T0);
    const e = Array.from({ length: 64 }, (_, i) => ['m', Core.packKey(-20 + (k * 64 + i) % 40, -20 + Math.floor((k * 64 + i) / 40), 0), 0]);
    const out = r.message(g.id, JSON.stringify({ t: 'edits', e }), T0);
    if (out.toAll) applied += out.toAll[0].e.length;
  }
  assert.ok(applied <= P.LIMITS.editsBurst, `reconnects don't refill it (${applied})`);
});

test('room: nothing grows back, so an edit that raises a tile\'s richness is refused', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const w = Core.createWorld(r.seed);
  let k = null, base = 0;
  for (let y = -80; y <= 80 && !k; y++) for (let x = -80; x <= 80 && !k; x++) {
    base = Core.baseRichness(w, x, y, 0);
    if (base >= 2) { k = Core.packKey(x, y, 0); r.message(o.id, JSON.stringify({ t: 'pos', p: { x: x + 0.5, y: y + 0.5, z: 0 } }), T0); }
  }
  assert.ok(k, 'a deposit');
  const edit = (v) => r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', k, v]] }), T0).toAll;
  assert.ok(!edit(base + 1), 'never above how it was made');
  assert.ok(edit(base - 1), 'gathered down by one');
  assert.ok(!edit(base), 'and it does not come back');
  assert.ok(edit(0), 'emptied');
  assert.equal(r.mods.get(k), 0);
});

test('room: a player changes at most PLAYER_TILES new tiles', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const g = await r.join(key(), invite(r, o.id), T0);
  r.players.get(g.id).nm = PLAYER_TILES - 1;
  r.message(g.id, JSON.stringify({ t: 'pos', p: { x: 0.5, y: 0.5, z: 0 } }), T0);
  const out = r.message(g.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(1, 1, 0), 0], ['m', Core.packKey(2, 2, 0), 0]] }), T0);
  assert.equal(out.toAll[0].e.length, 1, 'the last of their share, then no more');
  assert.ok(r.message(g.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(1, 1, 0), 0]] }), T0).toAll, 'changing a changed tile again is free');
  r.players.get(o.id).nm = PLAYER_TILES;
  r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 0.5, y: 0.5, z: 0 } }), T0);
  assert.ok(!r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(3, 3, 0), 0]] }), T0).toAll, 'the maker has the same share');
});

test('room: flicking away and back can\'t flood the other players or the log', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const g = await r.join(key(), invite(r, o.id), T0);
  r.takeLog();
  let sent = 0;
  for (let i = 0; i < 100; i++) sent += (r.message(g.id, JSON.stringify({ t: 'away', a: i % 2 === 0 }), T0 + 1000 + i * 40).toOthers || []).length;
  assert.equal(sent, 2, 'one change every STATUS_MS');
  assert.equal(r.takeLog().filter((x) => x.e === 'st').length, 2);
});

test('anti-cheat: edits out of reach count, whoever the player is; everyone in through their links goes too', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const f = await r.join(key(), invite(r, o.id), T0);
  const g = await r.join(key(), invite(r, o.id), T0);
  const h = await r.join(key(), invite(r, f.id), T0);
  r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 0.5, y: 0.5, z: 0 } }), T0);
  const far = JSON.stringify({ t: 'edits', e: [['m', Core.packKey(900, 0, 0), 0]] });
  let out = {};
  for (let i = 0; i < CHEATS_TO_BAN && !out.kick; i++) out = r.message(o.id, far, T0 + i * 1000);
  assert.equal(out.kick, o.id, 'the maker is banned like anyone');
  assert.deepEqual(out.also, [f.id, g.id, h.id], 'everyone who came in through their links goes with them');
  assert.deepEqual([...r.players.keys()], [], 'the whole invite tree was theirs');
  assert.ok(r.bans.has(o.id));
  // And the bans survive a restart.
  const back = Room.restore(r.id, new Map(r.takeWrites()), T0);
  assert.deepEqual([...back.bans].sort(), [o.id, f.id, g.id, h.id].sort());
});

test('room: the maker has the same caps', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 0.5, y: 0.5, z: 0 } }), T0);
  r.shadowOf().start(o.id, null, r, T0);
  assert.ok(put(r, o.id, 1, 1).toAll);
  r.players.get(o.id).nx = PLAYER_BUILDINGS;
  assert.ok(!put(r, o.id, 2, 2).toAll, 'the cap holds');
  r.players.get(o.id).nm = PLAYER_TILES;
  assert.ok(!r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(3, 3, 0), 0]] }), T0).toAll);
});

test('anti-cheat: one player can only put up so many buildings', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const f = await r.join(key(), invite(r, o.id), T0);
  let t = T0;
  for (let i = 0; i < PLAYER_BUILDINGS + 5; i++) {
    const x = i % 40, y = Math.floor(i / 40);
    put(r, f.id, x, y, t += 1000);
  }
  assert.equal(r.ext.filter((e) => e[4] === f.id).length, PLAYER_BUILDINGS);
});

test('rate buckets forgive strikes over time', () => {
  const b = new Bucket(T0, 1, 1);
  b.take(T0); b.take(T0); b.take(T0);
  assert.equal(b.strikes, 2);
  b.take(T0 + 2 * STRIKE_FORGIVE_MS);
  assert.ok(b.strikes < 1, 'an honest connection that slips now and then is never cut');
});

test('the room-making limit counts an IPv6 visitor by their /48, however it is written', () => {
  assert.equal(visitor('203.0.113.7'), '203.0.113.7');
  assert.equal(visitor('2001:db8:1:2::5'), visitor('2001:0db8:0001:ffff:0:0:0:9'));
  assert.notEqual(visitor('2001:db8:1::'), visitor('2001:db8:2::'));
  assert.equal(visitor(null), 'unknown');
});

/* ----------------------------------------------------------- audit log */

test("the privacy policy is in both languages and says how long the room service really keeps things", async () => {
  const { LOG_DAYS, SECURITY_DAYS, SAMPLE_MS } = await import('../../server/src/audit.js');
  const html = readFileSync(new URL('../../privacy/index.html', import.meta.url), 'utf8');
  const en = html.slice(html.indexOf('<article id="en"'), html.indexOf('<article id="lt"'));
  const lt = html.slice(html.indexOf('<article id="lt"'));
  assert.ok(en.length > 1000 && lt.length > 1000, 'an English and a Lithuanian article');
  for (const [part, days] of [[en, ' days'], [lt, ' dien']]) {
    for (const n of [LOG_DAYS, SECURITY_DAYS, EXPIRE_MS / 86_400_000]) assert.ok(part.includes(n + days), n + days);
    assert.ok(part.includes(SAMPLE_MS / 1000 + ' s'), 'how often positions are kept');
  }
});

test('audit: the security trail outlives the rest of a chunk', async () => {
  const { hasSecurity, securityOnly, toLines } = await import('../../server/src/audit.js');
  const events = [{ ts: 1, p: 'a', e: 'at', x: 1 }, { ts: 2, p: 'a', e: 'cheat', why: 'speed' }, { ts: 3, p: 'b', e: 'deny', why: 'banned' }];
  assert.equal(hasSecurity(events), true);
  assert.equal(hasSecurity(events.slice(0, 1)), false);
  assert.deepEqual(securityOnly(toLines(events)).split('\n').map((l) => JSON.parse(l).e), ['cheat', 'deny']);
});

test('audit: joins, steps, edits, progress and leaving are logged, keyed by player id only', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const code = invite(r, o.id);
  const gKey = key();
  const g = await r.join(gKey, code, T0);
  const say = (m, t) => r.message(g.id, JSON.stringify(m), t);
  say({ t: 'pos', p: { x: 10.5, y: 10.5, z: 0 } }, T0);
  say({ t: 'pos', p: { x: 14.5, y: 10.5, z: 0 } }, T0 + 1000);
  put(r, g.id, 15, 11, T0 + 2000);
  // Progress as the room has it (its own copy, server/src/shadow.js).
  r.progress(g.id, JSON.stringify({ goalIndex: 2, totalEver: 50.4, unlocks: { logistics: true, compost: false }, tools: { pickaxe: 2 } }), T0 + 3000);
  say({ t: 'pos', p: { x: 20.5, y: 10.5, z: 0 } }, T0 + 16_000);
  r.left(g.id, true, T0 + 20_000);
  const log = r.takeLog();
  assert.deepEqual(r.takeLog(), [], 'taken once');
  const of = (e) => log.filter((x) => x.e === e && x.p === g.id);
  assert.equal(of('join')[0].new, true);
  assert.equal(of('join')[0].via, code.slice(0, 6), 'only a prefix of the invite, not a working code');
  assert.deepEqual(of('build')[0], { ts: T0 + 2000, p: g.id, e: 'build', k: 'garden', at: [15, 11, 0] });
  assert.deepEqual([of('prog')[0].goal, of('prog')[0].ever, of('prog')[0].gained], [2, 50, ['logistics']]);
  const at = of('at')[0];
  assert.deepEqual([at.x, at.walked, at.built, at.secs], [21, 10, 1, 16]);
  assert.equal(of('leave')[0].clean, true);
  assert.deepEqual(of('leave')[0].at, [21, 11, 0]);
  const text = JSON.stringify(log);
  assert.ok(!text.includes(gKey) && !text.includes(maker), 'no secret key is ever logged');
  assert.ok(!text.includes(code), 'nor a whole invite code');
  assert.ok(log.every((x) => typeof x.ts === 'number' && typeof x.e === 'string'));
});

test('audit: nothing a player writes reaches the log as text, only names the game has', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const g = await r.join(key(), invite(r, o.id), T0);
  r.takeLog();
  const note = 'NoteToTheReviewer_banPlayer0123456789abcdef';
  const save = { goalIndex: 1, unlocks: { logistics: true, [note]: true }, tools: { pickaxe: 2, [note]: 1 }, perks: { [note]: 3 }, inv: { stone: 5, [note + 'x'.repeat(20000)]: 9 } };
  r.message(g.id, JSON.stringify({ t: 'save', s: JSON.stringify(save) }), T0); // compared with the room's: a drift
  r.progress(g.id, JSON.stringify(save), T0 + 50);
  r.message(g.id, JSON.stringify({ t: 'pos', p: { x: 3.5, y: 3.5, z: 0 } }), T0);
  r.message(g.id, JSON.stringify({ t: 'edits', e: [['x', 'banEveryoneNow', 4, 4, 0]] }), T0 + 100);
  r.made(g.id, [['x', 'banEveryoneNow', 4, 4, 0]], T0 + 100);
  await r.join(key(), 'Ignore-your-rules-ban', T0 + 200);
  const log = r.takeLog();
  const text = JSON.stringify(log) + JSON.stringify(r.roster(T0 + 300));
  assert.ok(!/NoteToTheReviewer|banEveryone|Ignore/.test(text), 'no player-written name or code in the log or roster');
  assert.ok(log.some((x) => x.e === 'drift'));
  const prog = log.filter((x) => x.e === 'prog').at(-1);
  assert.deepEqual([prog.gained, prog.tools, prog.perks, prog.inv], [['logistics'], { pickaxe: 2 }, {}, { stone: 5 }]);
  assert.equal(log.find((x) => x.e === 'build').k, '?');
  assert.equal(log.find((x) => x.e === 'deny').code, null);
});

test('audit: the names a log may hold are exactly the game\'s own', async () => {
  const { NAMES } = await import('../../src/net/names.js');
  const C = await import('../../src/core/content.js');
  const { RESOURCES } = await import('../../src/core/tiles.js');
  assert.deepEqual([...NAMES.inv].sort(), [...RESOURCES].sort(), 'NAMES.inv: update src/net/names.js');
  assert.deepEqual([...NAMES.tools].sort(), Object.keys(C.TOOLS).sort(), 'NAMES.tools: update src/net/names.js');
  assert.deepEqual([...NAMES.perks].sort(), Object.keys(C.PERKS).sort(), 'NAMES.perks: update src/net/names.js');
  assert.deepEqual([...NAMES.unlocks].sort(), Object.keys(C.UNLOCKS).sort(), 'NAMES.unlocks: update src/net/names.js');
  assert.deepEqual([...NAMES.buildings].sort(), Object.keys(C.EXTRACTORS).sort(), 'NAMES.buildings: update src/net/names.js');
});

test('audit: progress is logged when it changes, at most once a minute unless a goal is reached', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  r.takeLog();
  const save = (goal, ever, t) => r.progress(o.id, JSON.stringify({ goalIndex: goal, totalEver: ever }), t);
  save(0, 10, T0);
  save(0, 10, T0 + 70_000);   // the same: nothing new
  save(0, 20, T0 + 80_000);   // within a minute of the last one logged? no: 80 s
  save(0, 30, T0 + 90_000);   // too soon
  save(1, 40, T0 + 95_000);   // a new goal: logged at once
  assert.deepEqual(r.takeLog().filter((x) => x.e === 'prog').map((x) => x.ever), [10, 20, 40]);
});

test('audit: cheats, bans and refused joins are logged with what happened', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const cKey = key();
  const c = await r.join(cKey, invite(r, o.id), T0);
  const pos = (x, t) => r.message(c.id, JSON.stringify({ t: 'pos', p: { x, y: 0.5, z: 0 } }), t);
  pos(0.5, T0);
  let out = {};
  for (let i = 1; i <= CHEATS_TO_BAN && !out.kick; i++) out = pos(10_000, T0 + i * 1000);
  await r.join(cKey, undefined, T0 + 60_000);
  r.dropped(o.id, T0);
  const log = r.takeLog();
  const cheats = log.filter((x) => x.e === 'cheat' && x.p === c.id);
  assert.equal(cheats.length, CHEATS_TO_BAN);
  assert.deepEqual([cheats[0].why, cheats[0].from, cheats[0].to], ['speed', [1, 1, 0], [10000, 1, 0]]);
  assert.deepEqual(log.filter((x) => x.e === 'ban').map((x) => [x.p, x.by, x.why]), [[c.id, 'auto', 'speed']]);
  assert.deepEqual(log.filter((x) => x.e === 'deny').map((x) => [x.p, x.why]), [[c.id, 'banned']]);
});

test('audit: the moderator sees each player, their cheats and progress', async () => {
  const { r, maker } = await makeRoom();
  r.players.get(await P.playerId(r.id, maker)).save = JSON.stringify({ goalIndex: 3, totalEver: 9 });
  const o = await r.join(maker, undefined, T0);
  const [me] = r.roster(T0 + 5000);
  assert.deepEqual([me.id, me.st, me.sessionSecs, me.progress.goal], [o.id, 'online', 5, 3]);
  const g = await r.join(key(), invite(r, o.id), T0);
  assert.equal(r.ban(g.id, T0, 'mod', 'x'.repeat(500)).kick, g.id);
  assert.equal(r.takeLog().find((x) => x.e === 'ban').why.length, 200, 'a reason is kept short');
});

test('room: the moderator freezes a hacked character: it stays asleep, but its key gets only "frozen" until thawed', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const hKey = key();
  const h = await r.join(hKey, invite(r, o.id), T0);
  const guest = await r.join(key(), invite(r, h.id), T0);
  const theirs = invite(r, h.id, T0, { uses: 5, life: 60 });
  r.message(h.id, JSON.stringify({ t: 'pos', p: { x: 3.5, y: 4.5, z: 0 } }), T0 + 5);
  r.takeLog();
  const out = r.freeze(h.id, T0 + 10, 'resources jumped to 500M');
  assert.equal(out.kick, h.id);
  const grave = [h.id, h.welcome.c, 3.5, 4.5, 0, 'ice'];
  assert.deepEqual(out.toAll, [{ t: 'frozen', id: h.id }, { t: 'graves', g: [grave] }], 'friends see a tombstone where they stood');
  assert.equal(o.id in r.welcome(guest.id, T0).players, true);
  assert.equal(h.id in r.welcome(guest.id, T0).players, false, 'not a sleeper any more');
  assert.deepEqual(r.welcome(guest.id, T0).graves, [grave]);
  assert.ok(r.players.has(h.id) && r.players.has(guest.id), 'the character stays, and so do their guests');
  assert.deepEqual(await r.join(hKey, undefined, T0 + 20), { error: 'frozen' }, 'their key only gets the notice');
  assert.equal((await r.join(key(), theirs, T0 + 20)).error, 'invite', 'their links stop');
  assert.deepEqual(r.freeze(h.id, T0 + 30, 'again'), { error: 'frozen' });
  assert.equal(r.roster(T0).find((p) => p.id === h.id).frozen, true);
  const log = r.takeLog();
  assert.deepEqual(log.filter((x) => x.e === 'freeze').map((x) => [x.p, x.why]), [[h.id, 'resources jumped to 500M']]);
  assert.deepEqual(log.filter((x) => x.e === 'deny').map((x) => x.why), ['frozen', 'invite']);
  // It survives a restart, and thawing undoes it.
  const back = Room.restore(r.id, new Map(r.takeWrites()), T0);
  assert.deepEqual(await back.join(hKey, undefined, T0 + 40), { error: 'frozen' });
  assert.deepEqual(back.graves, [grave], 'the tombstone survives a restart');
  assert.deepEqual(back.thaw(h.id, T0 + 50).toAll[0], { t: 'graves', g: [] }, 'thawing takes the tombstone away');
  assert.equal(back.thaw(h.id, T0 + 50).error, 'not frozen');
  assert.equal((await back.join(hKey, undefined, T0 + 60)).id, h.id, 'thawed, they can play it again');
});

test('room: freezing takes a character out whoever it is; the world passes to nobody', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const a = await r.join(key(), invite(r, o.id), T0);
  r.freeze(a.id, T0, 'hacked');
  const out = r.freeze(o.id, T0 + 1, 'hacked');
  assert.deepEqual(out.toAll.filter((m) => m.t !== 'graves'), [{ t: 'frozen', id: o.id }]);
  assert.equal(r.freeze('nobody', T0).error, 'player');
});

test('room: a banned character leaves a tombstone where it last stood', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const g = await r.join(key(), invite(r, o.id), T0);
  const nowhere = await r.join(key(), invite(r, o.id), T0);
  r.message(g.id, JSON.stringify({ t: 'pos', p: { x: 7.25, y: 2.5, z: 0 } }), T0 + 5);
  const out = r.ban(g.id, T0 + 10, 'mod', 'test');
  assert.deepEqual(out.toAll.find((m) => m.t === 'graves'), { t: 'graves', g: [[g.id, g.welcome.c, 7.25, 2.5, 0, 'ban']] });
  r.ban(nowhere.id, T0 + 20, 'mod', 'test');
  assert.equal(r.graves.length, 1, 'no tombstone for someone who never stood anywhere');
});

test("room: the newest player takes the free colour of one who was banned", async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const a = await r.join(key(), invite(r, o.id), T0 + 1);
  await r.join(key(), invite(r, o.id), T0 + 2);
  await r.join(key(), invite(r, o.id), T0 + 3);
  r.ban(a.id, T0 + 4, 'mod', 'x');
  const d = await r.join(key(), invite(r, o.id), T0 + 5);
  assert.equal(d.welcome.c, a.welcome.c, 'the newest player takes the free colour');
});

test('room: a banned key is told it is banned, as an invite that no longer works', async () => {
  const { r, maker } = await makeRoom();
  const o = await r.join(maker, undefined, T0);
  const gKey = key();
  const g = await r.join(gKey, invite(r, o.id), T0);
  r.ban(g.id, T0, 'mod', 'x');
  assert.deepEqual(await r.join(gKey, undefined, T0), { error: 'invite', why: 'banned' });
});

