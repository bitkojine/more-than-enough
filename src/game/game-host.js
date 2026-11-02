/* The one place the current state lives: `game.state`. Everything else reads
 * it from here, and a different world comes in only through `replace`
 * (embark, a shared world, your own again, your other device's).
 *
 * It saves your own world on this device (storage.js), a shared one to its
 * room (together.js), says the moment saving starts failing, and never
 * writes over a newer save from another tab (`forked`).
 *
 * `store` is storage.js's {saveGame, soloWorld, soloCount, keepStorage}.
 * The other parts of the game are made after this, so they come in later:
 * `game.attach({...})` (see main.js). Tests attach stand-ins. */

import * as Core from '../core/index.js';
import { awayNote } from './tips.js';
import { t } from '../i18n/i18n.js';

export function createGame({ state, store, copy = null }) {
  let saveDue = false;
  let saveError = null;
  let p = null; // the game's parts, once attached

  const game = {
    state,
    attach(parts) {
      p = parts;
    },
    // Whether something changed that should be saved at the next frame.
    get saveDue() {
      return saveDue;
    },
    saveSoon() {
      saveDue = true;
      p.sync()?.played();
      store.keepStorage();
    },
    saveNow(force = false) {
      saveDue = false;
      // A shared world is saved to its room (and a copy here), never over your own.
      if (game.state.shared) return p.together.save(game.state);
      if (p.fork.open) return; // the player hasn't picked a world yet
      game.state.seen = Date.now(); // for what your buildings make while you're away (catchUp)
      const r = store.saveGame(game.state, force);
      if (r && r.conflict) return p.forked(r.conflict);
      p.sync()?.saved();
      const err = r && r.error;
      // Say so the moment saving starts failing (and again if it recovers and
      // fails later), so progress is never lost silently.
      if (err && !saveError) {
        console.error('Saving failed:', err);
        p.hud.toast(t('toast.saveFailed', { error: err.name || err }));
      }
      saveError = err;
    },
    // Saves, and says whether the world is safely kept (saved, with its own
    // copy), so it may be left for another one.
    keep() {
      game.saveNow();
      return !saveError && !p.fork.open;
    },
    // Back into one of your own worlds (Settings → Worlds): out of a shared
    // world first, and the world you leave is kept first, or you stay.
    playSolo(seed) {
      if (game.state.shared) p.together.switchTo(null);
      if (game.state.shared || game.state.seed === seed || !game.keep()) return;
      const next = store.soloWorld(seed);
      if (next) game.replace(next);
    },
    // Plays an older copy of one of your worlds (Settings → Worlds): `take`
    // (storage.js takeKept) makes it its world's own copy, keeping the one
    // it takes over from, and only once the world you leave is kept.
    playKept(take) {
      if (game.state.shared) p.together.switchTo(null);
      if (game.state.shared || !game.keep()) return;
      const next = take();
      if (next) game.replace(next);
    },
    // Swaps in a different world (embark, a shared world). `why`: 'cloud'
    // (your other device's, sync.js) or 'back' (your own again, after a
    // shared one); otherwise the player picked it, so it counts as played.
    replace(next, why = null) {
      p.problems.crumb('world replaced'); // i18n-ok: a report for developers, in English
      game.state = next;
      for (const part of p.forgetWorld) part();
      p.hud.newWorld();
      p.hud.update(next);
      game.saveNow();
      if (!why) p.sync()?.touched();
      game.changedMode();
    },
    // Time away from a solo world (closed, asleep, in another app): what your
    // buildings made meanwhile lands in your packs (Core.awayProduce), said
    // in a note. In a shared world the room works it out and says so
    // (together.js 'away'). Freeze season: away makes nothing unless the
    // player turned it back on in Settings (savedView.awayProduce).
    catchUp(seconds) {
      const made = Core.awayProduce(game.state, seconds, p.savedView.awayProduce);
      if (made) game.sayAway(seconds, made);
    },
    // `fixed`: arriving in a shared world also set your numbers straight
    // (together.js), so the note says that too.
    sayAway(seconds, made, fixed = false) {
      const note = awayNote(seconds, made, fixed);
      if (note) p.hud.toast(note);
      p.hud.update(game.state);
      game.saveSoon();
    },
    // Just arrived in a world new to you (a friend's): what to go for.
    arrived() {
      p.showNext();
    },
    // For playing together (together.js).
    facing: () => p.controller.facing,
    moving: () => p.moving(),
    act: () => p.actor.sent,
    // Friends changed the world: what's shown around you may differ now.
    worldChanged() {
      p.hud.update(game.state);
    },
    // The room says you stand somewhere else (you came back from another
    // device, or after playing offline): you're moved there.
    moveTo(to) {
      const s = game.state;
      Object.assign(s.player, { x: to.x, y: to.y, z: to.z });
      s.underground.deepest = Math.min(s.underground.deepest, to.z);
      p.controller.forget();
      p.simulation()?.invalidate();
      p.hud.update(s);
    },
    // Alone or together: the settings that differ.
    changedMode() {
      const shared = !!game.state.shared;
      const { el, together } = p;
      p.showAuto();
      el.invitesBtn.hidden = !shared;
      el.playersBtn.hidden = !shared;
      el.worldsBtn.hidden = !shared && !together.available && store.soloCount() < 2;
      el.worldNow.textContent = together.worldName;
      el.devicesBtn.hidden = shared || !!copy;
      if (!shared) p.syncSoon();
      p.backup.changedMode();
      together.refresh();
    }
  };
  return game;
}
