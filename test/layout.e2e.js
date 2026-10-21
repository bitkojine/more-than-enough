/* Layout check: opens the real game in headless Chrome at a grid of screen
 * sizes (small phones to desktop, portrait and landscape) in both languages,
 * walks through the HUD, every sheet and every dialog, and fails on what a
 * player would see as broken: buttons on top of each other, buttons off the
 * screen or too small to tap, words cut short, rows squashed out of sight.
 *
 *   node test/layout.e2e.js            (CHROME_PATH=... to pick the browser)
 *   MTE_SHOT_DIR=dir node test/layout.e2e.js   also saves a screenshot of each
 *   MTE_LAYOUT_SCREENS=320x568,568x320 ...     only those screen sizes
 *
 * See docs/ui.md for the layout these rules protect. */
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 8600 + Math.floor(Math.random() * 300);
const CDP_PORT = 9800 + Math.floor(Math.random() * 300);
const SHOT_DIR = process.env.MTE_SHOT_DIR || '';
const CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');

const LANGS = ['en', 'lt'];
// MTE_LAYOUT_SCREENS=320x568,568x320 checks just those.
const SCREENS = process.env.MTE_LAYOUT_SCREENS ? process.env.MTE_LAYOUT_SCREENS.split(',').map((s) => s.split('x').map(Number)) : [
  [320, 568], [375, 667], [390, 844], [430, 932],   // phones, portrait
  [568, 320], [667, 375], [844, 390], [932, 430],   // phones, landscape
  [768, 1024], [1024, 768], [1366, 768], [1920, 1080]
];
// In this order on one page per screen; `rich` and `huge` last, as they
// can't be undone. `crowd` joins a shared world of 100 (a fake room) and
// stays in it.
const STATES = ['fresh', 'underground', 'upgrades', 'build', 'awards', 'settings', 'nerds', 'worlds', 'map', 'ask', 'fbi', 'news', 'crowd', 'players', 'rich', 'statement', 'huge'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------- a tiny CDP client */

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const p = msg.id && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.rej(new Error(JSON.stringify(msg.error))); else p.res(msg.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); rej(new Error('Chrome did not answer ' + method)); }, 20000);
    pending.set(n, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });
  return new Promise((res, rej) => { ws.onopen = () => res({ send, close: () => ws.close() }); ws.onerror = () => rej(new Error('ws error')); });
}

/* ---------------------------------------- what's broken, measured in-page */

// Runs in the page; returns a list of problems in the current state.
function problems() {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const name = (el) => el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) +
    (el.textContent.trim() ? ' "' + el.textContent.trim().slice(0, 24) + '"' : '');
  const shown = (el) => {
    if (!el.getClientRects().length) return false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
  const sheetOpen = document.getElementById('sheet').classList.contains('open');
  const dialog = [...document.querySelectorAll('.scrim')].find((s) => !s.hidden);

  // The HUD, while nothing covers it: every button and name plate clear of
  // the others, on the screen, and big enough for a thumb.
  if (!sheetOpen && !dialog) {
    const targets = [...document.querySelectorAll('#topbar button, #btnVersion, #friends .friend, #controls button, #controls .cap, #battery, #depth, #depthGauge')].filter(shown);
    for (let i = 0; i < targets.length; i++) {
      const a = targets[i], ra = a.getBoundingClientRect();
      if (ra.left < -1 || ra.top < -1 || ra.right > vw + 1 || ra.bottom > vh + 1) out.push('off screen: ' + name(a));
      for (let j = i + 1; j < targets.length; j++) {
        const b = targets[j];
        if (a.contains(b) || b.contains(a)) continue;
        if (overlap(ra, b.getBoundingClientRect())) out.push('overlap: ' + name(a) + ' and ' + name(b));
      }
      const small = a.matches('.hudBtn, .btn') ? 44 : a.matches('#zoomControls button:not(#zoomLevel)') ? 40 : 0;
      if (small && (ra.width < small - 0.5 || ra.height < small - 0.5)) out.push('too small to tap: ' + name(a) + ' ' + Math.round(ra.width) + 'x' + Math.round(ra.height));
    }
  }

  // Words cut short with an ellipsis (or clipped) anywhere a player reads.
  for (const el of document.querySelectorAll('.tab, .chip .val, .chip .rate, .setRow > *, .row .nm, .player strong, .player small, .railHead .fh-nm, #sheetTitle, .dialog strong, .dialog p, .dialog button')) {
    if (!shown(el) || !el.textContent.trim()) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.push('cut short: ' + name(el));
  }

  // Rows squashed: each settings row whole inside its group, each buy (or
  // Remove) button inside its row.
  for (const row of document.querySelectorAll('.setRow, .row .buy, .player button')) {
    if (!shown(row)) continue;
    const box = row.parentElement.closest('.setGroup, .row, .player').getBoundingClientRect(), r = row.getBoundingClientRect();
    if (r.top < box.top - 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1 || r.right > box.right + 1) out.push('squashed: ' + name(row));
  }

  // A dialog's buttons are on screen without scrolling.
  for (const b of document.querySelectorAll('.scrim:not([hidden]) .choices button')) {
    const r = b.getBoundingClientRect();
    if (shown(b) && (r.bottom > vh + 1 || r.bottom > b.closest('.dialog').getBoundingClientRect().bottom + 1)) out.push('below the fold: ' + name(b));
  }

  // The open sheet and dialog fit the screen.
  for (const el of [sheetOpen && document.getElementById('sheet'), dialog && dialog.querySelector('.dialog')]) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) out.push('off screen: ' + name(el));
  }

  // The plate under the big action may shrink to keep its words on the
  // screen, but not to a smudge: they are what the player reads.
  const cap = document.querySelector('#btnAction .cap');
  if (shown(cap)) {
    const scale = parseFloat(getComputedStyle(cap).getPropertyValue('--cap-scale')) || 1;
    if (scale < 0.75) out.push('plate shrunk to a smudge: ' + name(cap) + ' ' + scale);
  }
  return out;
}

// Puts the game in one state, after closing whatever the last one opened.
async function enter(state) {
  const g = window.MTE_GAME;
  const { t } = await import('/src/i18n/i18n.js');
  const click = (sel) => document.querySelector(sel).click();
  if (document.getElementById('sheet').classList.contains('open')) click('#btnClose');
  if (g.dialogs.ask.open) click('#ask .secondary');
  if (g.dialogs.fbi.open) click('#fbi button');
  clearInterval(window.layoutHold);
  if (state === 'rich') for (const r of Object.keys(g.getState().inv)) g.addRes(r, 987654321098);
  // Absurd numbers: the counts in the bar go scientific (1e15), the rate
  // under them does too, and the plate under Gather is held at its widest —
  // the longest word with the widest short number (docs/ui.md).
  if (state === 'huge') {
    const st = g.getState();
    for (const r of Object.keys(st.inv)) g.addRes(r, 1.2e15);
    st.perks.legacy = 120;   // the multiplier that makes what is produced big
    st.tools.overclock = 6;
    for (const r of g.core.RESOURCES) st.resUp[r] = 10;
    for (const key of Object.keys(g.core.EXTRACTORS)) for (let i = 0; i < 3; i++) st.extractors.push({ key, res: g.core.EXTRACTORS[key].res, x: 200 + i, y: 200, z: 0, buffer: 0 });
    const { fmtShort } = await import('/src/game/format.js');
    const hold = () => {
      document.getElementById('actionLabel').textContent = t('button.gatherYield', { n: fmtShort(9999) });
      g.hud.fit();   // the plate measures itself against the screen
    };
    hold();
    window.layoutHold = setInterval(hold, 10);
  }
  // Underground beside a ladder: the depth meter and the climb button, held
  // up against the HUD's own updates while the check runs.
  if (state === 'underground') {
    const hold = () => {
      document.getElementById('depth').lastElementChild.textContent = '12';  // i18n-ok: test fixture
      document.getElementById('depthGauge').innerHTML = '<i class="forest"></i><i></i><i class="here"></i><i class="deeper"></i>';
      document.body.classList.add('below');
      const battery = document.getElementById('battery');
      battery.className = 'low';
      battery.querySelector('b').style.width = '23%';
      battery.querySelector('span').textContent = '23%';  // i18n-ok: test fixture
      for (const id of ['battery', 'depth', 'depthGauge', 'btnMine']) document.getElementById(id).hidden = false;
      document.getElementById('mineLabel').textContent = t('button.climbDown');
    };
    hold();
    window.layoutHold = setInterval(hold, 10);
  }
  if (state === 'upgrades') click('#btnUpgrade');
  if (state === 'build') click('#btnBuild');
  if (state === 'awards') click('#btnAwards');
  if (state === 'settings') click('#btnSettings');
  if (state === 'nerds') { click('#btnSettings'); click('#btnNerds'); }
  // Three shared worlds (made-up ids: their names are what's checked).
  if (state === 'worlds') {
    localStorage.setItem('mte.rooms', JSON.stringify(['AAAAAAAAAAAAAAAAAAAAAA', 'thunderfallsXXXXXXXXXX', 'zzzzzzzzzzzzzzzzzzzzzz']));
    click('#btnSettings');
    click('#btnWorlds');
  }
  // A shared world full to its 100 players, from a fake room service: some
  // awake round you, some away, out of touch or asleep, some a layer down.
  if (state === 'crowd') {
    const id = (n) => n.toString(16).padStart(16, '0');
    const players = {};
    for (let i = 1; i < 100; i++) {
      const a = i * 2.4, r = 1 + (i % 25);
      players[id(i * 7919)] = { c: i, st: ['online', 'online', 'away', 'lost', 'offline'][i % 5], p: { x: Math.cos(a) * r, y: Math.sin(a) * r, z: i % 6 ? 0 : -1 } };
    }
    const welcome = { t: 'welcome', you: id(1), owner: id(1), c: 0, seed: 12345, mods: [], props: [], ext: [], players, save: null, p: { x: 0.5, y: 0.5, z: 0 } };
    window.WebSocket = class {
      constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(); }); }
      send(text) { if (text.includes('"hello"')) setTimeout(() => this.onmessage?.({ data: JSON.stringify(welcome) })); }
      close() { this.readyState = 3; }
    };
    g.together.switchTo('AAAAAAAAAAAAAAAAAAAAAA');
    await new Promise((r) => setTimeout(r, 1500));  // the world is made and everyone placed
  }
  if (state === 'players') {
    click('#btnSettings');
    click('#btnPlayers');
  }
  if (state === 'map') click('#btnMap');
  if (state === 'ask') g.dialogs.ask.ask({ title: t('together.join.title', { world: t('world.name', { thing: t('world.thing.firefly'), place: t('world.place.falls') }) }), text: t('together.join.text') + ' ' + t('privacy.join'), yes: t('together.join.yes'), link: { href: '#', text: t('privacy.link') } });  // the longest question
  if (state === 'fbi') g.dialogs.fbi.show();
  if (state === 'news') click('#btnVersion');
  // The statement of a world well under way: every kind of building, levels
  // bought, and an hour of income behind it for the charts.
  if (state === 'statement') {
    const st = g.getState();
    Object.assign(st.unlocks, { compost: true, brickyard: true, foundry: true, observatory: true, logistics: true });
    Object.assign(st.discovered, { ore: true, crystal: true });
    for (const key of Object.keys(g.core.EXTRACTORS)) for (let i = 0; i < 3; i++) st.extractors.push({ key, res: g.core.EXTRACTORS[key].res, x: 200 + i, y: 200, z: 0, buffer: 0 });
    st.tools.overclock = 4; st.abundanceLv = 2;
    for (let i = 0; i <= 8; i++) {
      for (const r of g.core.RESOURCES) st.resUp[r] = i;
      g.income.note(st, Date.now() + (i + 1) * 400000); // after the samples the game itself took
    }
    click('#resources .chip.ledger');
  }
}

/* -------------------------------------------------------------------- run */

async function main() {
  const server = cp.spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mte-layout-'));
  const chrome = cp.spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio', '--hide-scrollbars',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', detached: true });
  const cleanup = () => {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch { }
    try { server.kill('SIGKILL'); } catch { }
  };
  process.on('exit', cleanup);

  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    try { version = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/version')).json(); } catch { await sleep(250); }
  }
  if (!version) { console.error('Chrome did not start (set CHROME_PATH).'); process.exit(2); }
  const cdp = await connect(version.webSocketDebuggerUrl);
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const found = [];
  let checks = 0;
  for (const lang of LANGS) {
    for (const [w, h] of SCREENS) {
      const phone = Math.min(w, h) < 600;
      // Every screen starts from a new game, in its own storage.
      const { browserContextId } = await cdp.send('Target.createBrowserContext');
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: SHOT_DIR ? 2 : 1, mobile: phone }, s);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: phone, maxTouchPoints: 5 }, s);
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, s);
      await cdp.send('Page.enable', {}, s);
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/?lang=' + lang }, s);
      const where = lang + ' ' + w + 'x' + h;
      const evaluate = async (expr) => {
        const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s);
        if (r.exceptionDetails) throw new Error(where + ': ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
        return r.result.value;
      };
      for (let i = 0; i < 80 && !(await evaluate('!!window.MTE_GAME').catch(() => false)); i++) await sleep(100);
      for (const state of STATES) {
        await evaluate('(' + enter + ')(' + JSON.stringify(state) + ')');
        await sleep(450);  // sheets slide in, the HUD updates
        checks++;
        for (const p of await evaluate('(' + problems + ')()')) found.push(where + ' ' + state + ': ' + p);
        if (SHOT_DIR) {
          const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, s);
          fs.writeFileSync(path.join(SHOT_DIR, lang + '-' + w + 'x' + h + '-' + state + '.png'), Buffer.from(data, 'base64'));
        }
      }
      await cdp.send('Target.closeTarget', { targetId });
      await cdp.send('Target.disposeBrowserContext', { browserContextId });
    }
    console.log('checked ' + lang);
  }
  cdp.close();
  if (found.length) {
    console.log('\nLAYOUT PROBLEMS (' + found.length + '):\n  ' + [...new Set(found)].join('\n  '));
    process.exit(1);
  }
  console.log('\nlayout ok: ' + checks + ' screens, no overlaps, nothing cut short');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(2); });
