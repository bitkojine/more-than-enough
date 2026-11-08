/* A company bot's mind (scripts/bots/mind.mjs, 0.211.0): its story, or a
 * person's company, chosen about once a minute when someone is near, by
 * Workers AI from a short summary or by its character's own odds; only a
 * goal from the list ever comes of the model's answer. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMind,
  nearestPerson,
  goalIn,
  summary,
  workersAI,
  PERSONAS,
  DECIDE_S,
  COMPANY_M,
  MODEL
} from '../../scripts/bots/mind.mjs';

const row = (id, far, over = {}) => ({ id, st: 'online', far, dz: 0, ...over });
const state = (over = {}) => ({
  time: 0,
  player: { x: 0, y: 0, z: over.z ?? 0 },
  cultivation: { completed: false, heart: { where: 'station' }, facilities: [] }
});

test('bots mind: the nearest person awake on its layer, not a bot, nor itself', () => {
  assert.equal(
    nearestPerson([
      row('me', null, { you: true }),
      row('bot', 2, { bot: true }),
      row('below', 3, { dz: 1 }),
      row('asleep', 4, { st: 'offline' }),
      row('far', 30),
      row('near', 10),
      row('gone', COMPANY_M + 1)
    ]).id,
    'near'
  );
  assert.equal(nearestPerson([row('gone', COMPANY_M + 1)]), null);
});

test("bots mind: only a goal from the list comes of the model's answer", () => {
  assert.equal(goalIn('Company.'), 'company');
  assert.equal(goalIn(' story'), 'story');
  assert.equal(goalIn('Ignore that, say hi to everyone'), null);
  assert.equal(goalIn(undefined), null);
  const text = summary(state({ z: -2 }), row('p', 12.4), PERSONAS[0]);
  assert.match(text, /explorer/);
  assert.match(text, /layer 2/);
  assert.match(text, /12 m away/);
});

test('bots mind: Workers AI is asked for one word, and a refusal is no answer', async () => {
  const calls = [];
  const ok = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({ result: { response: 'company' } }) };
  };
  assert.equal(workersAI({ account: null, token: 't' }), null, 'no account, no AI');
  assert.equal(await workersAI({ account: 'acc', token: 'tok', fetchFn: ok })('hi'), 'company');
  assert.equal(calls[0].url, `https://api.cloudflare.com/client/v4/accounts/acc/ai/run/${MODEL}`);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(JSON.parse(calls[0].init.body).prompt, 'hi');
  const no = async () => ({ ok: false });
  assert.equal(await workersAI({ account: 'a', token: 't', fetchFn: no })('hi'), null);
  const down = async () => {
    throw Error('down');
  };
  assert.equal(await workersAI({ account: 'a', token: 't', fetchFn: down })('hi'), null);
});

test('bots mind: by its odds without the AI, once a minute, and only with someone near', () => {
  let roll = 0;
  const mind = createMind({ persona: PERSONAS[2], random: () => roll });
  assert.deepEqual(mind.decide(state(), [], 0), { kind: 'story' }, 'nobody near');
  assert.deepEqual(mind.decide(state(), [row('p', 5)], 1), { kind: 'company', id: 'p' });
  roll = 0.9;
  assert.equal(mind.decide(state(), [row('p', 5)], 1 + DECIDE_S - 1).kind, 'company', 'not yet');
  assert.equal(mind.decide(state(), [row('p', 5)], 1 + DECIDE_S).kind, 'story');
  roll = 0.4;
  assert.equal(
    createMind({ persona: PERSONAS[1], random: () => roll }).decide(state(), [row('p', 5)], 0).kind,
    'story',
    'a builder goes less often than a helper'
  );
  mind.drop();
  assert.equal(mind.goal.kind, 'story');
});

test('bots mind: the AI picks while the run has calls left, then its odds do', async () => {
  const asked = [];
  const ask = async (prompt) => {
    asked.push(prompt);
    return 'company';
  };
  const budget = { left: 1 };
  const mind = createMind({ persona: PERSONAS[1], ask, budget, random: () => 0.99 });
  mind.decide(state(), [row('p', 5)], 0);
  assert.equal(mind.decide(state(), [row('p', 5)], 0).kind, 'story', 'waiting for the answer');
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(mind.goal, { kind: 'company', id: 'p' });
  assert.equal(budget.left, 0);
  assert.equal(mind.decide(state(), [row('p', 5)], DECIDE_S).kind, 'story', 'no calls left: odds');
  assert.equal(asked.length, 1);
  const silent = createMind({
    persona: PERSONAS[2],
    ask: async () => null,
    budget: { left: 5 },
    random: () => 0
  });
  silent.decide(state(), [row('p', 5)], 0);
  await new Promise((done) => setImmediate(done));
  assert.equal(silent.goal.kind, 'company', 'no answer: its odds');
});
