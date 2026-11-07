/* AUTO in a crystal world (core crystal-brain.js), held down through the
 * shipped button and controller: it wins the chapter, from empty hands to
 * the machine woken, with no act refused; in a crystal room the room agrees
 * with every step; and it picks up wherever a world is (a reload halfway). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket } from '../../server/src/room.js';
import { createAutoplaySession } from '../../src/game/autoplay-session.js';

const T0 = 1_700_000_000_000;
const LIMIT = 90 * 60; // game seconds held at most: a win takes about half an hour

// Holds AUTO in world `state` until `until(state)` or the time limit, `tick`
// after every 15 frames. Returns what it did.
function hold(state, { until = (s) => s.cultivation.completed, tick = () => {} } = {}) {
  const refused = [];
  const kinds = {};
  const auto = createAutoplaySession(
    0,
    (intent, result) => {
      kinds[intent.type] = (kinds[intent.type] || 0) + 1;
      if (!result) refused.push(intent);
    },
    { state }
  );
  auto.press();
  const end = state.time + LIMIT;
  while (!until(state) && state.time < end) {
    auto.advanceTicks(15);
    tick();
  }
  return { refused, kinds };
}

test('AUTO wins a fresh crystal world, every act through the controller, none refused', () => {
  const s = C.createState(9, { cultivation: true });
  const run = hold(s);
  assert.equal(s.cultivation.completed, true, 'the machine woke');
  assert.deepEqual(run.refused, []);
  assert.ok(s.time < 60 * 60, 'within the hour: ' + Math.round(s.time / 60) + ' min');
  assert.ok(run.kinds.cultivate >= 12, 'built, planted, tended, repaired and woke it');
  assert.equal(s.cultivation.heart.where, 'installed', 'the heart was carried home');
});

test('AUTO picks a crystal world up where it was: a reload on the way to the heart', () => {
  const s = C.createState(3, { cultivation: true });
  const machine = (t) => t.cultivation.facilities.find((b) => b.kind === 'machine');
  hold(s, { until: (t) => machine(t) && C.machineSections(machine(t)) >= 1 && t.player.z === 0 });
  assert.equal(s.player.z, 0, 'up on the surface, the heart still out there');
  const back = C.deserialize(C.serialize(s));
  const run = hold(back);
  assert.equal(back.cultivation.completed, true);
  assert.deepEqual(run.refused, []);
});

// A game in crystal room `r` as key `key`, sending what it did the way together.js does.
async function roomGame(r, key, now) {
  const j = await r.join(key, undefined, now, false, { crystal: true, seats: true });
  const s = C.joinState(j.welcome, r.id, null, null);
  s.time = j.welcome.time;
  s.acts = [];
  const edits = new Bucket(now, 1e9, 1e9);
  const base = s.stats.playedMs;
  let savedAt = base;
  const send = (m) => {
    const out = r.message(
      j.id,
      JSON.stringify(m),
      now + Math.round(s.stats.playedMs - base),
      edits
    );
    assert.ok(!out.drop, 'the room took ' + m.t);
  };
  const sync = (force = false) => {
    r.players.get(j.id).p = P.cleanPos(s.player);
    const acts = C.takeActs(s);
    for (let i = 0; i < acts.length; i += P.LIMITS.actsPerMessage)
      send({ t: 'acts', ms: Math.round(s.stats.playedMs), a: acts.slice(i, i + 256) });
    const list = C.takeEdits(s);
    for (let i = 0; i < list.length; i += P.LIMITS.editsPerMessage)
      send({ t: 'edits', e: list.slice(i, i + P.LIMITS.editsPerMessage) });
    if (force || s.stats.playedMs - savedAt >= 10_000) {
      savedAt = s.stats.playedMs;
      send({ t: 'save', s: C.progressOf(s) });
    }
  };
  return { s, id: j.id, sync };
}

test('AUTO in a crystal room: the room agrees with every act, and coming back it carries on', async () => {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  const world = { seed: 15, mods: [], props: [], ext: [] };
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world, eco: 'crystal' }), T0), null);
  const g = await roomGame(r, key, T0);
  // Home with the heart, deep down: there it leaves.
  const run = hold(g.s, {
    until: (t) => t.cultivation.heart.where === 'carried' && t.player.z === -2,
    tick: g.sync
  });
  g.sync(true);
  assert.equal(g.s.cultivation.heart.where, 'carried');
  // Back later: the room keeps no fog, so nothing around is seen yet.
  const T1 = T0 + 1e7;
  const back = await roomGame(r, key, T1);
  assert.equal(back.s.cultivation.heart.where, 'carried');
  const p = back.s.player;
  assert.equal(C.isExplored(back.s.world, Math.floor(p.x) + 1, Math.floor(p.y), p.z), false);
  const rest = hold(back.s, { tick: back.sync });
  back.sync(true);
  assert.equal(back.s.cultivation.completed, true);
  assert.deepEqual([...run.refused, ...rest.refused], []);
  const report = r.shadowOf().report(back.id);
  assert.deepEqual({ off: report.off, refused: report.refused }, { off: 0, refused: 0 });
  assert.deepEqual(
    r.log.filter((e) => e.e === 'drift'),
    []
  );
  const copy = JSON.parse(r.saveFor(back.id, r.players.get(back.id)));
  assert.equal(copy.cultivation.completed, true, 'the machine woke in the room too');
});

test('AUTO short of metal for a repair gets it first, never asking the machine for nothing', () => {
  const s = C.createState(3, { cultivation: true });
  hold(s, { until: (t) => t.cultivation.heart.where === 'carried' && t.player.z === -2 });
  s.inv.ore = 0;
  const run = hold(s);
  assert.equal(s.cultivation.completed, true);
  assert.deepEqual(run.refused, []);
});

test('AUTO in a crystal world with nothing left to do waits, and says so', () => {
  const s = C.createState(9, { cultivation: true });
  s.cultivation.completed = true;
  assert.equal(C.nextCrystalIntent(s, C.newCrystalMind()).why, 'done');
});
