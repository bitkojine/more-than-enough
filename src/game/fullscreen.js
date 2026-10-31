/* Whole-client fullscreen. Capability and actual browser state are the truth;
 * unsupported/installed views explain their platform controls instead. */
import { t } from '../i18n/i18n.js';

export function createFullscreen({
  button,
  state,
  hint,
  doc = document,
  win = window,
  changed = () => {},
  report = () => {}
}) {
  const root = doc.documentElement;
  const displays = ['fullscreen', 'standalone'].map((mode) =>
    win.matchMedia?.('(display-mode: ' + mode + ')')
  );
  let pending = false,
    help = false,
    error = null;
  const active = () => doc.fullscreenElement || doc.webkitFullscreenElement;
  function api() {
    if (root.requestFullscreen && doc.exitFullscreen)
      return {
        enter: root.requestFullscreen,
        exit: doc.exitFullscreen,
        enabled: doc.fullscreenEnabled !== false
      };
    if (root.webkitRequestFullscreen && doc.webkitExitFullscreen)
      return {
        enter: root.webkitRequestFullscreen,
        exit: doc.webkitExitFullscreen,
        enabled: doc.webkitFullscreenEnabled !== false,
        prefixed: true
      };
    return null;
  }
  function mode() {
    if (active()) return 'native';
    if (displays[0]?.matches) return 'system';
    if (api()?.enabled) return 'windowed';
    if (displays[1]?.matches || win.navigator?.standalone) return 'app';
    return 'unsupported';
  }
  function render() {
    const current = mode(),
      toggle = current === 'native' || current === 'windowed';
    button.disabled = pending;
    button.setAttribute('aria-busy', String(pending));
    if (toggle) {
      button.setAttribute('aria-pressed', String(current === 'native'));
      button.removeAttribute('aria-expanded');
    } else {
      button.removeAttribute('aria-pressed');
      button.setAttribute('aria-expanded', String(help));
    }
    state.textContent = t(
      pending
        ? 'fullscreen.changing'
        : toggle
          ? current === 'native'
            ? 'settings.on'
            : 'settings.off'
          : 'fullscreen.' + current
    );
    // i18n-ok: suffix of localized translation keys.
    const helpKey = 'fullscreen.' + current + 'Help';
    const key = error ? 'fullscreen.failed' : help && !toggle ? helpKey : null;
    hint.hidden = !key;
    hint.textContent = key ? t(key) : '';
  }
  function sync() {
    error = null;
    help = false;
    render();
    changed();
  }
  function failed(reason) {
    error = reason;
    pending = false;
    render();
    report(reason);
  }
  async function toggle() {
    if (pending) return;
    const current = mode(),
      methods = api();
    if (current !== 'native' && current !== 'windowed') {
      help = !help;
      render();
      return;
    }
    pending = true;
    error = null;
    help = false;
    render();
    try {
      // Invoke before the first await: browsers require the original gesture.
      if (current === 'native') await methods.exit.call(doc);
      else if (methods.prefixed) await methods.enter.call(root);
      else await methods.enter.call(root, { navigationUI: 'hide' });
    } catch (reason) {
      failed(reason);
    } finally {
      pending = false;
      render();
    }
  }
  button.addEventListener('click', toggle);
  for (const event of ['fullscreenchange', 'webkitfullscreenchange'])
    doc.addEventListener(event, sync);
  for (const event of ['fullscreenerror', 'webkitfullscreenerror'])
    doc.addEventListener(event, () => {
      failed(new Error('Browser fullscreen request failed')); // i18n-ok: developer diagnostic; players see fullscreen.failed.
    });
  for (const display of displays) {
    if (display?.addEventListener) display.addEventListener('change', sync);
    else display?.addListener?.(sync);
  }
  win.addEventListener('pageshow', sync);
  render();
  return {
    toggle,
    sync,
    get mode() {
      return mode();
    },
    get error() {
      return error;
    }
  };
}
