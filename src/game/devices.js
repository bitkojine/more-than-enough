/* Another device (Settings, in your own world): the QR that brings this
 * world to your other phone or computer, the same link to copy, and whether
 * the world is kept in the cloud now. The keeping itself is sync.js.
 * Loaded on demand with it (sync-lazy.js), so the game's words and the
 * duration format come in as `t` and `ago` rather than imported: a second
 * copy of i18n.js there would lack the words added at run time. */

import { qrCanvas } from './qr.js';

// Fills `box`. `url` is the link (sync.js linkUrl); `okAt` when the vault
// last answered (0: not yet), `failed` whether the last try didn't reach it.
export function renderDevices(box, { url, okAt, failed, now, t, ago }) {
  const intro = document.createElement('p');
  intro.className = 'empty';
  intro.textContent = t('devices.intro');
  const qr = qrCanvas(url);
  qr.className = 'deviceQr';
  qr.setAttribute('role', 'img');
  qr.setAttribute('aria-label', t('devices.qr'));
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'deviceCopy';
  copy.textContent = t('devices.copy');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); copy.textContent = t('devices.copied'); } catch { copy.textContent = t('devices.copyFailed'); }
  });
  const state = document.createElement('p');
  state.className = 'deviceState' + (okAt ? ' ok' : '');
  state.setAttribute('role', 'status');
  state.textContent = okAt
    ? (now - okAt < 60_000 ? t('devices.keptNow') : t('devices.keptAgo', { time: ago((now - okAt) / 1000) }))
    : t(failed ? 'devices.offline' : 'devices.keeping');
  const warn = document.createElement('p');
  warn.className = 'empty';
  warn.textContent = t('devices.secret');
  box.replaceChildren(intro, qr, copy, state, warn);
}
