/* A crystal world calls its company bots (server/src/bots.js, 0.209.0): a
 * person comes in, no bot is awake, and the room asks GitHub to start the
 * bots' workflow, at most once in ten minutes, and only with the token. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';
import { botsWanted, callBots, CALL_EVERY_MS } from '../../server/src/bots.js';
import { install, now, makeRoom, join, say, idOf } from '../support/room-object.js';

install(test.after);

const T = 1_700_000_000_000;
const roomOf = (players, eco = 'crystal') => ({ eco, copy: null, players: new Map(players) });

test('bots call: a person in a crystal world with no bot awake, not lately', () => {
  const person = ['p', { st: 'online' }];
  assert.equal(botsWanted(roomOf([person]), 'p', T, 0), true);
  assert.equal(botsWanted(roomOf([person], 'old'), 'p', T, 0), false, 'an old world');
  assert.equal(
    botsWanted({ ...roomOf([person]), copy: {} }, 'p', T, 0),
    false,
    "a moderator's copy"
  );
  assert.equal(botsWanted(roomOf([['b', { bot: true, st: 'online' }]]), 'b', T, 0), false, 'a bot');
  assert.equal(botsWanted(roomOf([person]), 'nobody', T, 0), false);
  const awake = roomOf([person, ['b', { bot: true, st: 'away' }]]);
  assert.equal(botsWanted(awake, 'p', T, 0), false, 'a bot is awake');
  const asleep = roomOf([person, ['b', { bot: true, st: 'offline' }]]);
  assert.equal(botsWanted(asleep, 'p', T, 0), true, 'the bots sleep');
  assert.equal(botsWanted(roomOf([person]), 'p', T, T - CALL_EVERY_MS + 1), false, 'called lately');
  assert.equal(botsWanted(roomOf([person]), 'p', T, T - CALL_EVERY_MS), true);
});

test('bots call: asks GitHub to start the workflow for this world, with the token', async () => {
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, init });
    return { status: 204 };
  };
  const id = P.randomRoomId();
  assert.equal(await callBots({ BOTS_GITHUB_TOKEN: 'tok' }, id, fake), true);
  const [{ url, init }] = calls;
  assert.equal(
    url,
    'https://api.github.com/repos/bitkojine/more-than-enough/actions/workflows/bots.yml/dispatches'
  );
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer tok');
  assert.ok(init.headers['User-Agent'], 'GitHub refuses a call without one');
  assert.deepEqual(JSON.parse(init.body), { ref: 'main', inputs: { room: id } });
  await callBots({ BOTS_GITHUB_TOKEN: 't', BOTS_REPO: 'fork/game' }, id, fake);
  assert.match(calls[1].url, /repos\/fork\/game\//, "a fork's own");
  assert.equal(
    await callBots({ BOTS_GITHUB_TOKEN: 't' }, id, async () => ({ status: 403 })),
    false
  );
  const down = async () => {
    throw Error('down');
  };
  assert.equal(await callBots({ BOTS_GITHUB_TOKEN: 't' }, id, down), false);
});

// A crystal world in the worker, with GitHub answering in `fetch`.
async function crystalWorld(token) {
  const g = await makeRoom();
  g.r.eco = 'crystal';
  if (token) g.env.BOTS_GITHUB_TOKEN = token;
  const calls = [];
  const was = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { status: 204 };
  };
  test.after(() => (globalThis.fetch = was));
  return { g, calls };
}

test('bots call: the worker calls them when a person comes in, once in ten minutes', async () => {
  const { g, calls } = await crystalWorld('tok');
  const a = await join(g);
  await Promise.all(g.room.ctx.waiting);
  assert.deepEqual(
    calls.map((c) => c.body.inputs.room),
    [g.id]
  );
  assert.ok(
    g.r.log.some((e) => e.e === 'bots' && e.ok === true),
    'in the audit log'
  );
  await say(g, a, { t: 'invite', uses: 3, life: 1440 });
  const [{ code }] = a.got('invite');
  now.t += CALL_EVERY_MS - 1;
  const b = await join(g, P.randomHex(32), code);
  assert.ok(idOf(b));
  assert.equal(calls.length, 1, 'not again so soon');
  now.t += 1;
  const c = await join(g, P.randomHex(32), code);
  assert.ok(idOf(c));
  assert.equal(calls.length, 2);
});

test('bots call: without the token, or in an old world, nothing is called', async () => {
  const off = await crystalWorld(null);
  await join(off.g);
  assert.equal(off.calls.length, 0);
  const old = await crystalWorld('tok');
  old.g.r.eco = 'old';
  await join(old.g);
  assert.equal(old.calls.length, 0);
});
