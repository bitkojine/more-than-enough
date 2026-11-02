/* Makes the staged site (scripts/stage-site.sh) quick to open on a slow phone
 * connection. The source tree is untouched and still runs as it is, with no
 * build step; only the copy players download changes:
 *
 * 1. The default texture pack is one file. Every picture path in the staged
 *    packs/default/pack.json is replaced by the SVG itself (a pack may carry
 *    inline "<svg ...>" markup), so the game makes one request for its
 *    pictures instead of ~150. The source pack keeps its files, so it stays
 *    an easy example to copy for your own pack. Each picture keeps its
 *    width and height, so the game decodes it only when first drawn
 *    (src/game/look/look.js).
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
 * 6. One copy of shared code. A lazy bundle (statement.js, perf.js, ...)
 *    takes the modules main.js also has from main.js (globalThis.MTE_SHARED,
 *    filled in by src/game/share.js) instead of carrying its own copy.
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
// 5. The dictionary start.js fetched, set before any bundle runs. There is
// one i18n.js, main.js's: lazy bundles use it (6.), so the strings perf.js
// or statement.js add are added to the game's own, as in the source tree.
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
const game = (name) => path.join(OUT, 'src/game', name);
// Loaded by main.js when needed. Each is bundled on its own (6., below).
const LAZY = [
  'autoplay-lab.js',
  'perf.js',
  'statement.js',
  'sync-lazy.js',
  'qr.js',
  'render/rigged-character.js'
];
const options = {
  external: LAZY.map((name) => './' + name),
  allowOverwrite: true,
  bundle: true,
  format: 'esm',
  charset: 'utf8', // module scripts are UTF-8; avoid escaping Lithuanian text
  minify: true,
  keepNames: true, // so a crash report still names the functions
  sourcemap: 'linked', // for DevTools only; players never download it
  sourcesContent: false, // the staged site carries the sources themselves
  legalComments: 'none',
  logLevel: 'warning'
};

/* 6. One copy of the code main.js and a lazy module share. Bundled on its
 *    own, a lazy module used to carry its own copy of everything it
 *    imports: statement.js was 75% a second src/core, and every copy was a
 *    second instance (its own i18n, its own caches). Now main.js puts those
 *    modules in globalThis.MTE_SHARED before any of its own code runs, and
 *    the lazy bundle reads them from there. It doesn't import main.js:
 *    main.js awaits at top level (the autoplay viewer never finishes), so a
 *    module importing it could wait for ever. No module exports a `let`, so
 *    reading the exports once is the same as importing them. */
const SHARED = 'mte-shared';
const key = (file) => path.relative(OUT, file).split(path.sep).join('/');
const mainDry = await esbuild.build({
  ...options,
  entryPoints: [game('main.js')],
  outfile: game('main.js'),
  write: false,
  metafile: true,
  plugins: [oneLanguage]
});
const inMain = new Set(Object.keys(mainDry.metafile.inputs).map((file) => path.resolve(file)));
const exportsOf = new Map();
async function namesOf(file) {
  if (!exportsOf.has(file)) {
    const r = await esbuild.build({
      entryPoints: [file],
      bundle: true,
      format: 'esm',
      write: false,
      metafile: true,
      outdir: path.join(OUT, '.names'),
      logLevel: 'silent',
      plugins: [oneLanguage]
    });
    exportsOf.set(file, Object.values(r.metafile.outputs).find((o) => o.entryPoint).exports);
  }
  return exportsOf.get(file);
}
const shared = new Set();
const fromMain = (entryFile) => ({
  name: 'from-main',
  setup(build) {
    build.onResolve({ filter: /^\./ }, async (args) => {
      if (args.pluginData === SHARED || args.namespace === SHARED) return undefined;
      const found = await build.resolve(args.path, {
        kind: args.kind,
        resolveDir: args.resolveDir,
        importer: args.importer,
        pluginData: SHARED
      });
      if (found.errors.length || found.external || found.path === entryFile) return undefined;
      if (!inMain.has(found.path)) return undefined;
      shared.add(found.path);
      return { path: found.path, namespace: SHARED };
    });
    build.onLoad({ filter: /.*/, namespace: SHARED }, async (args) => {
      const names = await namesOf(args.path);
      const named = names.filter((n) => n !== 'default');
      return {
        contents:
          `const m = globalThis.MTE_SHARED && globalThis.MTE_SHARED[${JSON.stringify(key(args.path))}];\n` +
          `if (!m) throw new Error('main.js has not shared ${key(args.path)}: lazy modules load after it');\n` +
          (named.length ? `export const { ${named.join(', ')} } = m;\n` : '') +
          (names.includes('default') ? 'export default m.default;\n' : ''),
        loader: 'js'
      };
    });
  }
});
for (const name of LAZY)
  await esbuild.build({
    ...options,
    entryPoints: [game(name)],
    outfile: game(name), // in place: import.meta.url stays where it was
    plugins: [oneLanguage, fromMain(path.resolve(game(name)))]
  });

// main.js, with src/game/share.js (its last import) filled in to register
// the shared modules before main.js's own code runs.
const sharedList = [...shared].sort();
await esbuild.build({
  ...options,
  entryPoints: [game('main.js')],
  outfile: game('main.js'), // in place: import.meta.url stays where main.js was
  plugins: [
    oneLanguage,
    {
      name: 'share',
      setup(build) {
        build.onLoad({ filter: /[\\/]src[\\/]game[\\/]share\.js$/ }, () => ({
          contents:
            sharedList
              .map((file, i) => `import * as s${i} from ${JSON.stringify(file)};`)
              .join('\n') +
            `\nglobalThis.MTE_SHARED = Object.freeze({ ${sharedList
              .map((file, i) => `${JSON.stringify(key(file))}: s${i}`)
              .join(', ')} });\n`,
          loader: 'js'
        }));
      }
    }
  ]
});

// Run before main.js, or on their own: nothing to share.
for (const file of [
  game('start.js'),
  path.join(OUT, 'src/i18n/en.js'),
  path.join(OUT, 'src/i18n/lt.js'),
  path.join(OUT, 'src/i18n/news/en.js'),
  path.join(OUT, 'src/i18n/news/lt.js')
])
  await esbuild.build({ ...options, entryPoints: [file], outfile: file, plugins: [oneLanguage] });

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
  `Inlined the default pack's pictures; bundled the game (${Math.round(fs.statSync(game('main.js')).size / 1024)} KB)`
);
