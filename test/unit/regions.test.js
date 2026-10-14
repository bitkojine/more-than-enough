/* Regions (src/core/regions.js): the surface is a patchwork of big named
 * places, each with its own kind of land, set apart by rivers and ridges. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T } from './helpers.js';
import { LANGUAGES } from '../../src/i18n/i18n.js';

const SEED = 12345;

test('every world starts in the middle of a meadow region', () => {
  for (const seed of [1, SEED, 777]) {
    const r = C.regionAt(seed, 0, 0);
    assert.equal(r.key, '0,0');
    assert.equal(r.biome, 'meadow');
    assert.ok(r.name && r.kind);
  }
});

test('regions are big: a long walk from home in any direction before the next', () => {
  for (let a = 0; a < 16; a++) {
    const dx = Math.cos(a * Math.PI / 8), dy = Math.sin(a * Math.PI / 8);
    let d = 0;
    while (C.regionAt(SEED, Math.round(dx * d), Math.round(dy * d)).key === '0,0') d++;
    assert.ok(d > 70, 'only ' + d + ' tiles at angle ' + a);
  }
});

test('a border runs between any two regions: a river, a ridge, a wall or a hedge, with gaps', () => {
  const w = C.createWorld(SEED);
  const kinds = new Set();
  let crossings = 0;
  for (let y = -1500; y < 1500; y += 7) {
    for (let x = -1500; x < 1500; x++) {
      const a = C.landAt(SEED, x, y), b = C.landAt(SEED, x + 1, y);
      if (a.cx === b.cx && a.cy === b.cy) continue;
      crossings++;
      assert.ok(a.border || b.border, 'a border at ' + x + ',' + y);
      kinds.add(a.border || b.border);
      const t = C.tileAt(w, a.border ? x : x + 1, y, C.SURFACE);
      assert.ok([T.WATER, T.ROCK, T.WALL, T.HEDGE, T.GRASS, T.CAVE].includes(t), 'border tile ' + t);
    }
  }
  assert.ok(crossings > 50);
  assert.deepEqual([...kinds].sort(), ['hedge', 'pass', 'ridge', 'river', 'wall']);
});

test('kinds of land differ: woods are wooded, lakes wet, highlands rocky', () => {
  const w = C.createWorld(SEED);
  const share = {};
  for (let y = -1500; y < 1500; y += 5) for (let x = -1500; x < 1500; x += 5) {
    const b = C.landAt(SEED, x, y).biome;
    const t = C.tileAt(w, x, y, C.SURFACE);
    const s = share[b] || (share[b] = { n: 0, forest: 0, water: 0, rock: 0 });
    s.n++;
    if (t === T.FOREST) s.forest++;
    if (t === T.WATER) s.water++;
    if (t === T.ROCK) s.rock++;
  }
  const f = (b, k) => share[b][k] / share[b].n;
  assert.ok(f('woods', 'forest') > 1.8 * f('meadow', 'forest'), 'woods');
  assert.ok(f('heath', 'forest') < 0.5 * f('meadow', 'forest'), 'heath');
  assert.ok(f('lakes', 'water') > 2 * f('meadow', 'water'), 'lakes');
  assert.ok(f('highlands', 'rock') > 2 * f('meadow', 'rock'), 'highlands');
});

test('neighbouring regions never share a name, and every name exists in every language', () => {
  for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
    const r = C.region(SEED, cx, cy);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx || dy) assert.notEqual(C.region(SEED, cx + dx, cy + dy).name, r.name);
    }
  }
  for (const [b, info] of Object.entries(C.BIOMES)) {
    for (const lang of Object.values(LANGUAGES)) {
      assert.ok(lang.strings['biome.' + b], b);
      for (let n = 1; n <= info.names; n++) assert.ok(lang.strings[`region.${b}.${n}`], `region.${b}.${n}`);
    }
  }
});
