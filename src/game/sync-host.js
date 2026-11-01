/* Your own world on every device you link (sync.js), as the page hosts it:
 * never in an admin's copy, a shared world, or while a question about which
 * world to keep is up. The sync code is loaded the first time it's needed
 * (sync-lazy.js): this device is linked, opens a link, or shows the Another
 * device screen.
 *
 * `deps` are the game's: {game, el, ask, toast, fork, input, copy, store,
 * load (the lazy import), service, location, history}. */

import * as Core from '../core/index.js';
import { soloSeeds, archivedSave, keepCopy, keepAside } from './storage.js';
import { character, becomeCharacter } from './identity.js';
import { fmtDuration, lockIcon } from './format.js';
import { t, addStrings } from '../i18n/i18n.js';

export const SYNC_STORE = 'mte.sync'; // sync.js keeps its key there
export const LINK_HASH = /(^#|&)link=[0-9a-f]{64}(&|$)/;
const SOON_MS = 300; // focus and coming back to the front come together: one check for both

// What sync.js says happened, in the player's words.
export const syncNote = (what) =>
  t(what === 'arrived' ? 'sync.arrived' : what === 'me' ? 'sync.me' : 'sync.full');

export function createSyncHost({
  game,
  el,
  ask,
  toast,
  fork,
  input,
  copy,
  store,
  service,
  load = () => import('./sync-lazy.js'),
  page = globalThis.location,
  history = globalThis.history
}) {
  let sync = null;
  let module = null;
  let timer = null;

  function loadSync() {
    return (module ||= load().then((m) => {
      addStrings(m.strings);
      sync = m.createSync({
        store,
        fetch: (url, init) => fetch(url, init),
        service,
        own: () => (copy || game.state.shared || fork.open ? null : game.state),
        serialize: Core.serialize,
        deserialize: Core.deserialize,
        seeds: soloSeeds,
        archived: archivedSave,
        copy: keepCopy,
        aside: keepAside,
        replace: (s) => game.replace(s, 'cloud'),
        conflict: ({ mine, other, keepMine, keepOther }) => {
          input.release();
          input.releasePerfect();
          fork.show(mine, other, { keepMine, keepOther, reload: () => page.reload() }, 'device');
        },
        said: (what) => toast(syncNote(what)),
        me: character,
        becomeMe: becomeCharacter,
        askMe: () =>
          ask({ title: t('sync.me.title'), text: t('sync.me.text'), yes: t('sync.me.yes') })
      });
      return m;
    }));
  }

  function soon() {
    if (!sync) return;
    clearTimeout(timer);
    timer = setTimeout(() => sync.check(), SOON_MS);
  }

  // A device linked before: in step from the start.
  function linked() {
    try {
      return !!store?.getItem(SYNC_STORE);
    } catch {
      return false; // blocked: not linked
    }
  }

  return {
    // The sync, once loaded (null before): played, saved, touched, flush.
    get sync() {
      return sync;
    },
    soon,
    // Starts syncing at once if this device was linked before.
    start() {
      if (!copy && linked()) loadSync().then(soon);
    },

    // The Another device screen: the QR, and whether the world is kept yet.
    async showDevices() {
      const m = await loadSync();
      const key = sync.start();
      const draw = () =>
        m.renderDevices(el.devicesPanel, {
          url: m.linkUrl(page, key),
          okAt: sync.okAt,
          failed: sync.failed,
          now: Date.now(),
          t,
          ago: fmtDuration,
          lockIcon
        });
      draw();
      sync.check().then(() => {
        if (!el.devicesPanel.hidden) draw();
      });
    },

    // Opened from the link on your other device (#link=<key>): play that world here.
    async linkFromHash() {
      if (!LINK_HASH.test(page.hash)) return;
      const m = await loadSync();
      const key = m.linkFrom(page.hash);
      history.replaceState(null, '', page.pathname + page.search);
      if (copy || !key) return;
      const yes = await ask({
        title: t('sync.link.title'),
        text: t('sync.link.text'),
        yes: t('sync.link.yes')
      });
      if (!yes) return;
      toast(t((await sync.link(key)) ? 'sync.linked' : 'sync.already'));
    }
  };
}
