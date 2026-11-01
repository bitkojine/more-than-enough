/* The few things the game tells a player once, as they need them:
 *   - holding Gather keeps going, said after a few single taps (once ever);
 *   - AUTO plays while held, in a bubble over it after a quick tap;
 *   - early on, what the next milestone is, on opening or arriving;
 *   - a crystal world in danger (a cracking heart, poor crystal, a hot
 *     chamber), at most every few seconds.
 * The words and the moments are here; `hud` shows them. */

import * as Core from '../core/index.js';
import { fmt, fmtDuration } from './format.js';
import { t } from '../i18n/i18n.js';

export const HOLD_TIP_AFTER = 8; // single gathers before the tip
export const AUTO_TAP_S = 0.5; // AUTO released sooner than this: a tap
export const AUTO_TIP_SECONDS = 4;
export const NEXT_SHOWN_BELOW = 3; // milestones reached, after which players know where to look
export const DANGER_EVERY = 5; // seconds between warnings that a crystal world is in danger
const WEAK = 35; // health or quality below this is danger
const HOT = 22; // °C: a chamber warmer than this cracks its crystal

// Whether a crystal world needs the player now.
export function crystalDanger(s) {
  const c = s.cultivation;
  if (!c) return false;
  return (
    c.starter?.health < WEAK ||
    (s.inv.crystal > 0 && c.quality < WEAK) ||
    c.facilities.some((b) => b.health > 0 && b.temperature > HOT)
  );
}

// `view` is this browser's saved choices (holdTip is kept there), `keep()`
// saves them; `now()` is milliseconds.
export function createTips({ hud, view, keep, now = () => performance.now() }) {
  let singles = 0,
    autoDownAt = 0,
    dangerIn = 0;
  return {
    // Gathered once (`held` false) or by holding.
    gathered(held) {
      if (view.holdTip) return;
      if (!held && ++singles < HOLD_TIP_AFTER) return;
      view.holdTip = true; // found it, or told now: never again
      keep();
      if (!held) hud.toast(t('tip.hold'));
    },
    autoDown() {
      autoDownAt = now();
      hud.autoTip(0);
    },
    autoUp() {
      if ((now() - autoDownAt) / 1000 < AUTO_TAP_S) hud.autoTip(AUTO_TIP_SECONDS);
    },
    // The next milestone, for a player still finding their way.
    next(s) {
      const goal = Core.nextGoal(s);
      if (goal && s.goalIndex < NEXT_SHOWN_BELOW) hud.nextUp(goal.text);
    },
    // Each tick of play; says whether it warned.
    danger(s, dt) {
      dangerIn -= dt;
      if (!s.cultivation || dangerIn > 0) return false;
      dangerIn = DANGER_EVERY;
      if (!crystalDanger(s)) return false;
      hud.toast(t('cr.danger'));
      return true;
    }
  };
}

// What your buildings made while you were away, as a note, or null when it
// was nothing worth saying. `fixed`: arriving in a shared world also set your
// numbers straight (together.js), so the note says that too.
export function awayNote(seconds, made, fixed = false) {
  const parts = Core.RESOURCES.filter((r) => made[r] >= 1).map((r) =>
    t('cost.item', { n: fmt(made[r]), res: Core.RESOURCE_LABEL[r] })
  );
  if (!parts.length) return null;
  const away = t('toast.away', {
    time: fmtDuration(Math.min(seconds, Core.AWAY_CAP)),
    made: parts.join(', ')
  });
  return fixed ? away + '. ' + t('together.toast.fixed') : away;
}

// What a crystal-world command says when it didn't just work (a plain
// "Done." after every press would bury what matters): a discovery and its
// clue, the machine starting, or why not. Null when it just worked.
export function cultivationNote(result, clue) {
  if (result === 'ok') return null;
  if (result === 'discovery') return t('cr.discovery.' + clue);
  if (result === 'activated') return t('cr.activated');
  return t('cr.reason.' + result);
}
