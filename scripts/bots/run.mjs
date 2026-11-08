/* The company bots (bot plan phase 3): three bots in one shared crystal
 * world, each the game itself without the page (bot.mjs), for as long as a
 * person is playing there. Run on GitHub Actions (.github/workflows/bots.yml),
 * where WebSockets reach the room service.
 *
 *   ROOM=<room id> ADMIN_TOKEN=<moderator token> node scripts/bots/run.mjs
 *   (optional: BOTS=3, MINUTES=340, LINGER=120, ROOMS=https://rooms.robertasrudys.com,
 *    GAME=https://play.robertasrudys.com)
 *
 * Each bot is always the same character in that world: its key comes from
 * the room and the moderator token, so nobody else holds it and a new run
 * adds no new character (nothing deletes one, AGENTS.md). The first time it
 * comes in by a one-use invite the moderator makes; once in, the moderator
 * marks it as a bot (POST /admin/rooms/<id>/bots), so every game tags it.
 * Bots play only while a person is awake in the world (time away makes
 * nothing): with nobody there for LINGER seconds they leave, asleep where
 * they stand, and the run ends. It fails if the room froze a bot or kept
 * finding its numbers off. */

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { ROOM_ID_RE } from '../../src/net/protocol.js';
import { createBot } from './bot.mjs';

const env = process.env;
const ROOMS = env.ROOMS || 'https://rooms.robertasrudys.com';
const GAME = env.GAME || 'https://play.robertasrudys.com';
const ROOM = env.ROOM || '';
const TOKEN = env.ADMIN_TOKEN || '';
const COUNT = Math.min(3, Math.max(1, Number(env.BOTS) || 3)); // three, as the plan has it
const MINUTES = Math.min(340, Math.max(1, Number(env.MINUTES) || 340)); // under GitHub's 6 h
const LINGER = Math.max(10, Number(env.LINGER) || 120); // seconds with nobody there before leaving
const FRAME = 0.1; // seconds between frames
const LOG_EVERY = 60; // seconds between lines on how they're doing
const STAGGER = 20; // seconds between one bot starting to play and the next

if (!ROOM_ID_RE.test(ROOM) || TOKEN.length < 32) {
  console.error('usage: ROOM=<room id> ADMIN_TOKEN=<token> node scripts/bots/run.mjs');
  process.exit(2);
}

async function admin(path, body) {
  const res = await fetch(ROOMS + '/admin/rooms/' + ROOM + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!res.ok) throw Error(path + ': HTTP ' + res.status);
  return res.json();
}

const seconds = () => performance.now() / 1000;
const timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
const open = (url) => new WebSocket(url, { headers: { Origin: GAME } }); // the room only takes the game's origin
const keyOf = (n) =>
  createHash('sha256')
    .update('mte company bot|' + ROOM + '|' + TOKEN + '|' + n)
    .digest('hex');

// One at a time: the room hands out the same unused link again until it is
// used (server/src/invites.js linkFor), so each bot is in, or turned away,
// before the next one asks for a link.
const bots = [];
for (let n = 1; n <= COUNT; n++) {
  const { code } = await admin('/invite', { uses: 1, life: 30 });
  const bot = createBot({
    service: ROOMS,
    room: ROOM,
    key: keyOf(n),
    code,
    open,
    seconds,
    timers,
    log: (line) => console.log('bot ' + n + ': ' + line),
    wait: (n - 1) * STAGGER
  });
  bot.connect();
  bots.push(bot);
  for (let t = 0; t < 30 && !bot.inWorld && bot.closed?.code !== 1008; t++) await sleep(1000);
}

// Marks the bots that got in.
const ids = bots.map((b) => b.session.friends.me).filter(Boolean);
if (!ids.length) {
  console.error('FAIL: no bot got into the world');
  process.exit(1);
}
for (const id of ids) await admin('/bots', { id, bot: true });
console.log('in: ' + ids.join(', '));

// A person is awake there: anyone in the world but a bot.
const peopleIn = () =>
  bots.some((b) =>
    b.session.friends.rows({ x: 0, y: 0 }).some((r) => !r.you && !r.bot && r.st !== 'offline')
  );

// GitHub stops a run after six hours: one that is still wanted when its
// time is up starts the next, which waits for this one to end (bots.yml's
// concurrency) and comes back as the same three bots.
async function startNext() {
  const repo = env.GITHUB_REPOSITORY,
    token = env.GITHUB_TOKEN;
  if (!repo || !token) return console.log('time is up, and no token to start the next run');
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/bots.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'mica-and-wiki-bots'
      },
      body: JSON.stringify({ ref: 'main', inputs: { room: ROOM, minutes: String(MINUTES) } })
    }
  ).catch(() => null);
  console.log(
    'time is up: the next run ' + (res?.status === 204 ? 'is on its way' : 'did not start')
  );
}

const end = seconds() + MINUTES * 60;
let last = seconds(),
  alone = 0,
  logged = 0;
while (seconds() < end) {
  await sleep(FRAME * 1000);
  const now = seconds(),
    dt = Math.min(1, now - last);
  last = now;
  for (const b of bots) b.frame(dt);
  alone = peopleIn() ? 0 : alone + dt;
  if (alone >= LINGER) {
    console.log('nobody has been here for ' + LINGER + ' s: leaving');
    break;
  }
  if ((logged += dt) >= LOG_EVERY) {
    logged = 0;
    for (const [i, b] of bots.entries()) {
      const s = b.game.state,
        p = s.player;
      if (!p) continue; // never got in
      console.log(
        `bot ${i + 1}: (${Math.round(p.x)}, ${Math.round(p.y)}, layer ${-p.z}) ` +
          `${b.inWorld ? 'in' : 'out'}, played ${Math.round((s.stats?.playedMs || 0) / 60000)} min`
      );
    }
  }
}
// Only with a person awake there now: no run starts the next for nobody.
if (peopleIn()) await startNext();
for (const b of bots) b.leave();
await sleep(2000);

// What the room made of it: nobody frozen, and each game set straight when
// it was off. A refusal on its own is no failure: two players going for the
// same tile is honest, the room takes the first, and the other's game takes
// the room's numbers ('econ'). A game that stays off didn't.
const { players } = await admin('/players');
let bad = 0;
for (const id of ids) {
  const p = players.find((q) => q.id === id);
  const rep = p?.shadow || {};
  console.log(`${id}: checks ${rep.checks}, off ${rep.off}, refused ${rep.refused}, bot ${p?.bot}`);
  if (!p || p.frozen || rep.off > Math.max(2, rep.checks / 10)) bad++;
}
if (bad) {
  console.error('FAIL: the room froze, or kept finding off, ' + bad + ' bot(s)');
  process.exit(1);
}
console.log('done');
process.exit(0);
