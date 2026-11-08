/* A company bot (scripts/bots/bot.mjs) in a crystal room in this process:
 * it comes in by an invite through the game's own room session, plays the
 * crystal chapter with AUTO, and the room agrees with everything it did;
 * it leaves asleep and comes back as it was. The socket here hands what it
 * says straight to the room, as server/src/worker.js does. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { Bucket } from '../../server/src/room.js';
import { createBot } from '../../scripts/bots/bot.mjs';
import { T0, crystalRoom, play } from './crystal-room.js';

// Sockets into room `r`, at the time `now()` says, as the worker would run them.
function sockets(r, now) {
  const all = [];
  const open = () => {
    const ws = { readyState: 0, id: null, inbox: [], bucket: new Bucket(now(), 1e9, 1e9) };
    const hear = (m) => ws.readyState === 1 && ws.onmessage?.({ data: JSON.stringify(m) });
    ws.hear = hear;
    ws.send = (raw) => ws.inbox.push(raw);
    ws.close = (code = 1000, reason = '') => {
      if (ws.readyState === 3) return;
      ws.readyState = 3;
      if (ws.id) r.left(ws.id, code === 1000 && reason === 'bye', now());
      ws.onclose?.({ code, reason });
    };
    all.push(ws);
    return ws;
  };
  const deliver = (from, out) => {
    for (const m of out.toSelf || []) from.hear(m);
    for (const m of out.toAll || []) for (const ws of all) ws.hear(m);
    for (const m of out.toOthers || []) for (const ws of all) if (ws !== from) ws.hear(m);
    for (const { id, m } of out.to || []) for (const ws of all) if (ws.id === id) ws.hear(m);
  };
  // What every socket said since last time, taken to the room.
  async function pump() {
    for (const ws of all) {
      if (ws.readyState === 0) {
        ws.readyState = 1;
        ws.onopen?.();
      }
      while (ws.readyState === 1 && ws.inbox.length) {
        const raw = ws.inbox.shift();
        if (raw === P.PING) {
          ws.onmessage?.({ data: P.PONG });
          continue;
        }
        if (!ws.id) {
          const d = JSON.parse(raw);
          const j = await r.join(d.key, d.code, now(), d.away, {
            crystal: d.crystal === true,
            seats: d.seats === true,
            shares: d.shares === true
          });
          if (j.error) {
            ws.hear({ t: j.error });
            ws.close(1008, j.error);
            continue;
          }
          ws.id = j.id;
          ws.hear(j.welcome);
          deliver(ws, { toOthers: [r.statusOf(j.id)], to: j.to });
          continue;
        }
        const out = r.message(ws.id, raw, now(), ws.bucket);
        assert.ok(!out.drop, 'the room took what the bot said: ' + raw.slice(0, 80));
        deliver(ws, out);
      }
    }
  }
  return { open, pump };
}

// `n` bots in a crystal room with a person, each `wait` seconds after the last
// to start playing; run(seconds) plays them all, the room's clock with them.
async function botsInRoom(n = 1, wait = 0) {
  const { r, key } = await crystalRoom(15);
  const person = await play(r, key, undefined, T0);
  let secs = 0;
  const now = () => T0 + Math.round(secs * 1000);
  const net = sockets(r, now);
  const timers = { set: () => 0, clear: () => {} };
  const bots = Array.from({ length: n }, (_, i) =>
    createBot({
      service: 'https://rooms.example',
      room: r.id,
      key: P.randomHex(32),
      code: person.invite(),
      open: net.open,
      seconds: () => secs,
      timers,
      wait: i * wait
    })
  );
  const run = async (seconds) => {
    for (let t = 0; t < seconds; t += 0.1) {
      secs += 0.1;
      for (const b of bots) b.frame(0.1);
      await net.pump();
    }
  };
  return { r, bots, bot: bots[0], net, run, person };
}

const botInRoom = () => botsInRoom(1);

test('bots: a bot comes in by an invite, plays the crystal chapter with AUTO, and the room agrees', async () => {
  const { r, bot, net, run } = await botInRoom();
  bot.connect();
  await net.pump();
  assert.ok(bot.inWorld, 'let in: ' + JSON.stringify(bot.closed));
  const s = bot.game.state;
  assert.ok(s.cultivation, 'the crystal chapter');
  const start = { ...s.player };
  await run(120);
  const id = bot.session.friends.me;
  const rep = r.shadowOf().report(id);
  assert.ok(rep.checks > 0, 'the room checked what it did');
  assert.deepEqual({ off: rep.off, refused: rep.refused }, { off: 0, refused: 0 });
  assert.ok(s.stats.playedMs > 100_000, 'played: ' + s.stats.playedMs);
  assert.notDeepEqual({ ...s.player }, start, 'it went somewhere');
  assert.equal(r.players.get(id).st, 'online');
  assert.equal(r.players.get(id).frozen, undefined);
});

test('bots: a bot that leaves sleeps where it stood, and comes back as it was', async () => {
  const { r, bot, net, run } = await botInRoom();
  bot.connect();
  await net.pump();
  await run(60);
  const id = bot.session.friends.me;
  const had = { inv: { ...bot.game.state.inv }, at: { ...bot.game.state.player } };
  bot.leave();
  await net.pump();
  assert.equal(r.players.get(id).st, 'offline', 'asleep');
  bot.connect();
  await net.pump();
  assert.ok(bot.inWorld, 'back: ' + JSON.stringify(bot.closed));
  assert.equal(bot.session.friends.me, id, 'the same character, no invite needed');
  assert.deepEqual(bot.game.state.inv, had.inv, 'with all it had');
  assert.equal(Math.round(bot.game.state.player.x), Math.round(had.at.x));
  await run(10);
  const rep = r.shadowOf().report(id);
  assert.deepEqual({ off: rep.off, refused: rep.refused }, { off: 0, refused: 0 });
});

// Two that do the same thing at the same moment go for the same tiles: the
// room takes the first and refuses the other, whose game then takes the
// room's numbers back (shadow.js 'econ', correctProgress) and is right again.
test('bots: two that race for every tile are set straight by the room', async () => {
  const { r, bots, net, run } = await botsInRoom(2, 0);
  for (const b of bots) {
    b.connect();
    await net.pump();
  }
  await run(150);
  const [first, second] = bots.map((b) => r.shadowOf().report(b.session.friends.me));
  assert.deepEqual({ off: first.off, refused: first.refused }, { off: 0, refused: 0 });
  assert.ok(second.refused > 0, 'it lost a race');
  assert.ok(second.off <= second.checks / 3, 'off ' + second.off + ' of ' + second.checks);
});

// Started 20 s apart (run.mjs), they hardly ever race.
test('bots: three started a little apart play side by side', async () => {
  const { r, bots, net, run } = await botsInRoom(3, 20);
  for (const b of bots) {
    b.connect();
    await net.pump();
    assert.ok(b.inWorld, 'let in: ' + JSON.stringify(b.closed));
  }
  await run(150);
  for (const b of bots) {
    const id = b.session.friends.me;
    const rep = r.shadowOf().report(id);
    assert.ok(rep.off <= 2 && rep.refused <= 5, id + ': ' + JSON.stringify(rep));
    assert.ok(b.game.state.stats.playedMs > 90_000, 'played');
    assert.equal(r.players.get(id).frozen, undefined);
  }
});
