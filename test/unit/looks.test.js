/* The catalog of everything in the game and the game's one pack
 * (packs/default/pack.json): every thing the game shows has an id, and the
 * pack draws all of it, with every slot in the shape the game reads. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { C } from './helpers.js';
import { createLook, iconHtml } from '../../src/game/look/look.js';

const PACK_DIR = new URL('../../packs/default/', import.meta.url).pathname;
const pack = JSON.parse(readFileSync(join(PACK_DIR, 'pack.json'), 'utf8'));

const { pictures } = C;

// Every way the pack could disagree with the catalog, by thing and slot.
function packProblems(json) {
  const problems = [];
  for (const k of Object.keys(json))
    if (!['format', 'name', 'author', 'tile', 'pixelated', 'looks'].includes(k))
      problems.push('top-level key ' + k);
  for (const [id, entry] of Object.entries(json.looks)) {
    const thing = C.LOOK[id];
    if (!thing) {
      problems.push(id + ': no such thing');
      continue;
    }
    for (const [slot, value] of Object.entries(entry)) {
      const where = `${id} ${slot}`;
      if (!(slot in thing.slots)) problems.push(where + ': no such slot');
      else if (slot === 'color') {
        if (!/^#[0-9a-f]{6}$/i.test(value)) problems.push(where + ': not a colour');
      } else if (slot === 'tiers' || slot === 'stages') {
        if (!(Array.isArray(value) && value.length && !value.includes(null)))
          problems.push(where + ': not a list of pictures');
      } else if (
        Array.isArray(value)
          ? !value.some((v) => v !== null)
          : value &&
            typeof value === 'object' &&
            !(value.frames?.length && value.fps > 0 && value.fps <= 30)
      )
        problems.push(where + ': bad variants or frames');
      for (const p of slot === 'color' ? [] : pictures(value))
        if (!/^[\w\-./ ]+\.svg$/.test(p) || p.includes('..'))
          problems.push(`${where}: ${p} is not an SVG next to pack.json`);
    }
  }
  for (const thing of C.LOOKS) {
    for (const [slot, required] of Object.entries(thing.slots)) {
      if (required && json.looks[thing.id]?.[slot] === undefined)
        problems.push(`${thing.id} ${slot}: missing`);
    }
  }
  return problems;
}

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
  for (const g of C.LOOK_GROUPS)
    assert.ok(
      C.LOOKS.some((t) => t.group === g.id),
      `group ${g.id} is not empty`
    );
});

test('catalog: everything the game draws or lists has a look', () => {
  for (let t = 0; t < C.TILE_INFO.length; t++)
    assert.ok(C.LOOK[C.tileLook(t)], `tile ${t} (${C.TILE_NAME[t]})`);
  for (const r of C.RESOURCES) assert.ok(C.LOOK[C.resourceLook(r)], `resource ${r}`);
  assert.ok(C.LOOK['resource.insight']);
  for (const k of Object.keys(C.EXTRACTORS)) assert.ok(C.LOOK['building.' + k], `building ${k}`);
  for (const [id, u] of Object.entries(C.UPGRADES))
    assert.ok(C.LOOK[u.look], `upgrade ${id} -> ${u.look}`);
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
  assert.deepEqual(packProblems(pack), []);
  for (const [id, entry] of Object.entries(pack.looks)) {
    for (const [slot, value] of Object.entries(entry)) {
      if (slot === 'color') continue;
      for (const p of pictures(value))
        assert.ok(existsSync(join(PACK_DIR, p)), `${id} ${slot}: ${p} exists`);
    }
  }
});

test('default pack: every file in it is used, and every SVG has a size', () => {
  const used = new Set();
  for (const entry of Object.values(pack.looks)) {
    for (const [slot, value] of Object.entries(entry))
      if (slot !== 'color') pictures(value).forEach((p) => used.add(p));
  }
  const files = readdirSync(PACK_DIR, { recursive: true }).filter((f) =>
    /\.(svg|png|webp|jpe?g|gif)$/.test(f)
  );
  assert.deepEqual(
    files.filter((f) => !used.has(f)),
    [],
    'no unused pictures'
  );
  for (const f of files.filter((n) => n.endsWith('.svg'))) {
    const head = readFileSync(join(PACK_DIR, f), 'utf8').match(/<svg[^>]*>/)[0];
    for (const attr of ['xmlns=', 'width=', 'height=', 'viewBox='])
      assert.ok(head.includes(attr), `${f} has ${attr}`);
  }
});

test('default pack: the checker catches what would break the game', () => {
  const broken = {
    looks: {
      ...pack.looks,
      'tile.gras': { top: 'g.svg' },
      'tile.water': { ...pack.looks['tile.water'], icon: 'w.svg', color: 'blue' }
    }
  };
  delete broken.looks['tile.grass'];
  const problems = packProblems(broken);
  for (const e of [
    'tile.gras: no such thing',
    'tile.water icon: no such slot',
    'tile.water color: not a colour',
    'tile.grass top: missing'
  ]) {
    assert.ok(problems.includes(e), `reports: ${e}\n got: ${problems.join('\n')}`);
  }
});

// A loaded pack's slots, each picture standing in as its name.
const loaded = (looks) => ({
  slots: new Map(
    Object.entries(looks).map(([id, e]) => [
      id,
      Object.fromEntries(
        Object.entries(e).map(([slot, pics]) => [
          slot,
          { pics: [].concat(pics), variants: false, fps: 0 }
        ])
      )
    ])
  )
});

test('look: a building shows the stage for what waits in it, empty when nothing does', () => {
  const look = createLook();
  look.use(
    loaded({ 'building.garden': { image: 'full', stages: ['empty', 'little', 'most', 'full'] } })
  );
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

test('physical tiers and machine repairs show their own stage', () => {
  const look = createLook();
  look.use(
    loaded({
      'tool.pickaxe': { icon: 'stone', stages: ['stone', 'forged', 'braced'] },
      'building.sleepingMachine': {
        image: 'awake',
        stages: ['dormant', 'one', 'two', 'three', 'awake']
      }
    })
  );
  assert.equal(look.level('tool.pickaxe', 1, 'icon'), 'forged');
  assert.equal(look.level('tool.pickaxe', 9, 'icon'), 'braced', 'past the last stage, the last');
  assert.equal(look.level('building.sleepingMachine', 0), 'dormant');
  assert.equal(look.level('building.sleepingMachine', 4), 'awake');
});

test('missing HTML pictures never emit an empty src and report the logical request', () => {
  const look = createLook(),
    faults = [],
    previous = globalThis.MTE_FAULT;
  look.use(loaded({ 'tile.geode': { top: { url: 'https://assets.test/geode.svg' } } }));
  globalThis.MTE_FAULT = (err, where) => faults.push({ err, where });
  try {
    for (const [id, slot] of [
      ['tile.geode', 'image'],
      ['tile.typo', 'image']
    ]) {
      const html = iconHtml(look, id, 'ico', slot);
      assert.ok(html.startsWith('<span '));
      assert.ok(!html.includes('src='));
      const f = faults.at(-1);
      assert.equal(f.err.name, 'PictureUnavailableError');
      assert.match(f.err.message, new RegExp(id.replace('.', '\\.')));
      assert.ok(f.err.message.includes('slot=image'));
      assert.equal(f.where, 'picture');
    }
    assert.ok(
      iconHtml(look, 'tile.geode', 'ico', 'top').includes('src="https://assets.test/geode.svg"')
    );
    assert.equal(faults.length, 2, 'valid artwork creates no fault');
  } finally {
    if (previous === undefined) delete globalThis.MTE_FAULT;
    else globalThis.MTE_FAULT = previous;
  }
});
