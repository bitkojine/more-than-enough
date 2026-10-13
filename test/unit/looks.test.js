/* The catalog of everything in the game, the texture pack format, and the
 * default pack: every thing the game shows has an id, the default pack draws
 * all of it, and a broken pack is caught with a message naming what broke. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { C } from './helpers.js';
import { validatePack, pictures, isPicture } from '../../src/game/look/validate.js';

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

test('catalog: only surface deposits that can be worked out have a cut look', () => {
  for (const t of C.LOOKS.filter((l) => l.group === 'tile')) {
    const info = C.TILE_INFO[C.TILE_KEY.indexOf(t.key)];
    assert.equal('cut' in t.slots, !!(info.harvest && !info.solid), t.id);
  }
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
      'resource.wood': 'wood.png'
    }
  });
  const expect = [
    'Unknown top-level key "extra"', '"format" must be 1', '"name" is missing',
    'tile.gras: no such thing', 'tile.water icon: Water has no "icon"', 'tile.water color: must be a colour',
    'tile.water top: unknown key "speed"', 'tile.water top: "frames" must be a list', 'tile.water top: "fps" must be',
    'tile.grass stand: Grass has no "stand"', 'tile.forest stand: every variant is empty', 'tile.grass top: "grass.txt" is not a picture', 'resource.wood: must be an object'
  ];
  for (const e of expect) assert.ok(problems.some((p) => p.startsWith(e)), `reports: ${e}\n got: ${problems.join('\n')}`);
  assert.equal(problems.length, expect.length, problems.join('\n'));
  assert.deepEqual(validatePack(null), ['The pack is not a JSON object']);
  assert.ok(validatePack({ format: 1, name: 'x' }).includes('"looks" must be an object of thing ids'));
});
