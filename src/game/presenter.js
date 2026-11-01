/* Presentation: what each drawn frame does after the simulation, and what
 * the renderer is given besides the state. It observes the state; its
 * cadence never changes movement, production, AUTO cooldowns or milestone
 * progression (the simulation's fixed tick does those).
 *
 * `p` holds the game's parts (see main.js); `moving()` and `autoPlaying()`
 * are the simulation's last word on the wanderer. */

import * as Core from '../core/index.js';
import { t } from '../i18n/i18n.js';

export const SAVE_EVERY = 3; // seconds between autosaves
export const WAKE_CHANCE = 0.35; // boat ripples per moving frame
export const SLOW_EVERY = 0.25; // seconds between the HUD's slower updates

// Work on its own cadence rather than every frame: each `{every, run}` runs
// once per `every` seconds of frames, catching up a step at a time.
export function createCadence(jobs) {
  const list = jobs.map((j) => ({ ...j, left: j.every }));
  return function advance(dt) {
    for (const j of list) {
      if ((j.left -= dt) <= 0) {
        j.left += j.every;
        j.run();
      }
    }
  };
}

// The direction of a boat's wake, from where the wanderer faces.
export function wakeOf(facing) {
  const len = Math.hypot(facing.x, facing.y) || 1;
  return { x: facing.x / len, y: facing.y / len };
}

// Where box `r` sits on canvas `c` (both client rectangles), or null while
// it isn't laid out: friends' edge badges move out from under the zoom pill.
export const clearOf = (r, c) =>
  r.width ? { left: r.left - c.left, top: r.top - c.top, bottom: r.bottom - c.top } : null;

export function createPresenter(p) {
  const { game, el, hud, fx, input, perfect, controller, placing, card, together } = p;
  const random = p.random || Math.random;
  let copyText = '';

  const cadence = createCadence([
    { every: SAVE_EVERY, run: () => game.saveNow() },
    {
      every: SLOW_EVERY,
      run: () => {
        const s = game.state;
        hud.update(s);
        p.income.note(s, Date.now());
        p.regions.tick(s, SLOW_EVERY);
        p.audio.scene(p.regions.scene(s));
        p.messages.tick();
        if (!p.copy) p.homeHint.check(s.goalIndex, performance.now());
      }
    }
  ]);

  // An admin's copy says so, with whose character it is, all the time.
  function showCopy() {
    const me = together.me;
    const text = me ? t('copy.badge', { name: me.name }) : t('copy.badgeWait');
    if (text === copyText) return;
    copyText = text;
    el.copyBadge.textContent = text;
    el.copyBadge.hidden = false;
  }

  function update(dt) {
    const s = game.state;
    Core.settleEconomy(s);
    if (p.copy) showCopy();
    if (p.moving() && Core.onWater(s) && random() < WAKE_CHANCE) {
      const w = wakeOf(controller.facing);
      fx.wake(s.player.x, s.player.y, w.x, w.y);
    }
    fx.update(dt);
    if (game.saveDue) game.saveNow();
    cadence(dt);
    hud.tick(dt);
    hud.updateButtons(s);
    hud.perfect(perfect.badge, input.perfect);
    p.sheet.tick();
    p.back.tick();
    card.tick();
    if (placing.open && p.blocked()) placing.cancel(); // a sheet or a question came up
    placing.tick(dt);
    p.lights.show(s);
    p.hudLayout.tick();
  }

  function view() {
    const s = game.state;
    const moving = p.moving();
    const trail = input.trail;
    return {
      facing: controller.facing,
      moving,
      actor: p.actor.view(moving, s.player),
      yard: p.yard,
      harvestTarget: input.perfect ? perfect.target : Core.harvestTarget(s),
      auto: p.autoPlaying() && perfect.badge !== 'ui.embark' ? t('button.perfect') : '',
      placing: placing.view(),
      focus: placing.focus() || card.focus(), // the building whose reach shows
      trail,
      trailTargets: trail && trail.leftButton ? Core.sweepTargets(s, trail.points) : [],
      underground: Core.isUnderground(s),
      joy: input.joy,
      friends: together.view(),
      graves: together.graves(),
      // The zoom pill, which friends' edge badges move out from under.
      keepClear: clearOf(
        el.zoomControls.getBoundingClientRect(),
        el.canvas.getBoundingClientRect()
      ),
      me: together.me, // your name and colour in a shared world
      sign: together.sign,
      signFace: together.signFace,
      signCaption: t('together.sign'),
      wiki: p.wiki.pose(),
      map: p.mapView.look() // zoomed out to the world map: where it looks, if not at you
    };
  }

  return { update, view };
}
