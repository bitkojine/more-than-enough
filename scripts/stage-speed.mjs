/* Makes the staged site (scripts/stage-site.sh) quick to open on a slow phone
 * connection. The source tree is untouched and still runs as it is, with no
 * build step; only the copy players download changes:
 *
 * 1. The default texture pack is one file. Every picture path in the staged
 *    packs/default/pack.json is replaced by the SVG itself (a pack may carry
 *    inline "<svg ...>" markup), so the game makes one request for its
 *    pictures instead of ~150. The source pack keeps its files, so it stays
 *    an easy example to copy for your own pack.
 * 2. The game's ~70 modules are bundled and minified (esbuild) into one
 *    file in place of src/game/main.js: one request, and about half the bytes,
 *    since the source is mostly comments. A source map is alongside for DevTools.
 * 3. The page names the pack up front (<link rel="preload">), so it downloads
 *    with the code instead of after it.
 * 4. The stylesheet is minified (esbuild): it is mostly comments too. Old
 *    browsers are the target, so nothing is rewritten into newer CSS.
 * 5. One language at a time. The bundles hold no dictionary: each gets
 *    src/i18n/dictionaries.js swapped for one that reads the dictionary
 *    src/game/start.js (the page's first script) fetched for the player's
 *    language, and the page preloads main.js so it downloads alongside.
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

/* 2. Bundle and minify the game's code. */
let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  throw new Error('esbuild is missing: run `npm ci` first (it is only used to stage the site)');
}
// 5. The dictionary start.js fetched, set before any bundle runs. Each
// bundle's copy of i18n.js gets its own copy of it, as a bundled dictionary
// was its own before (perf.js adds its keys to its copy only).
const oneLanguage = {
  name: 'one-language',
  setup(build) {
    build.onResolve({ filter: /\/dictionaries\.js$/ }, (args) =>
      /[\\/]src[\\/]i18n$/.test(args.resolveDir)
        ? { path: 'dictionaries', namespace: 'one-language' }
        : undefined
    );
    build.onLoad({ filter: /.*/, namespace: 'one-language' }, () => ({
      resolveDir: path.join(OUT, 'src/i18n'),
      contents: `import { CODES } from './language.js';
const loaded = globalThis.MTE_DICTIONARY;
if (!loaded) throw new Error('No dictionary: the game starts from src/game/start.js');
export default Object.fromEntries(CODES.map((c) => [c, c === loaded.lang ? { ...loaded.strings } : {}]));`
    }));
  }
};
const entry = path.join(OUT, 'src/game/main.js');
for (const target of [
  entry,
  path.join(OUT, 'src/game/start.js'),
  path.join(OUT, 'src/i18n/en.js'),
  path.join(OUT, 'src/i18n/lt.js'),
  path.join(OUT, 'src/game/autoplay-lab.js'),
  path.join(OUT, 'src/game/perf.js'),
  path.join(OUT, 'src/game/news-text.js'),
  path.join(OUT, 'src/game/statement.js'),
  path.join(OUT, 'src/game/sync-lazy.js'),
  path.join(OUT, 'src/game/qr.js'),
  path.join(OUT, 'src/game/render/rigged-character.js')
])
  await esbuild.build({
    entryPoints: [target],
    external: [
      './perf.js',
      './statement.js',
      './autoplay-lab.js',
      './news-text.js',
      './sync-lazy.js',
      './qr.js',
      './render/rigged-character.js'
    ],
    outfile: target, // in place: import.meta.url stays where main.js was
    allowOverwrite: true,
    bundle: true,
    format: 'esm',
    charset: 'utf8', // module scripts are UTF-8; avoid escaping Lithuanian text
    minify: true,
    keepNames: true, // so a crash report still names the functions
    sourcemap: 'linked', // for DevTools only; players never download it
    sourcesContent: false, // the staged site carries the sources themselves
    legalComments: 'none',
    logLevel: 'warning',
    plugins: [oneLanguage]
  });

/* 3. The pack and the game are named up front, so they download with the
 *    first script (start.js) instead of after it. */
const page = path.join(OUT, 'index.html');
const html = fs.readFileSync(page, 'utf8');
if (!html.includes('</head>')) throw new Error('no </head> in index.html');
fs.writeFileSync(
  page,
  html.replace(
    '</head>',
    '<link rel="modulepreload" href="src/game/main.js" />\n' +
      '<link rel="preload" href="packs/default/pack.json" as="fetch" crossorigin />\n</head>'
  )
);

/* 4. Minify the stylesheet. */
for (const name of ['style.css', 'autoplay-lab.css']) {
  const sheet = path.join(OUT, name);
  const css = await esbuild.transform(fs.readFileSync(sheet, 'utf8'), {
    loader: 'css',
    minify: true,
    legalComments: 'none',
    target: ['safari12', 'chrome70', 'firefox68']
  });
  fs.writeFileSync(sheet, css.code);
}

console.log(
  `Inlined the default pack's pictures; bundled the game (${Math.round(fs.statSync(entry).size / 1024)} KB)`
);
