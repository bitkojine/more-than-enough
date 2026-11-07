/* Machines side by side (0.198.0): in a crystal room every player's machine
 * lies buried at their own seat in a row in the deep under spawn
 * (src/core/cultivation-seats.js). AUTO digs each out where it should be,
 * the room agrees, nobody builds on a seat, and a game from before seats
 * still finds its machine where it always did, with the room agreeing. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import * as P from '../../src/net/protocol.js';
import { Room, Bucket } from '../../server/src/room.js';
import { createAutoplaySession } from '../../src/game/autoplay-session.js';
import { cleanWelcome } from '../../src/game/room-messages.js';

const T0 = 1_700_000_000_000;
const machine = (s) => s.cultivation.facilities.find((b) => b.kind === 'machine');

// Holds AUTO in `s` until its machine shows (at most an hour of game time).
function untilMachine(s, tick) {
  const refused = [];
  const auto = createAutoplaySession(0, (intent, ok) => ok || refused.push(intent), { state: s });
  auto.press();
  const end = s.time + 3600;
  while (!machine(s) && s.time < end) {
    auto.advanceTicks(15);
    tick();
  }
  return refused;
}

// A game in room `r`, the way together.js plays one; `seats`: a game that knows of seats.
async function play(r, key, code, now, seats) {
  const j = await r.join(key, code, now, false, { crystal: true, seats });
  assert.ok(j.welcome, 'let in: ' + j.error);
  const s = C.joinState(cleanWelcome(j.welcome), r.id, null, null);
  s.time = j.welcome.time;
  s.acts = [];
  const edits = new Bucket(now, 1e9, 1e9);
  const base = s.stats.playedMs;
  const send = (m) => {
    const at = now + Math.round(s.stats.playedMs - base);
    assert.ok(!r.message(j.id, JSON.stringify(m), at, edits).drop, 'the room took ' + m.t);
  };
  const sync = (save = false) => {
    r.players.get(j.id).p = P.cleanPos(s.player);
    const acts = C.takeActs(s);
    for (let i = 0; i < acts.length; i += P.LIMITS.actsPerMessage)
      send({ t: 'acts', ms: Math.round(s.stats.playedMs), a: acts.slice(i, i + 256) });
    const list = C.takeEdits(s);
    for (let i = 0; i < list.length; i += P.LIMITS.editsPerMessage)
      send({ t: 'edits', e: list.slice(i, i + P.LIMITS.editsPerMessage) });
    if (save) send({ t: 'save', s: C.progressOf(s) });
  };
  return { s, id: j.id, sync, invite: () => r.message(j.id, '{"t":"invite"}', now).toSelf[0].code };
}

async function crystalRoom(seed) {
  const r = new Room(P.randomRoomId(), T0);
  const key = P.randomHex(32);
  const world = { seed, mods: [], props: [], ext: [] };
  assert.equal(await r.init(JSON.stringify({ t: 'create', key, world, eco: 'crystal' }), T0), null);
  return { r, key };
}

test('seats: one place a player, in plain rock in the deep, the same for every copy of the land', () => {
  const w = C.createWorld(15, true),
    again = C.createWorld(15, true);
  const seats = Array.from({ length: 12 }, (_, i) => C.machineSeat(w, i));
  assert.equal(new Set(seats.map((p) => p.x + ',' + p.y)).size, 12, 'no two share a place');
  for (const [i, p] of seats.entries()) {
    assert.equal(p.z, C.SEAT_LAYER);
    assert.deepEqual(C.machineSeat(again, i), p, 'the same in another copy of the land');
    assert.ok(C.TILE_INFO[C.tileAt(w, p.x, p.y, p.z)].solid, 'buried until dug out');
    assert.ok(C.seatAt(w, p.x, p.y, p.z));
  }
  assert.equal(C.machineSeat(w, -1), null);
  assert.equal(C.machineSeat(w, 1.5), null);
  assert.equal(C.seatAt(w, seats[0].x, seats[0].y, C.SEAT_LAYER + 1), false);
});

test('seats: two players dig their machines out side by side, and the room agrees', async () => {
  const { r, key } = await crystalRoom(15);
  const a = await play(r, key, undefined, T0, true);
  assert.equal(untilMachine(a.s, a.sync).length, 0, 'nothing refused');
  a.sync(true);
  // The friend comes in later, onto the land as the first one left it.
  const b = await play(r, P.randomHex(32), a.invite(), T0 + 1e6, true);
  assert.equal(untilMachine(b.s, b.sync).length, 0, 'nothing refused');
  b.sync(true);
  const at = (g) => {
    const m = machine(g.s);
    return { x: m.x, y: m.y, z: m.z };
  };
  assert.deepEqual(at(a), C.machineSeat(a.s.world, a.s.seat));
  assert.deepEqual(at(b), C.machineSeat(b.s.world, b.s.seat));
  assert.notEqual(a.s.seat, b.s.seat);
  assert.ok(Math.abs(at(a).x - at(b).x) <= 3 * C.SEAT_GAP, 'side by side');
  for (const g of [a, b]) {
    const rep = r.shadowOf().report(g.id);
    assert.deepEqual({ off: rep.off, refused: rep.refused }, { off: 0, refused: 0 });
    const copy = JSON.parse(r.saveFor(g.id, r.players.get(g.id)));
    const m = copy.cultivation.facilities.find((f) => f.kind === 'machine');
    assert.deepEqual({ x: m.x, y: m.y, z: m.z }, at(g), "the room's copy has it there too");
  }
});

test('seats: nobody builds on a seat in a shared world; alone there are none', async () => {
  const { r, key } = await crystalRoom(15);
  const g = await play(r, key, undefined, T0, true);
  const p = C.machineSeat(g.s.world, 4);
  g.s.player.z = p.z;
  C.markExplored(g.s.world, p.x, p.y, p.z);
  C.setRichness(g.s.world, p.x, p.y, p.z, 0); // dug out, by someone not seated there
  assert.equal(C.facilitySite(g.s, 'chamber', p.x, p.y, p.z), 'occupied');
  const solo = C.createState(15, { cultivation: true });
  solo.player.z = p.z;
  C.markExplored(solo.world, p.x, p.y, p.z);
  C.setRichness(solo.world, p.x, p.y, p.z, 0);
  assert.equal(C.tileAt(solo.world, p.x, p.y, p.z), C.T.TUNNEL);
  assert.equal(C.facilitySite(solo, 'chamber', p.x, p.y, p.z), null);
});

test('seats: a game from before seats finds its machine in a tunnel, and the room looks there too', async () => {
  const { r, key } = await crystalRoom(15);
  const g = await play(r, key, undefined, T0, false);
  assert.equal(g.s.seat, undefined, 'the room told it of no seat');
  assert.equal(untilMachine(g.s, g.sync).length, 0);
  g.sync(true);
  assert.ok(machine(g.s), 'found');
  const rep = r.shadowOf().report(g.id);
  assert.deepEqual({ off: rep.off, refused: rep.refused }, { off: 0, refused: 0 });
  // Back with a game that knows of seats: it has been down there, so it
  // is given no seat, and finds its machine the way it always did.
  const back = await play(r, key, undefined, T0 + 1e7, true);
  assert.equal(back.s.seat, undefined);
  assert.equal(r.players.get(back.id).seats, false);
  assert.equal(untilMachine(back.s, back.sync).length, 0);
  back.sync(true);
  assert.ok(machine(back.s));
  const again = r.shadowOf().report(back.id);
  assert.deepEqual({ off: again.off, refused: again.refused }, { off: 0, refused: 0 });
});
