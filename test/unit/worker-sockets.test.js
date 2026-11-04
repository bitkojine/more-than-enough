/* The room's front door (server/src/worker.js Rooms): who may open a socket,
 * what a socket must say first, how one that floods or sends rubbish is cut
 * off, who hears what, and what a closed connection leaves behind. These are
 * the limits that keep one visitor from filling a room or drowning it in
 * messages; mutation sweep 1 found most of them unchecked (worker.js 23 %). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { NEAR, Bucket } from '../../server/src/room.js';
import {
  install,
  now,
  makeRoom,
  stranger,
  join,
  say,
  idOf,
  twoPlayers,
  knock,
  start,
  Rooms
} from '../support/room-object.js';

install(test.after);

/* ------------------------------------------------------------ fetch */

test('worker door: a socket for another room, or no room, is not found', async () => {
  const g = await makeRoom();
  assert.equal((await knock(g, { id: P.randomRoomId() })).status, 404);
  assert.equal((await knock(g, { id: null })).status, 404);
  g.room.room.ready = false;
  assert.equal((await knock(g)).status, 404);
  assert.equal(g.room.ctx.sockets.size, 0);
});

test('worker door: a socket is let in as a stranger and must say hello within 5 s', async () => {
  const g = await makeRoom();
  g.storage.alarm = null;
  const res = await knock(g, { visitor: 'v1' });
  assert.equal(res.status, 101);
  assert.ok(res.webSocket?.client);
  const [ws] = g.room.ctx.sockets;
  assert.deepEqual(ws.deserializeAttachment(), { id: null, at: now.t, v: 'v1' });
  assert.ok(g.storage.alarm <= now.t + 5000, 'an alarm comes to close it if it says nothing');
  await knock(g, { visitor: null });
  assert.equal([...g.room.ctx.sockets][1].deserializeAttachment().v, '');
});

test('worker door: one visitor holds at most 3 strangers and 8 sockets; others still get in', async () => {
  const g = await makeRoom();
  for (let i = 0; i < 2; i++) stranger(g, 'v1');
  assert.equal((await knock(g, { visitor: 'v1' })).status, 101, 'a third stranger');
  assert.equal((await knock(g, { visitor: 'v1' })).status, 429, 'a fourth');
  assert.equal((await knock(g, { visitor: 'v2' })).status, 101, 'someone else');

  const h = await makeRoom();
  for (let i = 0; i < 7; i++)
    stranger(h, 'v1').serializeAttachment({ id: 'p' + i, at: 0, v: 'v1' });
  assert.equal((await knock(h, { visitor: 'v1' })).status, 101, 'an eighth socket');
  [...h.room.ctx.sockets].at(-1).serializeAttachment({ id: 'p7', at: 0, v: 'v1' });
  assert.equal((await knock(h, { visitor: 'v1' })).status, 429, 'a ninth');
  assert.equal((await knock(h, { visitor: 'v2' })).status, 101);
});

test('worker door: a room takes at most twice its players in sockets', async () => {
  const g = await makeRoom();
  const max = P.LIMITS.players * 2;
  for (let i = 0; i < max - 1; i++) stranger(g, 'v' + i);
  assert.equal((await knock(g, { visitor: 'new1' })).status, 101);
  assert.equal((await knock(g, { visitor: 'new2' })).status, 429);
  assert.equal(g.room.ctx.sockets.size, max);
});

test('worker door: a room made before the registry adds itself when visited, a copy never', async () => {
  const g = await makeRoom();
  g.env.rooms.clear();
  g.room.registered = false;
  await knock(g);
  assert.ok(g.env.rooms.has(g.id));
  assert.equal(g.room.registered, true);

  const c = await makeRoom();
  c.env.rooms.clear();
  c.room.registered = false;
  c.room.room.copy = { as: 'x', key: 'x', until: now.t + 3600_000 };
  assert.equal((await knock(c)).status, 101);
  assert.equal(c.env.rooms.size, 0, 'a copy is nobody’s world');
});

/* ------------------------------------------------------------ hello */

test('worker hello: anything but a short hello closes the socket', async () => {
  const g = await makeRoom();
  for (const raw of ['not json', '{"t":"pos"}', 'null']) {
    const ws = stranger(g);
    await say(g, ws, raw);
    assert.deepEqual(ws.closed, { code: 1008, reason: 'hello first' }, raw);
  }
  const hello = (len) => {
    const base = JSON.stringify({ t: 'hello', key: g.key, pad: '' });
    return JSON.stringify({ t: 'hello', key: g.key, pad: 'x'.repeat(len - base.length) });
  };
  const long = stranger(g);
  await say(g, long, hello(257));
  assert.equal(long.closed?.reason, 'hello first', 'over 256 characters');
  const ok = stranger(g);
  await say(g, ok, hello(256));
  assert.equal(ok.closed, null);
  assert.equal(ok.got('welcome').length, 1, 'exactly 256 is fine');
});

test('worker hello: a refused hello is told why, then closed', async () => {
  const g = await makeRoom();
  const bad = await join(g, 'nope');
  assert.deepEqual(bad.sent, [{ t: 'bad' }]);
  assert.deepEqual(bad.closed, { code: 1008, reason: 'bad' });
  const stranger1 = await join(g, P.randomHex(32));
  assert.deepEqual(stranger1.sent, [{ t: 'invite' }], 'no link: no why');
  assert.equal(stranger1.closed?.reason, 'invite');
  g.r.invites.set('A'.repeat(22), { by: 'x', made: 0, until: 1, uses: 0, max: 3 });
  const late = await join(g, P.randomHex(32), 'A'.repeat(22));
  assert.equal(late.sent[0].t, 'invite');
  assert.equal(typeof late.sent[0].why, 'string', 'a dead link says why');
});

test('worker hello: the welcome goes to the socket, its status to everyone else', async () => {
  const g = await twoPlayers();
  const { a, b } = g;
  const id = idOf(a);
  assert.deepEqual(a.deserializeAttachment(), { id, at: now.t, v: 'test' });
  assert.equal(a.got('welcome').length, 1);
  const st = a.got('status').find((m) => m.id === idOf(b));
  assert.equal(st?.st, 'online', 'the creator hears the friend arrive');
  assert.equal(b.got('status').filter((m) => m.id === idOf(b)).length, 0, 'not about yourself');
});

test('worker hello: a newer connection replaces the old one, nobody else', async () => {
  const g = await twoPlayers();
  const creator = idOf(g.a);
  const again = await join(g);
  assert.deepEqual(g.a.closed, { code: 4001, reason: 'replaced' });
  assert.deepEqual(g.a.deserializeAttachment(), { id: null, at: 0, replaced: true });
  assert.equal(g.b.closed, null);
  assert.equal(idOf(again), creator);
  assert.equal(g.r.players.get(creator).st, 'online');
});

test('worker hello: only away: true turns on making while away; saying nothing keeps it', async () => {
  const g = await makeRoom();
  const ws = await join(g, g.key, undefined, { away: true });
  const pl = g.r.players.get(idOf(ws));
  assert.equal(pl.awayProduce, true);
  await join(g, g.key, undefined, {});
  assert.equal(pl.awayProduce, true, 'an older game says nothing');
  await join(g, g.key, undefined, { away: 1 });
  assert.equal(pl.awayProduce, false, 'only true counts');
});

/* --------------------------------------------------- flood and rubbish */

test('worker flood: 60 messages at once pass, then each is dropped, and the 121st cuts', async () => {
  const g = await makeRoom();
  const ws = await join(g); // the hello is the first of the 60
  const id = idOf(ws);
  const before = g.r.acts.get(id).drops;
  for (let i = 0; i < 59; i++) await say(g, ws, { t: 'invites' });
  assert.equal(ws.got('invites').length, 59);
  for (let i = 0; i < 60; i++) await say(g, ws, { t: 'invites' });
  assert.equal(ws.got('invites').length, 59, 'over the burst: dropped');
  assert.equal(g.r.acts.get(id).drops - before, 60, 'and counted');
  assert.equal(ws.closed, null, '60 strikes are forgiven');
  await say(g, ws, { t: 'invites' });
  assert.deepEqual(ws.closed, { code: 1008, reason: 'too fast' });
  assert.ok(g.r.log.some((e) => e.e === 'cut' && e.p === id && e.why === 'too fast'));
});

test('worker flood: a stranger that floods is cut without a log line', async () => {
  const g = await makeRoom();
  const ws = stranger(g);
  const bucket = new Bucket(now.t);
  g.room.buckets.set(ws, bucket);
  bucket.tokens = 0;
  bucket.strikes = 60;
  await say(g, ws, { t: 'hello', key: g.key });
  assert.equal(ws.closed?.reason, 'too fast');
  assert.ok(!g.r.log.some((e) => e.e === 'cut'));
});

test('worker rubbish: twelve bad messages are borne, the thirteenth cuts', async () => {
  const g = await makeRoom();
  const ws = await join(g);
  const id = idOf(ws);
  const before = g.r.acts.get(id).drops;
  for (let i = 0; i < 12; i++) await say(g, ws, { t: 'no such thing' });
  assert.equal(ws.closed, null);
  assert.equal(g.r.acts.get(id).drops - before, 12);
  await say(g, ws, '{"t":');
  assert.deepEqual(ws.closed, { code: 1008, reason: 'bad messages' });
  assert.ok(g.r.log.some((e) => e.e === 'cut' && e.why === 'bad messages'));
});

test('worker rubbish: anything but text closes the socket', async () => {
  const g = await makeRoom();
  const ws = await join(g);
  await g.room.webSocketMessage(ws, new ArrayBuffer(4));
  assert.deepEqual(ws.closed, { code: 1003, reason: 'text only' });
});

/* ------------------------------------------------------- who hears what */

test('worker send: steps reach only players near enough, on the same layer', async () => {
  const g = await twoPlayers();
  const others = [];
  const at = { x: 100, y: 100, z: 0 };
  const place = [
    ['same spot', at, true],
    ['NEAR away', { x: 100 + NEAR, y: 100 - NEAR, z: 0 }, true],
    ['just over in x', { x: 100 + NEAR + 0.01, y: 100, z: 0 }, false],
    ['just over in y', { x: 100, y: 100 - NEAR - 0.01, z: 0 }, false],
    ['another layer', { x: 100, y: 100, z: 1 }, false],
    ['nowhere yet', null, false]
  ];
  for (const [name, p] of place) {
    const id = 'n' + others.length;
    const ws = stranger(g);
    ws.serializeAttachment({ id, at: 0 });
    g.r.players.set(id, { c: 9, st: 'online', p });
    others.push([name, ws]);
  }
  g.room.send({ t: 'pos', id: 'q' }, idOf(g.a), at);
  for (const [i, [name, ws]] of others.entries())
    assert.equal(ws.got('pos').length, place[i][2] ? 1 : 0, name);
  assert.equal(g.a.got('pos').length, 0, 'not to the one who moved');
  g.room.send({ t: 'pos', id: 'q' }, idOf(g.a));
  assert.equal(others.at(-1)[1].got('pos').length, 1, 'without `near`, everyone');
});

test('worker send: a socket that closed mid-send does not stop the rest', async () => {
  const g = await twoPlayers();
  g.a.send = () => {
    throw new Error('closed');
  };
  g.room.send({ t: 'x' }, null);
  assert.equal(g.b.got('x').length, 1);
});

/* ------------------------------------------------------ leaving */

test('worker close: only a clean "bye" means offline; anything else is lost', async () => {
  for (const [code, reason, st] of [
    [1000, 'bye', 'offline'],
    [1000, 'gone', 'lost'],
    [1001, 'bye', 'lost']
  ]) {
    const g = await twoPlayers();
    const id = idOf(g.b);
    g.b.close(code, reason);
    await g.room.webSocketClose(g.b, code, reason);
    assert.equal(g.r.players.get(id).st, st, `${code} ${reason}`);
    assert.equal(g.a.got('status').at(-1).st, st, 'the others are told');
    assert.equal(g.room.buckets.has(g.b), false);
  }
  const g = await twoPlayers();
  const id = idOf(g.b);
  await g.room.webSocketError(g.b);
  assert.equal(g.r.players.get(id).st, 'lost');
});

test('worker close: the log is written when the last player goes, not before', async () => {
  const g = await twoPlayers();
  const rows = () => g.storage.sql.exec('SELECT COUNT(*) AS n FROM audit').one().n;
  const written = rows();
  g.b.close(1000, 'bye');
  await g.room.webSocketClose(g.b, 1000, 'bye');
  assert.equal(rows(), written, 'someone is still here');
  assert.ok(g.r.log.length > 0);
  g.a.close(1000, 'bye');
  await g.room.webSocketClose(g.a, 1000, 'bye');
  assert.equal(rows(), written + 1);
  assert.equal(g.r.log.length, 0);
});

test('worker close: a socket that never said hello leaves nothing behind', async () => {
  const g = await makeRoom();
  const ws = stranger(g);
  const before = [...g.r.players.values()].map((p) => p.st);
  await g.room.webSocketClose(ws, 1006, '');
  assert.deepEqual(
    [...g.r.players.values()].map((p) => p.st),
    before
  );
});

test('worker restart: a player whose socket slept through it is still online', async () => {
  const g = await twoPlayers();
  await g.room.alarm();
  const kept = new Set([g.a]); // the runtime kept a's socket, b's is gone
  const again = await start(Rooms, g.storage, g.env, kept);
  assert.equal(again.room.players.get(idOf(g.a)).st, 'online');
  assert.equal(again.room.players.get(idOf(g.b)).st, 'lost');
});
