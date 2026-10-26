/* No control rewards being pressed quickly (Watch, 2026-10-26): pressing
 * Gather (or Space) again and again, tapping a tile, drawing Trail after
 * Trail, or all of them at once never works tiles faster than holding
 * Gather down. Every way takes turns on one clock (core pace.js), and the
 * room holds each player's acts to the same clock (server/src/shadow.js). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { createController } from '../../src/game/controller.js';
import { Shadow } from '../../server/src/shadow.js';

const DT = 1 / 60;
const SECONDS = 10;
const feedback = () => new Proxy({}, { get: () => () => {} });

// A player in the middle of a patch of forest that never runs out.
function grove() {
  const s = C.createState(12345);
  const X = 300, Y = 300;
  for (let y = Y - 3; y <= Y + 3; y++) for (let x = X - 3; x <= X + 3; x++) {
    C.tileAt(s.world, x, y, 0);
    s.world.chunks.get(C.packKey(C.chunkCoord(x), C.chunkCoord(y), 0)).type[C.chunkIndex(x, y)] = C.T.FOREST;
    C.setRichness(s.world, x, y, 0, 1e6);
    C.markExplored(s.world, x, y, 0);
  }
  s.player = { x: X + 0.5, y: Y + 0.5, z: 0 };
  return { s, X, Y };
}

// Plays SECONDS the way the game's simulation does (steer, step, then the
// controller's tick), with `each(c, tick)` pressing whatever it likes before
// every tick and `holding(tick)` saying whether Gather is held. Returns the
// tiles worked.
function play(each, holding = () => false) {
  const { s, X, Y } = grove();
  const c = createController({ game: { state: s, saveSoon() {} }, fx: feedback(), hud: feedback(), audio: feedback(),
    look: { color: () => '' }, actor: { act() {} }, cam: { unproject: (x, y) => ({ x, y }) } });
  for (let i = 0; i < SECONDS * 60; i++) {
    each(c, i, X, Y);
    c.steer(DT, { x: 0, y: 0 });
    C.step(s, DT);
    c.tick(DT, holding(i));
  }
  return s.stats.gathers;
}

const held = () => play((c, i) => { if (i === 0) c.press(); }, () => true);
// A stroke across the tiles round the player.
const stroke = (X, Y) => [{ x: X - 0.5, y: Y + 0.5 }, { x: X + 1.5, y: Y + 0.5 }, { x: X + 1.5, y: Y + 1.5 }, { x: X - 0.5, y: Y + 1.5 }];

test('pace: holding Gather works a tile four times a second, on the beat', () => {
  assert.equal(held(), SECONDS * C.HANDS_PER_SECOND + 1, 'the press, then a repeat every quarter second');
});

test('pace: pressing Gather or Space every frame is no faster than holding it, and no slower', () => {
  const hold = held();
  const spam = play((c) => c.press());
  assert.ok(spam <= hold, `spam ${spam} > hold ${hold}`);
  assert.ok(spam >= hold - 1, `spam ${spam} far below hold ${hold}`);
});

test('pace: tapping a tile again and again is no faster than holding Gather', () => {
  const hold = held();
  const taps = play((c, i, X, Y) => { if (i % 2 === 0) c.tap(X + 1, Y); });
  assert.ok(taps <= hold, `taps ${taps} > hold ${hold}`);
  assert.ok(taps >= hold - 1, 'a tap during the wait is kept for the next turn');
});

test('pace: a Trail works its tiles a turn each, so stroke after stroke is no faster', () => {
  const hold = held();
  const one = play((c, i, X, Y) => { if (i === 0) c.trailEnded(stroke(X, Y)); });
  assert.equal(one, 6, 'one stroke still works each tile it crossed');
  const strokes = play((c, i, X, Y) => { if (i % 3 === 0) c.trailEnded(stroke(X, Y)); });
  assert.ok(strokes <= hold, `strokes ${strokes} > hold ${hold}`);
});

test('pace: every way at once, at random moments, is never faster than holding', () => {
  const hold = held();
  for (let seed = 1; seed <= 12; seed++) {
    let r = seed * 2654435761 >>> 0;
    const rand = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const holding = new Set();
    const n = play((c, i, X, Y) => {
      const k = rand();
      if (k < 0.2) c.press();
      else if (k < 0.3) c.tap(X + Math.floor(rand() * 3) - 1, Y + Math.floor(rand() * 3) - 1);
      else if (k < 0.33) c.trailEnded(stroke(X, Y));
      if (rand() < 0.5) holding.add(i);
    }, (i) => holding.has(i));
    assert.ok(n <= hold, `seed ${seed}: ${n} > ${hold}`);
  }
});

test('pace: a forgotten world leaves no early press or Trail waiting', () => {
  const n = play((c, i, X, Y) => {
    if (i === 0) { c.press(); c.press(); c.trailEnded(stroke(X, Y)); c.forget(); }
  });
  assert.equal(n, 1, 'only the press that came on its turn');
});

test('pace: the hand clock keeps the beat, and a new world starts it afresh', () => {
  const h = C.handClock();
  assert.ok(C.handReady(h, 0));
  C.useHand(h, 0);
  assert.ok(!C.handReady(h, 249));
  assert.ok(C.handReady(h, 250));
  C.useHand(h, 260); // a frame late: the next is still due at 500
  assert.equal(h.at, 500);
  C.useHand(h, 2000); // after a pause: from now
  assert.equal(h.at, 2250);
  C.useHand(h, 10); // play time went back: a new world
  assert.equal(h.at, 260);
});

// The room's side: a game that sends more than the pace allows has the
// extra refused, however the acts are spaced or bunched.
function room() {
  const shadow = new Shadow(12345);
  const sh = { s: { stats: { playedMs: 0 } }, hand: C.handClock(), last: null };
  return (ms) => shadow.allowed(sh, ['h', ms, 0, 0, 0, 0, 0], Infinity);
}

test('pace: the room allows one tile worked a turn, rounded play time and all', () => {
  const allow = room();
  let ok = 0;
  for (let i = 0; i < 40; i++) ok += allow(Math.round(i * 250 + (i % 3) * 0.4)); // a held hand, as sent
  assert.equal(ok, 40);
});

test('pace: the room refuses gathers faster than the pace, spammed or bunched', () => {
  const spam = room();
  let ok = 0;
  for (let ms = 0; ms < 10_000; ms += 50) ok += spam(ms); // twenty a second
  assert.equal(ok, 10_000 / C.HAND_MS);
  const burst = room();
  ok = 0;
  for (let i = 0; i < 30; i++) ok += burst(1000); // a whole Trail at once, as old games sent it
  assert.equal(ok, 1);
});
