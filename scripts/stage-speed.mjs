/* Makes the staged site (scripts/stage-site.sh) quick to open on a slow phone
 * connection, without a build step or any change to the source tree:
 *
 * 1. The default texture pack is one file. Every picture path in the staged
 *    packs/default/pack.json is replaced by the SVG itself (a pack may carry
 *    inline "<svg ...>" markup), so the game makes one request for its
 *    pictures instead of ~150. The source pack keeps its files, so it stays
 *    an easy example to copy for your own pack.
 * 2. The page names every module the game will load, and the pack, up front
 *    (<link rel="modulepreload"> and "preload"), so the browser fetches them all at once
 *    instead of discovering them import by import, one round trip per level.
 *
 * Usage: node scripts/stage-speed.mjs <staged site dir>  (before stamping) */

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'site');

/* 1. Inline the default pack's pictures. */
const packFile = path.join(OUT, 'packs/default/pack.json');
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const inline = (ref) => {
  if (typeof ref !== 'string' || !/\.svg$/i.test(ref)) return ref;
  const svg = fs.readFileSync(path.join(path.dirname(packFile), ref), 'utf8').trim();
  if (!/^<svg[\s>]/.test(svg)) throw new Error(`${ref} does not start with <svg`);
  return svg;
};
for (const entry of Object.values(pack.looks)) {
  for (const [slot, v] of Object.entries(entry)) {
    if (slot === 'color') continue;
    if (Array.isArray(v)) entry[slot] = v.map(inline);
    else if (v && typeof v === 'object') v.frames = v.frames.map(inline);
    else entry[slot] = inline(v);
  }
}
fs.writeFileSync(packFile, JSON.stringify(pack));

/* 2. Preload every module reachable from the entry point. */
const page = path.join(OUT, 'index.html');
const entry = 'src/game/main.js';
const seen = new Set();
const walk = (rel) => {
  if (seen.has(rel)) return;
  seen.add(rel);
  const src = fs.readFileSync(path.join(OUT, rel), 'utf8');
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+'(\.{1,2}\/[^']+\.js)'/gm)) {
    walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  }
};
walk(entry);
seen.delete(entry); // the page's own <script> already asks for it
const links = [...seen].sort().map((m) => `<link rel="modulepreload" href="${m}" />`)
  // The pack too: fetched with the modules instead of after them all.
  .concat('<link rel="preload" href="packs/default/pack.json" as="fetch" crossorigin />').join('\n');
const html = fs.readFileSync(page, 'utf8');
if (!html.includes('</head>')) throw new Error('no </head> in index.html');
fs.writeFileSync(page, html.replace('</head>', `${links}\n</head>`));

console.log(`Inlined the default pack's pictures; preloading ${seen.size} modules`);
