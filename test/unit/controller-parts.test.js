/* The controller's parts on their own, with stand-ins for the page:
 * what the player sees and hears (feedback.js) and the commands that change
 * what you have (controller-commands.js). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { createFeedback } from '../../src/game/feedback.js';
import { createCommands } from '../../src/game/controller-commands.js';

// Records every call made on it, as [name, ...args].
function recorder() {
  const calls = [];
  const obj = new Proxy(
    {},
    {
      get:
        (_, name) =>
        (...args) =>
          calls.push([name, ...args])
    }
  );
  return { obj, calls, names: () => calls.map((c) => c[0]) };
}

function parts(s) {
  const fx = recorder(),
    audio = recorder(),
    hud = recorder();
  const acts = [];
  const faced = [];
  let saves = 0;
  const game = {
    state: s,
    saveSoon: () => saves++,
    keep: () => true,
    replace(next) {
      game.state = next;
    }
  };
  const feedback = createFeedback({
    game,
    fx: fx.obj,
    audio: audio.obj,
    hud: hud.obj,
    look: { color: () => '#000' },
    actor: { act: (kind, d) => acts.push([kind, d]) },
    facing: () => ({ x: 0, y: 1 }),
    faceTile: (x, y) => faced.push([x, y])
  });
  return { game, feedback, fx, audio, hud, acts, faced, saves: () => saves };
}

test('feedback: a swing at plain soil says it was dug, a gathered tile what it gave', () => {
  const s = C.createState(12345);
  const p = parts(s);
  p.feedback.harvested({ x: 3, y: 4, z: 0, type: C.T.SOIL });
  assert.deepEqual(p.faced, [[3, 4]]);
  assert.ok(p.fx.names().includes('dug'));
  assert.ok(p.fx.names().includes('tossed'));
  assert.deepEqual(p.audio.names(), ['dig']);

  const q = parts(s);
  q.feedback.harvested({ x: 1, y: 1, z: 0, type: C.T.FOREST, res: 'mycelium', amount: 2 });
  assert.ok(q.fx.names().includes('gathered'));
  assert.equal(q.audio.calls[0][0], 'gather');
  assert.equal(q.acts[0][0], 'pick'); // mycelium is picked, never swung at
  assert.deepEqual(q.acts[0][1].facing, { x: 0, y: 1 });
});

test('feedback: a find is shown and heard, nothing else', () => {
  const p = parts(C.createState(12345));
  p.feedback.harvested({ x: 0, y: 0, z: -1, type: C.T.STONE_SEAM, found: 'coin' });
  assert.ok(p.fx.names().includes('found'));
  assert.ok(!p.fx.names().includes('dug'));
  assert.deepEqual(p.audio.names(), ['collect']);
});

test('feedback: changed updates the HUD and schedules a save; needsGear names the tool', () => {
  const p = parts(C.createState(12345));
  p.feedback.changed();
  assert.equal(p.saves(), 1);
  assert.deepEqual(p.hud.names(), ['update']);
  p.feedback.needsGear({ tool: 'pickaxe', level: 2 });
  assert.equal(p.hud.calls[1][0], 'toast');
  assert.match(p.hud.calls[1][1], /2/);
});

function commands(p, approach = () => false) {
  let stopped = 0;
  const cmds = createCommands({
    game: p.game,
    feedback: p.feedback,
    approach,
    faceTile: () => {},
    stopWalk: () => stopped++,
    ask: async () => true,
    hud: p.hud.obj,
    audio: p.audio.obj,
    fx: p.fx.obj
  });
  return { cmds, stopped: () => stopped };
}

test('commands: a crystal-world command out of reach walks there, or says it is out of reach', () => {
  const s = C.createState(12345);
  const p = parts(s);
  const far = { type: 'plant', x: Math.floor(s.player.x) + 40, y: Math.floor(s.player.y) };
  const said = [];
  const none = commands(p);
  assert.equal(
    none.cmds.cultivation(far, (r) => said.push(r)),
    'reach'
  );
  assert.deepEqual(said, ['reach']);

  const queued = [];
  const walks = commands(p, (x, y, then) => (queued.push({ x, y, then }), true));
  assert.equal(walks.cmds.cultivation(far), true);
  assert.equal(queued[0].x, far.x);
  assert.equal(walks.stopped(), 0);
});

test('commands: a purchase that cannot be paid for changes nothing', () => {
  const s = C.createState(12345);
  const p = parts(s);
  const id = Object.keys(C.UPGRADES)[0];
  const before = JSON.stringify(s.upgrades ?? null);
  assert.equal(commands(p).cmds.buy(id), false);
  assert.equal(JSON.stringify(s.upgrades ?? null), before);
  assert.equal(p.saves(), 0);
  assert.deepEqual(p.audio.calls, []);
});

// Online only (Watch, 2026-11-05): no command starts a new world of your own.
test('commands: there is no Embark, even in a won world', () => {
  assert.equal(commands(parts(C.createState(12345))).cmds.embark, undefined);
});
