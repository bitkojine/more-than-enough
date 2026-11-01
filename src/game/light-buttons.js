/* The two buttons for the light you carry (Watch, 2026-10-25 and -26):
 * the lantern you crafted, above Gather once it's made, switches on and off;
 * the ore flare makes a flare from metal and lights it, or puts out the one
 * burning. The flare shows underground and while one burns, never in a
 * shared world, whose room doesn't check flares yet. The rules are the
 * core's (Core.useFlare, Core.activeCarriedLight); this keeps the buttons in
 * step with them and says what happened.
 *
 * `el` holds the buttons; `cultivate(cmd)` runs a crystal-world command;
 * `saveSoon()` and `toast(text)` are the game's. */

import * as Core from '../core/index.js';
import { lockIcon } from './format.js';
import { t } from '../i18n/i18n.js';

// A burning flare's time left, as a clock: "1:05".
export function flareClock(secondsLeft) {
  const left = Math.ceil(secondsLeft);
  return Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'); // i18n-ok: a clock
}

// What the flare button says: its lock, the time left while one burns, or
// its name. `aria` is the longer label for screen readers.
export function flareLabel(s) {
  const locked = Core.contentLocked(s, 'flare'),
    on = Core.flareLit(s),
    time = flareClock(s.flare);
  if (locked)
    return {
      locked,
      on,
      html: lockIcon + ' ' + t('button.flare'),
      aria: t('progression.requirement')
    };
  if (on) return { locked, on, html: time, aria: t('button.flare.lit.aria', { time }) };
  return { locked, on, html: t('button.flare'), aria: t('button.flare.aria') };
}

// What the player is told after pressing the flare button, if anything.
export function flareNote(result, s) {
  if (result === 'locked') return t('progression.requirement');
  if (result === 'materials') return t('toast.flare.materials');
  if (result === 'lit' && s.stats.flares === 1) return t('toast.flare.first');
  return null;
}

export function createLightButtons({ el, state, cultivate, saveSoon, toast }) {
  let flareWas = 0; // the flare time the button last showed
  let flareWorld = null; // the world it showed it for

  function showLantern(s) {
    const c = s.cultivation,
      on = Core.activeCarriedLight(s) === 'lantern';
    el.lantern.hidden = !c?.gear.lantern;
    if (el.lantern.hidden) return;
    el.lantern.classList.toggle('on', on);
    el.lantern.setAttribute('aria-pressed', String(on));
    el.lanternLabel.textContent = t(on ? 'button.lantern.on' : 'button.lantern.off');
  }

  function showFlare(s) {
    // It burnt out on its own (not put out, and in this same world).
    if (flareWas > 0 && !(s.flare > 0) && flareWorld === s) toast(t('toast.flare.burntOut'));
    flareWas = s.flare;
    flareWorld = s;
    const label = flareLabel(s);
    el.flare.disabled = label.locked;
    el.flare.hidden = !!s.shared;
    if (el.flare.hidden) return;
    el.flare.classList.toggle('on', label.on);
    el.flare.setAttribute('aria-pressed', String(label.on));
    el.flare.style.setProperty('--left', label.on ? (s.flare / Core.FLARE_TIME).toFixed(3) : '1');
    el.flare.classList.toggle('progressionLocked', label.locked);
    const shown = (label.locked ? 'locked:' : '') + label.html;
    if (el.flareLabel.dataset.state === shown) return;
    el.flareLabel.dataset.state = shown;
    el.flareLabel.innerHTML = label.html; // the game's own words and icon, never a player's
    el.flare.setAttribute('aria-label', label.aria);
  }

  function show(s) {
    showLantern(s);
    showFlare(s);
  }

  function toggleLantern() {
    const s = state();
    if (!s.cultivation?.gear.lantern) return;
    cultivate({ type: 'lantern' });
    flareWas = state().flare; // switching lights puts out a flare: not burnt out
    show(state());
  }

  function useFlare() {
    const s = state(),
      result = Core.useFlare(s);
    const note = flareNote(result, s);
    if (note) toast(note);
    flareWas = s.flare;
    if (result === 'lit' || result === 'out') saveSoon();
    show(s);
  }

  el.lantern.addEventListener('click', toggleLantern);
  el.flare.addEventListener('click', useFlare);
  return { show, toggleLantern, useFlare };
}
