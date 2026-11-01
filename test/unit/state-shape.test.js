/* The world's state is listed in one place: the State typedef in
 * src/core/state.js. These checks keep that list whole, so a reader (or an
 * editor's type hints) sees every field a state can hold:
 *  - every field blankState() and createState() set is listed;
 *  - every field the code writes onto a state (`s.x = …` in the core, the
 *    network code and the room service; `game.state.x = …` in the game) is
 *    listed. A new field fails here until it is added, with a line on what
 *    it holds and who sets it. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankState, createState } from '../../src/core/state.js';
import { createWorld } from '../../src/core/world.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return jsFiles(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

function typedefFields(file, name) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const start = src.indexOf(`@typedef {object} ${name}`);
  assert.ok(start >= 0, `${file} has a ${name} typedef`);
  const block = src.slice(start, src.indexOf('*/', start));
  return new Set([...block.matchAll(/@property \{.*?\} \[?(\w+)\]?/g)].map((m) => m[1]));
}

const listed = typedefFields('src/core/state.js', 'State');

test('every field a new state has is in the State typedef', () => {
  const fresh = [blankState(createWorld(7)), createState(7), createState(7, { cultivation: true })];
  for (const s of fresh)
    for (const key of Object.keys(s))
      assert.ok(listed.has(key), `State typedef (src/core/state.js) lacks '${key}'`);
});

test('every field the code writes onto a state is in the State typedef', () => {
  const writes = [
    ...['src/core', 'src/net', 'server/src'].map((dir) => [
      dir,
      /\bs\.(\w+) *(?:=|\?\?=|\|\|=)(?!=)/g
    ]),
    ['src/game', /\bgame\.state\.(\w+) *(?:=|\?\?=|\|\|=)(?!=)/g]
  ];
  const missing = [];
  for (const [dir, re] of writes)
    for (const file of jsFiles(join(ROOT, dir)))
      for (const m of readFileSync(file, 'utf8').matchAll(re))
        if (!listed.has(m[1])) missing.push(`${relative(ROOT, file)}: ${m[1]}`);
  assert.deepEqual(missing, [], 'add these to the State typedef in src/core/state.js');
});

test('every field a new world has is in the World typedef', () => {
  const worldFields = typedefFields('src/core/world.js', 'World');
  for (const key of Object.keys(createWorld(7)))
    assert.ok(worldFields.has(key), `World typedef (src/core/world.js) lacks '${key}'`);
});
