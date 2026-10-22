/* The shipped AUTO/controller host, shared by fresh evaluation and the live
 * developer viewer. Presentation is absent; no special gameplay actions. */
import * as Core from '../core/index.js';
import { createController } from './controller.js';
import { createPerfect } from './perfect.js';
import { createSimulation } from '../engine/simulation.js';
const nothing = () => {};

export function createAutoplaySession(seed, seen = () => {}) {
  const state = Core.createState(seed);
  const game = { state, saveSoon: nothing, saveNow: nothing,
    replace() { throw new Error('AUTO must not replace the world'); } }; // i18n-ok: invalid developer host operation
  const fx = Object.fromEntries(['text', 'tally', 'celebrate', 'hit', 'found', 'gathered', 'dug', 'tossed', 'flyersFrom', 'clear', 'built'].map((k) => [k, nothing]));
  const audio = Object.fromEntries(['fanfare', 'collect', 'gather', 'dig', 'upgrade', 'build'].map((k) => [k, nothing]));
  const hud = Object.fromEntries(['update', 'updateButtons', 'milestone', 'toast'].map((k) => [k, nothing]));
  const controller = createController({ game, fx, audio, hud,
    cam: { unproject() { throw new Error('No manual map input'); } }, // i18n-ok: invalid developer host operation
    look: { color: () => '#ffffff' }, actor: { act: nothing, busy: false },
    ask() { throw new Error('AUTO must not confirm dialogs'); } // i18n-ok: invalid developer host operation
  });
  const perform = controller.perform.bind(controller);
  controller.perform = (intent, held) => {
    const result = perform(intent, held);
    seen(intent, result);
    return result;
  };
  const auto = createPerfect({ game, controller, hud });
  const zero = { x: 0, y: 0 };
  const input = { held: false, trail: null, perfect: false, moveVector: () => zero, holdPoint: () => null };
  const simulation = createSimulation({ game, controller, autoplay: auto, input });
  Core.revealAround(state); // the normal initial reveal, never a world scan
  return {
    state,
    get badge() { return auto.badge; },
    get walking() { return controller.walking; },
    get goal() { return auto.goal; },
    press() { input.perfect = true; auto.press(); },
    release() { input.perfect = false; auto.release(); },
    tick: simulation.tick,
    advanceChunk: simulation.advanceChunk,
    get work() { return simulation.work; },
    advanceTicks(count) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid tick count'); // i18n-ok: invalid developer host operation
      return simulation.advanceTicks(count);
    }
  };
}

