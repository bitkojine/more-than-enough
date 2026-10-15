/* The room's own copy of each player's progress (server/src/shadow.js): a
 * bot plays a shared world as a game would, sending what it did, its edits
 * and its progress the way src/game/together.js does, and the room, working
 * only from what it did, must come out with the same numbers. And when a
 * game's numbers don't follow from what it did, the room says so. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket } from '../../server/src/room.js';
import { C, T, createBot } from './helpers.js';

const T0 = 1_700_000_000_000;
const SAVE_EVERY_MS = 10_000;

// A room made from a new world, its owner in it, and a game playing there.
async function sharedGame(seed) {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world: { seed, mods: [], props: [], ext: [] } }), T0), null);
  const j = await r.join(key, undefined, T0);
  const s = C.joinState(j.welcome, r.id, null, null);
  assert.ok(j.welcome.acts, 'the room asks for acts');
  s.acts = [];
  const id = j.id;
  const edits = new Bucket(T0, 1e9, 1e9); // edit budgets aren't what's tested here
  let savedAt = 0;
  const now = () => T0 + Math.round(s.stats.playedMs);
  const send = (m) => {
    const out = r.message(id, JSON.stringify(m), now(), edits);
    assert.ok(!out.drop, 'the room took ' + m.t);
    return out;
  };
  // What the game's tick does: say where you are, then what you did, then
  // the edits it made, and now and then your progress.
  function sync(force = false) {
    C.advanceGoals(s); // as the game's controller does, a few times a second
    const pl = r.players.get(id);
    pl.p = P.cleanPos(s.player);
    const acts = C.takeActs(s);
    for (let i = 0; i < acts.length; i += P.LIMITS.actsPerMessage) send({ t: 'acts', ms: Math.round(s.stats.playedMs), a: acts.slice(i, i + P.LIMITS.actsPerMessage) });
    const list = C.takeEdits(s);
    for (let i = 0; i < list.length; i += P.LIMITS.editsPerMessage) send({ t: 'edits', e: list.slice(i, i + P.LIMITS.editsPerMessage) });
    if (force || s.stats.playedMs - savedAt >= SAVE_EVERY_MS) {
      savedAt = s.stats.playedMs;
      send({ t: 'save', s: C.progressOf(s) });
    }
  }
  return { r, s, id, sync, send, now };
}

const drifts = (r) => r.log.filter((e) => e.e === 'drift');

test('shadow: a game played fairly, from nothing to its first buildings, agrees with the room', async () => {
  const g = await sharedGame(12345);
  const { s, r, id, sync } = g;
  const b = createBot(12345, s, sync);
  const { gather, standBy, free } = b;
  gather('mycelium', 6); C.buy(s, 'basket'); sync();
  gather('mycelium', 8); C.buy(s, 'boots'); sync();
  gather('mycelium', 10); gather('stone', 6); C.buy(s, 'pickaxe'); sync();
  gather('mycelium', 15); standBy(free(T.FOREST)); assert.ok(C.place(s, 'garden').ok); sync();
  gather('mycelium', 30); gather('stone', 15); standBy(free(T.STONE)); assert.ok(C.place(s, 'quarry').ok); sync();
  // Let them make things, and collect.
  for (let i = 0; i < 600; i++) {
    C.step(s, 0.1);
    if (i % 50 === 49 && C.collectTarget(s)) C.collect(s);
    if (i % 5 === 4) sync();
  }
  sync(true);
  const report = r.shadow.report(id);
  assert.ok(report.checks >= 5, 'the room checked often (' + report.checks + ')');
  assert.equal(report.refused, 0, 'every act was allowed');
  assert.deepEqual(drifts(r), [], 'and the room\'s copy matched every time: ' + JSON.stringify(drifts(r)));
  assert.equal(report.off, 0);
  assert.ok(s.stats.built >= 2 && s.tools.pickaxe >= 2, 'it really played');
});

test('shadow: progress that doesn\'t follow from what was done is logged', async () => {
  const { s, r, id, sync, send } = await sharedGame(12345);
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 6);
  sync(true);
  assert.deepEqual(drifts(r), []);
  // An edited save: half a billion stone out of nowhere.
  const hacked = JSON.parse(C.progressOf(s));
  hacked.inv.stone = 500_000_000;
  hacked.tools.pickaxe = 6;
  send({ t: 'save', s: JSON.stringify(hacked) });
  const d = drifts(r);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].res.find((x) => x[0] === 'stone').slice(1), [500_000_000, s.inv.stone]);
  assert.deepEqual(d[0].levels.find((x) => x[0] === 'tool.pickaxe'), ['tool.pickaxe', 6, 1]);
  assert.equal(r.shadow.report(id).off, 1);
  assert.ok(r.roster(g0()).find((p) => p.id === id).shadow.off === 1, 'the moderator sees it');
});

const g0 = () => T0 + 60_000;

test('shadow: acts the rules refuse change nothing and are counted', async () => {
  const { s, r, id, sync, send } = await sharedGame(12345);
  send({ t: 'acts', ms: 0, a: [] });
  sync(true);
  const before = JSON.stringify(r.shadow.players.get(id).s.inv);
  const p = s.player;
  send({ t: 'acts', ms: 1000, a: [
    ['h', 500, p.x, p.y, p.z, Math.floor(p.x) + 40, Math.floor(p.y)], // far out of reach
    ['u', 600, p.x, p.y, p.z, 'abundance'],                          // can't afford it
    ['u', 700, p.x, p.y, p.z, 'constructor'],                        // no such upgrade
    ['b', 800, p.x, p.y, p.z, 'garden', Math.floor(p.x), Math.floor(p.y)] // can't afford it
  ] });
  assert.equal(r.shadow.report(id).refused, 4);
  assert.equal(JSON.stringify(r.shadow.players.get(id).s.inv), before);
});

test('shadow: play time can\'t run ahead of the room\'s clock', async () => {
  const { s, r, id, sync, send } = await sharedGame(12345);
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST)); C.place(s, 'garden'); sync(true);
  const copy = r.shadow.players.get(id).s;
  const from = copy.stats.playedMs;
  // A game claims an hour of play a second later.
  r.message(id, JSON.stringify({ t: 'acts', ms: Math.round(from + 3600_000), a: [] }), T0 + Math.round(from) + 1000);
  assert.ok(copy.stats.playedMs - from <= 1000 + 2000 + 1, 'at most the time that passed, and a little slack');
});

test('shadow: hauling with Logistics and overclocked buildings agree too', async () => {
  const { s, r, id, sync } = await sharedGame(12345);
  const { gather, standBy, free } = createBot(12345, s, sync);
  gather('mycelium', 6); C.buy(s, 'basket');
  gather('mycelium', 8); C.buy(s, 'boots');
  gather('mycelium', 10); gather('stone', 6); C.buy(s, 'pickaxe');
  gather('mycelium', 15); standBy(free(T.FOREST)); C.place(s, 'garden');
  gather('mycelium', 30); gather('stone', 15); standBy(free(T.STONE)); C.place(s, 'quarry');
  gather('stone', 45); gather('ore', 12); standBy(free(T.ORE)); C.place(s, 'mine');
  gather('stone', 150); gather('ore', 40); assert.ok(C.buy(s, 'logistics').ok, 'Logistics');
  const cost = C.upgradeCost(s, 'overclock');
  gather('stone', cost.stone); gather('ore', cost.ore); assert.ok(C.buy(s, 'overclock').ok);
  for (let i = 0; i < 1200; i++) { C.step(s, 0.1); if (i % 3 === 2) sync(); }
  sync(true);
  const report = r.shadow.report(id);
  assert.equal(report.refused, 0);
  assert.deepEqual(drifts(r), [], JSON.stringify(drifts(r)));
  assert.ok(s.sources.stone.buildings > 0, 'buildings made things');
});

test('shadow: play before the game\'s first message counts from when it came in', async () => {
  const { s, r, id, sync, send } = await sharedGame(12345);
  // A while of gathering go by before the game says anything.
  const b = createBot(12345, s, () => {});
  b.gather('mycelium', 6); C.buy(s, 'basket');
  b.gather('mycelium', 8); C.buy(s, 'boots');
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST)); assert.ok(C.place(s, 'garden').ok);
  for (let i = 0; i < 100; i++) C.step(s, 0.1);
  assert.ok(s.stats.playedMs > 5000, 'it played a while (' + s.stats.playedMs + ' ms)');
  sync(true);
  assert.equal(r.shadow.report(id).refused, 0, 'none of it was refused for being too fast');
  assert.deepEqual(drifts(r), [], JSON.stringify(drifts(r)));
  void send;
});
