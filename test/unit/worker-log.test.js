/* What the room's Durable Object (server/src/worker.js Rooms) keeps and
 * when: the audit log (written in chunks, 14 days of play and 90 of the
 * security trail, exported page by page), the one alarm that wakes it,
 * and what the moderator's calls change and write. Mutation sweep 1 found
 * most of this unchecked (worker.js 23 %): a bug here deletes the security
 * trail early, never writes the log, or lets a room sleep with unsaved play. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOG_FLUSH_EVENTS, LOG_FLUSH_MS } from '../../server/src/audit.js';
import { LOST_TO_OFFLINE_MS } from '../../server/src/room.js';
import {
  install,
  now,
  makeRoom,
  stranger,
  join,
  idOf,
  twoPlayers,
  start,
  Rooms,
  Storage,
  makeEnv
} from '../support/room-object.js';

install(test.after);

const DAY = 24 * 3600_000;
const HOUR = 3600_000;
const rows = (g) =>
  g.storage.sql
    .exec('SELECT rowid AS r, ts, lines, sec, trimmed FROM audit ORDER BY rowid')
    .toArray();
const event = (ts, e = 'join') => ({ ts, p: null, e });
const line = (ts, e = 'join') => JSON.stringify(event(ts, e));
const insert = (g, ts, lines, sec = 0) =>
  g.storage.sql.exec('INSERT INTO audit (ts, lines, sec) VALUES (?, ?, ?)', ts, lines, sec);

// A room with nothing waiting, its log already written once (so pruning is
// due again only an hour later).
async function quietRoom() {
  const g = await makeRoom();
  await g.room.persist();
  await g.room.flushLog(now.t, true);
  g.storage.sql.exec('DELETE FROM audit');
  return g;
}

/* ------------------------------------------------------------- log */

test('worker log: events wait for 30 s or 500 of them, unless forced', async () => {
  const g = await quietRoom();
  const t0 = now.t;
  for (let i = 1; i < LOG_FLUSH_EVENTS; i++) g.r.log.push(event(t0));
  await g.room.flushLog(t0 + LOG_FLUSH_MS - 1);
  assert.equal(rows(g).length, 0, '499 events, 29.999 s: they wait');
  g.r.log.push(event(t0));
  await g.room.flushLog(t0);
  assert.equal(rows(g).length, 1, 'the 500th writes them');
  assert.equal(rows(g)[0].lines.split('\n').length, LOG_FLUSH_EVENTS);
  assert.equal(g.r.log.length, 0);

  g.r.log.push(event(t0 + 5));
  await g.room.flushLog(t0 + 5 + LOG_FLUSH_MS);
  assert.equal(rows(g).length, 2, 'the oldest waited 30 s');
  assert.equal(rows(g)[1].ts, t0 + 5, 'a chunk is stamped with its first event');

  g.r.log.push(event(t0 + 10));
  await g.room.flushLog(t0 + 10, true);
  assert.equal(rows(g).length, 3, 'forced');
  await g.room.flushLog(t0 + 10, true);
  assert.equal(rows(g).length, 3, 'nothing waiting: nothing written');
});

test('worker log: a chunk with a security event is marked so', async () => {
  const g = await quietRoom();
  g.r.log.push(event(now.t, 'join'));
  await g.room.flushLog(now.t, true);
  g.r.log.push(event(now.t, 'join'), event(now.t, 'cheat'));
  await g.room.flushLog(now.t, true);
  assert.deepEqual(
    rows(g).map((r) => r.sec),
    [0, 1]
  );
});

test('worker log: play is kept 14 days, the security trail 90, trimmed to itself', async () => {
  const g = await quietRoom();
  const t = now.t + HOUR;
  const mixed = [line(1, 'join'), line(2, 'cheat'), line(3, 'pos')].join('\n');
  insert(g, t - 14 * DAY + 1, line(1)); // a: kept
  insert(g, t - 14 * DAY - 1, line(1)); // b: play, too old
  insert(g, t - 14 * DAY - 1, mixed, 1); // c: security, keeps its trail
  insert(g, t - 14 * DAY + 1, mixed, 1); // d: security, young: whole
  insert(g, t - 90 * DAY + 1, mixed, 1); // e: security, almost 90 days
  insert(g, t - 90 * DAY - 1, mixed, 1); // f: security, too old
  g.room.prunedAt = t - HOUR + 1;
  await g.room.flushLog(t);
  assert.equal(rows(g).length, 6, 'pruned at most once an hour');
  g.room.prunedAt = t - HOUR;
  await g.room.flushLog(t);
  const left = rows(g);
  assert.deepEqual(
    left.map((r) => r.r),
    [1, 3, 4, 5]
  );
  const by = Object.fromEntries(left.map((r) => [r.r, r]));
  assert.equal(by[1].lines, line(1));
  assert.equal(by[3].lines, line(2, 'cheat'), 'only the trail is left of an old chunk');
  assert.equal(by[3].trimmed, 1);
  assert.equal(by[4].lines, mixed, 'a young chunk is whole');
  assert.equal(by[4].trimmed, 0);
  assert.equal(by[5].lines, line(2, 'cheat'));
  assert.equal(g.room.prunedAt, t);
});

test('worker log: an audit table from before sec and trimmed gains them', async () => {
  const storage = new Storage();
  storage.db.exec('CREATE TABLE audit (ts INTEGER NOT NULL, lines TEXT NOT NULL)');
  storage.db.exec(`INSERT INTO audit (ts, lines) VALUES (1, 'x')`);
  await start(Rooms, storage, makeEnv());
  const cols = storage.db
    .prepare('PRAGMA table_info(audit)')
    .all()
    .map((c) => c.name);
  assert.deepEqual(cols, ['ts', 'lines', 'sec', 'trimmed']);
  assert.deepEqual(
    { ...storage.db.prepare('SELECT sec, trimmed FROM audit').get() },
    {
      sec: 0,
      trimmed: 0
    }
  );
  await start(Rooms, storage, makeEnv()); // and starting again is fine
});

test('worker log: an export starts with the room, then every event from `since` on', async () => {
  const g = await quietRoom();
  insert(g, 100, [line(100), line(150), line(200)].join('\n'));
  insert(g, 300, [line(300), line(400)].join('\n'));
  g.r.log.push(event(500, 'cheat')); // waiting: an export writes it first
  const out = (await g.room.exportLog(g.id, 150)).split('\n');
  assert.equal(out.at(-1), '', 'ends with a newline');
  const [head, ...events] = out.slice(0, -1).map((l) => JSON.parse(l));
  assert.equal(head.e, 'room');
  assert.equal(head.id, g.id);
  assert.equal(head.since, 150);
  assert.equal(head.now, now.t);
  assert.deepEqual(
    events.map((e) => e.ts),
    [150, 200, 300, 400, 500],
    'from inside the chunk that holds `since`'
  );
  assert.equal(g.r.log.length, 0);
  assert.equal(await g.room.exportLog('another', 0), null);
});

test('worker log: an export reads 500 chunks, then says where to go on', async () => {
  const g = await quietRoom();
  for (let i = 1; i <= 500; i++) insert(g, i * 10, line(i * 10));
  let out = (await g.room.exportLog(g.id, 0)).trim().split('\n');
  assert.equal(out.length, 501, 'exactly 500: no more to fetch');
  insert(g, 5010, line(5010));
  out = (await g.room.exportLog(g.id, 0)).trim().split('\n');
  assert.equal(out.length, 502);
  assert.deepEqual(JSON.parse(out.at(-1)), { e: 'more', since: 5001 });
  out = (await g.room.exportLog(g.id, 5001)).trim().split('\n');
  assert.deepEqual(
    out.slice(1).map((l) => JSON.parse(l).ts),
    [5010]
  );
});

/* ----------------------------------------------------------- alarm */

test('worker alarm: wakes at the soonest of everything that waits, never later', async () => {
  const g = await quietRoom();
  const at = async () => {
    g.storage.alarm = null;
    await g.room.schedule();
    return g.storage.alarm - now.t;
  };
  assert.equal(await at(), DAY, 'nothing waits: once a day');
  g.r.touch(now.t);
  assert.equal(await at(), 2000, 'unsaved play: 2 s');
  await g.room.persist();
  g.r.log.push(event(now.t - 10_000));
  assert.equal(await at(), LOG_FLUSH_MS - 10_000, 'the log, 30 s after its oldest event');
  g.r.log[0].ts = now.t - 60_000;
  assert.equal(await at(), 0, 'overdue: now');
  g.r.log.length = 0;
  g.r.players.set('lost1', { c: 5, st: 'lost', lostAt: now.t - 1000, p: null });
  assert.equal(await at(), LOST_TO_OFFLINE_MS - 1000, 'a lost player turns offline');
  g.r.players.delete('lost1');
  stranger(g);
  assert.equal(await at(), 5000, 'a socket that has not said hello');
  g.room.ctx.sockets.clear();
  g.r.copy = { as: 'x', key: 'x', until: now.t + 777 };
  assert.equal(await at(), 777, 'a copy’s end');
  g.r.copy.until = now.t - 5;
  assert.equal(await at(), 0);
  g.r.copy = null;

  g.storage.alarm = now.t + 100;
  await g.room.schedule();
  assert.equal(g.storage.alarm, now.t + 100, 'a sooner alarm stays');
  g.storage.alarm = now.t + 2 * DAY;
  await g.room.schedule();
  assert.equal(g.storage.alarm, now.t + DAY, 'a later one comes forward');
});

test('worker alarm: a socket silent for 5 s is closed; one that said hello is not', async () => {
  const g = await makeRoom();
  const friend = await join(g);
  const young = stranger(g, 'v', now.t - 4999);
  const old = stranger(g, 'v', now.t - 5000);
  await g.room.alarm();
  assert.equal(young.closed, null);
  assert.deepEqual(old.closed, { code: 1008, reason: 'hello first' });
  assert.equal(friend.closed, null);
});

test('worker alarm: lost players turn offline and everyone is told; play is saved', async () => {
  const g = await twoPlayers();
  const id = idOf(g.b);
  g.b.close(1006, '');
  await g.room.webSocketClose(g.b, 1006, '');
  now.t += LOST_TO_OFFLINE_MS;
  await g.room.alarm();
  assert.equal(g.r.players.get(id).st, 'offline');
  assert.equal(g.a.got('status').at(-1).st, 'offline');
  assert.equal(g.r.isDirty, false);
  const back = await start(Rooms, g.storage, g.env);
  assert.equal(back.room.players.get(id).st, 'offline');
});

test('worker alarm: a smoke-test room nobody is in is kept', async () => {
  const g = await makeRoom();
  await g.room.modSmoke(g.id, true);
  now.t += 400 * DAY;
  await g.room.alarm();
  assert.equal(g.room.room.ready, true);
  assert.ok(g.env.rooms.has(g.id));
});

/* ------------------------------------------------------- moderator */

test('worker moderator: a freeze closes the player with the notice and is written', async () => {
  const g = await twoPlayers();
  const id = idOf(g.b);
  assert.equal(await g.room.modFreeze('another', id, 'x'), 'room');
  assert.equal(await g.room.modFreeze(g.id, 'nobody', 'x'), 'player');
  assert.equal(await g.room.modFreeze(g.id, id, 'speed'), null);
  assert.deepEqual(g.b.sent.at(-1), { t: 'frozen' });
  assert.deepEqual(g.b.closed, { code: 4005, reason: 'frozen' });
  assert.deepEqual(g.b.deserializeAttachment(), { id: null, at: 0 });
  assert.ok(
    g.a.got('frozen').some((m) => m.id === id),
    'the others see it'
  );
  assert.equal(g.a.closed, null);
  assert.equal(await g.room.modFreeze(g.id, id, 'again'), 'frozen');
  const back = await start(Rooms, g.storage, g.env);
  assert.ok(back.room.players.get(id).frozen, 'written');

  assert.equal(await g.room.modThaw('another', id), 'room');
  assert.equal(await g.room.modThaw(g.id, idOf(g.a)), 'not frozen');
  assert.equal(await g.room.modThaw(g.id, id), null);
  assert.ok(g.a.got('status').some((m) => m.id === id));
  const thawed = await start(Rooms, g.storage, g.env);
  assert.equal(thawed.room.players.get(id).frozen, undefined, 'the thaw is written too');
});

test('worker moderator: a bot mark reaches everyone, is written, and comes off again', async () => {
  const g = await twoPlayers();
  const id = idOf(g.b);
  assert.equal(await g.room.modBot('another', id, true), 'room');
  assert.equal(await g.room.modBot(g.id, 'nobody', true), 'player');
  assert.equal(await g.room.modBot(g.id, id, true), null);
  assert.ok(
    g.a.got('status').some((m) => m.id === id && m.bot === true),
    'the others are told'
  );
  const back = await start(Rooms, g.storage, g.env);
  assert.equal(back.room.players.get(id).bot, true, 'written');
  assert.equal(back.room.welcome(idOf(g.a), Date.now()).players[id].bot, true, 'in a welcome');
  assert.equal(
    back.room.roster(Date.now()).find((p) => p.id === id).bot,
    true,
    'on the moderator page'
  );
  assert.equal(await g.room.modBot(g.id, id, false), null);
  assert.equal(g.a.got('status').at(-1).bot, undefined);
  const off = await start(Rooms, g.storage, g.env);
  assert.equal(off.room.players.get(id).bot, undefined, 'unmarked is written too');
  assert.equal(off.room.statusOf(idOf(g.a)).bot, undefined, 'nobody else is marked');
});

test('worker moderator: a stopped invite link is written', async () => {
  const g = await twoPlayers();
  const [{ code }] = g.a.got('invite');
  assert.equal(await g.room.modRevoke('another', code), 'room');
  assert.equal(await g.room.modRevoke(g.id, 'B'.repeat(22)), 'link');
  assert.equal(await g.room.modRevoke(g.id, code), null);
  const back = await start(Rooms, g.storage, g.env);
  assert.equal(back.room.invites.get(code).off, true);
});

// How Watch gets into a world made by hand (a crystal room, 0.194.0).
test('worker moderator: an invite link from the moderator lets someone in, and is written', async () => {
  const g = await twoPlayers();
  assert.deepEqual(await g.room.modInvite('another', { uses: 3, life: 60 }), { error: 'room' });
  const made = await g.room.modInvite(g.id, { uses: 1, life: 60 });
  assert.match(made.code, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(made.until > Date.now());
  const back = await start(Rooms, g.storage, g.env);
  assert.equal(back.room.invites.get(made.code).by, 'mod', 'kept, made by the moderator');
  const joined = await back.room.join('cd'.repeat(32), made.code, Date.now());
  assert.ok(joined.id, 'it lets someone in');
  assert.equal(
    (await back.room.join('ef'.repeat(32), made.code, Date.now())).error,
    'invite',
    'once'
  );
});

test('worker moderator: the brief counts who is in, away and frozen', async () => {
  const g = await twoPlayers();
  const [a, b] = [idOf(g.a), idOf(g.b)];
  const s = await g.room.summary();
  assert.equal(s.id, g.id);
  assert.equal(s.players, 2);
  assert.equal(s.online, 2);
  assert.equal(s.frozen, 0);
  assert.equal(s.smk, false);
  assert.equal(s.seed, 12345);
  for (const k of ['created', 'last', 'gen', 'fmt']) assert.equal(s[k], g.r[k], k);
  g.r.players.get(a).st = 'away';
  g.r.players.get(b).st = 'lost';
  g.r.players.set('z', { c: 7, st: 'offline', frozen: 1, p: null });
  const t = await g.room.summary();
  assert.deepEqual([t.players, t.online, t.frozen], [3, 1, 1]);
  assert.deepEqual(await g.room.brief(g.id), { exists: true, online: 1 });
  assert.deepEqual(await g.room.brief('another'), { exists: false });
  g.r.ready = false;
  assert.equal(await g.room.summary(), null);
  assert.deepEqual(await g.room.brief(g.id), { exists: false });
});

test('worker moderator: a smoke-test room shows only its brief, unless tests are asked for', async () => {
  const g = await twoPlayers();
  let o = await g.room.overview(g.id, false);
  assert.equal(o.players.length, 2);
  assert.deepEqual(o.graves, g.r.graves);
  assert.equal(await g.room.modSmoke(g.id, true), null);
  assert.equal((await start(Rooms, g.storage, g.env)).room.smoke, true, 'written');
  o = await g.room.overview(g.id, false);
  assert.deepEqual(Object.keys(o), ['summary']);
  assert.equal(o.summary.smk, true);
  o = await g.room.overview(g.id, true);
  assert.equal(o.players.length, 2);
  assert.equal(await g.room.overview('another', true), null);
});

test('worker moderator: every read of another room answers null', async () => {
  const g = await twoPlayers();
  for (const read of ['snapshot', 'graves', 'roster'])
    assert.equal(await g.room[read]('another'), null, read);
  assert.ok(await g.room.snapshot(g.id));
  assert.deepEqual(await g.room.graves(g.id), g.r.graves);
  assert.equal((await g.room.roster(g.id)).length, 2);
});

test('worker create: a room is made once; a refused world leaves nothing', async () => {
  const g = await makeRoom();
  assert.equal(await g.room.create(g.id, '{}', true), 'exists');
  assert.equal(g.storage.data.get('id'), g.id, 'written with the room');

  const storage = new Storage();
  const fresh = await start(Rooms, storage, makeEnv());
  assert.equal(typeof (await fresh.create('X'.repeat(22), 'not a world')), 'string');
  assert.equal(fresh.room.ready, false);
  assert.equal(fresh.registered, false);
  assert.equal(storage.data.size, 0);
  assert.equal(await g.room.adopt('Y'.repeat(22), []), 'exists');
});
