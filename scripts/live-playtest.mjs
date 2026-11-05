/* A playtest of the live game in a live shared world (Watch, 2026-11-05):
 * the threads that build the game can't open a WebSocket from where they
 * run, so this runs on GitHub Actions (.github/workflows/live-playtest.yml)
 * and says in its log what happened.
 *
 *   ROOM=<room id> ADMIN_TOKEN=<moderator token> node scripts/live-playtest.mjs
 *   (optional: MINUTES=3, GAME=https://play.robertasrudys.com,
 *    ROOMS=https://rooms.robertasrudys.com, CHROME_PATH=google-chrome)
 *
 * It plays as a person would, through the game's own buttons and nothing
 * else: headless Chrome opens an invite link the moderator made, says yes,
 * presses the main button (Explore, then Gather) for a few minutes, then
 * leaves and comes back. It fails when the game didn't get in, a crystal
 * room didn't open the crystal chapter, the room refused an act, counted a
 * cheat or saw the game's numbers drift, what was gathered wasn't there on
 * coming back, or the page threw.
 *
 * The playtester is one character per room, always the same one: its key is
 * made from the room and the moderator token, so nobody else holds it and a
 * new run doesn't add another character (nothing deletes one, AGENTS.md). */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { playerId, ROOM_ID_RE } from '../src/net/protocol.js';

const env = process.env;
const GAME = env.GAME || 'https://play.robertasrudys.com';
const ROOMS = env.ROOMS || 'https://rooms.robertasrudys.com';
const ROOM = env.ROOM || '';
const TOKEN = env.ADMIN_TOKEN || '';
const MINUTES = Math.min(30, Math.max(0.5, Number(env.MINUTES) || 3));
const CHROME = env.CHROME_PATH || 'google-chrome';
const PRESS_MS = 4000; // between two presses of the main button

if (!ROOM_ID_RE.test(ROOM) || TOKEN.length < 32) {
  console.error('usage: ROOM=<room id> ADMIN_TOKEN=<token> node scripts/live-playtest.mjs');
  process.exit(2);
}

const key = createHash('sha256')
  .update('mte live playtester|' + ROOM + '|' + TOKEN)
  .digest('hex');
const me = await playerId(ROOM, key);
const report = [];
const problems = [];
const say = (line) => {
  report.push(line);
  console.log(line);
};
const fail = (line) => {
  problems.push(line);
  say('FAIL: ' + line);
};

async function admin(path, body) {
  const res = await fetch(ROOMS + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!res.ok) throw Error(path + ': HTTP ' + res.status);
  return res.json();
}
const roster = async () =>
  (await admin(`/admin/rooms/${ROOM}/players`)).players.find((p) => p.id === me);

/* ------------------------------------------------- Chrome, over DevTools */

const profile = mkdtempSync(join(tmpdir(), 'mte-live-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--enable-automation', // the game doesn't wait asleep for a tap (src/game/sleep.js)
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--lang=en-US',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank'
  ],
  { stdio: 'ignore' }
);
process.on('exit', () => {
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
});

let port = null;
for (let i = 0; i < 240 && !port; i++) {
  try {
    port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
  } catch {
    await sleep(250);
  }
}
if (!port) throw Error('Chrome did not open DevTools');
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(pages.find((p) => p.type === 'page').webSocketDebuggerUrl);
await new Promise((ok, no) => ((ws.onopen = ok), (ws.onerror = no)));
let next = 0;
const waiting = new Map();
const pageErrors = [];
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.id && waiting.has(m.id)) {
    waiting.get(m.id)(m);
    waiting.delete(m.id);
  } else if (m.method === 'Runtime.exceptionThrown')
    pageErrors.push(
      m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text
    );
};
const send = (method, params = {}) =>
  new Promise((ok, no) => {
    const id = ++next;
    waiting.set(id, (m) => (m.error ? no(Error(method + ': ' + m.error.message)) : ok(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || expression);
  return r.result.value;
}
async function waitFor(expression, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      if (await js(expression)) return true;
    } catch {
      /* the page is still loading */
    }
    await sleep(500);
  }
  return false;
}
await send('Runtime.enable');
await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `try { localStorage.setItem('mte.key', ${JSON.stringify(key)}); } catch {}`
});

/* ---------------------------------------------------------- the playtest */

const state = 'MTE_GAME.getState()';
const inShared = `(typeof MTE_GAME === 'object' && ${state}.shared === ${JSON.stringify(ROOM)})`;
const gathered = `(() => { const i = ${state}.inv; return Object.values(i).reduce((a, b) => a + b, 0); })()`;
const press = `(() => { const b = document.getElementById('btnAction');
  b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7 }));
  b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 })); return true; })()`;

say(`Live playtest of ${GAME} in room ${ROOM.slice(0, 6)}…, as player ${me}, ${MINUTES} min`);
const before = await roster();
const { code } = await admin(`/admin/rooms/${ROOM}/invite`, { uses: 1, life: 30 });
await send('Page.navigate', { url: `${GAME}/#join=${ROOM}.${code}` });
// Someone new is asked first (the privacy policy goes with it): yes.
if (!before) {
  const asked = await waitFor(`!document.getElementById('ask').hidden`, 60_000);
  if (asked) await js(`document.querySelector('#ask .primary').click(), true`);
  else fail('the game never asked to join');
}
if (!(await waitFor(inShared, 90_000))) {
  fail('the game never got into the shared world');
} else {
  const info = await js(`({ version: document.getElementById('btnVersion')?.textContent.trim(),
    crystal: !!${state}.cultivation, land: ${state}.world.cultivation === true,
    eco: ${state}.cultivation ? 'crystal' : 'old' })`);
  say(
    `In: game ${info.version}, plays the ${info.eco} economy` + (before ? ', coming back' : ', new')
  );
  if (info.crystal !== info.land) fail('the crystal chapter and the land disagree');
  const start = await js(gathered);
  const end = Date.now() + MINUTES * 60_000;
  while (Date.now() < end) {
    await js(press);
    await sleep(PRESS_MS);
  }
  const got = await js(gathered);
  const inv = await js(`${state}.inv`);
  say(`Played ${MINUTES} min: ${got - start} gathered, holding ${JSON.stringify(inv)}`);
  if (got <= start) fail('nothing was gathered');
  await sleep(15_000); // its progress goes to the room every few seconds
  const after = await roster();
  say('The room on this player: ' + JSON.stringify(after));
  if (!after) fail('the room does not know this player');
  else {
    if (after.frozen) fail('the room froze the playtester');
    if (after.cheats) fail(`the room counted ${after.cheats} cheats`);
    if (after.shadow?.refused) fail(`the room refused ${after.shadow.refused} acts`);
    if (after.shadow?.off) fail(`the game's numbers were off the room's ${after.shadow.off} times`);
  }
  // Leaving and coming back: a new page opens the shared world it was in.
  await send('Page.navigate', { url: GAME + '/' });
  await sleep(3000);
  if (!(await waitFor(inShared, 90_000)))
    fail('coming back, the game did not open the shared world');
  else {
    const back = await js(gathered);
    say(`Back: holding ${back} (had ${got})`);
    if (back < got) fail(`coming back, ${got - back} of what was gathered was gone`);
  }
}
const errors = [...new Set(pageErrors)];
if (errors.length) fail('the page threw: ' + errors.slice(0, 5).join(' | '));
say(problems.length ? `${problems.length} problem(s)` : 'All well');
if (env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(
    env.GITHUB_STEP_SUMMARY,
    '## Live playtest\n\n' + report.map((l) => '- ' + l).join('\n') + '\n'
  );
}
process.exit(problems.length ? 1 : 0);
