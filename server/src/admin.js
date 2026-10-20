/* The moderator's page: every shared world and everyone in it, in one table
 * that sorts by any column, with a copy to play, a backup to download, freeze and thaw, and each
 * player's log (server/README.md, "The moderator").
 *
 * GET /admin serves the page to anyone, and it holds nothing: it asks for
 * the admin token, keeps it in the browser (the tab only, unless "remember"
 * is ticked) and sends it as a bearer to the /admin/ routes, which answer
 * nothing without it. Everything the rooms send is written into the page as
 * text, never as HTML, and the page runs only its own script (CSP). Its
 * imports are the game's words, so the room service bundles it as is. */

import en from '../../src/i18n/en.js';
import lt from '../../src/i18n/lt.js';
import { worldWords, nameNumbers, nameWord } from '../../src/net/naming.js';

// A deploy smoke-test room: marked by the server under the admin token when
// it is made (server/src/worker.js), never told apart by its seed.
export const isSmokeTest = (summary) => summary.smk === true;

// A world's name and its players' names, in English and Lithuanian, as the
// game shows them (src/net/naming.js).
export function worldOf(summary, roster, graves) {
  const words = (tr) => {
    const w = worldWords(summary.id);
    return tr['world.name'].replace('{thing}', tr[w.thing]).replace('{place}', tr[w.place]);
  };
  const ids = new Set(roster.map((p) => p.id));
  const numbers = nameNumbers([...roster.map((p) => [p.id, p.c]), ...graves.filter((g) => !ids.has(g[0])).map((g) => [g[0], g[1]])]);
  const nameIn = (tr, k) => {
    const { key, n } = nameWord(k);
    return n ? tr[key] + ' ' + n : tr[key];
  };
  return {
    ...summary,
    name: { en: words(en), lt: words(lt) },
    players: roster.map((p) => ({ ...p, name: { en: nameIn(en, numbers.get(p.id)), lt: nameIn(lt, numbers.get(p.id)) } }))
  };
}

/* ------------------------------------------------------------ the page */

const STYLE = `
:root { color-scheme: light dark; --bg: #f6f7f8; --panel: #fff; --text: #16191d; --muted: #5d6670; --line: #d9dde2; --accent: #0b7a75; --bad: #b3261e; --warn: #8a5a00; }
@media (prefers-color-scheme: dark) { :root { --bg: #111417; --panel: #1a1e22; --text: #e8ebee; --muted: #9aa4ae; --line: #2c3238; --accent: #4fd1c5; --bad: #ff8a80; --warn: #ffcc66; } }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, -apple-system, sans-serif; }
header, main { padding: 12px 16px; }
header { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
h1 { font-size: 16px; margin: 0 auto 0 0; }
input, select, button { font: inherit; color: inherit; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; min-height: 40px; }
button { cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.bad { color: var(--bad); border-color: var(--bad); }
label { display: inline-flex; gap: 6px; align-items: center; }
#gate { max-width: 360px; margin: 48px auto; display: grid; gap: 12px; }
.note { color: var(--muted); }
.error { color: var(--bad); }
.wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
table { border-collapse: collapse; width: 100%; white-space: nowrap; }
th, td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: right; }
th:nth-child(-n+4), td:nth-child(-n+4) { text-align: left; }
th { position: sticky; top: 0; background: var(--panel); user-select: none; }
th button { border: 0; padding: 0; min-height: 0; background: none; font-weight: 600; }
th[aria-sort] button::after { content: ' \\25BE'; }
th[aria-sort="ascending"] button::after { content: ' \\25B4'; }
td:nth-child(2), th:nth-child(2) { position: sticky; left: 0; background: var(--panel); z-index: 1; }
th:nth-child(2) { z-index: 2; }
tbody tr { cursor: pointer; }
tbody tr:hover td, tbody tr.open td { background: color-mix(in srgb, var(--accent) 10%, var(--panel)); }
.tag { font-size: 12px; color: var(--muted); margin-left: 4px; }
.st-online { color: var(--accent); } .st-frozen { color: var(--bad); } .st-away, .st-lost { color: var(--warn); }
.warn { color: var(--bad); font-weight: 600; }
#detail { margin-top: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
#detail h2 { font-size: 15px; margin: 0 0 8px; }
#detail dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0 0 12px; }
#detail dt { color: var(--muted); }
#detail dd { margin: 0; overflow-wrap: anywhere; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
pre { overflow: auto; max-height: 50vh; font-size: 12px; background: var(--bg); padding: 8px; border-radius: 8px; }
`;

// Runs in the moderator's browser, written into the page by its source
// (so it may use nothing from this module).
/* global document, window, sessionStorage, localStorage, fetch */
function client() {
  const STORE = 'mte.admin';
  const LIVE_MS = 30_000;
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) if (v !== undefined) e[k] = v;
    e.append(...kids);
    return e;
  };
  const read = (s) => { try { return s.getItem(STORE); } catch { return null; } };
  let token = read(sessionStorage) || read(localStorage);
  let rows = [], worlds = [], open = null, timer = null;
  let sort = { key: 'goal', dir: -1 };

  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const short = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + 'G' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(n);
  const hours = (s) => s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm' : Math.floor(s / 60) + 'm';
  const ago = (ms) => { const s = (Date.now() - ms) / 1000; return s < 3600 ? Math.round(s / 60) + 'm ago' : s < 86400 ? Math.round(s / 3600) + 'h ago' : Math.round(s / 86400) + 'd ago'; };
  const STATUS_ORDER = { online: 0, away: 1, lost: 2, offline: 3, frozen: 4 };

  // Each column: its heading, how a row sorts by it, and what it shows.
  const COLUMNS = [
    { key: 'rank', label: '#', value: (r) => r.rank },
    { key: 'name', label: 'Player', value: (r) => r.name.en.toLowerCase(), text: (r) => [r.name.en + ' / ' + r.name.lt] },
    { key: 'world', label: 'World', value: (r) => r.world.name.en, text: (r) => r.world.name.en },
    { key: 'status', label: 'Status', value: (r) => STATUS_ORDER[r.status], text: (r) => [el('span', { className: 'st-' + r.status, textContent: r.status })] },
    { key: 'goal', label: 'Milestones', value: (r) => r.goal },
    { key: 'res', label: 'Resources', value: (r) => r.res, text: (r) => short(r.res) },
    { key: 'played', label: 'Played', value: (r) => r.played, text: (r) => hours(r.played) },
    { key: 'deep', label: 'Deepest', value: (r) => r.deep, text: (r) => r.deep ? 'layer ' + r.deep : 'surface' },
    { key: 'built', label: 'Built', value: (r) => r.built },
    { key: 'tools', label: 'Tools', value: (r) => r.tools },
    { key: 'cheats', label: 'Cheats', value: (r) => r.cheats, text: (r) => [el('span', { className: r.cheats ? 'warn' : '', textContent: String(r.cheats) })] },
    { key: 'drift', label: 'Off', value: (r) => r.drift, text: (r) => [el('span', { className: r.drift ? 'warn' : '', textContent: r.shadow ? r.drift + ' / ' + r.shadow.checks : '–' })] },
    { key: 'last', label: 'World active', value: (r) => r.world.last, text: (r) => ago(r.world.last) }
  ];
  // Ties go to the most milestones, then resources, then play time.
  const TIES = ['goal', 'res', 'played'];

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
    if (res.status === 404 && path === '/admin/players') { signOut('That token was not accepted.'); throw new Error('token'); }
    const type = res.headers.get('Content-Type') || '';
    const data = type.startsWith('application/json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || res.status);
    return data;
  }

  function flatten(list) {
    worlds = list;
    rows = [];
    for (const w of list) {
      for (const p of w.players || []) {
        const g = p.progress || {};
        rows.push({
          ...p, world: w, status: p.frozen ? 'frozen' : p.st,
          goal: g.goal || 0, res: Math.round(sum(g.inv)), played: g.played || 0, deep: -(g.deep || 0),
          built: g.built || 0, tools: sum(g.tools), drift: p.shadow ? p.shadow.off : 0
        });
      }
    }
    const best = [...rows].sort((a, b) => order(a, b, { key: 'goal', dir: -1 }));
    best.forEach((r, i) => { r.rank = i + 1; });
  }

  function order(a, b, s) {
    for (const key of [s.key, ...TIES]) {
      const col = COLUMNS.find((c) => c.key === key);
      const x = col.value(a), y = col.value(b);
      if (x !== y) return (x < y ? -1 : 1) * (key === s.key ? s.dir : -1);
    }
    return a.id < b.id ? -1 : 1;
  }

  function render() {
    const want = $('world').value, find = $('find').value.trim().toLowerCase();
    const shown = rows.filter((r) => (!want || r.world.id === want) && (!find || (r.name.en + ' ' + r.name.lt).toLowerCase().includes(find)))
      .sort((a, b) => order(a, b, sort));
    $('head').replaceChildren(...COLUMNS.map((c) => {
      const th = el('th', {}, el('button', { type: 'button', textContent: c.label, onclick: () => {
        sort = { key: c.key, dir: sort.key === c.key ? -sort.dir : (c.key === 'name' || c.key === 'world' || c.key === 'status' || c.key === 'rank' ? 1 : -1) };
        render();
      } }));
      if (sort.key === c.key) th.setAttribute('aria-sort', sort.dir < 0 ? 'descending' : 'ascending');
      return th;
    }));
    $('body').replaceChildren(...shown.map((r) => {
      const tr = el('tr', { className: open && open.id === r.id && open.world.id === r.world.id ? 'open' : '', onclick: () => { open = r; render(); detail(); $('detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } },
        ...COLUMNS.map((c) => { const v = c.text ? c.text(r) : String(c.value(r)); return el('td', {}, ...(Array.isArray(v) ? v : [v])); }));
      return tr;
    }));
    $('count').textContent = shown.length + ' of ' + rows.length + ' players in ' + worlds.length + ' worlds';
  }

  function fillWorlds() {
    const was = $('world').value;
    $('world').replaceChildren(el('option', { value: '', textContent: 'All worlds' }),
      ...[...worlds].sort((a, b) => b.last - a.last).map((w) => el('option', { value: w.id, textContent: w.name.en + ' (' + w.players.length + ')' })));
    $('world').value = worlds.some((w) => w.id === was) ? was : '';
  }

  function detail() {
    const box = $('detail');
    if (!open) { box.hidden = true; return; }
    const r = rows.find((x) => x.id === open.id && x.world.id === open.world.id) || open;
    open = r;
    const g = r.progress || {};
    const list = (o) => Object.entries(o || {}).map(([k, v]) => k + ' ' + short(Math.round(v))).join(', ') || '–';
    const facts = [
      ['World', r.world.name.en + ' / ' + r.world.name.lt + ' (' + r.world.id + ')'],
      ['Player id', r.id],
      ['Status', r.status + (r.sessionSecs !== null && r.sessionSecs !== undefined ? ', this session ' + hours(r.sessionSecs) : '')],
      ['Where', r.at ? r.at.join(', ') : '–'],
      ['Has', list(g.inv)],
      ['Tools', list(g.tools)],
      ['Unlocked', (g.unl || []).join(', ') || '–'],
      ['Room\'s check', r.shadow ? r.shadow.checks + ' checks, ' + r.shadow.off + ' off, ' + r.shadow.refused + ' acts refused' : 'not running'],
      ['Came in by', r.via ? 'link ' + r.via : '–']
    ];
    const say = el('p', { className: 'note' });
    const log = el('pre', { hidden: true });
    const act = (label, cls, fn) => el('button', { type: 'button', className: cls, textContent: label, onclick: async (ev) => {
      ev.target.disabled = true;
      try { await fn(); } catch (e) { say.className = 'error'; say.textContent = 'Failed: ' + e.message; }
      ev.target.disabled = false;
    } });
    const base = '/admin/rooms/' + encodeURIComponent(r.world.id);
    box.replaceChildren(
      el('h2', { textContent: r.name.en + ' / ' + r.name.lt }),
      el('dl', {}, ...facts.flatMap(([k, v]) => [el('dt', { textContent: k }), el('dd', { textContent: v })])),
      el('div', { className: 'actions' },
        act('Play a copy', 'primary', async () => {
          const c = await api(base + '/copy', { id: r.id });
          // Only ever the game's own address, in a tab that can't reach back here.
          if (!/^https:\/\/[a-z0-9.-]+\/#copy=[A-Za-z0-9_-]{22}\.[0-9a-f]{64}(&[a-z]+=[A-Za-z0-9_.:,-]*)*$/.test(c.link)) throw new Error('unexpected link');
          window.open(c.link, '_blank', 'noopener,noreferrer');
          say.className = 'note';
          say.textContent = 'Copy opened in a new tab; it lasts until ' + new Date(c.until).toLocaleTimeString() + '.';
        }),
        r.frozen
          ? act('Thaw', '', async () => {
            if (!window.confirm('Thaw ' + r.name.en + '?')) return;
            await api(base + '/thaw', { id: r.id });
            await load();
          })
          : act('Freeze…', 'bad', async () => {
            const why = window.prompt('Freeze ' + r.name.en + ' (they get the FBI notice and go back to solo). Why?');
            if (!why || !why.trim()) return;
            await api(base + '/freeze', { id: r.id, why: why.trim().slice(0, 200) });
            await load();
          }),
        act('Stop a link…', '', async () => {
          const code = window.prompt('Stop an invite link of ' + r.name.en + '? Paste its code: the part after the dot in the link.');
          if (!code || !/^[A-Za-z0-9_-]{22}$/.test(code.trim())) return;
          await api(base + '/revoke', { code: code.trim() });
          say.className = 'note';
          say.textContent = 'Link stopped; nobody new gets in through it.';
        }),
        act('Download backup', '', async () => {
          // The whole world, to keep on disk (backup.js): fetched with the
          // token, then saved from memory.
          const res = await fetch(base + '/backup', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
          if (!res.ok) throw new Error(res.status);
          const name = (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'mte-world.json';
          const url = URL.createObjectURL(await res.blob());
          const a = el('a', { href: url, download: name });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          say.className = 'note';
          say.textContent = 'Saved ' + name + ' (the whole world, every player in it).';
        }),
        act('Log, last 24 h', '', async () => {
          let since = Date.now() - 86400_000, lines = [];
          for (let page = 0; page < 10; page++) {
            const text = await api(base + '/log?since=' + since);
            let more = null;
            for (const line of String(text).split('\n')) {
              let e = null;
              try { e = JSON.parse(line); } catch { continue; }
              if (e.e === 'more') more = e.since;
              else if (e.p === r.id) lines.push(e);
            }
            if (!more) break;
            since = more;
          }
          log.textContent = lines.reverse().map(({ ts, p, e, ...rest }) => new Date(ts).toLocaleString() + '  ' + e + '  ' + JSON.stringify(rest)).join('\n') || 'Nothing logged in the last 24 hours.';
          log.hidden = false;
        }),
        act('Close', '', async () => { open = null; render(); detail(); })),
      say, log);
    box.hidden = false;
  }

  async function load() {
    $('status').className = 'note';
    $('status').textContent = 'Loading…';
    try {
      const d = await api('/admin/players' + ($('tests').checked ? '?tests=1' : ''));
      flatten(d.rooms);
      fillWorlds();
      render();
      if (open) detail();
      const failed = d.rooms.filter((w) => w.error).length;
      $('status').textContent = 'Updated ' + new Date().toLocaleTimeString() + (failed ? ', ' + failed + ' worlds could not answer' : '');
    } catch (e) {
      if (e.message === 'token') return;
      $('status').className = 'error';
      $('status').textContent = 'Could not load: ' + e.message;
    }
  }

  function live() {
    clearInterval(timer);
    timer = null;
    if ($('live').checked && !document.hidden) timer = setInterval(load, LIVE_MS);
  }

  function signOut(why) {
    token = null;
    for (const s of [sessionStorage, localStorage]) try { s.removeItem(STORE); } catch { /* blocked */ }
    clearInterval(timer);
    $('app').hidden = true;
    $('gate').hidden = false;
    $('gateError').textContent = why || '';
  }

  function start() {
    $('gate').hidden = true;
    $('app').hidden = false;
    load();
    live();
  }

  $('gate').onsubmit = (ev) => {
    ev.preventDefault();
    token = $('token').value.trim();
    $('token').value = '';
    if (!token) return;
    try { ($('remember').checked ? localStorage : sessionStorage).setItem(STORE, token); } catch { /* kept in memory only */ }
    start();
  };
  $('refresh').onclick = load;
  // A world that's gone, put back from its backup file at its own address
  // (backup.js): the room service refuses one that's still there.
  $('restore').onclick = () => $('restoreFile').click();
  $('restoreFile').onchange = async () => {
    const file = $('restoreFile').files[0];
    $('restoreFile').value = '';
    if (!file) return;
    const status = $('status');
    try {
      const text = await file.text();
      let d = null;
      try { d = JSON.parse(text); } catch { /* below */ }
      if (!d || d.kind !== 'mte-shared-world' || typeof d.room !== 'string') throw new Error('that file is not a world backup');
      if (!window.confirm('Put world ' + d.room + ' back as it was on ' + new Date(d.at).toLocaleString() + '? Only if it is gone: a world that is still there is never written over.')) return;
      const res = await fetch('/admin/rooms/' + encodeURIComponent(d.room) + '/restore', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: text, cache: 'no-store' });
      const out = await res.json().catch(() => ({}));
      if (res.status === 409 && out.error === 'exists') throw new Error('that world is still there, so it was left as it is');
      if (!res.ok) throw new Error(out.error || res.status);
      await load();
      status.className = 'note';
      status.textContent = 'World ' + d.room + ' is back; its players come back with their own phones.';
    } catch (e) {
      status.className = 'error';
      status.textContent = 'Restore failed: ' + e.message;
    }
  };
  $('signout').onclick = () => signOut('');
  $('world').onchange = render;
  $('find').oninput = render;
  $('tests').onchange = load;
  $('live').onchange = live;
  document.addEventListener('visibilitychange', () => { live(); if (!document.hidden && token && $('live').checked) load(); });
  if (token) start();
}

// The bundler (wrangler's esbuild, keeping function names) may wrap inner
// functions in a __name() helper of its own, which the page doesn't have.
const SCRIPT = 'var __name = (f) => f;\n(' + client.toString() + ')();';

const BODY = `<form id="gate">
  <h1>MORE THAN ENOUGH: admin</h1>
  <input id="token" type="password" autocomplete="current-password" placeholder="Admin token" aria-label="Admin token" required>
  <label><input id="remember" type="checkbox"> Remember on this device</label>
  <button class="primary" type="submit">Open</button>
  <p id="gateError" class="error"></p>
  <p class="note">The token stays in this browser and goes only to this service.</p>
</form>
<div id="app" hidden>
  <header>
    <h1>Players</h1>
    <select id="world" aria-label="World"></select>
    <input id="find" type="search" placeholder="Find a name" aria-label="Find a name">
    <label><input id="live" type="checkbox" checked> Live</label>
    <label><input id="tests" type="checkbox"> Test worlds</label>
    <button id="refresh" type="button">Refresh</button>
    <button id="restore" type="button">Restore a backup…</button>
    <input id="restoreFile" type="file" accept=".json,application/json" hidden>
    <button id="signout" type="button">Sign out</button>
  </header>
  <main>
    <p><span id="count"></span> · <span id="status" class="note"></span></p>
    <div class="wrap"><table><thead><tr id="head"></tr></thead><tbody id="body"></tbody></table></div>
    <section id="detail" hidden></section>
  </main>
</div>`;

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MTE admin</title>
<style>${STYLE}</style>
</head>
<body>
${BODY}
<script>${SCRIPT}</script>
</body>
</html>`;

const base64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const hashOf = async (text) => "'sha256-" + base64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))) + "'";

let page = null;
// The page and its headers: it may run only its own script and style, talk
// only to this service, and never be framed, indexed or kept.
export async function adminPage() {
  if (!page) {
    const csp = [
      "default-src 'none'", 'script-src ' + await hashOf(SCRIPT), 'style-src ' + await hashOf(STYLE),
      "connect-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"
    ].join('; ');
    page = {
      html: HTML,
      headers: {
        'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'X-Frame-Options': 'DENY',
        'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
      }
    };
  }
  return page;
}
