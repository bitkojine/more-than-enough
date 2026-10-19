/* The catalog of everything in the game, the texture pack format, and the
 * default pack: every thing the game shows has an id, the default pack draws
 * all of it, and a broken pack is caught with a message naming what broke. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { C } from './helpers.js';
import { validatePack, pictures, isPicture } from '../../src/game/look/validate.js';
import { createLook } from '../../src/game/look/look.js';

const PACK_DIR = new URL('../../packs/default/', import.meta.url).pathname;
const pack = JSON.parse(readFileSync(join(PACK_DIR, 'pack.json'), 'utf8'));

const minimal = (looks = {}) => ({ format: C.PACK_FORMAT, name: 'Test', looks });

test('catalog: every thing has a unique id in a known group, with known slots', () => {
  const groups = new Set(C.LOOK_GROUPS.map((g) => g.id));
  const ids = C.LOOKS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const t of C.LOOKS) {
    assert.ok(groups.has(t.group), `${t.id} is in a known group`);
    assert.equal(t.id, `${t.group}.${t.key}`);
    assert.ok(t.name && t.does, `${t.id} has a name and says what it does`);
    const slots = Object.keys(t.slots);
    assert.ok(slots.length, `${t.id} has slots`);
    for (const s of slots) assert.ok(C.SLOTS.includes(s), `${t.id} slot ${s} is a known slot`);
  }
  for (const g of C.LOOK_GROUPS) assert.ok(C.LOOKS.some((t) => t.group === g.id), `group ${g.id} is not empty`);
});

test('catalog: everything the game draws or lists has a look', () => {
  for (let t = 0; t < C.TILE_INFO.length; t++) assert.ok(C.LOOK[C.tileLook(t)], `tile ${t} (${C.TILE_NAME[t]})`);
  for (const r of C.RESOURCES) assert.ok(C.LOOK[C.resourceLook(r)], `resource ${r}`);
  assert.ok(C.LOOK['resource.insight']);
  for (const k of Object.keys(C.EXTRACTORS)) assert.ok(C.LOOK['building.' + k], `building ${k}`);
  for (const [id, u] of Object.entries(C.UPGRADES)) assert.ok(C.LOOK[u.look], `upgrade ${id} -> ${u.look}`);
  for (const f of C.PATH_FAMILIES) assert.ok(C.LOOK[f.look], `upgrade group ${f.id}`);
});

test('catalog: only surface deposits that can be worked out have a cut look; forests never do', () => {
  for (const t of C.LOOKS.filter((l) => l.group === 'tile')) {
    const info = C.TILE_INFO[C.TILE_KEY.indexOf(t.key)];
    const workable = !!(info.harvest && !info.solid);
    assert.equal('cut' in t.slots, workable && !info.forage, t.id);
  }
  assert.ok(C.TILE_INFO[C.T.FOREST].forage, 'trees are never cut down');
  for (const f of C.LOOKS.filter((l) => l.group === 'forest')) assert.ok(!('cut' in f.slots), f.id);
});

test('default pack: complete, valid, and every picture it names exists', () => {
  assert.deepEqual(validatePack(pack, { complete: true }), []);
  for (const [id, entry] of Object.entries(pack.looks)) {
    for (const [slot, value] of Object.entries(entry)) {
      if (slot === 'color') continue;
      for (const p of pictures(value)) assert.ok(existsSync(join(PACK_DIR, p)), `${id} ${slot}: ${p} exists`);
    }
  }
});

test('default pack: every file in it is used, and every SVG has a size', () => {
  const used = new Set();
  for (const entry of Object.values(pack.looks)) {
    for (const [slot, value] of Object.entries(entry)) if (slot !== 'color') pictures(value).forEach((p) => used.add(p));
  }
  const files = readdirSync(PACK_DIR, { recursive: true }).filter((f) => /\.(svg|png|webp|jpe?g|gif)$/.test(f));
  assert.deepEqual(files.filter((f) => !used.has(f)), [], 'no unused pictures');
  for (const f of files.filter((n) => n.endsWith('.svg'))) {
    const head = readFileSync(join(PACK_DIR, f), 'utf8').match(/<svg[^>]*>/)[0];
    for (const attr of ['xmlns=', 'width=', 'height=', 'viewBox=']) assert.ok(head.includes(attr), `${f} has ${attr}`);
  }
});

test('pack: a partial pack is fine; the default fills the rest', () => {
  assert.deepEqual(validatePack(minimal({ 'tile.grass': { color: '#123456' } })), []);
  assert.deepEqual(validatePack(minimal()), []);
  assert.ok(validatePack(minimal(), { complete: true }).some((p) => p === 'tile.grass top: missing'));
});

test('pack: a pack saved before a thing was retired still loads', () => {
  assert.deepEqual(validatePack(minimal({ 'color.edge': { color: '#f0e2b6' }, 'color.visited': { color: '#3d2f21' } })), []);
  for (const id of C.RETIRED_LOOKS) assert.equal(C.LOOK[id], undefined, id + ' is retired, not drawn');
  assert.ok(validatePack(minimal({ 'color.nonsense': { color: '#000000' } })).length, 'an unknown thing is still a problem');
});

test('pack: pictures can be paths, inline SVG, data: or https: URLs; variants and animations', () => {
  for (const ok of ['a/b.png', 'x.svg', 'data:image/png;base64,AAA', 'https://example.com/t.webp', '<svg width="1" height="1"></svg>']) {
    assert.ok(isPicture(ok), ok);
  }
  for (const bad of ['../up.png', '/abs.png', 'http://insecure.png', 'notes.txt', 'javascript:alert(1)', 42]) {
    assert.ok(!isPicture(bad), String(bad));
  }
  assert.deepEqual(validatePack(minimal({
    'tile.grass': { top: ['a.png', 'b.png'] },
    'tile.forest': { stand: ['pine.png', null, null] },
    'tile.water': { top: { frames: ['w1.png', 'w2.png'], fps: 2 } }
  })), []);
});

test('pack: every problem is reported, naming the thing and slot', () => {
  const problems = validatePack({
    format: 99, extra: true, name: '',
    looks: {
      'tile.gras': { top: 'g.png' },
      'tile.water': { icon: 'w.png', color: 'blue', top: { frames: [], fps: 0, speed: 1 } },
      'tile.grass': { stand: 'tuft.png', top: 'grass.txt' },
      'tile.forest': { stand: [null, null] },
      'resource.mycelium': 'mycelium.png'
    }
  });
  const expect = [
    'Unknown top-level key "extra"', '"format" must be 1', '"name" is missing',
    'tile.gras: no such thing', 'tile.water icon: Water has no "icon"', 'tile.water color: must be a colour',
    'tile.water top: unknown key "speed"', 'tile.water top: "frames" must be a list', 'tile.water top: "fps" must be',
    'tile.grass stand: Grass has no "stand"', 'tile.forest stand: every variant is empty', 'tile.grass top: "grass.txt" is not a picture', 'resource.mycelium: must be an object'
  ];
  for (const e of expect) assert.ok(problems.some((p) => p.startsWith(e)), `reports: ${e}\n got: ${problems.join('\n')}`);
  assert.equal(problems.length, expect.length, problems.join('\n'));
  assert.deepEqual(validatePack(null), ['The pack is not a JSON object']);
  assert.ok(validatePack({ format: 1, name: 'x' }).includes('"looks" must be an object of thing ids'));
});

test('pack: a building\'s stages are a list of pictures, empty first', () => {
  const pack = (stages) => ({ format: 1, name: 'x', looks: { 'building.garden': { stages } } });
  assert.deepEqual(validatePack(pack(['e.png', 'f.png'])), []);
  for (const bad of [[], ['e.png', null], 'e.png']) {
    assert.ok(validatePack(pack(bad)).some((p) => p.startsWith('building.garden stages: must be a list')), JSON.stringify(bad));
  }
});

// A loaded pack's slots, each picture standing in as its name.
const loaded = (looks) => ({ slots: new Map(Object.entries(looks).map(([id, e]) =>
  [id, Object.fromEntries(Object.entries(e).map(([slot, pics]) => [slot, { pics: [].concat(pics), variants: false, fps: 0 }]))])) });

test('look: a building shows the stage for what waits in it, empty when nothing does', () => {
  const look = createLook();
  look.use(loaded({ 'building.garden': { image: 'full', stages: ['empty', 'little', 'most', 'full'] } }));
  const at = (share) => look.stage('building.garden', share);
  assert.equal(at(0), 'empty');
  assert.equal(at(0.01), 'little', 'one unit waiting already shows');
  assert.equal(at(0.49), 'little');
  assert.equal(at(0.5), 'most');
  assert.equal(at(0.99), 'most', 'full only when it is');
  assert.equal(at(1), 'full');
  look.use(loaded({ 'building.garden': { image: 'full', stages: ['empty', 'full'] } }));
  assert.equal(at(0.3), 'full', 'two stages: anything waiting shows the full one');
});

test('look: a player\'s pack that draws a building without stages keeps its own picture', () => {
  const look = createLook();
  const base = loaded({ 'building.garden': { image: 'full', stages: ['empty', 'little', 'most', 'full'] } });
  look.use(base, loaded({ 'building.garden': { image: 'mine' } }));
  assert.equal(look.stage('building.garden', 0), 'mine');
  assert.equal(look.stage('building.garden', 1), 'mine');
  look.use(base, loaded({ 'tile.grass': { top: 'g' } }));
  assert.equal(look.stage('building.garden', 0), 'empty', 'untouched buildings use the default stages');
});
