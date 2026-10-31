import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playCultivation } from '../../scripts/cultivation-playtest.mjs';
import * as C from '../../src/core/index.js';
import { createController } from '../../src/game/controller.js';
import { createSimulation } from '../../src/engine/simulation.js';

// The wall budget only stops a hung run: the game-time budget is the check,
// so a slow or busy machine can't fail it.
const run = playCultivation(11, { wallSeconds: 300 });

test('empty-handed cultivation world reaches activation through shipped movement and actions', () => {
  assert.equal(run.result, 'won', run.error);
  assert.ok(run.seconds > 0);
  assert.ok(run.actions > 100);
  assert.ok(Object.values(run.stages[0].inv).every((n) => n === 0));
  assert.ok(run.trace.every((e) => !e.intent || e.result));
  const before = C.deserialize(run.activationSave),
    after = C.deserialize(run.save);
  assert.ok(before);
  assert.equal(C.canEmbark(before), false);
  assert.ok(C.canEmbark(after));
  assert.equal(
    C.nextGoal(after),
    null,
    'a completed world does not still ask the player to discover metal'
  );
  assert.equal(after.cultivation.facilities.find((b) => b.kind === 'machine').sections, 3);
  assert.equal(after.extractors.length, 0, 'the focused route uses no optional producers');
  assert.ok(
    after.cultivation.facilities.every((b) => ['chamber', 'cooler', 'machine'].includes(b.kind))
  );
});

// Every number a played world holds as a fraction (timers, charges, piles,
// health) saves and loads to the same save at the edges of its rounding.
// The long property sweep found one such slip only after a deploy (v0.171.1:
// a flare almost burnt out); this finds that kind in a second, before one.
test('a played world saves the same after loading, whatever fractions it holds', () => {
  const lit = C.deserialize(run.save);
  lit.inv.ore = (lit.inv.ore || 0) + C.FLARE_COST.ore;
  assert.ok(C.useFlare(lit));
  C.burnFlare(lit, 7.3);
  const old = C.createState(4242);
  for (let i = 0; i < 4000; i++) C.step(old, 0.25);
  // Later systems still belong to the save contract even though the focused
  // journey no longer builds them. Include representative post-win fractions.
  const expanded = C.deserialize(run.save),
    c = expanded.cultivation,
    room = c.facilities.find((b) => b.kind === 'chamber');
  expanded.extractors.push({
    key: 'garden',
    res: 'mycelium',
    x: 900001,
    y: 900001,
    z: 0,
    buffer: 1.2345
  });
  const vault = {
    kind: 'vault',
    id: c.nextId++,
    x: 900000,
    y: 900000,
    z: -2,
    temperature: 18.123,
    quality: 83.456,
    buffer: 12.345
  };
  c.facilities.push(vault, {
    kind: 'conduit',
    id: c.nextId++,
    x: 900000,
    y: 899999,
    z: -2,
    temperature: 12.345,
    quality: 100,
    buffer: 0,
    from: room.id,
    to: vault.id
  });
  const states = [lit, C.deserialize(run.save), expanded, old];
  const leaves = (o, path = [], out = []) => {
    for (const [k, v] of Object.entries(o)) {
      if (!path.length && ['world', 'acts', 'edits'].includes(k)) continue;
      if (typeof v === 'number') out.push([o, k, [...path, k].join('.')]);
      else if (v && typeof v === 'object' && !(v instanceof Map) && !(v instanceof Set))
        leaves(v, [...path, k], out);
    }
    return out;
  };
  let tried = 0;
  const slips = [];
  for (const s of states)
    for (const [o, k, path] of leaves(s)) {
      const keep = o[k];
      if (Number.isInteger(keep)) continue;
      tried++;
      for (const v of [0.004, 0.0049, 0.005, 0.00004, keep + 0.004]) {
        o[k] = v;
        const a = C.serialize(s);
        if (C.serialize(C.deserialize(a)) !== a) slips.push(path + '=' + v);
      }
      o[k] = keep;
    }
  assert.ok(
    tried >= 40,
    `only ${tried} fractions were tried: the states no longer reach what they did`
  );
  assert.ok(
    states[0].flare > 0 && !Number.isInteger(states[0].flare),
    'the flare is burning, part way'
  );
  assert.deepEqual(slips, [], 'these values save differently after a load');
});

test('recorded fresh journey replays every controller command and tick to the same win', () => {
  const state = C.deserialize(run.initialSave),
    noop = () => {},
    proxy = new Proxy({}, { get: () => noop });
  assert.ok(
    Object.values(state.inv).every((n) => n === 0) &&
      Object.values(state.tools).every((n) => n === 0)
  );
  const game = { state, saveSoon: noop, saveNow: noop },
    controller = createController({
      game,
      cam: {},
      fx: proxy,
      audio: proxy,
      hud: proxy,
      look: { color: () => '' },
      actor: { act: noop },
      ask: async () => false
    });
  const simulation = createSimulation({
    game,
    controller,
    autoplay: { tick: noop },
    input: {
      perfect: false,
      held: false,
      trail: null,
      holdPoint: () => null,
      moveVector: () => ({ x: 0, y: 0 })
    }
  });
  let actions = 0,
    ticks = 0;
  for (const entry of run.trace) {
    if (entry.ticks) {
      for (let i = 0; i < entry.ticks; i++) simulation.tick();
      ticks += entry.ticks;
    } else {
      const result = entry.intent
        ? controller.perform(entry.intent, false)
        : controller.cultivation(entry.cultivation);
      assert.equal(result, entry.result);
      if (entry.cultivation) controller.checkGoals();
      actions++;
    }
  }
  assert.equal(actions, run.actions);
  assert.equal(ticks, run.ticks);
  assert.equal(C.serialize(state), run.save);
  assert.ok(C.canEmbark(state));
});
