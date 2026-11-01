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
import { client } from './admin-client.js';

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
  const numbers = nameNumbers([
    ...roster.map((p) => [p.id, p.c]),
    ...graves.filter((g) => !ids.has(g[0])).map((g) => [g[0], g[1]])
  ]);
  const nameIn = (tr, k) => {
    const { key, n } = nameWord(k);
    return n ? tr[key] + ' ' + n : tr[key];
  };
  return {
    ...summary,
    name: { en: words(en), lt: words(lt) },
    players: roster.map((p) => ({
      ...p,
      name: { en: nameIn(en, numbers.get(p.id)), lt: nameIn(lt, numbers.get(p.id)) }
    }))
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

// The bundler (wrangler's esbuild, keeping function names) may wrap inner
// functions in a __name() helper of its own, which the page doesn't have.
const SCRIPT = 'var __name = (f) => f;\n(' + client.toString() + ')();';

const BODY = `<form id="gate">
  <h1>MICA AND WIKI: admin</h1>
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
const hashOf = async (text) =>
  "'sha256-" + base64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))) + "'";

let page = null;
// The page and its headers: it may run only its own script and style, talk
// only to this service, and never be framed, indexed or kept.
export async function adminPage() {
  if (!page) {
    const csp = [
      "default-src 'none'",
      'script-src ' + (await hashOf(SCRIPT)),
      'style-src ' + (await hashOf(STYLE)),
      "connect-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'"
    ].join('; ');
    page = {
      html: HTML,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': csp,
        'X-Frame-Options': 'DENY',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
      }
    };
  }
  return page;
}
