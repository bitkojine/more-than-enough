import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { cardAt } from '../../src/game/building-card.js';
import { cultivationBuildRows, cultivationUpgradeRows, useLook } from '../../src/game/sheet.js';

function site() {
  const s = C.createState(114, { cultivation: true });
  s.player = { x: 0.5, y: 0.5, z: -2 };
  s.tools.pickaxe = 3;
  for (let y = -4; y <= 4; y++)
    for (let x = -4; x <= 4; x++) {
      C.tileAt(s.world, x, y, -2);
      s.world.hotChunk.type[C.chunkIndex(x, y)] = C.T.TUNNEL;
      C.markExplored(s.world, x, y, -2);
    }
  for (const r of C.RESOURCES) s.inv[r] = 200;
  return s;
}
function facility(s, kind, x, y, extra = {}) {
  const b = {
    kind,
    id: s.cultivation.nextId++,
    x,
    y,
    z: -2,
    temperature: 18,
    quality: 100,
    buffer: 0,
    ...extra
  };
  s.cultivation.facilities.push(b);
  return b;
}
const command = (s, type, kind, x = 0, y = 0) => C.cultivationCommand(s, { type, kind, x, y });

test('the focused chapter allows its minimum kit and rejects optional spending in the core', () => {
  const s = site();
  for (const kind of ['vault', 'conduit']) {
    const before = C.serialize(s);
    assert.equal(command(s, 'build', kind), 'locked');
    assert.equal(C.serialize(s), before);
  }
  for (const key of ['garden', 'quarry', 'mine', 'stoneworks', 'depot']) {
    const before = C.serialize(s);
    assert.equal(C.place(s, key, { x: 0, y: 0 }).ok, false);
    assert.equal(C.serialize(s), before);
  }
  assert.equal(C.canBuy(s, 'basket'), false);
  assert.equal(C.buy(s, 'basket').ok, false);
  assert.equal(C.canBuy(s, 'pickaxe'), false);
  assert.equal(command(s, 'craft', 'lantern'), 'ok');
  assert.equal(command(s, 'craft', 'carrier'), 'ok');
  assert.equal(command(s, 'build', 'chamber'), 'ok');
  assert.equal(command(s, 'plant'), 'starter');
  assert.equal(command(s, 'reinforce'), 'locked');
  assert.equal(
    C.nextGoal(s)?.build === 'garden',
    false,
    'guidance never asks for locked producers'
  );
});

test('owned optional tools and flares are preserved but inactive until activation', () => {
  const s = site();
  s.tools = { basket: 6, pickaxe: 6, boots: 5, overclock: 6 };
  s.flare = 73.25;
  const owned = { ...s.tools };
  assert.equal(C.gatherYield(s, 'mycelium'), 1);
  assert.equal(C.gatherYield(s, 'stone'), 4);
  assert.equal(C.speedMult(s), 1.3);
  assert.equal(C.effectiveToolLevel(s, 'pickaxe'), 3);
  assert.equal(C.flareLit(s), false);
  assert.equal(C.useFlare(s), 'locked');
  C.burnFlare(s, 10);
  assert.equal(s.flare, 73.25);
  assert.deepEqual(s.tools, owned);
  const copy = C.deserialize(C.serialize(s));
  assert.deepEqual(copy.tools, owned);
  assert.equal(copy.flare, s.flare);
});

test('locked automation freezes its contents and heat; active chambers keep growing without trimming earned buffers', () => {
  const s = site();
  facility(s, 'machine', -2, 0, { health: 0, sections: 0 });
  const room = facility(s, 'chamber', 0, 0, { health: 100, buffer: 27, reinforced: true });
  facility(s, 'cooler', 0, 1);
  const vault = facility(s, 'vault', 2, 0, { buffer: 11, quality: 62, temperature: 80 });
  facility(s, 'conduit', 1, 0, { from: room.id, to: vault.id });
  s.extractors.push(
    { key: 'mine', res: 'ore', x: 1, y: 1, z: -2, buffer: 17 },
    { key: 'quarry', res: 'stone', x: 2, y: 2, z: -2, buffer: 5 },
    { key: 'depot', res: 'stone', x: 1, y: 2, z: -2, buffer: 0 }
  );
  const kept = structuredClone([s.extractors, vault]),
    inv = { ...s.inv };
  assert.equal(C.cultivationTarget(s, room), 18, 'paused mine emits no heat');
  C.step(s, 0.25, { visualEvents: false });
  assert.deepEqual(s.inv, inv);
  assert.deepEqual([s.extractors, vault], kept);
  assert.equal(room.buffer, 27, 'earned over-capacity crystal is never trimmed');
  assert.equal(C.collect(s), null);
  assert.equal(C.moveExtractor(s, s.extractors[0], 0, 0).ok, false);
  assert.equal(command(s, 'collect', null, 2, 0), 'reach');
  s.player.x = 1.5;
  assert.equal(command(s, 'collect', null, 2, 0), 'locked');
  s.player.x = 0.5;
  room.buffer = 0;
  C.step(s, 0.25, { visualEvents: false });
  assert.ok(room.buffer > 0, 'required crystal production stays active');
});

test('actual activation unlocks existing equipment, purchases and paused production without resetting progress', () => {
  const s = site(),
    machine = facility(s, 'machine', 0, 0, { sections: 3, health: 100 });
  facility(s, 'cooler', 0, 1);
  s.cultivation.heart = { where: 'installed', health: 88 };
  s.tools.basket = 6;
  s.flare = 52;
  s.cultivation.gear.lantern = true;
  s.cultivation.lantern = true;
  const producer = { key: 'quarry', res: 'stone', x: 2, y: 0, z: -2, buffer: 5 };
  s.extractors.push(producer);
  assert.equal(command(s, 'activate'), 'activated');
  assert.equal(C.focusedChapter(s), false);
  assert.equal(C.contentLocked(s, 'vault'), false);
  assert.equal(C.effectiveToolLevel(s, 'basket'), 6);
  assert.equal(C.flareLit(s), true);
  assert.equal(
    s.cultivation.lantern,
    false,
    'unpausing a saved flare cannot create a second carried light'
  );
  C.step(s, 0.25, { visualEvents: false });
  assert.ok(producer.buffer > 5);
  assert.equal(machine.sections, 3);
  assert.equal(s.cultivation.heart.health, 88);
  const copy = C.deserialize(C.serialize(s));
  assert.ok(C.canEmbark(copy));
  assert.equal(copy.tools.basket, 6);
  assert.equal(copy.extractors.length, 1);
});

test('heart shelters remain usable in the focused chapter so saved damaged hearts can recover', () => {
  const s = site(),
    shelter = facility(s, 'shelter', 1, 0);
  s.cultivation.heart = { where: shelter.id, health: 63 };
  C.stepCultivation(s, 1);
  assert.equal(s.cultivation.heart.health, 63.25);
  assert.equal(cardAt(s, 1, 0).actions[0].type, 'heart');
  assert.equal(command(s, 'heart', null, 1, 0), 'lifted');
  assert.equal(command(s, 'heart', null, 1, 0), 'ok');
  assert.equal(s.cultivation.heart.where, shelter.id);
  assert.equal(C.contentLocked(s, 'shelter'), false);
});

test('locked catalog entries stay visible with icons and real unlock conditions, not fake purchase prices', () => {
  useLook({ src: () => '', color: () => '#000' });
  const s = site(),
    html = cultivationBuildRows(s) + cultivationUpgradeRows(s);
  for (const look of [
    'building.crystalVault',
    'building.sealedConduit',
    'tool.basket',
    'tool.flare'
  ])
    assert.ok(html.includes('data-locked="' + look + '"'), look);
  assert.ok(html.includes('lockIcon'));
  assert.ok(html.includes('Activate the machine to unlock.'));
  assert.ok(!cardAt(s, 0, 0));
});

test('legacy worlds retain their original tools, purchases, production and flare rules', () => {
  const s = C.createState(114);
  s.tools.basket = 6;
  s.inv.ore = 10;
  assert.equal(C.focusedChapter(s), false);
  assert.equal(C.contentLocked(s, 'garden'), false);
  assert.equal(C.effectiveToolLevel(s, 'basket'), 6);
  assert.equal(C.useFlare(s), 'lit');
});

test('retiring the producer milestone from guidance never removes an earned garden award', () => {
  const s = site();
  s.goalsDone.push('garden');
  const copy = C.deserialize(C.serialize(s));
  assert.ok(copy.goalsDone.includes('garden'));
  assert.ok(C.worldGoals(copy).some((g) => g.id === 'garden'));
  assert.equal(C.goalsTotal(copy), C.worldGoals(copy).length);
});
