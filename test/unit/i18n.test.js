/* Every word the player reads exists in English and Lithuanian, and nothing
 * the player reads bypasses the translations (src/i18n/i18n.js). These
 * checks fail loudly when a string is added in one language only, or written
 * straight into the code:
 *  - every dictionary has exactly the same keys as English, with the same
 *    {placeholders}, the plural forms its language needs, and nothing empty;
 *  - every t('key') written in the code exists;
 *  - no string literal in the game, the core or the wiki reads like words
 *    (it must come from t() instead): a line can opt out with a trailing
 *    `// i18n-ok: <why>` comment, for text that is not for the player;
 *  - the pages' static markup holds no words, only data-i18n keys;
 *  - the whole game's content loads in every language. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { LANGUAGES } from '../../src/i18n/i18n.js';
import wikiEn from '../../wiki/i18n/en.js';
import wikiLt from '../../wiki/i18n/lt.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = (p) => relative(ROOT, p);

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return jsFiles(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

// The game's dictionaries, as loaded (before the wiki adds its own).
const GAME = Object.fromEntries(Object.entries(LANGUAGES).map(([code, l]) => [code, { ...l.strings }]));
const WIKI = { en: wikiEn, lt: wikiLt };
const CODES = Object.keys(LANGUAGES);

const placeholders = (v) => {
  const forms = typeof v === 'string' ? [v] : Object.values(v);
  return [...new Set(forms.flatMap((f) => [...f.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))].sort();
};

for (const [name, dicts] of [['game', GAME], ['wiki', WIKI]]) {
  test(`the ${name} dictionaries all have the same keys`, () => {
    const keys = Object.keys(dicts.en);
    for (const code of CODES) {
      assert.ok(dicts[code], `no ${code} ${name} dictionary`);
      const missing = keys.filter((k) => !(k in dicts[code]));
      const extra = Object.keys(dicts[code]).filter((k) => !(k in dicts.en));
      assert.deepEqual(missing, [], `${code} ${name} dictionary is missing: ${missing.join(', ')}`);
      assert.deepEqual(extra, [], `${code} ${name} dictionary has keys English lacks: ${extra.join(', ')}`);
    }
  });

  test(`every ${name} translation is complete: same placeholders, every plural form, nothing empty`, () => {
    for (const code of CODES) {
      const forms = new Intl.PluralRules(LANGUAGES[code].locale).resolvedOptions().pluralCategories;
      for (const [key, value] of Object.entries(dicts[code])) {
        const en = dicts.en[key];
        assert.equal(typeof value, typeof en, `${code} "${key}": a ${typeof en} in English, a ${typeof value} here`);
        if (typeof value === 'string') assert.ok(value.trim(), `${code} "${key}" is empty`);
        else {
          for (const f of forms) assert.ok(typeof value[f] === 'string' && value[f].trim(), `${code} "${key}" has no "${f}" plural form`);
        }
        assert.deepEqual(placeholders(value), placeholders(en), `${code} "${key}" has placeholders ${placeholders(value)}, English has ${placeholders(en)}`);
      }
    }
  });
}

test('the game and the wiki never define the same key', () => {
  const twice = Object.keys(WIKI.en).filter((k) => k in GAME.en);
  assert.deepEqual(twice, [], `defined in both: ${twice.join(', ')}`);
});

// src/vendor/ holds other people's code, copied unchanged: not ours to check.
const SOURCES = [...jsFiles(join(ROOT, 'src')), ...jsFiles(join(ROOT, 'wiki'))].filter((f) => !f.includes(join('src', 'vendor')))
  .filter((f) => !f.includes(join('src', 'i18n')) && !f.includes(join('wiki', 'i18n')));

test('every key the code asks for exists', () => {
  const all = { ...GAME.en, ...WIKI.en };
  for (const file of SOURCES) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bt\('([^']+)'\s*[,)]/g)) {
      assert.ok(m[1] in all, `${rel(file)} asks for "${m[1]}", which no dictionary has`);
    }
  }
});

/* ------------------------------------------- no raw text in the code */

// The string literals of a JS file: [{text, line}], template literals with
// their ${...} parts left out. Comments and regular expressions are skipped.
function literals(src) {
  const out = [];
  let i = 0, line = 1, prev = '';
  const n = src.length;
  const regexCanStart = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|in|of)$/.test(prev);
  function readString(q) {
    const start = line;
    let text = '';
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { text += src[i + 1]; i += 2; continue; }
      if (src[i] === '\n') line++;
      if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
        // Skip the expression, strings and nested templates included.
        i += 2;
        let depth = 1;
        while (i < n && depth) {
          const c = src[i];
          if (c === "'" || c === '"' || c === '`') { readString(c); i++; continue; }
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '\n') line++;
          i++;
        }
        text += ' ';
        continue;
      }
      text += src[i++];
    }
    out.push({ text, line: start });
  }
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      line += (src.slice(i, end).match(/\n/g) || []).length;
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { readString(c); i++; prev = 'x'; continue; }
    if (c === '/' && regexCanStart()) {
      i++;
      let inClass = false;
      while (i < n && (inClass || src[i] !== '/')) {
        if (src[i] === '\\') i++;
        else if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        i++;
      }
      i++;
      prev = 'x';
      continue;
    }
    if (!/\s/.test(c)) prev = (prev + c).slice(-8);
    i++;
  }
  return out;
}

// Whether a literal reads as words for a person: once markup, entities and
// symbols are gone, two words in a row, or one capitalised word.
function wordy(text) {
  // A literal may open or close a tag that another literal finishes.
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/<[^>]*$/, ' ').replace(/^[^<]*>/, ' ').replace(/&\w+;/g, ' ');
  if (/^\s*[a-z][\w-]*(\.[\w-]+)+\s*$/.test(plain)) return false; // a translation key or look id
  return /\p{L}{2,}[ ,:;!?'’]+\p{L}{2,}/u.test(plain) || /^\s*\p{Lu}\p{Ll}+[.!?]?\s*$/u.test(plain);
}

test('no player-facing text is written straight into the code', () => {
  const found = [];
  for (const file of SOURCES) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (const { text, line } of literals(src)) {
      const at = lines[line - 1] || '';
      if (/\/\/ i18n-ok: \S/.test(at) || /\bconsole\.\w+\(/.test(at)) continue;
      if (wordy(text)) found.push(`${rel(file)}:${line}: ${JSON.stringify(text.slice(0, 70))}`);
    }
  }
  assert.deepEqual(found, [], 'text that bypasses t() (put it in src/i18n/en.js and lt.js, or mark the line `// i18n-ok: <why>` if no player reads it):\n' + found.join('\n'));
});

/* ---------------------------------------------- no words in the markup */

// The text a page shows that doesn't come from data-i18n: text between
// tags, and the attributes people read. Inline scripts and styles are left
// to the checks above and below. A name that is the same in every language
// (the author's mark) is marked translate="no".
function markupWords(html) {
  const found = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '')
    .replace(/<meta (http-equiv|name="referrer")[^>]*>/g, '') // policies for the browser, not words
    .replace(/(<[^>]*\stranslate="no"[^>]*>)[^<]*/g, '$1');
  for (const m of body.matchAll(/>([^<]+)</g)) if (/\p{L}/u.test(m[1].replace(/&\w+;/g, ''))) found.push(m[1].trim());
  for (const m of body.matchAll(/\s(aria-label|placeholder|title|alt|content)="([^"]*)"/g)) {
    if (/\p{L}{2,}/u.test(m[2]) && !/^(width=|#|yes$|no$|telephone=|black-)/.test(m[2])) found.push(`${m[1]}="${m[2]}"`);
  }
  return found;
}

for (const page of ['index.html', 'wiki/index.html']) {
  test(`${page} has no words of its own, only data-i18n keys`, () => {
    const html = readFileSync(join(ROOT, page), 'utf8');
    assert.deepEqual(markupWords(html), []);
    const all = { ...GAME.en, ...WIKI.en };
    for (const m of html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)) assert.ok(m[1] in all, `${page} uses "${m[1]}", which no dictionary has`);
  });
}

test("the crash screen's own words exist in every language", () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const block = html.match(/var CRASH_TEXT = (\{[\s\S]*?\n {4}\});/);
  assert.ok(block, 'index.html has no CRASH_TEXT');
  const crash = Function('return ' + block[1])();
  assert.deepEqual(Object.keys(crash).sort(), [...CODES].sort());
  for (const code of CODES) {
    assert.deepEqual(Object.keys(crash[code]).sort(), Object.keys(crash.en).sort(), `CRASH_TEXT.${code} keys`);
    for (const [k, v] of Object.entries(crash[code])) assert.ok(v.trim(), `CRASH_TEXT.${code}.${k} is empty`);
  }
});

/* ------------------------------------------------- loads in every language */

for (const code of CODES) {
  test(`the whole game's content and every milestone load in ${LANGUAGES[code].name}`, () => {
    // A fresh Node per language: the language is picked once, at load.
    const script = `
      const C = await import(${JSON.stringify(new URL('../../src/core/index.js', import.meta.url).href)});
      const s = C.createState(7);
      if (C.LOOKS.some((l) => !l.name || !l.does)) throw new Error('a look has no name or text');
      console.log(JSON.stringify({ looks: C.LOOKS.length, goal: C.GOALS[0].text, reason: C.buy(s, 'nomad').reason }));`;
    const out = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, MTE_LANG: code } }).toString());
    assert.ok(out.looks > 50);
    assert.equal(out.goal, LANGUAGES[code].strings['goal.forage']);
  });
}
