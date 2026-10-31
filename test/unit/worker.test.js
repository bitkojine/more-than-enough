/* The room service's own Durable Object (server/src/worker.js), run for real
 * in Node on a storage that fails the way Cloudflare's can
 * (test/support/durable.js). It is the one place every shared world is
 * written and read back, so "every world is kept, forever" (AGENTS.md) is
 * held here: a world comes back whole after a restart, a failed write
 * loses nothing, a restore is all or nothing, and nothing deletes a
 * player's world on its own. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { C, T, createBot } from './helpers.js';
import { registerCloudflare, Storage, Socket, makeEnv, start } from '../support/durable.js';

registerCloudflare();
const { Rooms } = await import('../../server/src/worker.js');
const { MOD_BUCKETS } = await import('../../server/src/room.js');

const T0 = 1_700_000_000_000;
const realNow = Date.now;
let clock = T0;
Date.now = () => clock;
test.after(() => {
  Date.now = realNow;
});

// A shared world made in a room, its creator connected and playing it the
// way a game does (together.js): moves, acts, edits, and now and then its
// progress, all through the Durable Object's own socket handler.
async function playedRoom(seed = 12345) {
  clock = T0;
  const storage = new Storage(),
    env = makeEnv();
  const room = await start(Rooms, storage, env);
  const id = P.randomRoomId(),
    key = P.randomHex(32);
  assert.equal(
    await room.create(
      id,
      JSON.stringify({ t: 'create', key, world: { seed, mods: [], props: [], ext: [] } }),
      true
    ),
    null
  );
  await env.REGISTRY.get().add(id); // as POST /rooms does
  const g = { storage, env, room, id, key };
  await connect(g);
  return g;
}

// Connects the creator (again) and starts their game from the welcome.
async function connect(g) {
  const ws = new Socket(g.room.ctx);
  g.room.ctx.acceptWebSocket(ws);
  ws.serializeAttachment({ id: null, at: clock, v: 'test' });
  await g.room.webSocketMessage(ws, JSON.stringify({ t: 'hello', key: g.key }));
  const [welcome] = ws.got('welcome');
  assert.ok(welcome, 'the room welcomes its creator');
  const s = C.joinState(welcome, g.id, null, null);
  s.time = welcome.time;
  s.acts = [];
  g.ws = ws;
  g.s = s;
  g.pid = ws.deserializeAttachment().id;
  g.base = clock - Math.round(s.stats.playedMs); // wall time = base + play time
  return g;
}

// What the game's tick sends, through the socket.
async function sync(g, save = false) {
  clock = Math.max(clock, g.base + Math.round(g.s.stats.playedMs));
  const send = (m) => g.room.webSocketMessage(g.ws, JSON.stringify(m));
  C.advanceGoals(g.s);
  g.room.room.players.get(g.pid).p = P.cleanPos(g.s.player); // where they walked (the room's step budget isn't what's tested)
  const acts = C.takeActs(g.s);
  for (let i = 0; i < acts.length; i += P.LIMITS.actsPerMessage)
    await send({
      t: 'acts',
      ms: Math.round(g.s.stats.playedMs),
      a: acts.slice(i, i + P.LIMITS.actsPerMessage)
    });
  const edits = C.takeEdits(g.s);
  for (let i = 0; i < edits.length; i += P.LIMITS.editsPerMessage)
    await send({ t: 'edits', e: edits.slice(i, i + P.LIMITS.editsPerMessage) });
  if (save) await send({ t: 'save', s: C.progressOf(g.s) });
}

// Plays a while: gathers mycelium, and once there's enough, puts up a garden.
async function play(g, need = 15) {
  const pending = [];
  const bot = createBot(12345, g.s, () => pending.push(sync(g)));
  bot.gather('mycelium', need);
  bot.standBy(bot.free(T.FOREST));
  C.place(g.s, 'garden');
  await Promise.all(pending);
  await sync(g, true);
}

// The world as storage holds it, in a form two worlds can be compared by.
async function stored(storage) {
  const all = await storage.list();
  all.delete('id');
  return all;
}

test('worker: a shared world comes back whole after the room restarts', async () => {
  const g = await playedRoom();
  await play(g, 30);
  assert.ok(
    g.room.room.mods.size > 0 && g.room.room.ext.length > 0,
    'the play made edits and a building'
  );
  await g.room.alarm(); // the room writes what changed
  assert.equal(g.room.room.isDirty, false);
  const before = await stored(g.storage);
  const player = before.get('p:' + g.pid);
  assert.ok(player.save, 'their progress is in storage');

  // A deploy: a new object on the same storage, every socket gone.
  clock += 60_000;
  const again = await start(Rooms, g.storage, g.env);
  const r = again.room;
  assert.equal(r.ready, true);
  assert.equal(r.id, g.id);
  assert.equal(r.seed, 12345);
  assert.deepEqual(new Map(r.mods), new Map(g.room.room.mods), 'every edit to the land');
  assert.deepEqual(r.ext, g.room.room.ext, 'every building');
  assert.equal(r.players.get(g.pid).save, player.save, 'their progress, as the room kept it');
  assert.equal(
    r.players.get(g.pid).st,
    'lost',
    'someone online when the room stopped is lost, not still online'
  );

  // And the player comes back to it: the same progress, the same world.
  const back = await connect({ ...g, room: again });
  assert.equal(back.s.extractors.length, g.s.extractors.length);
  const kept = JSON.parse(player.save);
  for (const res of C.RESOURCES) assert.equal(back.s.inv[res], kept.inv[res] ?? 0, res);
  assert.ok(
    C.RESOURCES.some((res) => kept.inv[res] > 0),
    'they had something to come back to'
  );
  // The audit log was kept too.
  const log = await again.exportLog(g.id, 0);
  assert.match(log, /"e":"join"/);
});

test('worker: a write that fails is made with the next one, and nothing is lost', async () => {
  const g = await playedRoom();
  await play(g, 6);
  await g.room.alarm();
  const first = await stored(g.storage);

  await play(g, 6);
  g.storage.failNext();
  await assert.rejects(g.room.alarm(), /the write failed/);
  assert.deepEqual(await stored(g.storage), first, 'a failed write changed nothing');
  assert.equal(g.room.room.isDirty, true, 'what it held is still to be written');

  await play(g, 4);
  await g.room.alarm();
  const after = await start(Rooms, g.storage, g.env);
  assert.deepEqual(
    new Map(after.room.mods),
    new Map(g.room.room.mods),
    'edits from before and after the failure'
  );
  assert.deepEqual(after.room.ext, g.room.room.ext);
  assert.equal(after.room.players.get(g.pid).save, g.room.room.players.get(g.pid).save);
});

test('worker: the most a room ever writes at once lands whole', async () => {
  // The most a room can have to write at once: every piece of the land and
  // every player changed since the last write.
  const g = await playedRoom();
  await play(g, 3);
  const r = g.room.room;
  for (let b = 0; b < MOD_BUCKETS; b++) r.dirty.buckets.add(b);
  for (let i = 0; i < P.LIMITS.players; i++)
    r.players.set('pad' + i, { st: 'offline', save: null });
  for (const id of r.players.keys()) r.dirty.players.add(id);
  r.dirty.meta = r.dirty.props = r.dirty.ext = true;
  await g.room.persist();
  assert.equal(r.isDirty, false);
  const all = await g.storage.list();
  assert.equal([...all.keys()].filter((k) => k.startsWith('mods:')).length, MOD_BUCKETS);
  assert.ok(all.has('p:pad99'));
  const back = await start(Rooms, g.storage, g.env);
  assert.deepEqual(new Map(back.room.mods), new Map(r.mods));
});

test('worker: a world restored from its backup comes back whole, and never over one that is there', async () => {
  const g = await playedRoom();
  await play(g);
  const entries = await g.room.snapshot(g.id);
  // Into an empty room, as POST /admin/rooms/<id>/restore does.
  const storage = new Storage();
  const fresh = await start(Rooms, storage, g.env);
  assert.equal(await fresh.adopt(g.id, entries), null);
  assert.deepEqual(new Map(fresh.room.mods), new Map(g.room.room.mods));
  assert.deepEqual(fresh.room.ext, g.room.room.ext);
  const again = await start(Rooms, storage, g.env);
  assert.equal(again.room.players.get(g.pid).save, entries.get('p:' + g.pid).save);
  // Never over a live world.
  const kept = await stored(g.storage);
  assert.equal(await g.room.adopt(g.id, new Map([['meta', { seed: 1 }]])), 'exists');
  assert.deepEqual(await stored(g.storage), kept);
});

test('worker: a restore that fails leaves no half world, and can be tried again', async () => {
  const g = await playedRoom();
  await play(g, 6);
  const entries = await g.room.snapshot(g.id);
  const storage = new Storage();
  const fresh = await start(Rooms, storage, g.env);
  storage.failNext();
  await assert.rejects(fresh.adopt(g.id, entries));
  const after = await start(Rooms, storage, g.env);
  assert.equal(after.room.ready, false, 'nothing of it was kept, so nothing half of it loads');
  assert.equal(await after.adopt(g.id, entries), null, 'and the restore can be made again');
  assert.deepEqual(new Map(after.room.mods), new Map(g.room.room.mods));
});

test('worker: a backup whose land is stored in other pieces is written back in pieces storage takes', async () => {
  // Every edit stored in one piece, as a backup from a room that split its
  // land differently would have it: the restored room writes every piece
  // again (Room.restore `moved`), MOD_BUCKETS of them.
  const g = await playedRoom();
  await play(g);
  const entries = await g.room.snapshot(g.id);
  const all = [];
  for (const [k, v] of entries)
    if (k.startsWith('mods:')) {
      all.push(...v);
      entries.delete(k);
    }
  entries.set('mods:0', all);
  const storage = new Storage();
  const fresh = await start(Rooms, storage, g.env);
  assert.equal(await fresh.adopt(g.id, entries), null);
  assert.equal(fresh.room.isDirty, false, 'every piece was written');
  const back = await start(Rooms, storage, g.env);
  assert.deepEqual(new Map(back.room.mods), new Map(g.room.room.mods));
});

test('worker: a world nobody has played for a year is kept by its alarm', async () => {
  const g = await playedRoom();
  await play(g, 3);
  g.ws.close(1000, 'bye');
  await g.room.webSocketClose(g.ws, 1000, 'bye');
  await g.room.alarm();
  const kept = await stored(g.storage);
  clock += 400 * 24 * 3600_000;
  const later = await start(Rooms, g.storage, g.env);
  await later.alarm();
  assert.equal(later.room.ready, true);
  assert.deepEqual(await stored(g.storage), kept, 'not a key gone');
  assert.ok(g.env.rooms.has(g.id), 'still in the registry');
});

test("worker: only a moderator's copy is deleted, once its time is up", async () => {
  const g = await playedRoom();
  await play(g, 3);
  const r = g.room.room;
  r.copy = { as: g.pid, key: g.pid, until: clock + 3600_000 };
  r.dirty.meta = true;
  await g.room.alarm();
  clock += 1800_000;
  await g.room.alarm();
  assert.equal(g.room.room.ready, true, 'a copy plays until its time is up');
  clock += 1800_000;
  await g.room.alarm();
  assert.equal(g.room.room.ready, false);
  assert.equal((await g.storage.list()).size, 0);
  assert.equal(g.ws.closed?.code, 4006, 'its player is told it ended');
});

test('worker: someone lost when the room restarted turns offline, and that is written', async () => {
  const g = await playedRoom();
  await play(g, 3);
  await g.room.alarm();
  const again = await start(Rooms, g.storage, g.env);
  assert.equal(again.room.players.get(g.pid).st, 'lost');
  await again.alarm();
  clock += 10 * 60_000;
  await again.alarm();
  assert.equal(again.room.players.get(g.pid).st, 'offline');
  const third = await start(Rooms, g.storage, g.env);
  assert.equal(third.room.players.get(g.pid).st, 'offline');
});
