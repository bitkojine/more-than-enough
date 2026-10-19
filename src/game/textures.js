/* Texture packs in the game: the default pack shipped with it, and the
 * player's own, picked from files (a pack.json, alone or with its pictures),
 * remembered between visits and dropped again with "Default textures".
 *
 * Fail loud: a pack with any problem is not used, and every problem is
 * listed on screen by thing and slot. A broken default pack is a crash. */

import { loadPack, inlinePack } from './look/look.js';
import { validatePack } from './look/validate.js';
import { loadSavedPack, savePack, forgetPack } from './look/store.js';
import { t } from '../i18n/i18n.js';

// The default pack, carrying this module's ?v= cache-busting hash.
function defaultPackUrl() {
  const url = new URL('../../packs/default/pack.json', import.meta.url);
  url.search = new URL(import.meta.url).search;
  return url.href;
}

// Loads the default pack; throws (naming every problem) if it is broken.
export async function loadDefaultPack() {
  const url = defaultPackUrl();
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('pack.defaultHttp', { url, status: res.status }));
  const { pack, problems } = await loadPack(await res.json(), { base: url, complete: true });
  if (!pack) throw new Error(t('pack.defaultBroken', { problems: problems.join('\n') }));
  return pack;
}

export function createTextures({ el, look, defaultPack, changed, toast }) {
  function label() {
    el.packName.textContent = look.name;
    el.texturesDefault.hidden = !look.custom;
  }

  function report(problems) {
    console.error('Texture pack not used:\n' + problems.join('\n'));
    const list = el.packReport.querySelector('ul');
    list.innerHTML = '';
    for (const p of problems) {
      const li = document.createElement('li');
      li.textContent = p;
      list.appendChild(li);
    }
    el.packReport.hidden = false;
  }

  function apply(pack) {
    look.use(defaultPack, pack);
    label();
    changed();
  }

  // Reads the picked files into a self-contained pack, or reports why not.
  async function fromFiles(files) {
    const jsons = files.filter((f) => /\.json$/i.test(f.name));
    if (jsons.length !== 1) return report([jsons.length ? t('pack.pickOne', { n: jsons.length, names: jsons.map((f) => f.name).join(', ') }) : t('pack.noJson')]);
    let json;
    try { json = JSON.parse(await jsons[0].text()); } catch (err) { return report([t('pack.badJson', { name: jsons[0].name, error: err.message })]); }
    // Check the pack itself before reading its pictures, so every problem in
    // it is listed, not just the first missing file.
    const invalid = validatePack(json);
    if (invalid.length) return report(invalid);
    try { json = await inlinePack(json, files); } catch (err) { return report([err.message]); }
    const { pack, problems } = await loadPack(json);
    if (!pack) return report(problems);
    apply(pack);
    const saved = await savePack(json);
    toast(saved.error ? t('toast.texturesUnkept', { name: pack.name, error: saved.error.name || saved.error }) : t('toast.textures', { name: pack.name }));
  }

  el.textures.addEventListener('click', () => el.packFile.click());
  el.packFile.addEventListener('change', () => {
    const files = [...el.packFile.files];
    el.packFile.value = '';
    if (files.length) fromFiles(files).catch((err) => report([err.stack || String(err)]));
  });
  // Forget first, then switch: the game shows the default pack only once a
  // reload would too.
  el.texturesDefault.addEventListener('click', async () => {
    const gone = await forgetPack();
    apply(null);
    toast(gone.error ? t('toast.texturesUnforgotten', { name: look.name, error: gone.error.name }) : t('toast.textures', { name: look.name }));
  });
  // Closes by its button, a tap outside the card or Escape, like every dialog.
  const closeReport = () => { el.packReport.hidden = true; };
  el.packReport.querySelector('button').addEventListener('click', closeReport);
  el.packReport.addEventListener('click', (e) => { if (e.target === el.packReport) closeReport(); });
  window.addEventListener('keydown', (e) => {
    if (el.packReport.hidden || e.key !== 'Escape') return;  // i18n-ok: a key name
    e.stopImmediatePropagation();
    closeReport();
  });

  return {
    // Puts back the pack remembered from last time, if any (`reading`: a
    // loadSavedPack() already under way).
    async restore(reading = loadSavedPack()) {
      label();
      const saved = await reading;
      if (saved.error) return toast(t('toast.texturesUnread', { error: saved.error.name || saved.error }));
      if (!saved.value) return;
      const { pack, problems } = await loadPack(saved.value);
      if (pack) apply(pack);
      else report(problems);
    },
    // For the browser tests: load picked files as if from the file picker.
    fromFiles
  };
}
