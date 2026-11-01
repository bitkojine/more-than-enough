/* What the player sees and hears when the game does what they asked: words
 * and "+n" over the wanderer, the wanderer acting it out, the sound, the HUD
 * kept up to date and a save scheduled, and milestones celebrated. Visual
 * and audible only: the rules are the core's, called by controller.js.
 *
 * `facing()` is where the wanderer faces, `faceTile(x, y)` turns it. */

import * as Core from '../core/index.js';
import { t } from '../i18n/i18n.js';

export function createFeedback({ game, fx, audio, hud, look, actor, facing, faceTile }) {
  const state = () => game.state;
  const player = () => game.state.player;
  const say = (text, color, icon) => fx.text(player().x, player().y - 0.4, text, color, icon);
  // "+n" of a resource over your head, adding up with the gains just before it.
  const tally = (res, amount) =>
    fx.tally(
      player().x,
      player().y - 0.4,
      amount,
      look.color(Core.resourceLook(res)),
      Core.resourceLook(res)
    );
  const toolLevel = (res) => state().tools[res === 'mycelium' ? 'basket' : 'pickaxe'];

  function performAct(kind, detail = {}) {
    actor.act(kind, { ...detail, facing: { ...facing() } });
  }

  function changed() {
    hud.update(state());
    game.saveSoon();
  }

  // Milestones are celebrated when reached: a burst, a fanfare and a banner
  // naming each one. The Awards sheet shows the next one.
  function checkGoals() {
    const from = state().goalIndex;
    const reached = Core.advanceGoals(state());
    if (!reached.length) return;
    const next = Core.nextGoal(state());
    reached.forEach((g, i) =>
      hud.milestone(
        g.reached,
        from + i + 1,
        Core.goalsTotal(state()),
        i === reached.length - 1 && next ? next.text : null
      )
    );
    fx.celebrate(player().x, player().y);
    performAct('cheer');
    audio.fanfare();
  }

  // Every swing shakes what it hit and knocks chips off it. Plain dirt holds
  // nothing: its clods are tossed aside and it says +0, so digging through it
  // reads as clearing the way, not as gathering that failed.
  function harvested(r) {
    faceTile(r.x, r.y);
    performAct(r.res === 'mycelium' || state().tools.pickaxe === 0 ? 'pick' : 'swing');
    fx.hit(Core.packKey(r.x, r.y, r.z), r.x, r.y, look.color(Core.tileLook(r.type)));
    if (r.found) {
      fx.found(r.x, r.y, look.color(Core.tileLook(r.type)), r.found);
      audio.collect();
      return;
    }
    if (r.newKind) {
      // A kind of mushroom never found before, in any world.
      fx.text(
        r.x + 0.5,
        r.y - 1,
        t('fx.newMushroom', { name: Core.MUSHROOMS[r.mushroom].name }),
        '#c9a6ff',
        null,
        -0.5,
        2.6
      );
      audio.collect();
    }
    if (r.res) {
      fx.gathered(r.x, r.y, r.res, r.amount);
      audio.gather(r.res, r.amount, toolLevel(r.res));
      return;
    }
    fx.dug(r.x, r.y);
    if (r.type === Core.T.SOIL) fx.tossed(r.x, r.y, look.color(Core.tileLook(r.type)));
    audio.dig();
  }

  // Says which tool level something takes, when that's all that's missing.
  function needsGear(g) {
    hud.toast(t('reason.gear', { tool: Core.TOOLS[g.tool].name, lv: g.level }));
  }

  // Gather in the pitch dark: says why nothing happens, at most every few
  // seconds while held (Watch, 2026-11-01: a flat lantern underground).
  let darkSaidAt = -Infinity;
  function tooDark() {
    const now = performance.now();
    if (now - darkSaidAt < 4000) return;
    darkSaidAt = now;
    hud.toast(t('reason.dark'));
  }

  return { say, tally, performAct, changed, checkGoals, harvested, needsGear, tooDark };
}
