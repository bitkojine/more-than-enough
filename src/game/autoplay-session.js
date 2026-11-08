/* The shipped AUTO/controller host, shared by fresh evaluation and the live
 * developer viewer. Presentation is absent; no special gameplay actions. */
import * as Core from '../core/index.js';
import { createController } from './controller.js';
import { createPerfect } from './perfect.js';
import { createSimulation } from '../engine/simulation.js';
const nothing = () => {};

// `state`: a world to play instead of a new old-economy one (a crystal
// world, or a crystal room's copy as a game holds it).
export function createAutoplaySession(seed, seen = () => {}, { state: given = null } = {}) {
  const state = given ?? Core.createState(seed);
  const game = {
    state,
    saveSoon: nothing,
    saveNow: nothing,
    replace() {
      // i18n-ok: invalid developer host operation
      throw new Error('AUTO must not replace the world');
    }
  };
  const fx = Object.fromEntries(
    [
      'text',
      'tally',
      'celebrate',
      'hit',
      'found',
      'gathered',
      'dug',
      'tossed',
      'flyersFrom',
      'clear',
      'built'
    ].map((k) => [k, nothing])
  );
  const audio = Object.fromEntries(
    ['fanfare', 'collect', 'gather', 'dig', 'upgrade', 'build'].map((k) => [k, nothing])
  );
  const hud = Object.fromEntries(
    ['update', 'updateButtons', 'milestone', 'toast'].map((k) => [k, nothing])
  );
  const controller = createController({
    game,
    fx,
    audio,
    hud,
    cam: {
      unproject() {
        // i18n-ok: invalid developer host operation
        throw new Error('No manual map input');
      }
    },
    look: { color: () => '#ffffff' },
    actor: { act: nothing, busy: false },
    ask() {
      // i18n-ok: invalid developer host operation
      throw new Error('AUTO must not confirm dialogs');
    }
  });
  const perform = controller.perform.bind(controller);
  controller.perform = (intent, held) => {
    const result = perform(intent, held);
    seen(intent, result);
    return result;
  };
  const auto = createPerfect({ game, controller, hud });
  const zero = { x: 0, y: 0 };
  let dir = zero; // where it is steered by hand (steer), or nowhere
  const input = { held: false, trail: null, perfect: false, moveVector: () => dir };
  const simulation = createSimulation({ game, controller, autoplay: auto, input });
  if (!given) Core.revealAround(state); // the normal initial reveal, never a world scan
  return {
    state,
    get badge() {
      return auto.badge;
    },
    get walking() {
      return controller.walking;
    },
    get facing() {
      return controller.facing;
    },
    get goal() {
      return auto.goal;
    },
    press() {
      input.perfect = true;
      auto.press();
    },
    release() {
      input.perfect = false;
      auto.release();
    },
    // Walks the way `v` ({x, y}, at most 1 long) points, as a held stick
    // does, AUTO waiting meanwhile; nothing (or zero) stops (the company
    // bots, scripts/bots/bot.mjs).
    steer(v = null) {
      dir = v && (v.x || v.y) ? { x: v.x, y: v.y } : zero;
    },
    tick: simulation.tick,
    advanceChunk: simulation.advanceChunk,
    get work() {
      return simulation.work;
    },
    advanceTicks(count) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid tick count'); // i18n-ok: invalid developer host operation
      return simulation.advanceTicks(count);
    }
  };
}
