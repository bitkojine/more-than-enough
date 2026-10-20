/* Every world is kept (Watch, 2026-10-18: "all current worlds must be
 * preserved", "nukes are never allowed anymore"). These fail if anything
 * could reset, nuke or delete a solo or shared world again. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as P from '../../src/net/protocol.js';
import { Room, EXPIRE_MS, SMOKE_SEED } from '../../server/src/room.js';
import * as Core from '../../src/core/index.js';
import { WORLD_FORMAT, ECON_FORMAT } from '../../src/core/format.js';
import { OLDEST_SAVE } from '../../src/core/save.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; }
};
const { loadGame } = await import('../../src/game/storage.js');
const SAVE = 'more-than-enough-save', ASIDE = 'more-than-enough-save-aside';
beforeEach(() => store.clear());

const T0 = 1_700_000_000_000;
const key = () => P.randomHex(32);

async function makeRoom(seed = 42, { smoke = false } = {}) {
  const r = new Room(P.randomRoomId(), T0);
  const maker = key();
  assert.equal(await r.init(JSON.stringify({ t: 'create', key: maker, ...(smoke ? { smoke: true } : {}), world: { seed, mods: [], props: [], ext: [] } }), T0, smoke), null);
  return { r, maker };
}

test('worlds kept: the world and economy formats are frozen forever', () => {
  // Never change these numbers, and never change this test to let them move:
  // bumping either used to reset every solo world and nuke every shared one.
  assert.equal(WORLD_FORMAT, 11, 'WORLD_FORMAT is frozen (src/core/format.js)');
  assert.equal(ECON_FORMAT, 1, 'ECON_FORMAT is frozen (src/core/format.js)');
  assert.equal(Core.SAVE_VERSION, 11);
  assert.equal(OLDEST_SAVE, 10, 'saves from format 10 on always load');
});

test('worlds kept: a save from any kept format loads with everything in it', () => {
  const s = Core.createState(99);
  s.inv.stone = 321;
  s.prestiges = 2;
  for (let v = OLDEST_SAVE; v <= Core.SAVE_VERSION; v++) {
    const old = Core.deserialize(JSON.stringify({ ...JSON.parse(Core.serialize(s)), v }));
    assert.ok(old, 'format ' + v + ' loads');
    assert.deepEqual([old.seed, old.inv.stone, old.prestiges], [99, 321, 2]);
  }
});

test('worlds kept: a shared world from an older format plays on, with no nuke, and stays that way after a restart', async () => {
  const { r, maker } = await makeRoom();
  const a = (await r.join(maker, null, T0)).id;
  r.made(a, [['p', Core.packKey(1, 1, 0), 'glowcap']], T0);
  const writes = r.takeWrites();
  // As a world made before v0.109.0 is stored, with a nuke already called.
  Object.assign(writes.get('meta'), { fmt: 10, ef: 0, call: { fmt: 11, at: T0 }, nk: [a] });
  const back = Room.restore(r.id, writes, T0 + 1000);
  assert.deepEqual([back.fmt, back.ef, back.seed, back.props.size], [WORLD_FORMAT, ECON_FORMAT, 42, 1], 'same world, same land, nothing lost');
  assert.ok(back.log.some((e) => e.e === 'kept'), 'logged once as kept');
  const joined = await back.join(maker, null, T0 + 2000);
  assert.equal(joined.called, undefined, 'nothing is called');
  assert.deepEqual([joined.welcome.nuke, joined.welcome.fmt, joined.welcome.gen, joined.welcome.seed], [null, WORLD_FORMAT, 0, 42]);
  const meta = back.takeWrites().get('meta');
  assert.deepEqual([meta.fmt, meta.ef, 'call' in meta, 'nk' in meta], [WORLD_FORMAT, ECON_FORMAT, false, false], 'the old nuke is gone from storage too');
});

test('worlds kept: pressing the nuke from an old game changes nothing', async () => {
  const { r, maker } = await makeRoom();
  const a = (await r.join(maker, null, T0)).id;
  r.made(a, [['p', Core.packKey(2, 2, 0), 'glowcap']], T0);
  for (let i = 0; i < 3; i++) assert.deepEqual(r.message(a, JSON.stringify({ t: 'nuke' }), T0 + i), {});
  assert.deepEqual([r.seed, r.props.size, r.gen], [42, 1, 0]);
  const forged = await r.join(maker, null, T0, 99999);
  assert.equal(forged.welcome.nuke, null, 'a hello claiming a far newer game changes nothing either');
});

test('worlds kept: the room has no way left to remake or wipe a world', () => {
  for (const name of ['renew', 'callNuke', 'nukeDue', 'nukeDeadline', 'nukeVotes']) {
    assert.equal(typeof Room.prototype[name], 'undefined', 'Room.' + name + ' is gone');
  }
  const worker = readFileSync(new URL('../../server/src/worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(worker, /renew|nuke/i, 'the Durable Object never remakes a world');
  // The only deleteAll left is where a room is meant to go: an expired room
  // (a copy or a smoke test, see the next test).
  assert.equal(worker.match(/deleteAll\(/g).length, 1);
});

test('worlds kept: a players\' world is never deleted for being unvisited, whatever its seed; only rooms the server marked as smoke tests and copies go', async () => {
  const { r } = await makeRoom();
  assert.equal(r.expired(T0 + 1000 * EXPIRE_MS), false);
  // The seed the deploy's smoke test sends is just a number: a players' world
  // that happens to have it is kept forever like any other.
  const seeded = await makeRoom(SMOKE_SEED);
  assert.equal(seeded.r.seed, SMOKE_SEED);
  assert.equal(seeded.r.expired(T0 + 1000 * EXPIRE_MS), false);
  // Only the server's own mark (admin token at create, markSmoke after) makes
  // a room a smoke test, and it says so through a restart too.
  const smoke = await makeRoom(42, { smoke: true });
  assert.equal(smoke.r.expired(T0 + EXPIRE_MS - 1), false);
  assert.equal(smoke.r.expired(T0 + EXPIRE_MS), true);
  const back = Room.restore(smoke.r.id, smoke.r.takeWrites(), T0 + 1000);
  assert.equal(back.expired(T0 + 1000 + EXPIRE_MS), true, 'the mark is kept in storage');
  const seededBack = Room.restore(seeded.r.id, seeded.r.takeWrites(), T0 + 1000);
  assert.equal(seededBack.expired(T0 + 1000 + 1000 * EXPIRE_MS), false, 'and a players\' world stays unmarked');
  // The body's word alone never marks a room: the worker's admin check does.
  const forged = new Room(P.randomRoomId(), T0);
  assert.equal(await forged.init(JSON.stringify({ t: 'create', key: key(), smoke: true, world: { seed: 7, mods: [], props: [], ext: [] } }), T0), null);
  assert.equal(forged.expired(T0 + EXPIRE_MS), false, 'a create claiming "smoke" without the admin token changes nothing');
  // Marking and unmarking is the moderator's alone, and it is logged.
  assert.equal(forged.markSmoke(true, T0 + 1), null);
  assert.equal(forged.expired(T0 + 1 + EXPIRE_MS), true);
  assert.ok(forged.log.some((e) => e.e === 'smoke' && e.smoke === true), 'the marking is in the audit log');
});

test('worlds kept: no solo world is lost on load; one set aside that was played further comes back', () => {
  const real = Core.createState(5);
  real.stats.playedMs = 3 * 3600_000;
  real.inv.stone = 777;
  const oldSave = JSON.stringify({ ...JSON.parse(Core.serialize(real)), v: 10 }); // set aside by v0.109.0
  const fresh = Core.createState(6);
  fresh.stats.playedMs = 600_000;
  const freshSave = Core.serialize(fresh);
  store.set(SAVE, freshSave);
  store.set(ASIDE, oldSave);
  const { state, lost } = loadGame();
  assert.equal(lost, false);
  assert.deepEqual([state.seed, state.inv.stone], [5, 777], 'the world played for hours is back');
  assert.equal(store.get(SAVE), oldSave, 'in use, so closing the game now keeps it');
  assert.equal(store.get(ASIDE), freshSave, 'and the short one is set aside, not thrown away');
  // Loading again changes nothing: the one in use is the one played further.
  assert.equal(loadGame().state.seed, 5);
  assert.equal(store.get(ASIDE), freshSave);
});

test('worlds kept: a world started by an Embark is never swapped for an older one set aside', () => {
  const embarked = Core.createState(8);
  embarked.prestiges = 1; // as Core.embark leaves it: the play clock starts again
  const old = Core.createState(9);
  old.stats.playedMs = 50 * 3600_000;
  store.set(SAVE, Core.serialize(embarked));
  store.set(ASIDE, Core.serialize(old));
  assert.equal(loadGame().state.seed, 8, 'more Embarks means further along, whatever the play clock says');
});

test('worlds kept: no file anywhere in the game or room service names the nuke any more', () => {
  const dirs = ['server/src', 'src/core', 'src/net'];
  for (const dir of dirs) {
    for (const f of readdirSync(new URL('../../' + dir, import.meta.url))) {
      if (!f.endsWith('.js')) continue;
      const src = readFileSync(new URL('../../' + dir + '/' + f, import.meta.url), 'utf8');
      for (const bad of ['renew(', 'callNuke', 'nukeDue', 'NUKE_AFK_MS']) assert.ok(!src.includes(bad), dir + '/' + f + ' has ' + bad);
    }
  }
});
