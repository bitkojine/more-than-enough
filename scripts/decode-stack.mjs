#!/usr/bin/env node
/* Turns a problem report's stack (Settings, Nerds, Copy; or the crash
 * screen's Copy report) back into source lines. The players' game is one
 * minified bundle, so a stack says `main.js:3:224345`; the bundle's source
 * map (written next to it when the site is staged, scripts/stage-speed.mjs)
 * says which file and line that was.
 *
 *   node scripts/decode-stack.mjs report.txt          # maps from the live site
 *   pbpaste | node scripts/decode-stack.mjs           # the report on stdin
 *   node scripts/decode-stack.mjs report.txt --site site
 *
 * `--site <dir>` reads the maps from a staged site instead (`npm run stage`
 * on the commit the report's version was built from). The live site only has
 * the newest build's maps: the script says so when the report's build is
 * another one. Zero dependencies: the map's VLQ mappings are decoded here. */

import fs from 'node:fs';
import path from 'node:path';

const LIVE = 'https://play.robertasrudys.com';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// The source map's `mappings`, as per generated line a sorted list of
// [column, source, line, column, name?] (all 0-based).
export function decodeMappings(mappings) {
  const lines = [];
  let src = 0, line = 0, col = 0, name = 0;
  for (const text of mappings.split(';')) {
    const segs = [];
    let gen = 0;
    for (const seg of text.split(',')) {
      if (!seg) continue;
      const v = [];
      let shift = 0, value = 0;
      for (const ch of seg) {
        const d = B64.indexOf(ch);
        value += (d & 31) << shift;
        if (d & 32) { shift += 5; continue; }
        v.push(value & 1 ? -(value >>> 1) : value >>> 1);
        shift = 0; value = 0;
      }
      gen += v[0];
      if (v.length >= 4) {
        src += v[1]; line += v[2]; col += v[3];
        if (v.length >= 5) name += v[4];
        segs.push([gen, src, line, col, v.length >= 5 ? name : -1]);
      }
    }
    lines.push(segs);
  }
  return lines;
}

// Where generated line:column (1-based, as stacks print them) came from.
export function lookup(map, decoded, line, column) {
  const segs = decoded[line - 1];
  if (!segs || !segs.length) return null;
  let best = null;
  for (const s of segs) { if (s[0] <= column - 1) best = s; else break; }
  if (!best) return null;
  return { source: map.sources[best[1]], line: best[2] + 1, column: best[3] + 1, name: best[4] >= 0 ? map.names[best[4]] : null };
}

// Every `<url>.js:line:col` in a report, each once.
export function framesIn(text) {
  const seen = new Map();
  for (const m of text.matchAll(/(https?:\/\/[^\s()]+?\.js)(?:\?[^\s:()]*)?:(\d+):(\d+)/g)) {
    seen.set(m[0], { url: m[1], line: Number(m[2]), column: Number(m[3]) });
  }
  return [...seen.entries()];
}

async function main() {
  const args = process.argv.slice(2);
  const siteAt = args.indexOf('--site');
  const site = siteAt >= 0 ? args.splice(siteAt, 2)[1] : null;
  const text = args[0] ? fs.readFileSync(args[0], 'utf8') : fs.readFileSync(0, 'utf8');
  const frames = framesIn(text);
  if (!frames.length) { console.log('No bundle frames (url.js:line:col) in this report.'); return; }

  if (!site) {
    const wanted = text.match(/\(build ([^)]+)\)/)?.[1];
    const live = await fetch(LIVE + '/build.json', { cache: 'no-store' }).then((r) => r.json()).then((b) => b.build, () => null);
    if (wanted && live && wanted !== live) console.log(`Note: the report is from build ${wanted}, the live site is ${live}. Lines may be off; stage that commit and pass --site.\n`);
  }

  const maps = new Map();
  async function mapFor(url) {
    if (!maps.has(url)) {
      const rel = new URL(url).pathname.replace(/^\//, '') + '.map';
      const raw = site ? fs.readFileSync(path.join(site, rel), 'utf8') : await fetch(LIVE + '/' + rel).then((r) => { if (!r.ok) throw new Error(`${r.status} for ${rel}`); return r.text(); });
      const map = JSON.parse(raw);
      maps.set(url, { map, decoded: decodeMappings(map.mappings) });
    }
    return maps.get(url);
  }

  for (const [frame, f] of frames) {
    try {
      const { map, decoded } = await mapFor(f.url);
      const at = lookup(map, decoded, f.line, f.column);
      const shown = at ? `${at.source.replace(/^(\.\.\/)+/, '')}:${at.line}:${at.column}` : '(not in the map)';
      console.log(`${frame}\n  -> ${shown}`);
    } catch (err) {
      console.log(`${frame}\n  -> no map: ${err.message}`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
