/* What a phone keeps of what it sent a shared world's room until the room
 * has it (src/game/outbox.js), driven through the orderings a real
 * connection makes: answers late or never, a connection dying with a
 * backlog, a game closed before it reconnects. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C } from './helpers.js';
import { LIMITS } from '../../src/net/protocol.js';
import {
  createOutbox, keptActsFrom, resync,
  SENT_KEPT, ACTS_KEPT_MS, ACTS_KEPT_MAX, MAX_UNACKED, ACTS_PER_TICK
} from '../../src/game/outbox.js';

// A player state that has done `n` walks, one every `gap` ms of play.
function walked(n, gap = 10, from = 0) {
  const s = C.createState(7);
  s.acts = [];
  for (let i = 0; i < n; i++) s.acts.push(['w', from + i * gap, i, 0, 0]);
  s.stats.playedMs = from + n * gap;
  return s;
}

const noWorld = { mods: [], props: [], ext: [] };

test('outbox: edits are numbered in order and forgotten once the room answers them', () => {
  const o = createOutbox();
  assert.equal(o.edit([['m', 1, 2]]), 1);
  assert.equal(o.edit([['m', 2, 2]]), 2);
  assert.equal(o.edit([['m', 3, 2]]), 3);
  o.acked(2);
  assert.equal(o.unacked, 1);
  o.acked('3'); // not a number: ignored
  assert.equal(o.unacked, 1);
  assert.deepEqual(o.lostEdits(noWorld), [['m', 3, 2]]);
  assert.equal(o.unacked, 0, 'lost edits go out again as new ones');
  assert.equal(o.edit([]), 4, 'numbers keep counting');
});

test('outbox: a lost edit is not sent again where the room already has something', () => {
  const o = createOutbox();
  o.edit([['m', 10, 1], ['p', 11, 1], ['x', 'garden', 5, 6, 0]]);
  o.edit([['m', 12, 1], ['x', 'garden', 7, 8, 0]]);
  const w = { mods: [[10, 3]], props: [[11, 0]], ext: [['garden', 5, 6, 0, 'someone']] };
  assert.deepEqual(o.lostEdits(w), [['m', 12, 1], ['x', 'garden', 7, 8, 0]]);
});

test('outbox: at most MAX_UNACKED batches wait for an answer', () => {
  const o = createOutbox();
  for (let i = 0; i < MAX_UNACKED + 10; i++) o.edit([['m', i, 1]]);
  assert.equal(o.unacked, MAX_UNACKED);
  assert.deepEqual(o.lostEdits(noWorld)[0], ['m', 10, 1], 'the oldest went first');
});

test('outbox: a long backlog of acts goes a few messages a tick, never ahead of what is still to come', () => {
  const per = LIMITS.actsPerMessage;
  const total = per * ACTS_PER_TICK * 2 + 5;
  const s = walked(total);
  const o = createOutbox();
  const sentAll = [];
  let ticks = 0, done = false;
  while (!done) {
    const t = o.takeActs(s);
    ticks++;
    assert.ok(t.messages.length <= ACTS_PER_TICK);
    for (const m of t.messages) {
      assert.ok(m.a.length <= per);
      if (t.done && m === t.messages[t.messages.length - 1]) assert.equal(m.ms, s.stats.playedMs, 'the last carries the play time now');
      else assert.equal(m.ms, m.a[m.a.length - 1][1], 'others are as of their own last act');
      sentAll.push(...m.a);
    }
    done = t.done;
  }
  assert.equal(ticks, 3);
  assert.equal(sentAll.length, total);
  assert.deepEqual(sentAll.map((a) => a[1]), [...sentAll.map((a) => a[1])].sort((x, y) => x - y), 'in order');
  assert.deepEqual(o.takeActs(s), { messages: [], done: true });
});

test('outbox: back after a lost connection, acts the room has not done go again, first', () => {
  const s = walked(20, 1000); // a walk a second for 20 s
  const o = createOutbox();
  o.takeActs(s);
  s.acts.push(['w', 20_500, 99, 0, 0]); // done while the connection was down
  o.resendActs(s, 14_000); // the room's copy is as of 14 s
  assert.deepEqual(s.acts.map((a) => a[1]), [15_000, 16_000, 17_000, 18_000, 19_000, 20_500]);
  o.resendActs(s, 0);
  assert.equal(s.acts.length, 6, 'sent again once, not every time');
});

test('outbox: acts are kept a minute of play after sending, and at most ACTS_KEPT_MAX', () => {
  const o = createOutbox();
  const s = walked(100, 1000); // 100 s of play
  while (!o.takeActs(s).done);
  o.resendActs(s, -1);
  assert.equal(s.acts[0][1], s.stats.playedMs - ACTS_KEPT_MS, 'older ones the room has had long enough');

  const o2 = createOutbox();
  const big = walked(ACTS_KEPT_MAX + 300, 1);
  while (!o2.takeActs(big).done);
  o2.resendActs(big, -1);
  assert.equal(big.acts.length, ACTS_KEPT_MAX);
});

test('outbox: acts kept on the phone come back the way they were, and junk is left out', () => {
  const o = createOutbox();
  const s = walked(10, 1000);
  o.takeActs(s);
  s.acts.push(['w', 10_500, 1, 1, 0]);
  const raw = o.kept(s);
  assert.equal(o.keptWaiting, true);
  assert.deepEqual(keptActsFrom(raw, 7_000).map((a) => a[1]), [8_000, 9_000, 10_500]);
  assert.deepEqual(keptActsFrom(raw, Infinity), [['w', 10_500, 1, 1, 0]], 'waiting ones always');

  for (const bad of [null, '', 'not json', '[]', '{"sent":5}', 'null']) assert.deepEqual(keptActsFrom(bad, 0), [], String(bad));
  const mixed = JSON.stringify({ sent: [['w', 5, 1, 1, 0], ['zz', 6, 1, 1, 0], ['w', 'x', 1, 1, 0], 'w'], waiting: [['w', 7, 1, 1, 0.5], ['h', 8, 1, 2, 3]] });
  assert.deepEqual(keptActsFrom(mixed, 0), [['w', 5, 1, 1, 0], ['h', 8, 1, 2, 3]]);

  s.acts = [];
  o.kept(s);
  assert.equal(o.keptWaiting, false);
});

test('outbox: the room\'s answer is matched to the progress it answers, while it is remembered', () => {
  const o = createOutbox();
  const s = C.createState(7);
  const ns = [];
  for (let i = 0; i < SENT_KEPT + 2; i++) {
    s.stats.playedMs = i * 1000.4;
    s.inv.mycelium = i;
    ns.push(o.save(s));
  }
  assert.deepEqual(ns, ns.map((_, i) => i + 1));
  assert.equal(o.answered(1), null, 'too old: forgotten');
  assert.equal(o.answered(2), null);
  const x = o.answered(5);
  assert.equal(x.n, 5);
  assert.equal(x.ms, Math.round(4 * 1000.4));
  assert.equal(x.inv.mycelium, 4);
  assert.equal(o.answered('5'), null);
  assert.equal(o.answered(99), null);
});

test('outbox: what buildings made while away is counted in every save the room may still answer', () => {
  const o = createOutbox();
  const s = C.createState(7);
  s.inv.mycelium = 3;
  o.save(s); o.save(s);
  o.earnedAway({ mycelium: 5, crystal: 0, junk: 4 });
  assert.equal(o.answered(1).inv.mycelium, 8);
  assert.equal(o.answered(2).inv.mycelium, 8);
  assert.equal(o.answered(2).inv.junk, undefined, 'only real resources');
});

test('outbox: leaving forgets everything; a new world forgets what was for the old one', () => {
  const s = walked(5);
  const o = createOutbox();
  o.edit([['m', 1, 1]]);
  o.takeActs(s);
  o.save(s);
  o.newWorld();
  assert.equal(o.unacked, 0);
  o.resendActs(s, -1);
  assert.equal(s.acts.length, 0);
  assert.ok(o.answered(1), 'progress is the player\'s own, kept across worlds');
  o.reset();
  assert.equal(o.answered(1), null);
});

test('outbox: resync takes the room\'s world, keeps your progress and sends again what it lacks', () => {
  const s = C.createState(7);
  s.me = 'me';
  s.acts = [];
  s.world.edits = [];
  const o = createOutbox();
  const at = (k) => { const { x, y, z } = C.unpackKey(k); return C.baseRichness(s.world, x, y, z) + 7; }; // not the land as made
  o.edit([['m', 500, at(500)]]);  // never answered
  s.world.edits.push(['m', 600, at(600)]); // not sent yet
  const keep = { ...s.inv };
  resync(s, { mods: [[700, at(700)]], props: [], ext: [] }, 'me', o, 0);
  assert.deepEqual(s.inv, keep);
  assert.deepEqual(s.world.edits, [['m', 500, at(500)], ['m', 600, at(600)]], 'to send again, oldest first');
  assert.ok(s.world.mods.has(700), 'the room\'s world');
  assert.ok(s.world.mods.has(500) && s.world.mods.has(600), 'with yours over it');
  assert.equal(o.unacked, 0);
});
