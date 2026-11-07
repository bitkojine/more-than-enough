/* A crystal room (0.194.0): the crystal chapter played in a shared world.
 * The room works out the player's progress from what they did (shadow.js),
 * crystal commands, moved buildings and flares included, so a whole
 * playthrough, from nothing to the machine woken and a teleport there and
 * back, must come out the same in the room as in the game: no act refused,
 * no drift, the same crystal, heart and machine. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { WORLD_FORMAT } from '../../src/core/format.js';
import { Room, Bucket } from '../../server/src/room.js';
import { playCultivation } from '../../scripts/cultivation-playtest.mjs';
import * as C from '../../src/core/index.js';
import { unlockOptional } from './helpers.js';

const T0 = 1_700_000_000_000;
const SAVE_EVERY_MS = 10_000;
const SYNC_EVERY = 15; // frames between two messages, about a quarter second

async function crystalRoom(seed) {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  const world = { seed, mods: [], props: [], ext: [] };
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world, eco: 'crystal' }), T0), null);
  return { r, key };
}

// A game in crystal room `r`, sending what it did the way together.js does.
async function crystalGame(r, key) {
  const j = await r.join(key, undefined, T0, false, { crystal: true, seats: true });
  assert.equal(j.welcome.eco, 'crystal');
  assert.equal(j.welcome.fmt, WORLD_FORMAT);
  const s = C.joinState(j.welcome, r.id, null, null);
  assert.ok(s?.cultivation, 'a crystal room plays the crystal chapter');
  s.time = j.welcome.time;
  s.acts = [];
  const id = j.id;
  const edits = new Bucket(T0, 1e9, 1e9);
  let savedAt = 0,
    frames = 0;
  const now = () => T0 + Math.round(s.stats.playedMs);
  const send = (m) => {
    const out = r.message(id, JSON.stringify(m), now(), edits);
    assert.ok(!out.drop, 'the room took ' + m.t);
    return out;
  };
  function sync(force = false) {
    if (!force && ++frames % SYNC_EVERY) return;
    r.players.get(id).p = P.cleanPos(s.player);
    const acts = C.takeActs(s);
    for (let i = 0; i < acts.length; i += P.LIMITS.actsPerMessage)
      send({ t: 'acts', ms: Math.round(s.stats.playedMs), a: acts.slice(i, i + 256) });
    const list = C.takeEdits(s);
    for (let i = 0; i < list.length; i += P.LIMITS.editsPerMessage)
      send({ t: 'edits', e: list.slice(i, i + P.LIMITS.editsPerMessage) });
    if (force || s.stats.playedMs - savedAt >= SAVE_EVERY_MS) {
      savedAt = s.stats.playedMs;
      send({ t: 'save', s: C.progressOf(s) });
    }
  }
  return { s, id, sync, now };
}

const { r, key } = await crystalRoom(11);
const g = await crystalGame(r, key);
const run = playCultivation(11, { wallSeconds: 300, state: g.s, tick: () => g.sync() });
g.sync(true);
const copy = JSON.parse(r.saveFor(g.id, r.players.get(g.id)));

test('crystal room: the whole crystal chapter, played together, is won', () => {
  assert.equal(run.result, 'won', run.error);
  assert.equal(g.s.cultivation.completed, true);
});

test('crystal room: the room agrees with the game on every act, from nothing to the machine woken', () => {
  assert.deepEqual(r.shadowOf().report(g.id), {
    checks: r.shadowOf().report(g.id).checks,
    off: 0,
    refused: 0
  });
  assert.deepEqual(
    r.log.filter((e) => e.e === 'drift'),
    []
  );
});

test("crystal room: the room's copy holds the same crystal chapter as the game", () => {
  const ours = copy.cultivation,
    theirs = g.s.cultivation;
  assert.equal(ours.completed, true, 'the machine woke in the room too');
  assert.equal(ours.heart.where, 'installed');
  assert.deepEqual(ours.gear, theirs.gear);
  assert.deepEqual(
    ours.facilities.map((b) => [b.kind, b.x, b.y, b.z]),
    theirs.facilities.map((b) => [b.kind, b.x, b.y, b.z])
  );
  for (const k of C.RESOURCES)
    assert.ok(
      Math.abs((copy.inv[k] || 0) - (g.s.inv[k] || 0)) <= 1,
      k + ': room ' + copy.inv[k] + ', game ' + g.s.inv[k]
    );
  const p = copy.player;
  assert.ok(Math.hypot(p.x - g.s.player.x, p.y - g.s.player.y) < 1, 'where they stand');
  assert.equal(p.z, g.s.player.z);
});

test('crystal room: coming back, the game opens the crystal chapter where it was', async () => {
  const back = await r.join(key, undefined, T0 + 1e7, false, { crystal: true, seats: true });
  const s = C.joinState(back.welcome, r.id, null, null);
  assert.equal(s.cultivation.completed, true);
  assert.equal(s.world.cultivation, true, 'crystal land');
});

test('crystal room: a game too old to play one is told to update, not let in to grow other land', async () => {
  const { r: room, key: k } = await crystalRoom(5);
  const j = await room.join(k, undefined, T0, false);
  assert.ok(j.welcome.fmt > WORLD_FORMAT, 'a newer format: the old game updates first');
  const now = await room.join(k, undefined, T0, false, true);
  assert.equal(now.welcome.fmt, WORLD_FORMAT);
});

test('crystal room: kept as one, through storage and back', async () => {
  const back = Room.restore(r.id, r.writesOf(r.dirty), T0);
  assert.equal(back.eco, 'crystal');
  const old = new Room(P.randomRoomId(), T0);
  await old.init(
    JSON.stringify({ t: 'create', key, world: { seed: 3, mods: [], props: [], ext: [] } }),
    T0
  );
  assert.equal(old.eco, 'old');
  assert.equal(old.welcome([...old.players.keys()][0], T0).eco, 'old');
  assert.equal(
    old.writesOf(old.dirty).get('meta').eco,
    undefined,
    "an old room's storage is as before"
  );
  assert.equal(Room.restore(old.id, old.writesOf(old.dirty), T0).eco, 'old');
});

test("crystal room: an old room's player never gets the crystal chapter, nor a crystal room's the old one", () => {
  const w = { seed: 9, mods: [], props: [], ext: [], you: 'a'.repeat(16), save: null };
  assert.equal(C.joinState({ ...w, eco: 'old' }, 'R', null, null).cultivation, undefined);
  const crystal = C.joinState({ ...w, eco: 'crystal' }, 'R', null, null);
  assert.ok(crystal.cultivation);
  const save = C.progressOf(crystal);
  assert.equal(C.joinState({ ...w, eco: 'old', save }, 'R', null, null), null);
  const oldSave = C.progressOf(C.joinState({ ...w, eco: 'old' }, 'R', null, null));
  assert.ok(C.joinState({ ...w, eco: 'crystal', save: oldSave }, 'R', null, null).cultivation);
});

/* ------------------------------------------------- each kind of crystal act */

// A crystal world opened up two layers down, everything unlocked, as the
// game has it in a crystal room (acts noted) and as the room's copy (not).
function pair() {
  const s = unlockOptional(C.createState(7, { cultivation: true }));
  s.tools.pickaxe = 3;
  for (let y = -6; y <= 6; y++)
    for (let x = -6; x <= 6; x++) {
      const t = C.tileAt(s.world, x, y, -2);
      if (!C.TILE_INFO[t].rise && !C.TILE_INFO[t].descend) {
        C.setRichness(s.world, x, y, -2, 0);
        C.markExplored(s.world, x, y, -2);
      }
    }
  s.player = { ...s.player, x: 0.5, y: 0.5, z: -2 };
  for (const k of C.RESOURCES) s.inv[k] = 1000;
  const room = C.deserialize(C.serialize(s));
  for (const t of [s, room]) t.shared = 'R'.repeat(22);
  s.acts = [];
  return { s, room };
}
const replayAll = (s, room) => C.takeActs(s).map((a) => C.replayAct(room, P.cleanAct(a)));

test('crystal room: a crystal building put up and moved is put up and moved in the room too', () => {
  const { s, room } = pair();
  assert.equal(C.cultivationCommand(s, { type: 'build', kind: 'chamber', x: 1, y: 0 }), 'ok');
  assert.deepEqual(replayAll(s, room), [true]);
  const b = s.cultivation.facilities.find((f) => f.kind === 'chamber');
  assert.equal(C.moveFacility(s, b, 0, 1), 'ok');
  assert.deepEqual(replayAll(s, room), [true]);
  const moved = room.cultivation.facilities.find((f) => f.kind === 'chamber');
  assert.deepEqual([moved.x, moved.y], [0, 1], 'moved in the room');
  assert.deepEqual(room.inv, s.inv);
  // Out of reach in the game: no act; one made up is refused by the room.
  assert.equal(C.moveFacility(s, b, 5, 5), 'reach');
  assert.deepEqual(s.acts, []);
  assert.equal(C.replayAct(room, ['m', 0, 0.5, 0.5, -2, 0, 1, 5, 5]), false);
  assert.equal(C.replayAct(room, ['m', 0, 0.5, 0.5, -2, 4, 4, 1, 0]), false, 'nothing there');
});

test('crystal room: a flare lit and put out is lit and put out in the room too', () => {
  const { s, room } = pair();
  assert.equal(C.useFlare(s), 'lit');
  assert.deepEqual(replayAll(s, room), [true]);
  assert.ok(room.flare > 0);
  assert.equal(room.inv.ore, s.inv.ore, 'paid for in the room');
  assert.equal(C.useFlare(s), 'out');
  assert.deepEqual(replayAll(s, room), [true]);
  assert.equal(room.flare, 0);
});

test('crystal room: a command the rules refuse is no act, and one made up changes nothing', () => {
  const { s, room } = pair();
  s.inv.stone = 0;
  assert.equal(
    C.cultivationCommand(s, { type: 'build', kind: 'chamber', x: 1, y: 0 }),
    'materials'
  );
  assert.deepEqual(s.acts, []);
  const before = C.serialize(room);
  assert.equal(C.replayAct(room, ['k', 0, 0.5, 0.5, -2, 'activate', 0, 0, 0]), false);
  assert.equal(C.replayAct(room, ['k', 0, 0.5, 0.5, -2, 'build', 4, 4, 'chamber']), false, 'reach');
  assert.equal(C.serialize(room), before);
});

test('protocol: crystal acts keep their fields, and nothing else gets through', () => {
  const head = [0, 1.5, 2.5, -2];
  assert.deepEqual(P.cleanAct(['k', ...head, 'build', 1, 2, 'chamber']), [
    'k',
    ...head,
    'build',
    1,
    2,
    'chamber'
  ]);
  assert.deepEqual(P.cleanAct(['k', ...head, 'teleport', 1, 2, 6]), [
    'k',
    ...head,
    'teleport',
    1,
    2,
    6
  ]);
  assert.deepEqual(P.cleanAct(['m', ...head, 1, 2, 3, 4]), ['m', ...head, 1, 2, 3, 4]);
  assert.deepEqual(P.cleanAct(['f', ...head]), ['f', ...head]);
  for (const bad of [
    ['k', ...head, 'build', 1, 2],
    ['k', ...head, 'Build', 1, 2, 0],
    ['k', ...head, 'build', 1.5, 2, 0],
    ['k', ...head, 'build', 1, 2, -1],
    ['k', ...head, 'build', 1, 2, 'x y'],
    ['k', ...head, 'build', 1, 2, null],
    ['m', ...head, 1, 2, 3],
    ['m', ...head, 1, 2, 3, 'a'],
    ['f', ...head, 1]
  ])
    assert.equal(P.cleanAct(bad), null, JSON.stringify(bad));
});
