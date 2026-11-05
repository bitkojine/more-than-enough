/* A playtest of the live game in a live shared world (Watch, 2026-11-05):
 * the threads that build the game can't open a WebSocket from where they
 * run, so this runs on GitHub Actions (.github/workflows/live-playtest.yml)
 * and says in its log what happened.
 *
 *   ROOM=<room id> ADMIN_TOKEN=<moderator token> node scripts/live-playtest.mjs
 *   (optional: MINUTES=20, GAME=https://play.robertasrudys.com,
 *    ROOMS=https://rooms.robertasrudys.com, CHROME_PATH=google-chrome)
 *
 * It plays through the game's own controls and nothing else: headless
 * Chrome opens an invite link the moderator made, says yes, turns the AUTO
 * button on (Nerds) and holds it down (the P key), so AUTO plays the way it
 * would for anyone: in a crystal room, the crystal brain
 * (src/core/crystal-brain.js) carries on with the chapter from wherever the
 * playtester got to last time. Every half minute the log says where it is.
 * Then it lets go, leaves and comes back. It fails when the game didn't get
 * in, a crystal room didn't open the crystal chapter, nothing moved on, the
 * room refused an act, counted a cheat or saw the game's numbers drift,
 * anything was gone on coming back, or the page threw.
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
const MINUTES = Math.min(60, Math.max(0.5, Number(env.MINUTES) || 20));
const CHROME = env.CHROME_PATH || 'google-chrome';
const LOG_MS = 30_000; // between two lines on where it is

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
// Where the playtester is in the chapter, and a number that only grows as it gets on.
const where = `(() => { const s = ${state}, c = s.cultivation;
  const m = c?.facilities.find((b) => b.kind === 'machine');
  const inv = Object.fromEntries(Object.entries(s.inv).map(([k, v]) => [k, Math.floor(v)]));
  const built = c ? c.facilities.length : s.extractors.length;
  const tools = Object.values(s.tools).reduce((a, b) => a + b, 0);
  return { layer: -s.player.z, tools: s.tools.pickaxe + '/' + s.tools.boots, built,
    kinds: c ? c.facilities.map((b) => b.kind).join(' ') : '', repairs: m ? (m.sections ?? 0) : null,
    heart: c?.heart?.where ?? null, woken: !!c?.completed, inv, gathers: s.stats.gathers,
    progress: s.stats.gathers + tools * 50 + built * 100 + (m ? (m.sections ?? 0) * 500 : 0) +
      (c?.completed ? 5000 : 0) };
})()`;
const pressP = (down) =>
  `window.dispatchEvent(new KeyboardEvent('${down ? 'keydown' : 'keyup'}', { key: 'p' })), true`;
const told = (w) =>
  `layer ${w.layer}, tools ${w.tools}, built [${w.kinds}], repairs ${w.repairs ?? '-'}, ` +
  `heart ${w.heart ?? '-'}${w.woken ? ', MACHINE AWAKE' : ''}, holding ${JSON.stringify(w.inv)}`;

say(
  `Live playtest of ${GAME} in room ${ROOM.slice(0, 6)}…, as player ${me}, ${MINUTES} min of AUTO`
);
const before = await roster();
const { code } = await admin(`/admin/rooms/${ROOM}/invite`, { uses: 1, life: 30 });
await send('Page.navigate', { url: `${GAME}/#join=${ROOM}.${code}` });
// A browser that hasn't been in this world before asks first (the privacy
// policy goes with it), even for a character the room knows: yes.
const asking = `document.getElementById('ask')?.hidden === false`;
if (await waitFor(`${asking} || ${inShared}`, 60_000))
  if (await js(asking)) await js(`document.querySelector('#ask .primary').click(), true`);
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
  const start = await js(where);
  say('Start: ' + told(start));
  await js(`MTE_GAME.setAuto(true), true`);
  await js(pressP(true));
  const end = Date.now() + MINUTES * 60_000;
  let last = start;
  while (Date.now() < end && !last.woken) {
    await sleep(Math.min(LOG_MS, Math.max(0, end - Date.now())));
    last = await js(where);
    say(`${Math.round((MINUTES * 60_000 - (end - Date.now())) / 60_000)} min: ` + told(last));
    await js(pressP(true)); // held again, should anything have let go of it
  }
  await js(pressP(false));
  if (last.woken && !start.woken) say('AUTO woke the machine');
  if (last.progress <= start.progress && !start.woken) fail('AUTO got nowhere');
  await sleep(15_000); // its progress goes to the room every few seconds
  const held = await js(where);
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
    const back = await js(where);
    say('Back: ' + told(back));
    if (back.progress < held.progress) fail('coming back, some of the progress was gone');
    for (const [k, n] of Object.entries(held.inv))
      if ((back.inv[k] ?? 0) < n) fail(`coming back, ${n - (back.inv[k] ?? 0)} ${k} was gone`);
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
