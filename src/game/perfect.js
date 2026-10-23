/* The Perfect button: hold it and the game plays itself. The brain in
 * src/core/perfect.js says what to do next; this carries each intent out
 * through the controller, the very calls a tap or press makes, so a shared
 * world's room sees nothing but a player's acts. Everything a person can do
 * by hand still works alongside: while you steer, tap or hold a tile, the
 * brain waits, and picks up again after.
 *
 * It stops for whatever needs the player (every dialog and sheet, and the
 * world ready to Embark, which only the player presses) and keeps the
 * screen awake while held. */

import * as Core from '../core/index.js';
import { t } from '../i18n/i18n.js';

const ACT_EVERY = 0.25;   // seconds between acts, as holding a tile works it
const CLOCK_EPSILON = 1e-9; // exact tick boundaries must not wait an extra frame
const PEEK_EVERY = 0.5;   // seconds between looks at what holding would do, while not held

export function createPerfect({ game, controller, hud }) {
  let mind = Core.newMind();
  let cooldown = 0, peekIn = 0;
  let badge = 'ui.explore';
  let target = null;     // the tile it works next ({x, y}), if it's working one
  let embarkSaid = null; // the world the Embark pause was last pointed out in
  let lock = null;
  let walked = false, walkToken = null;    // the walk under way is one it started

  const state = () => game.state;
  const see = (intent) => {
    badge = intent.badge;
    target = intent.type === 'harvestAt' ? { x: intent.x, y: intent.y } : null;
  };

  // One step of the brain: what it wants, done. `held`: a hold repeated it.
  function act(held, overdue = 0) {
    const intent = Core.nextIntent(state(), mind);
    see(intent);
    if (intent.type === 'wait') {
      if (intent.why === 'embark' && embarkSaid !== state()) {
        embarkSaid = state();
        hud.toast(t('toast.perfect.embark'));
      }
      return;
    }
    controller.perform(intent, held);
    walked = intent.type === 'walk';
    walkToken = walked ? controller.walkToken : null;
    if (!walked) cooldown = ACT_EVERY - overdue;
  }

  function stopOwnedWalk() {
    if (walked && controller.walking &&
        (walkToken === undefined || controller.walkToken === walkToken)) controller.stop();
    walked = false; walkToken = null;
  }

  // The screen stays on while the button is held (where the browser lets it).
  async function keepAwake(on) {
    try {
      if (on && !lock && navigator.wakeLock) lock = await navigator.wakeLock.request('screen');
      else if (!on && lock) { const l = lock; lock = null; await l.release(); }
    } catch { lock = null; } // refused (low battery, a background tab): the screen may sleep
  }

  return {
    // The look id of what the brain is doing (or would do), for the button's badge.
    get badge() { return badge; },
    // The tile it would work next, outlined on the map.
    get target() { return target; },
    // The shared scheduler may skip quiet ticks strictly before this deadline.
    get secondsUntilAct() { return Math.max(0, cooldown); },

    // Read-only diagnostic copy: observing a playtest cannot steer the brain.
    get goal() {
      const g = mind.goal;
      return g ? { kind: g.kind, id: g.id, cost: { ...g.cost } } : null;
    },

    // Pressed: act at once; holding repeats it in tick().
    press() {
      if(state().cultivation)return;
      keepAwake(true);
      if (cooldown <= CLOCK_EPSILON && !controller.walking) act(false);
    },

    // Let go: it stops, mid-step too.
    release() {
      keepAwake(false);
      stopOwnedWalk();
    },

    // Modal UI pauses AUTO movement without releasing the held input.
    suspend() { stopOwnedWalk(); },

    // Every frame. `holding`: the button is held, nothing in the way (no
    // dialog, no sheet) and the player isn't steering or working a tile.
    tick(dt, holding) {
      if(state().cultivation)return;
      const remaining = cooldown;
      cooldown -= dt;
      if (holding) {
        // Carry only the fraction of this tick past the deadline. Otherwise
        // 30 fps turns 0.25 s into 0.267 s forever. Time spent walking or
        // released never banks a burst of actions for later.
        const overdue = remaining > CLOCK_EPSILON ? Math.max(0, -cooldown) : 0;
        if (cooldown <= CLOCK_EPSILON && !controller.walking) act(true, overdue);
        return;
      }
      if ((peekIn -= dt) > 0) return;
      peekIn = PEEK_EVERY;
      see(Core.nextIntent(state(), mind, { peek: true }));
    },

    // A new world: the brain starts afresh in it.
    forget() {
      mind = Core.newMind();
      cooldown = 0;
      target = null;
    }
  };
}
