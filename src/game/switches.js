/* The switches in Settings and Nerds: how a drag moves you, sound, music,
 * time away, AUTO, how much Wiki says, and the language. Each shows its
 * state on its row and keeps the choice in this browser's view settings
 * (storage.js saveView, through main.js keepView). */

import { WIKI_MODES } from './wiki-memory.js';
import { t, setLanguage, nextLanguage } from '../i18n/i18n.js';

export function createSwitches({
  el,
  game,
  input,
  audio,
  wiki,
  hud,
  together,
  savedView,
  keepView
}) {
  // Which way a drag moves you: toward the finger (a joystick), or away from it,
  // pulling the map along like scrolling.
  function setDrag(invert) {
    input.invert = invert;
    el.dragMode.textContent = t(invert ? 'sheet.drag.pull' : 'sheet.drag.walk');
    el.drag.setAttribute('aria-pressed', String(invert));
  }
  el.drag.addEventListener('click', () => {
    setDrag(!input.invert);
    keepView();
  });
  const showMute = () => {
    el.muteState.textContent = t(audio.muted ? 'settings.off' : 'settings.on');
    el.mute.setAttribute('aria-pressed', String(!audio.muted));
  };
  el.mute.addEventListener('click', () => {
    audio.muted = !audio.muted;
    showMute();
  });
  showMute();
  // Music: off, or the name of the track playing.
  const showMusic = () => {
    const track = audio.track();
    el.musicState.textContent = !audio.music
      ? t('settings.off')
      : track
        ? t('music.' + track)
        : t('settings.on');
    el.music.setAttribute('aria-pressed', String(audio.music));
  };
  el.music.addEventListener('click', () => {
    audio.music = !audio.music;
    keepView();
    showMusic();
  });
  // Freeze season: whether time away makes anything. Off by default; a player
  // can turn it back on. Solo reads it on the next catch-up (catchUp), a shared
  // world is told at once (together.setAwayProduce).
  const showAway = () => {
    el.awayState.textContent = t(savedView.awayProduce ? 'settings.on' : 'settings.off');
    el.away.setAttribute('aria-pressed', String(savedView.awayProduce));
  };
  el.away.addEventListener('click', () => {
    savedView.awayProduce = !savedView.awayProduce;
    keepView();
    together.setAwayProduce(savedView.awayProduce);
    showAway();
  });
  // AUTO is hidden unless a player turns it on in Nerds (Watch, 2026-10-25),
  // and never in a crystal world, whose rules its planner doesn't know.
  function autoShown() {
    return savedView.showAuto && !game.state.cultivation;
  }
  function showAuto() {
    el.perfect.hidden = !autoShown();
    el.autoTip.hidden = !autoShown();
    el.autoLab.hidden = !!game.state.cultivation;
    el.autoState.textContent = game.state.cultivation
      ? t('nerds.auto.oldOnly')
      : t(savedView.showAuto ? 'settings.on' : 'settings.off');
    el.showAuto.setAttribute('aria-pressed', String(savedView.showAuto));
  }
  el.showAuto.addEventListener('click', () => {
    savedView.showAuto = !savedView.showAuto;
    keepView();
    showAuto();
  });
  // How much Wiki says on its own: chatty, only when asked, or not at all.
  const showWiki = () => {
    el.wikiState.textContent = t('settings.wiki.' + wiki.mode);
  };
  el.wikiMode.addEventListener('click', () => {
    wiki.setMode(WIKI_MODES[(WIKI_MODES.indexOf(wiki.mode) + 1) % WIKI_MODES.length]);
    showWiki();
  });
  showWiki();
  // The first time you hear a place's music, it tells you its name (except
  // the very first tune, which plays over a world that says nothing yet).
  audio.onTrack((id) => {
    showMusic();
    if (savedView.heard.includes(id)) return;
    savedView.heard.push(id);
    keepView();
    if (savedView.heard.length > 1) hud.toast(t('toast.newTrack', { name: t('music.' + id) }));
  });
  // The language button: the next language, the game saved first so the
  // reload comes back to the same spot.
  el.language.addEventListener('click', () => {
    game.saveNow();
    setLanguage(nextLanguage());
  });

  return { setDrag, showMusic, showAway, showAuto, autoShown };
}
