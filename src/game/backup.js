/* A backup of your own world, as a file on your device (Settings: Save
 * backup, Load backup). Every world is kept (src/core/format.js): loading a
 * backup first saves the world you're in to a file too, so neither is lost.
 *
 * Only your own world: a shared world's progress is the room's to keep
 * (server/src/shadow.js), and putting an old copy back would be cheating.
 * The moderator backs up shared worlds (server/src/backup.js). */

import { serialize, deserialize } from '../core/index.js';
import { t } from '../i18n/i18n.js';

export const SOLO_KIND = 'mte-solo-world';

// The file's text for world `state`, saved at `now` by game `version`.
export function backupText(state, now, version) {
  return JSON.stringify({ kind: SOLO_KIND, at: now, version, save: serialize(state) });
}

// The world a file holds, or null if this game can't read it. A save as
// the game keeps it in the browser is read too.
export function fromBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (d && d.kind === SOLO_KIND && typeof d.save === 'string') return deserialize(d.save);
  return d && typeof d === 'object' && 'seed' in d ? deserialize(text) : null;
}

export function backupName(now) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, '0');
  return 'more-than-enough-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
}

// Wires the Settings rows. `game` is main.js's, `ask` the game's own
// question (ask.js).
export function createBackup({ el, game, ask, toast, version }) {
  function download(state) {
    const now = Date.now();
    const url = URL.createObjectURL(new Blob([backupText(state, now, version)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = backupName(now);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  el.backupSave.addEventListener('click', () => {
    if (game.state.shared) return;
    game.saveNow();
    download(game.state);
    toast(t('backup.saved'));
  });
  el.backupLoad.addEventListener('click', () => el.backupFile.click());
  el.backupFile.addEventListener('change', async () => {
    const file = el.backupFile.files[0];
    el.backupFile.value = '';
    if (!file || game.state.shared) return;
    const next = fromBackup(await file.text().catch(() => ''));
    if (!next) return toast(t('backup.unreadable'));
    const yes = await ask({ title: t('backup.ask.title'), text: t('backup.ask.text'), yes: t('backup.ask.yes') });
    if (!yes || game.state.shared) return;
    download(game.state); // the world you're in, kept as a file first
    game.replace(next);
    toast(t('backup.loaded'));
  });

  return {
    // Shown in your own world only.
    changedMode() {
      el.backupSave.hidden = el.backupLoad.hidden = !!game.state.shared;
    }
  };
}
