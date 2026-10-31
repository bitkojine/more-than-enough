import { unlockOptional } from './helpers.js';
/* Ore flares (core flare.js): made and lit in one go from metal, carried,
 * burning down; underground their light uncovers the rock, and in a crystal
 * world it cracks crystal like the lantern's (Watch, 2026-10-26). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

const cmd = (s, type, kind, x = 0, y = 0) => C.cultivationCommand(s, { type, kind, x, y });
const run = (s, secs) => {
  for (let i = 0; i < Math.round(secs * 4); i++) C.step(s, 0.25, { visualEvents: false });
};
// A crystal world with the player down on layer `z`, a cleared site round them.
function deep(z = -2, { cultivation = true } = {}) {
  const s = unlockOptional(C.createState(7, { cultivation }));
  s.tools.pickaxe = 3;
  for (const r of C.RESOURCES) C.earn(s, r, 300, 'hand');
  for (let y = -8; y <= 8; y++)
    for (let x = -8; x <= 8; x++) {
      const t = C.tileAt(s.world, x, y, z);
      if (!C.TILE_INFO[t].rise && !C.TILE_INFO[t].descend) {
        C.setRichness(s.world, x, y, z, 0);
        C.markExplored(s.world, x, y, z);
      }
    }
  s.player = { x: 0.5, y: 0.5, z };
  s.underground.deepest = z;
  return s;
}

test('one tap makes a flare from FLARE_COST and lights it; a second puts it out, spent', () => {
  const s = deep();
  const before = s.inv.ore;
  assert.equal(C.useFlare(s), 'lit');
  assert.equal(s.inv.ore, before - C.FLARE_COST.ore);
  assert.equal(s.flare, C.FLARE_TIME);
  assert.equal(s.stats.flares, 1);
  assert.equal(C.useFlare(s), 'out');
  assert.equal(s.flare, 0, 'what was left of it is gone');
  assert.equal(s.inv.ore, before - C.FLARE_COST.ore, 'putting it out gives nothing back');
});

test('no metal, no flare: nothing is taken and nothing lights', () => {
  const s = deep();
  C.pay(s.inv, { ore: s.inv.ore });
  assert.equal(C.useFlare(s), 'materials');
  assert.equal(s.flare, 0);
  assert.equal(s.stats.flares, 0);
});

test('a flare burns down in FLARE_TIME seconds of play, then you make another', () => {
  const s = deep();
  C.useFlare(s);
  run(s, C.FLARE_TIME / 2);
  assert.ok(Math.abs(s.flare - C.FLARE_TIME / 2) < 1e-6, 'half burnt: ' + s.flare);
  run(s, C.FLARE_TIME / 2 + 1);
  assert.equal(s.flare, 0, 'burnt out, never below nothing');
  assert.equal(C.useFlare(s), 'lit', 'another, from more metal');
});

test('a shared world has no flares yet: its room does not check them', () => {
  const s = deep(-1, { cultivation: false });
  s.shared = 'room';
  assert.equal(C.useFlare(s), 'invalid');
  assert.equal(s.flare, 0);
});

test('underground in a crystal world light uncovers: none the tiles beside you, the lantern its reach, a flare far', () => {
  const s = deep();
  assert.equal(C.sightRadius(s), C.UNLIT_RADIUS);
  assert.equal(cmd(s, 'craft', 'lantern'), 'ok');
  cmd(s, 'lantern');
  assert.equal(C.sightRadius(s), C.MINE_EXPLORE_RADIUS);
  C.useFlare(s);
  assert.equal(C.sightRadius(s), C.FLARE_LIGHT);
  assert.equal(s.cultivation.lantern, false, 'lighting the flare switches off the lantern');
  assert.equal(C.sightRadius(s), C.FLARE_LIGHT, 'the flare alone reaches as far');
  // The reveal itself: a tile FLARE_LIGHT - 1 away is uncovered once the flare is lit.
  const far = { x: Math.floor(s.player.x) + C.FLARE_LIGHT - 1, y: Math.floor(s.player.y) + 12 };
  s.player.y += 12;
  assert.equal(C.isExplored(s.world, far.x, far.y, s.player.z), false);
  C.revealAround(s);
  assert.equal(C.isExplored(s.world, far.x, far.y, s.player.z), true);
});

test('older worlds keep their lantern reach; a flare adds its wide light in the dark', () => {
  const s = deep(-1, { cultivation: false });
  const lantern = C.exploreRadius(s) * C.lightScale(s);
  assert.equal(C.sightRadius(s), lantern);
  C.useFlare(s);
  assert.equal(C.sightRadius(s), Math.max(lantern, C.FLARE_LIGHT));
  s.player.z = C.SURFACE;
  s.time = 0; // noon: a flare adds nothing to daylight
  assert.equal(C.sightRadius(s), C.exploreRadius(s));
});

test('a flare illuminates a chamber without damaging its protected colony', () => {
  const s = deep();
  s.player.x = 0.5;
  s.player.y = 0.5;
  assert.equal(cmd(s, 'build', 'chamber', 1, 0), 'ok');
  const b = C.cultivationAt(s, 1, 0);
  b.health = 100;
  assert.equal(C.cultivationLight(s, b), false);
  run(s, 1);
  const safe = b.health;
  C.useFlare(s);
  assert.equal(C.cultivationLight(s, b), true);
  assert.equal(b.health, safe, 'lighting it does not expose protected contents');
  const lit = b.health;
  run(s, 1);
  assert.equal(b.health, lit, 'contents remain protected while it burns');
  C.useFlare(s);
  assert.equal(C.cultivationLight(s, b), false, 'put out, the chamber is dark again');
  // Out of reach, a tile more than FLARE_LIGHT away stays dark.
  assert.equal(C.cultivationLight(s, { x: C.FLARE_LIGHT + 2, y: 0, z: s.player.z }), false);
});

test('the heart and carried crystal feel a flare', () => {
  const s = deep();
  s.cultivation.heart = { where: 'carried', health: 100 };
  assert.equal(C.heartLight(s, { x: 0, y: 0, z: s.player.z }), 0);
  C.useFlare(s);
  assert.equal(C.heartLight(s, { x: 0, y: 0, z: s.player.z }), (C.FLARE_LIGHT + 1) / C.LIGHT_MAX);
  run(s, 1);
  assert.ok(s.cultivation.heart.health < 100);
});

test('a burning flare is saved and loads with what is left of it; old saves have none', () => {
  const s = deep();
  C.useFlare(s);
  run(s, 10);
  const back = C.deserialize(C.serialize(s));
  assert.ok(Math.abs(back.flare - s.flare) < 0.01, back.flare + ' vs ' + s.flare);
  const old = JSON.parse(C.serialize(s));
  delete old.flare;
  assert.equal(C.deserialize(JSON.stringify(old)).flare, 0);
  old.flare = 1e9;
  assert.equal(
    C.deserialize(JSON.stringify(old)).flare,
    C.FLARE_TIME,
    'never more than a whole flare'
  );
  assert.equal(back.inv.ore, s.inv.ore);
});

// The extended property sweep found it (seed 3640888): a flare a hair from
// out was saved as 0, which loads as no flare, and the save didn't round-trip.
test('a flare all but burnt out saves as none, so a save round-trips', () => {
  const s = deep();
  C.useFlare(s);
  s.flare = 0.003;
  const once = C.serialize(s);
  assert.equal(JSON.parse(once).flare, undefined);
  assert.equal(C.serialize(C.deserialize(once)), once);
});
