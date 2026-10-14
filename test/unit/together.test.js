/* Playing together: the wire format's checks (src/net/protocol.js), the
 * room's rules (server/src/room.js) and the shared world in the core
 * (src/core/shared.js). Most of these are the security rules: a room must
 * hold whatever a hostile player throws at it. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket, editBucket, LOST_TO_OFFLINE_MS, INVITE_MS, EXPIRE_MS } from '../../server/src/room.js';
import * as Core from '../../src/core/index.js';

const key = () => P.randomHex(32);
const T0 = 1_700_000_000_000;

async function makeRoom(extra = {}) {
  const r = new Room(P.randomRoomId(), T0);
  const owner = key();
  const err = await r.init(JSON.stringify({ t: 'create', key: owner, world: { seed: 42, mods: [], props: [], ext: [['garden', 3, 3, 0]] }, pos: { x: 0.5, y: 0.5, z: 0 }, ...extra }), T0);
  assert.equal(err, null);
  return { r, owner };
}

// A fresh invite code, as the room hands one out to `id`.
function invite(r, id, now = T0) {
  return r.message(id, JSON.stringify({ t: 'invite' }), now).toSelf[0].code;
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
  assert.deepEqual(p, { x: 1.235, y: 2, z: -3, fx: 1, fy: -1, m: false, sign: true, dev: 'phone' });
  assert.equal(P.cleanPos({ x: 0, y: 0, z: 0, dev: 'toaster' }).dev, null);
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

test('room: made once from a valid world; the creator owns its buildings', async () => {
  const { r, owner } = await makeRoom();
  assert.equal(r.ext[0][4], r.owner);
  assert.equal(r.owner, await P.playerId(r.id, owner));
  assert.equal(await r.init(JSON.stringify({ t: 'create', key: key(), world: { seed: 1 } }), T0), 'exists');
  const fresh = new Room(P.randomRoomId(), T0);
  assert.equal(await fresh.init('{"t":"create","key":"short","world":{"seed":1}}', T0), 'bad');
  assert.equal(await fresh.init(JSON.stringify({ t: 'create', key: key(), world: { seed: 1 }, save: 'not json' }), T0), 'bad');
});

test('room: new players need a live invite; members come back with their key', async () => {
  const { r, owner } = await makeRoom();
  const o = await r.join(owner, undefined, T0);
  assert.equal(o.id, r.owner, 'the owner needs no invite');
  assert.equal((await r.join(key(), undefined, T0)).error, 'invite');
  assert.equal((await r.join(key(), 'A'.repeat(22), T0)).error, 'invite');
  const code = invite(r, o.id);
  assert.equal((await r.join(key(), code, T0 + INVITE_MS + 1)).error, 'invite', 'invites expire');
  const friendKey = key();
  const f = await r.join(friendKey, code, T0 + 1000);
  assert.ok(f.id && f.welcome.you === f.id);
  assert.equal(f.welcome.save, null);
  assert.equal(JSON.stringify(f.welcome).includes(friendKey), false, 'the key never comes back');
  // Back later, long after the invite: the key alone is enough.
  assert.equal((await r.join(friendKey, undefined, T0 + 10 * INVITE_MS)).id, f.id);
  // Putting the sign down ends that invite at once.
  const code2 = invite(r, o.id);
  r.message(o.id, JSON.stringify({ t: 'uninvite', code: code2 }), T0);
  assert.equal((await r.join(key(), code2, T0)).error, 'invite');
});

test('room: holds at most four players', async () => {
  const { r, owner } = await makeRoom();
  const o = await r.join(owner, undefined, T0);
  for (let i = 0; i < 3; i++) assert.ok((await r.join(key(), invite(r, o.id), T0)).id);
  assert.equal((await r.join(key(), invite(r, o.id), T0)).error, 'full');
  assert.equal(r.players.size, P.LIMITS.players);
  assert.equal(new Set([...r.players.values()].map((p) => p.c)).size, 4, 'everyone gets their own colour');
});

test('room: edits are checked, owned by the sender, near the sender, and budgeted', async () => {
  const { r, owner } = await makeRoom();
  const o = await r.join(owner, undefined, T0);
  const f = await r.join(key(), invite(r, o.id), T0);
  const msg = (e) => JSON.stringify({ t: 'edits', e });
  // No position yet: nothing applies.
  assert.deepEqual(r.message(f.id, msg([['m', Core.packKey(1, 1, 0), 0]]), T0), {});
  r.message(f.id, JSON.stringify({ t: 'pos', p: { x: 10.5, y: 10.5, z: 0 } }), T0);
  const near = Core.packKey(12, 9, 0), far = Core.packKey(500, 9, 0), below = Core.packKey(12, 9, -1);
  const out = r.message(f.id, msg([['m', near, 0], ['m', far, 0], ['m', below, 0], ['x', 'garden', 11, 11, 0, r.owner]]), T0);
  assert.deepEqual(out.toAll[0].e, [['m', near, 0], ['x', 'garden', 11, 11, 0, f.id]], 'far, other-layer and spoofed-owner edits are fixed or dropped');
  assert.equal(r.mods.has(far), false);
  // A building can't go where one stands.
  assert.deepEqual(r.message(f.id, msg([['x', 'garden', 11, 11, 0]]), T0), {});
  assert.equal(r.message(f.id, msg([['m', near, 0, 'extra']]), T0).drop, true);
  // The edit budget: a flood is cut off.
  const budget = editBucket(T0);
  let refused = 0;
  for (let i = 0; i < 20; i++) if (r.message(f.id, msg(Array(64).fill(['m', near, 1])), T0, budget).drop) refused++;
  assert.ok(refused >= 13, 'only the burst gets through at once');
});

test('room: only your own progress is big; anything else oversized is dropped', async () => {
  const { r, owner } = await makeRoom();
  const o = await r.join(owner, undefined, T0);
  const big = JSON.stringify({ stuff: 'x'.repeat(30000) });
  assert.deepEqual(r.message(o.id, JSON.stringify({ t: 'save', s: big }), T0), {});
  assert.equal(r.players.get(o.id).save, big);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 1, y: 1, z: 0 }, pad: 'x'.repeat(20000) }), T0).drop, true);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'save', s: 'x'.repeat(P.LIMITS.saveBytes + 10) }), T0).drop, true);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'save', s: '[1,2]' }), T0).drop, true);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'whatever' }), T0).drop, true);
});

test('room: only the owner removes players, never themselves', async () => {
  const { r, owner } = await makeRoom();
  const o = await r.join(owner, undefined, T0);
  const fKey = key();
  const f = await r.join(fKey, invite(r, o.id), T0);
  assert.equal(r.message(f.id, JSON.stringify({ t: 'remove', id: o.id }), T0).drop, true);
  assert.equal(r.message(o.id, JSON.stringify({ t: 'remove', id: o.id }), T0).drop, true);
  const out = r.message(o.id, JSON.stringify({ t: 'remove', id: f.id }), T0);
  assert.equal(out.kick, f.id);
  assert.equal(r.players.has(f.id), false);
  assert.equal((await r.join(fKey, undefined, T0)).error, 'invite', 'removed means a new invite is needed');
});

test('room: lost connections turn offline after a minute; clean leaves at once', async () => {
  const { r, owner } = await makeRoom();
  const o = await r.join(owner, undefined, T0);
  assert.equal(r.left(o.id, false, T0).st, 'lost');
  assert.deepEqual(r.expireLost(T0 + 1000), []);
  assert.equal(r.nextLostDeadline(), T0 + LOST_TO_OFFLINE_MS);
  assert.equal(r.expireLost(T0 + LOST_TO_OFFLINE_MS)[0].st, 'offline');
  await r.join(owner, undefined, T0);
  assert.equal(r.left(o.id, true, T0).st, 'offline');
  assert.equal(r.expired(T0 + EXPIRE_MS - 1), false);
  assert.equal(r.expired(T0 + EXPIRE_MS), true);
});

test('room: what it writes to storage brings it back the same', async () => {
  const { r, owner } = await makeRoom();
  const o = await r.join(owner, undefined, T0);
  r.message(o.id, JSON.stringify({ t: 'pos', p: { x: 1.5, y: 1.5, z: 0 } }), T0);
  r.message(o.id, JSON.stringify({ t: 'edits', e: [['m', Core.packKey(2, 2, 0), 1], ['p', Core.packKey(1, 1, 0), 'glowcap']] }), T0);
  const code = invite(r, o.id);
  const stored = new Map([['id', r.id], ...r.takeWrites()]);
  assert.equal(r.isDirty, false);
  const back = Room.restore(r.id, stored, T0);
  assert.deepEqual([...back.mods], [...r.mods]);
  assert.deepEqual([...back.props], [...r.props]);
  assert.deepEqual(back.ext, r.ext);
  assert.equal(back.owner, r.owner);
  assert.equal(back.invites.get(code), r.invites.get(code));
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
  const welcome = { you: me, owner: me, seed: world.seed, mods: world.mods, props: world.props, ext: world.ext.map((e) => [...e, me]), save: Core.progressOf(s) };
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
  assert.deepEqual(s.player, near);
  assert.equal(s.underground.deepest, -2);
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
