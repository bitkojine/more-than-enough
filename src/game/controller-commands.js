/* The commands that change what you have or what stands in the world, as
 * the controller carries them out (controller.js): buying an upgrade,
 * placing and moving buildings and props, crystal-world commands and
 * Embark. Each calls the core, then gives feedback (feedback.js). A
 * command for something out of reach walks there first (`approach`).
 *
 * `stopWalk()` ends a walk in progress; `faceTile(x, y)` turns the wanderer. */

import * as Core from '../core/index.js';
import { randomSeed } from './storage.js';
import { t } from '../i18n/i18n.js';

// What the wanderer does for each crystal-world command that worked.
const CULTIVATION_ACTS = {
  build: 'build',
  repair: 'build',
  reinforce: 'build',
  craft: 'build',
  line: 'build',
  collect: 'collect',
  store: 'collect',
  shade: 'collect',
  lantern: 'collect',
  plant: 'pick',
  tend: 'pick',
  starter: 'pick',
  heart: 'pick',
  activate: 'cheer'
};

export function createCommands({
  game,
  feedback,
  approach,
  faceTile,
  stopWalk,
  ask,
  hud,
  audio,
  fx
}) {
  const state = () => game.state;
  const player = () => game.state.player;
  const { say, performAct, changed, checkGoals } = feedback;

  const commands = {
    cultivation(cmd, finished = null) {
      const x = cmd.x ?? Math.floor(player().x),
        y = cmd.y ?? Math.floor(player().y);
      if (!['craft', 'lantern'].includes(cmd.type)) {
        if (!Core.atInteraction(state(), x, y)) {
          const queued = approach(x, y, () => commands.cultivation(cmd, finished));
          if (!queued) finished?.('reach');
          return queued || 'reach';
        }
        stopWalk();
      }
      const result = Core.cultivationCommand(state(), cmd);
      if (['ok', 'lifted', 'discovery', 'activated'].includes(result)) {
        faceTile(cmd.x ?? Math.floor(player().x), cmd.y ?? Math.floor(player().y));
        const action = CULTIVATION_ACTS[cmd.type];
        if (action) performAct(action, { work: cmd.type });
        changed();
        checkGoals();
      }
      finished?.(result);
      return result;
    },

    buy(id) {
      const s = state();
      if (!Core.buy(s, id).ok) return false;
      audio.upgrade();
      performAct('cheer');
      say('✦', Core.UPGRADES[id].currency === 'insight' ? '#cbb0f0' : '#9fe08a');
      changed();
      checkGoals();
      return true;
    },

    placeProp(kind) {
      const s = state();
      const res = Core.placeProp(s, kind);
      if (!res.ok) return false;
      faceTile(res.x, res.y);
      fx.built(res.x, res.y);
      performAct('build');
      audio.build();
      changed();
      return true;
    },

    // On the nearest free tile, or on `at` ({x, y}) when one is picked.
    place(key, at = null) {
      const s = state();
      const res = Core.place(s, key, at);
      if (!res.ok) return false;
      faceTile(res.x, res.y);
      fx.built(res.x, res.y);
      performAct('build');
      audio.build();
      changed();
      checkGoals();
      return true;
    },

    // Moves your building `b` (one of your buildings, or a crystal-world
    // facility) to tile `at` beside you: free (Watch, 2026-10-26).
    move(b, at) {
      const s = state();
      const ok = s.extractors.includes(b)
        ? Core.moveExtractor(s, b, at.x, at.y).ok
        : Core.moveFacility(s, b, at.x, at.y) === 'ok';
      if (!ok) return false;
      faceTile(at.x, at.y);
      fx.built(at.x, at.y);
      performAct('build');
      audio.build();
      changed();
      return true;
    },

    // Embark starts another preserved world, so it asks first.
    async embark() {
      if (!Core.canEmbark(state())) return;
      const yes = await ask({
        title: t('ask.embark.title'),
        text: t('ask.embark.empty'),
        yes: t('ask.embark.yes')
      });
      const s = state();
      if (!yes || !Core.canEmbark(s)) return;
      // The world you leave is kept as it is now, or you don't leave it.
      if (!game.keep()) return;
      const res = Core.embark(s, randomSeed());
      game.replace(res.state);
      audio.fanfare();
      hud.toast(t('world.emptyStart'));
    }
  };
  return commands;
}
