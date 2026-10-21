/* The room's own copy of each player's progress (server/src/shadow.js): a
 * bot plays a shared world as a game would, sending what it did, its edits
 * and its progress the way src/game/together.js does, and the room, working
 * only from what it did, must come out with the same numbers. And when a
 * game's numbers don't follow from what it did, the room says so. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket } from '../../server/src/room.js';
import { C, T, createBot, holdPerfect } from './helpers.js';

const T0 = 1_700_000_000_000;
const SAVE_EVERY_MS = 10_000;

// A room made from a new world, a player in it, and a game playing there.
// `awayProduce` is that player's own freeze-season choice (Settings), told to
// the room when they join; the default is frozen, as a real game without it.
async function sharedGame(seed, awayProduce = false) {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world: { seed, mods: [], props: [], ext: [] } }), T0), null);
  const j = await r.join(key, undefined, T0, awayProduce);
  const s = C.joinState(j.welcome, r.id, null, null);
  s.time = j.welcome.time; // the game keeps the room's clock (together.js keepTime)
  assert.ok(j.welcome.acts, 'the room asks for acts');
  s.acts = [];
  const id = j.id;
  const edits = new Bucket(T0, 1e9, 1e9); // edit budgets aren't what's tested here
  let savedAt = 0;
  let off = 0; // wall time spent away from the game (not playing)
  const now = () => T0 + off + Math.round(s.stats.playedMs);
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
  const away = (ms) => { off += ms; };
  return { r, s, id, key, sync, send, now, away };
}

const drifts = (r) => r.log.filter((e) => e.e === 'drift');

// The Perfect button plays only through a player's own acts, so the room,
// replaying them, must come out exactly where the game did: no refused act,
// no drift, from the first spawn on through its first buildings.
test('shadow: the Perfect button, held, plays a shared world the room agrees with', async () => {
  const g = await sharedGame(777);
  const { s, r, id, sync } = g;
  let n = 0;
  holdPerfect(s, 20 * 60, { tick: () => { if (++n % 5 === 0) sync(); } });
  sync(true);
  const report = r.shadow.report(id);
  assert.ok(report.checks >= 20, 'the room checked often (' + report.checks + ')');
  assert.equal(report.refused, 0, 'every act was allowed');
  // Logistics hauls whole units a step at a time, and the room hears where
  // you walk every half tile: a few units can land a step apart. Never more,
  // and never a level.
  for (const d of drifts(r)) {
    assert.deepEqual(d.levels, [], JSON.stringify(d));
    for (const [, theirs, ours] of d.res) assert.ok(Math.abs(theirs - ours) <= 10, JSON.stringify(d));
  }
  assert.ok(s.extractors.length >= 4 && s.tools.pickaxe >= 2, 'it really played (' + s.extractors.length + ' buildings)');
});

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

test('shadow: progress that doesn\'t follow from what was done is logged, not kept, and the game is set straight', async () => {
  const { s, r, id, sync, send } = await sharedGame(12345);
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 6);
  sync(true);
  assert.deepEqual(drifts(r), []);
  // An edited save: half a billion stone out of nowhere.
  const hacked = JSON.parse(C.progressOf(s));
  hacked.inv.stone = 500_000_000;
  hacked.tools.pickaxe = 6;
  const out = send({ t: 'save', s: JSON.stringify(hacked) });
  const d = drifts(r);
  assert.equal(d.length, 1);
  assert.deepEqual(d[0].res.find((x) => x[0] === 'stone').slice(1), [500_000_000, s.inv.stone]);
  assert.deepEqual(d[0].levels.find((x) => x[0] === 'tool.pickaxe'), ['tool.pickaxe', 6, 1]);
  assert.equal(r.shadow.report(id).off, 1);
  assert.ok(r.roster(g0()).find((p) => p.id === id).shadow.off === 1, 'the moderator sees it');
  const kept = JSON.parse(r.players.get(id).save);
  assert.deepEqual([kept.inv.stone, kept.tools.pickaxe], [s.inv.stone, 1], 'the room keeps its own numbers');
  assert.equal(out.toSelf[0].t, 'econ');
  assert.equal(out.toSelf[0].ms, Math.round(hacked.stats.playedMs));
  // The game takes them, keeping what it got since it sent its progress.
  const sentInv = { ...hacked.inv };
  s.inv.stone = 500_000_007;
  assert.ok(C.correctProgress(s, out.toSelf[0].s, { inv: sentInv }));
  assert.deepEqual([s.inv.stone, s.tools.pickaxe], [kept.inv.stone + 7, 1]);
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

test('shadow: a tile with a building on it can\'t be gathered by hand', async () => {
  const { s, r, id, sync, send } = await sharedGame(12345);
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 15);
  b.standBy((st, x, y) => C.tileAt(st.world, x, y, C.SURFACE) === T.FOREST && C.richness(st.world, x, y, C.SURFACE) > 1);
  const built = C.place(s, 'garden', { x: Math.floor(s.player.x), y: Math.floor(s.player.y) });
  assert.ok(built.ok);
  sync(true);
  const copy = r.shadow.players.get(id).s;
  assert.ok(C.richness(copy.world, built.x, built.y, C.SURFACE) > 0, 'there is something left to gather');
  const refused = r.shadow.report(id).refused, before = copy.inv.mycelium;
  // A game that ignores the rule works the building's tile anyway.
  const ms = Math.round(s.stats.playedMs) + 250, p = s.player;
  send({ t: 'acts', ms, a: [['h', ms, p.x, p.y, p.z, built.x, built.y]] });
  assert.equal(r.shadow.report(id).refused, refused + 1);
  assert.equal(copy.inv.mycelium, before);
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
  const { buyNow, buildNow, standBy } = createBot(12345, s, sync);
  buyNow('basket'); buyNow('boots'); buyNow('pickaxe');
  assert.ok(buildNow('garden').ok && buildNow('quarry').ok && buildNow('mine').ok, 'a garden, a quarry and a mine');
  assert.ok(buyNow('logistics').ok, 'Logistics');
  assert.ok(buyNow('overclock').ok);
  // Back to the quarry, so Logistics hauls from it.
  assert.ok(standBy((st, x, y) => (C.extractorAt(st, x, y, 0) || {}).key === 'quarry'));
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

test('shadow: what nobody could do gets nobody anything', async () => {
  const { s, r, id, sync, send } = await sharedGame(12345);
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 4);
  sync(true);
  const p = s.player, ms = Math.round(s.stats.playedMs) + 1000;
  // A hundred gathers in one moment, more than any Trail stroke works.
  const flurry = Array.from({ length: 100 }, (_, i) => ['h', ms, p.x, p.y, p.z, Math.floor(p.x) + (i % 3) - 1, Math.floor(p.y) + (Math.floor(i / 3) % 3) - 1]);
  // And a step of a kilometre in a second, to gather over there.
  const leap = ['h', ms + 1000, p.x + 1000, p.y, p.z, Math.floor(p.x) + 1000, Math.floor(p.y)];
  // And acts from further ahead than the room's clock.
  const ahead = ['c', ms + 60_000, p.x, p.y, p.z];
  send({ t: 'acts', ms: ms + 1000, a: [...flurry.slice(0, 50), ...flurry.slice(50), leap, ahead] });
  assert.ok(r.shadow.report(id).refused >= 100 - 40 + 2, 'past the budget, the leap and the future are refused (' + r.shadow.report(id).refused + ')');
});

test('shadow: buildings go up in the room\'s world from what the room worked out, not from the game\'s edits', async () => {
  const { s, r, id, sync, send, now } = await sharedGame(12345);
  const b = createBot(12345, s, sync);
  // A hacked game's edit: a building it never paid for.
  send({ t: 'pos', p: P.cleanPos(s.player) });
  send({ t: 'edits', e: [['x', 'garden', Math.floor(s.player.x) + 1, Math.floor(s.player.y), 0]] });
  assert.equal(r.ext.length, 0);
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST));
  assert.ok(C.place(s, 'garden').ok);
  const e = s.extractors.find((x) => x.owner === id);
  const acts = C.takeActs(s);
  const out = r.message(id, JSON.stringify({ t: 'acts', ms: Math.round(s.stats.playedMs), a: acts }), now());
  assert.deepEqual(r.ext.map((x) => x.slice(1, 5)), [[e.x, e.y, e.z, id]], 'the garden they paid for stands');
  assert.deepEqual(out.toAll[0].e, [['x', 'garden', e.x, e.y, e.z, id]], 'and everyone hears');
});

// What the game does with the room's answers to its progress (together.js).
function hear(s, out) {
  for (const m of out.toSelf || []) {
    if (m.t === 'away') for (const r of C.RESOURCES) if (m.made[r] > 0) C.earn(s, r, m.made[r], 'buildings');
  }
}

test('shadow: buildings in a shared world keep working while their owner is away, up to 8 hours, once', async () => {
  const { s, r, id, key, sync, send, now, away } = await sharedGame(12345, true);
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST)); assert.ok(C.place(s, 'garden').ok);
  sync(true);
  const rate = C.extractorRate(s, 'garden');
  r.left(id, false, now());
  away(3600_000); // an hour with the game closed
  await r.join(key, undefined, now(), true);
  const before = s.inv.mycelium;
  const out = send({ t: 'save', s: C.progressOf(s) });
  const m = (out.toSelf || []).find((x) => x.t === 'away');
  assert.ok(m, 'the game hears what was made: ' + JSON.stringify(out));
  assert.ok(Math.abs(m.secs - 3600) <= 1, 'an hour away (' + m.secs + ')');
  assert.ok(Math.abs(m.made.mycelium - rate * 3600) < 1, 'what the garden makes in an hour');
  assert.ok(r.log.some((e) => e.e === 'away' && e.p === id), 'and the log says so');
  hear(s, out);
  assert.ok(s.inv.mycelium - before > rate * 3500);
  // The room keeps it, and the game and the room still agree.
  assert.ok(JSON.parse(r.players.get(id).save).inv.mycelium >= s.inv.mycelium - 1);
  const again = send({ t: 'save', s: C.progressOf(s) });
  assert.deepEqual(again.toSelf || [], [], 'counted once, and no drift');
  assert.deepEqual(drifts(r), []);
  // Away for days: still 8 hours' worth.
  r.left(id, true, now());
  away(3 * 86400_000);
  await r.join(key, undefined, now(), true);
  const long = (send({ t: 'save', s: C.progressOf(s) }).toSelf || []).find((x) => x.t === 'away');
  assert.equal(long.secs, C.AWAY_CAP);
});

test('shadow: freeze season — a shared world makes nothing while their owner is away by default', async () => {
  const { s, r, id, key, sync, send, now, away } = await sharedGame(12345); // no opt-in: frozen
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST)); assert.ok(C.place(s, 'garden').ok);
  sync(true);
  const before = s.inv.mycelium;
  r.left(id, false, now());
  away(3600_000); // an hour with the game closed
  await r.join(key, undefined, now()); // still nothing said: frozen
  const out = send({ t: 'save', s: C.progressOf(s) });
  assert.ok(!(out.toSelf || []).some((x) => x.t === 'away'), 'no away credit: ' + JSON.stringify(out));
  assert.ok(!r.log.some((e) => e.e === 'away' && e.p === id), 'and the log says nothing was made');
  assert.ok(Math.abs(s.inv.mycelium - before) < 1e-6, 'the packs did not change');
});

test('shadow: freeze season — turning it on while playing is honoured at once', async () => {
  const { s, r, id, key, sync, send, now, away } = await sharedGame(12345); // starts frozen
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST)); assert.ok(C.place(s, 'garden').ok);
  sync(true);
  const rate = C.extractorRate(s, 'garden');
  r.left(id, false, now()); // leaves while frozen
  away(3600_000);
  await r.join(key, undefined, now(), true); // Settings turned it on since
  const out = send({ t: 'save', s: C.progressOf(s) });
  const m = (out.toSelf || []).find((x) => x.t === 'away');
  assert.ok(m && Math.abs(m.made.mycelium - rate * 3600) < 1, 'opted in, so the hour counts: ' + JSON.stringify(out));
});

test('shadow: a game that played on through a lost connection was not away', async () => {
  const { s, r, id, key, sync, send, now } = await sharedGame(12345);
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST)); assert.ok(C.place(s, 'garden').ok);
  sync(true);
  r.left(id, false, now());
  // A minute of play with nobody to hear it, then back.
  for (let i = 0; i < 600; i++) C.step(s, 0.1);
  await r.join(key, undefined, now());
  sync(true);
  const out = send({ t: 'save', s: C.progressOf(s) });
  assert.ok(!(out.toSelf || []).some((x) => x.t === 'away'), 'nothing extra for time spent playing');
  assert.deepEqual(drifts(r), []);
});

test('shadow: someone who left before rooms noted when is away since their last progress', async () => {
  const { s, r, id, key, sync, send, now, away } = await sharedGame(12345);
  const b = createBot(12345, s, sync);
  b.gather('mycelium', 15); b.standBy(b.free(T.FOREST)); assert.ok(C.place(s, 'garden').ok);
  sync(true);
  const rate = C.extractorRate(s, 'garden');
  const left = now();
  r.left(id, true, left);
  delete r.players.get(id).gone; // as a room from before v0.100.0 kept them
  r.shadow.forget(id);           // and a restarted room starts its copy from the save
  away(3600_000);
  await r.join(key, undefined, now(), true);
  const m = (send({ t: 'save', s: C.progressOf(s) }).toSelf || []).find((x) => x.t === 'away');
  assert.ok(m, 'their buildings made something meanwhile');
  const since = (now() - r.players.get(id).savedAt) / 1000;
  assert.ok(m.secs >= 3600 && m.secs <= 3600 + 15, 'from their last progress (' + m.secs + ', ' + since + ')');
  assert.ok(m.made.mycelium >= rate * 3600 - 1);
});

test('overCounted: a phone that showed far more than the room counts', () => {
  const save = (inv, n = 0) => JSON.stringify({ inv, extractors: Array.from({ length: n }, () => ({})) });
  assert.ok(C.overCounted(save({ mycelium: 1.4e14 }, 327), save({ mycelium: 1.8e8 }, 186)), 'the runaway of v0.91.0');
  assert.ok(C.overCounted(save({ mycelium: 10 }, 20), save({ mycelium: 10 }, 10)), 'buildings only the phone had');
  assert.ok(!C.overCounted(save({ mycelium: 1200 }, 3), save({ mycelium: 1000 }, 3)), 'a little ahead is just timing');
  assert.ok(!C.overCounted(save({ mycelium: 500 }), save({ mycelium: 1 })), 'small numbers never count');
  assert.ok(!C.overCounted(null, save({})) && !C.overCounted('{bad', save({})) && !C.overCounted(save({}), null));
});

test('correctProgress: a room before v0.106.0 named no kinds: your building standing there stays', () => {
  const s = C.createState(7);
  s.me = 'a1a1a1a1a1a1a1a1';
  s.extractors.push({ key: 'quarry', res: 'stone', x: 3, y: 4, z: 0, buffer: 0, owner: s.me });
  const was = C.sentOf(s);
  const old = JSON.parse(C.progressOf(s));
  old.extractors = old.extractors.map(({ k, ...e }) => ({ ...e, b: 5 }));
  assert.ok(C.correctProgress(s, JSON.stringify(old), was));
  assert.deepEqual(s.extractors.map((e) => [e.key, e.x, e.y, e.buffer]), [['quarry', 3, 4, 5]]);
  assert.equal(C.takenBack(was, s), null, 'nothing taken back');
  old.extractors = [];
  C.correctProgress(s, JSON.stringify(old), was);
  assert.deepEqual(C.takenBack(was, s), { buildings: 1, levels: 0, res: [] }, 'one the room never had comes down, and that is said');
});
