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
const LIMIT = 90 * 60; // game seconds: a win takes about half an hour

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
  while (!until(state) && state.time < LIMIT) {
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

test('AUTO in a crystal room: the room agrees with every act, start to the machine woken', async () => {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  const world = { seed: 15, mods: [], props: [], ext: [] };
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world, eco: 'crystal' }), T0), null);
  const j = await r.join(key, undefined, T0, false, true);
  const s = C.joinState(j.welcome, r.id, null, null);
  s.time = j.welcome.time;
  s.acts = [];
  const edits = new Bucket(T0, 1e9, 1e9);
  let savedAt = 0;
  const send = (m) => {
    const out = r.message(j.id, JSON.stringify(m), T0 + Math.round(s.stats.playedMs), edits);
    assert.ok(!out.drop, 'the room took ' + m.t);
  };
  const sync = () => {
    r.players.get(j.id).p = P.cleanPos(s.player);
    const acts = C.takeActs(s);
    for (let i = 0; i < acts.length; i += P.LIMITS.actsPerMessage)
      send({ t: 'acts', ms: Math.round(s.stats.playedMs), a: acts.slice(i, i + 256) });
    const list = C.takeEdits(s);
    for (let i = 0; i < list.length; i += P.LIMITS.editsPerMessage)
      send({ t: 'edits', e: list.slice(i, i + P.LIMITS.editsPerMessage) });
    if (s.stats.playedMs - savedAt >= 10_000) {
      savedAt = s.stats.playedMs;
      send({ t: 'save', s: C.progressOf(s) });
    }
  };
  const run = hold(s, { tick: sync });
  sync();
  assert.equal(s.cultivation.completed, true);
  assert.deepEqual(run.refused, []);
  const report = r.shadowOf().report(j.id);
  assert.deepEqual({ off: report.off, refused: report.refused }, { off: 0, refused: 0 });
  assert.deepEqual(
    r.log.filter((e) => e.e === 'drift'),
    []
  );
  const copy = JSON.parse(r.saveFor(j.id, r.players.get(j.id)));
  assert.equal(copy.cultivation.completed, true, 'the machine woke in the room too');
});

test('AUTO in a crystal world with nothing left to do waits, and says so', () => {
  const s = C.createState(9, { cultivation: true });
  s.cultivation.completed = true;
  assert.equal(C.nextCrystalIntent(s, C.newCrystalMind()).why, 'done');
});
