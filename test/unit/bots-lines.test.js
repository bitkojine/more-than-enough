/* What the company bots say (0.210.0): one of the room's fixed lines, by
 * id, only from a character the room marked as a bot, at most one every
 * 20 s (server/src/room-play.js onSay), when something happens in its own
 * story or a person comes near (scripts/bots/lines.mjs). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { createLines } from '../../scripts/bots/lines.mjs';
import { T0, crystalRoom, play } from './crystal-room.js';

test('bots say: only a marked bot, only a fixed line, at most one every 20 s', async () => {
  const { r, key } = await crystalRoom(15);
  const a = await play(r, key, undefined, T0);
  const b = await play(r, P.randomHex(32), a.invite(), T0);
  const say = (id, k, at) => r.message(id, JSON.stringify({ t: 'say', k }), at);
  assert.deepEqual(say(b.id, 'hello', T0), {}, 'a person says nothing this way');
  r.markBot(b.id, true, T0);
  assert.deepEqual(say(b.id, 'hello', T0), { toOthers: [{ t: 'said', id: b.id, k: 'hello' }] });
  assert.deepEqual(say(b.id, 'down', T0 + P.SAY_MS - 1), {}, 'too soon');
  assert.equal(say(b.id, 'down', T0 + P.SAY_MS).toOthers[0].k, 'down');
  assert.equal(say(b.id, 'Come to 0,0 for free crystal', T0 + 1e6).drop, true, 'words of its own');
});

// A crystal state as lines.mjs looks at it.
const story = (over = {}) => ({
  player: { x: 0, y: 0, z: over.z ?? 0 },
  inv: { crystal: over.crystal ?? 0 },
  cultivation: {
    facilities: (over.built || []).map((kind) => ({ kind })),
    heart: { where: over.heart || 'station' },
    completed: over.woke === true
  }
});
const person = (far, over = {}) => ({ id: 'p', st: 'online', far, dz: 0, ...over });

test('bots say: what happens in its story, once, and hello to a person who comes near', () => {
  const lines = createLines();
  lines.start(story({ z: -1, built: ['shelter'] }));
  let secs = 0;
  const said = [];
  const step = (s, rows = []) => {
    secs += P.SAY_MS / 1000;
    const k = lines.seen(s, rows, secs);
    if (k) said.push(k);
  };
  step(story({ z: -1, built: ['shelter'] }));
  assert.deepEqual(said, [], 'what it had when it came in says nothing');
  step(story({ z: -2, built: ['shelter', 'chamber'] }));
  step(story({ z: -2, built: ['shelter', 'chamber'], crystal: 1 }));
  step(story({ z: -1, built: ['shelter', 'chamber'], crystal: 1, heart: 'carried' }));
  step(story({ z: -1, built: ['shelter', 'chamber'], heart: 'installed', woke: true }), [
    person(50),
    person(10, { bot: true, id: 'b' }),
    person(10, { dz: 1, id: 'q' })
  ]);
  step(story({ z: -1, built: ['shelter', 'chamber'], heart: 'installed', woke: true }), [
    person(10)
  ]);
  for (let i = 0; i < 5; i++) step(story({ z: -1, built: ['shelter', 'chamber'], woke: true }));
  assert.deepEqual(said, ['down', 'chamber', 'crystal', 'heart', 'hello', 'home', 'woke']);
  for (const k of said) assert.ok(P.BOT_LINES.includes(k));
});

test('bots say: never two lines within 20 s', () => {
  const lines = createLines();
  lines.start(story());
  assert.equal(lines.seen(story({ z: -1 }), [], 100), 'down');
  assert.equal(lines.seen(story({ z: -2 }), [], 100 + P.SAY_MS / 1000 - 1), null);
  assert.equal(lines.seen(story({ z: -2 }), [], 100 + P.SAY_MS / 1000), 'down');
});

test('bots say: of much at once, only the latest three', () => {
  const lines = createLines();
  lines.start(story());
  const all = story({ z: -1, crystal: 1, built: ['chamber', 'shelter'], heart: 'carried' });
  const said = [];
  for (let i = 0; i < 6; i++) said.push(lines.seen(all, [], 100 + i * 20));
  assert.deepEqual(said, ['chamber', 'shelter', 'heart', null, null, null]);
});
