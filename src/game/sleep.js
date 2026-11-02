/* Asleep until a tap (Watch, 2026-11-02). Browsers keep a page silent until
 * the player does something on it, so the game starts asleep: grey, still,
 * Wiki dozing on Mica's hood, "Tap to wake" under Mica. One tap or key
 * anywhere wakes it, and that same press wakes the sound (audio.js listens
 * in the capture phase first), so the music-box hello plays as the colour
 * comes back. It falls asleep again whenever the tab is hidden.
 *
 * Asleep is time away (frame-loop.js): the world stops, nothing grows or
 * counts down, and in a shared world the room counts you away. Nothing
 * else on the page can be pressed: the wake screen covers it, and keys go
 * no further than waking.
 *
 * It is made before the game loads, so a tap or key while it loads wakes
 * it at once (the game then opens awake); `attach()` hands it the game once
 * that is running and shows the wake screen after the first frames.
 * `enabled` false (browser tests, which drive the game directly) never
 * sleeps. */

import { createAudio } from './audio.js';

const KEY_EVENTS = ['keydown', 'keyup', 'keypress'];

// The sound and the sleep, made before the pictures load: iOS Safari wakes
// sound only inside a tap, so a tap while the game loads would otherwise be
// lost and the sound wait for another. The sound is made first, so it hears
// each press before the sleep does. Sound off is kept per browser and holds
// from the start (the hello stays silent too). Browser tests never see the
// game asleep unless they ask (?sleep).
export function createWaking(el, savedView, win = window) {
  const audio = createAudio({ muted: !savedView.sound });
  audio.wakeOn(el.canvas);
  const sleep = createSleep({
    root: win.document.documentElement,
    wake: el.wake,
    enabled: !win.navigator.webdriver || new URLSearchParams(win.location.search).has('sleep')
  });
  return { audio, sleep };
}
// Pressed on the way to something else (a screenshot, switching apps).
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn', 'OS']); // i18n-ok: key names

export function createSleep({ root, wake, enabled = true, doc = document }) {
  let asleep = enabled;
  let shown = false; // the game is drawn, so the wake screen can show
  let micaAt = () => null; // where Mica stands on screen, in CSS pixels
  let onSleep = null,
    onWake = null;

  // The Zzz and the words go by Mica, wherever the camera has them.
  function place() {
    const at = micaAt();
    if (!at) return;
    wake.style.setProperty('--mica-x', at.x + 'px');
    wake.style.setProperty('--mica-y', at.y + 'px');
  }

  function show() {
    if (!shown) return;
    root.classList.add('asleep');
    wake.hidden = false;
    place();
  }

  function sleep() {
    if (asleep || !enabled) return;
    asleep = true;
    show();
    if (onSleep) onSleep();
  }

  function rise() {
    if (!asleep) return;
    asleep = false;
    root.classList.remove('asleep');
    wake.hidden = true;
    if (onWake) onWake();
  }

  // A click wakes (on a phone it's the end of a tap, which iOS Safari
  // counts as the gesture that may start sound). The press that starts it
  // goes no further, so it can't also walk or gather.
  wake.addEventListener('click', (e) => {
    e.preventDefault();
    rise();
  });
  for (const type of [
    'pointerdown',
    'pointerup',
    'touchstart',
    'touchend',
    'mousedown',
    'contextmenu'
  ])
    wake.addEventListener(type, (e) => e.stopPropagation(), { passive: type.startsWith('touch') });
  // Any key wakes too; asleep, keys do nothing else. Registered after the
  // sound's own listener, so that runs first and wakes the sound with it.
  for (const type of KEY_EVENTS) {
    window.addEventListener(
      type,
      (e) => {
        if (!asleep) return;
        e.stopImmediatePropagation();
        if (type === 'keydown' && !e.repeat && !MODIFIERS.has(e.key)) rise();
      },
      { capture: true }
    );
  }
  // While the game still loads there's no wake screen yet: a press anywhere
  // wakes it, so it opens awake (the press woke the sound already).
  for (const type of ['pointerup', 'touchend', 'click'])
    window.addEventListener(
      type,
      () => {
        if (!shown) rise();
      },
      { capture: true, passive: true }
    );
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) sleep();
  });
  window.addEventListener('resize', () => {
    if (asleep) place();
  });

  return {
    get asleep() {
      return asleep;
    },
    // The game is running. Asleep, nothing held carries over and Wiki
    // dozes; awake, the clock goes on from here and a shared world hears
    // you're back. The wake screen shows after the first frames, with Mica
    // where the camera put them.
    attach({ game, cam, input, wiki, loop, together, frame = requestAnimationFrame }) {
      micaAt = () => {
        const p = game.state.player;
        return cam.project(p.x, p.y, p.z);
      };
      onSleep = () => {
        input.release();
        input.releasePerfect();
        wiki.sleeping = true;
      };
      onWake = () => {
        wiki.sleeping = false;
        loop.resume();
        together.away(false);
      };
      wiki.sleeping = asleep;
      frame(() =>
        frame(() => {
          shown = true;
          if (asleep) show();
        })
      );
    },
    wake: rise,
    sleep
  };
}
