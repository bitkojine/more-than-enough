/* Playthroughs: the Perfect button's brain (core perfect.js), held, plays
 * the real world with real movement from the first spawn on, through every
 * phase, and stops for the player at Embark. Before it, scripted bots that
 * walk the same world from nothing to automation and the Abundance Engine. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, T, typeAt, createBot, holdPerfect, master } from './helpers.js';

function playToAutomation(seed) {
  const b = createBot(seed);
  const { s, clock, mark, gather, standBy, free } = b;
  gather('mycelium', 6); C.buy(s, 'basket'); mark('axe2');
  gather('mycelium', 8); C.buy(s, 'boots'); mark('boots2');
  gather('mycelium', 10); gather('stone', 6); C.buy(s, 'pickaxe'); mark('pick2');
  gather('mycelium', 15); standBy(free(T.FOREST)); C.place(s, 'garden'); mark('garden');
  gather('mycelium', 30); gather('stone', 15); standBy(free(T.STONE)); C.place(s, 'quarry'); mark('quarry');
  gather('stone', 45); gather('ore', 12); standBy(free(T.ORE)); C.place(s, 'mine'); mark('mine');
  gather('stone', 30); gather('ore', 4); C.buy(s, 'overclock'); mark('overclock2');

  const start = clock.t;
  while (clock.t - start < 180 && clock.t < 1400) {
    C.step(s, 0.1); clock.t += 0.1;
    if (C.collectTarget(s)) C.collect(s);
    if (!s.unlocks.logistics) {
      if (C.buy(s, 'logistics').ok) mark('logistics');
      else if (s.extractors.length < 3) break;
    }
  }
  return b;
}

for (const seed of [12345, 777, 20260101]) {
  test('bot reaches automation on seed ' + seed, () => {
    const { s, timeline } = playToAutomation(seed);
    assert.ok(s.extractors.length >= 2, JSON.stringify(timeline));
    if (seed === 12345) {
      for (const step of ['axe2', 'garden', 'quarry', 'mine']) assert.ok(timeline[step] !== undefined, step);
    }
  });
}

test('bot plays through to the Abundance Engine', () => {
  const { s, clock, timeline, mark, gather, standBy, buyNow, buildNow } = createBot(12345);
  buyNow('basket'); buyNow('boots'); buyNow('pickaxe');
  buildNow('garden'); buildNow('quarry'); buildNow('mine');
  assert.ok(buyNow('logistics').ok, 'Logistics');
  while (s.tools.overclock < 3 && clock.t < 2000) if (!buyNow('overclock').ok) break;
  assert.ok(buyNow('pickaxe').ok, 'Pickaxe III, for crystal');
  if (standBy((st, x, y) => typeAt(st, x, y) === T.CRYSTAL)) {
    mark('crystal');
    if (buildNow('resonator').ok) mark('resonator');
  }

  const quota = C.abundanceCost(s);
  const campFor = (res) => s.extractors.find((e) => e.res === res);
  while (clock.t < 6000 && s.abundanceLv === 0) {
    const want = C.RESOURCES.find((r) => s.inv[r] < quota[r]);
    if (want) {
      const camp = campFor(want);
      const near = camp && Math.hypot(camp.x + 0.5 - s.player.x, camp.y + 0.5 - s.player.y) <= 2.9;
      const camped = near || (camp && standBy((st, x, y) =>
        !C.extractorAt(st, x, y, 0) && C.walkable(st.world, x, y, 0) && Math.hypot(x - camp.x, y - camp.y) <= 2.4, true));
      if (!camped) gather(want, Math.min(quota[want], s.inv[want] + 25)); // no camp: hand-gather a batch
    }
    C.step(s, 0.1); clock.t += 0.1;
    if (C.buy(s, 'abundance').ok) mark('abundance');
  }
  assert.ok(timeline.crystal !== undefined, 'found crystal');
  assert.ok(timeline.resonator !== undefined, 'built a Resonator');
  assert.ok(timeline.abundance !== undefined, 'built the Abundance Engine (' + JSON.stringify(timeline) + ')');
});

/* ------------------------------------------------- the Perfect button */

// Holds Perfect on a new world for `minutes` of play, checking that every
// act it picks is one the game takes (legal by construction: nothing out of
// reach, nothing it can't afford, nothing through the fog) and noting when
// each milestone comes.
function holdFromSpawn(seed, minutes) {
  const s = C.createState(seed);
  const timeline = {}, refused = [], kinds = {};
  let clock = 0;
  holdPerfect(s, minutes * 60, {
    seen(intent, result) {
      kinds[intent.type] = (kinds[intent.type] || 0) + 1;
      if (intent.type === 'harvestAt' && s.player.z === C.SURFACE) {
        assert.ok(C.isExplored(s.world, intent.x, intent.y, C.SURFACE), 'only works what has been seen');
      }
      if (intent.type === 'walk' && s.player.z === C.SURFACE) {
        assert.ok(C.isExplored(s.world, intent.x, intent.y, C.SURFACE), 'only walks where it has seen');
      }
      if (intent.type === 'wait') assert.notEqual(intent.why, 'embark');
      if (result === undefined) return;
      if (!(result === true || (result && result.ok !== false))) refused.push(intent);
    },
    tick() {
      clock = s.time;
      for (const g of C.advanceGoals(s)) timeline[g.id] = +(clock / 60).toFixed(1);
    }
  });
  return { s, timeline, refused, kinds };
}

for (const seed of [12345, 777, 20260101]) {
  test('Perfect, held from the first spawn, plays to automation on seed ' + seed, () => {
    const { s, timeline, refused, kinds } = holdFromSpawn(seed, 45);
    assert.deepEqual(refused, [], 'the game took every act it picked');
    // Waiting is never the best thing to do (Watch, 2026-10-18): there's
    // always something to gather that adds to what the buildings make.
    assert.ok(!(kinds.wait > 5), 'it stood waiting ' + kinds.wait + ' times');
    for (const goal of ['forage', 'basket', 'garden', 'pickaxe', 'overclock', 'logistics']) {
      assert.ok(timeline[goal] !== undefined, goal + ' within 45 minutes: ' + JSON.stringify(timeline));
    }
    assert.ok(s.extractors.length >= 4, 'it built (' + s.extractors.length + ')');
  });
}

// The whole world, from spawn to Embark, takes it 36 h of play on seed 12345
// and 45 h on 777: minutes of test time per seed, too long for every run. Four
// hours here reaches the compounding phase: refineries on every resource,
// converters, the Abundance Engine.
test('Perfect plays on through automation into compounding', () => {
  const { s, timeline, refused } = holdFromSpawn(12345, 240);
  assert.deepEqual(refused, []);
  for (const goal of ['crystal', 'resonator', 'observatory', 'abundance1']) assert.ok(timeline[goal] !== undefined, goal + ': ' + JSON.stringify(timeline));
  for (const r of C.RESOURCES) assert.ok(s.resUp[r] >= 2, r + ' refinery ' + s.resUp[r]);
  assert.ok(s.abundanceLv <= C.EMBARK_ABUNDANCE, 'Abundance waits at the Embark level until the rest is done');
});

// Near a cave mouth, small early purchases each looked quickest to dig for,
// so Perfect went down for a second and straight back up, over and over
// (Watch saw it on the ladder, v0.110.0). These seeds did it from spawn: a
// trip down must now be worth the way back, and lasts.
for (const seed of [2415085376, 4055616911, 3668339994]) {
  test('Perfect does not bob up and down the mine ladder on seed ' + seed, () => {
    const s = C.createState(seed);
    let z = C.SURFACE, changes = 0, wentDown = 0;
    const stays = [];
    holdPerfect(s, 20 * 60, { seen: () => {
      if (s.player.z === z) return;
      changes++;
      if (z === C.SURFACE) wentDown = s.time;
      else if (s.player.z === C.SURFACE) stays.push(s.time - wentDown);
      z = s.player.z;
    } });
    assert.ok(changes <= 4, 'layer changes: ' + changes);
    for (const t of stays) assert.ok(t >= 30, 'a trip down lasted only ' + t.toFixed(1) + ' s');
  });
}

// The mine: when what's wanted can only be dug (here ore, every deposit seen
// too hard for the Pickaxe in hand and no building making it), Perfect goes
// down a cave mouth it has seen, flags the way back, lights the tunnel with
// glowcaps, digs to the finds, and later climbs back up the way it came.
test('Perfect digs in the mine when only finds pay, and comes back up', () => {
  const s = C.createState(12345);
  const mind = C.newMind();
  holdPerfect(s, 8 * 60, { mind });
  s.tools.pickaxe = 1;
  s.inv.ore = 0;
  s.abundanceLv = 0; // this fixture requires ore unavailable from any surface income
  s.extractors = s.extractors.filter((e) => e.res !== 'ore');
  const cave = C.nearestTile(s.player.x, s.player.y, 120, (x, y) => C.tileAt(s.world, x, y, 0) === C.T.CAVE);
  assert.ok(cave); C.markExplored(s.world, cave.x, cave.y, 0);
  const want = { ore: 40 };
  assert.equal(C.plan(s, mind, want).layer, 1, 'finds on layer 1 are the way to ore');
  mind.goal = { kind: 'build', id: 'mine', cost: want, level: C.extractorCount(s, 'mine') };
  mind.decided = s.time;
  let deepest = 0;
  const did = new Set();
  holdPerfect(s, 60, { mind, seen: (i) => { did.add(i.type + ':' + (i.kind || '')); deepest = Math.min(deepest, s.player.z); } });
  assert.equal(deepest, -1, 'it went down');
  assert.ok(did.has('descend:'), 'through a cave mouth');
  const props = [...s.world.props.values()];
  assert.ok(props.includes('flag') && props.includes('glowcap'), 'a flag by the way back, glowcaps along the tunnel: ' + props);
  assert.ok(s.stats.finds > 0 && s.inv.ore > 0, 'and dug finds for ore (' + s.stats.finds + ')');
  holdPerfect(s, 10 * 60, { mind });
  assert.equal(s.player.z, C.SURFACE, 'then back on the surface');
});

// A mastered world just short of what Embark takes, its Abundance Engine
// running: the brain keeps playing, and the moment Embark opens it waits
// for the player, never pressing it itself.
test('Perfect never tries to build on a deposit the player has emptied', () => {
  // A player who gathered most of the land around home bare, as nothing grows back.
  const s = C.createState(12345);
  const hx = Math.floor(s.player.x), hy = Math.floor(s.player.y);
  for (let y = hy - 25; y <= hy + 25; y++) for (let x = hx - 25; x <= hx + 25; x++) {
    const info = C.TILE_INFO[C.tileAt(s.world, x, y, C.SURFACE)];
    if (info.harvest && info.res && (x + y) % 3) C.setRichness(s.world, x, y, C.SURFACE, 0);
  }
  let places = 0, onEmpty = 0, refused = 0;
  holdPerfect(s, 600, {
    seen(intent, result) {
      if (intent.type !== 'place') return;
      places++;
      if (C.EXTRACTORS[intent.key].tile !== null && C.richness(s.world, intent.x, intent.y, C.SURFACE) <= 0) onEmpty++;
      if (result && !result.ok) refused++;
    },
    tick() { C.advanceGoals(s); s.events.length = 0; }
  });
  assert.ok(places > 0, 'it builds');
  assert.equal(onEmpty, 0, 'never on an emptied deposit');
  assert.equal(refused, 0, 'and nothing it tries is refused');
});

test('Perfect pauses at Embark and leaves it to the player', () => {
  const s = master(C.createState(12345));
  s.stats.mycelium = C.EMBARK_MIN_TOTAL - 400;
  let before = 0, pausedWhen = null;
  const { last } = holdPerfect(s, 600, {
    seen(intent) {
      if (intent.type === 'wait' && intent.why === 'embark') { pausedWhen = C.canEmbark(s); return; }
      assert.ok(!C.canEmbark(s), 'it acts only while Embark is closed');
      before++;
    }
  });
  assert.equal(before, 0, 'mastery pauses AUTO immediately, even below the old income gate');
  assert.equal(pausedWhen, true, 'it paused once Embark opened');
  assert.deepEqual([last.type, last.why, last.badge], ['wait', 'embark', 'ui.embark']);
  assert.equal(s.prestiges, 0, 'and did not embark');
  // Held on and on, it still only waits.
  const again = holdPerfect(s, 30);
  assert.equal(again.played, 0);
  assert.ok(C.canEmbark(s) && s.prestiges === 0);
});

test('Perfect never pauses in a shared world, where there is no Embark, and spends no Insight there', () => {
  const s = master(C.createState(12345));
  s.shared = 'room'; s.me = 'me';
  s.stats.mycelium = 2 * C.EMBARK_MIN_TOTAL;
  s.insight = 10;
  const i = C.nextIntent(s, C.newMind());
  assert.notEqual(i.why, 'embark');
  assert.equal(C.nextPerk(s), null);
});

test('legacy Insight skips retired carry-over perks', () => {
  const s = C.createState(777);
  s.insight = 7;
  const bought = [];
  for (let id; (id = C.nextPerk(s)); ) { bought.push(id); C.buy(s, id); }
  assert.deepEqual(bought, ['cartographer', 'legacy', 'legacy', 'nomad']);
});
