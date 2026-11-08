/* What a company bot sets out to do (bot plan phase 4, 0.211.0): work on its
 * own story (AUTO, the crystal brain), or go and keep a person company for
 * a while. Each bot has its own character (PERSONAS); about once a minute,
 * when a person is awake near it, Workers AI picks between the two from a
 * short summary of only what the bot has seen, and without the AI (no
 * token, the day's calls used up, no answer) its character's own odds do.
 *
 * Only a goal from GOALS ever comes of the model's answer: no model text
 * reaches a player, and nothing a person wrote goes into the prompt (there
 * is no chat). */

import { daylight } from '../../src/core/light.js';

export const GOALS = Object.freeze(['story', 'company']);
export const DECIDE_S = 60; // seconds between two choices
export const COMPANY_M = 80; // a person this close on its layer can be gone to
export const MAX_AI_CALLS = 400; // per run: the free plan's 10,000 neurons a day go far
export const MODEL = '@cf/meta/llama-3.1-8b-instruct';

// Three characters, as the plan has them; `company`: how often each goes to
// someone when it can, without the AI.
export const PERSONAS = Object.freeze([
  { name: 'explorer', company: 0.25, about: 'curious, likes going deeper than anyone' },
  { name: 'builder', company: 0.15, about: 'careful, likes building things that last' },
  { name: 'helper', company: 0.5, about: 'friendly, likes being near other players' }
]);

// The nearest person awake on the bot's layer within COMPANY_M (a Players
// row: friends.rows), or null.
export function nearestPerson(rows) {
  let best = null;
  for (const r of rows)
    if (!r.you && !r.bot && r.st === 'online' && r.dz === 0 && r.far !== null && r.far <= COMPANY_M)
      if (!best || r.far < best.far) best = r;
  return best;
}

// What the bot has seen, in a few plain words (English: only the model reads it).
export function summary(s, person, persona) {
  const c = s.cultivation;
  const step = c.completed
    ? 'your machine is awake'
    : c.heart?.where === 'carried'
      ? 'you are carrying your machine heart home'
      : c.facilities.some((b) => b.kind === 'chamber')
        ? 'you are growing crystal to repair your machine'
        : 'you are gathering to build a crystal chamber';
  const day = daylight(s.time || 0) >= 0.5 ? 'day' : 'night';
  return (
    `You are a ${persona.name} (${persona.about}) in a cozy co-op mining game. ` +
    `Right now ${step}, ${-s.player.z > 0 ? 'underground on layer ' + -s.player.z : 'on the surface'}, ` +
    `at ${day}. A player is ${Math.round(person.far)} m away. ` +
    'Answer with one word: story (keep working on your own machine) or company ' +
    '(go to the player and keep them company for a minute).'
  );
}

// The goal in the model's answer, or null.
export function goalIn(text) {
  const m = /\b(story|company)\b/i.exec(String(text || ''));
  return m ? m[1].toLowerCase() : null;
}

// Workers AI over its REST API, from the runner (`account`, `token`): the
// goal it picked, or null.
export function workersAI({ account, token, fetchFn = fetch }) {
  if (!account || !token) return null;
  return async (prompt) => {
    try {
      const res = await fetchFn(
        `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, max_tokens: 8 })
        }
      );
      if (!res.ok) return null;
      return goalIn((await res.json())?.result?.response);
    } catch {
      return null;
    }
  };
}

// A bot's mind: `decide(s, rows, secs)` is the goal now ({kind, id} for
// company), choosing again every DECIDE_S. `ask`: workersAI's, or null;
// `budget`: {left} shared by the run's bots; `random`: () => [0, 1).
export function createMind({ persona, ask = null, budget = { left: 0 }, random = Math.random }) {
  let goal = { kind: 'story' },
    at = -Infinity,
    asking = false;
  return {
    get goal() {
      return goal;
    },
    // Back to its story at once (the person went, or it got stuck).
    drop() {
      goal = { kind: 'story' };
    },
    decide(s, rows, secs) {
      if (asking || secs - at < DECIDE_S) return goal;
      const person = nearestPerson(rows);
      // Nobody near: its story, and it looks again the moment someone comes.
      if (!person) return (goal = { kind: 'story' });
      at = secs;
      const set = (kind) => (goal = kind === 'company' ? { kind, id: person.id } : { kind });
      if (ask && budget.left > 0) {
        budget.left--;
        asking = true;
        ask(summary(s, person, persona))
          .then((k) => set(k || (random() < persona.company ? 'company' : 'story')))
          .finally(() => (asking = false));
        return goal;
      }
      return set(random() < persona.company ? 'company' : 'story');
    }
  };
}
