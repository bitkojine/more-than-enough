/* Keep diagnostics out of normal startup; a failed tool load never stops play. */
import { t } from '../i18n/i18n.js';
const PREF = 'mte.performance.enabled'; // i18n-ok: device preference key.
export function createPerf(el, canvas, audio, quality) {
  let active = null,
    loading = null,
    visible = false,
    samples = [],
    last = {},
    attempt = 0;
  const host = {
    get visible() {
      return visible;
    },
    enabled() {
      try {
        return localStorage.getItem(PREF) === 'true';
      } catch {
        return false;
      }
    },
    toggle(show = !visible) {
      visible = show;
      el.perf.hidden = !show;
      el.perfState.textContent = t(show ? 'settings.on' : 'settings.off');
      el.perfBtn.setAttribute('aria-pressed', String(show));
      try {
        localStorage.setItem(PREF, String(show));
      } catch {
        /* Optional preference. */
      }
      if (active) {
        active.toggle(show);
        return;
      }
      if (!show || loading) return;
      el.perf.textContent = t('perf.loading');
      const url = new URL('./perf.js', import.meta.url);
      url.search = new URL(import.meta.url).search;
      if (attempt++) url.searchParams.set('retry', String(attempt));
      loading = import(url.href)
        .then(({ createPerf }) => {
          active = createPerf(el, canvas, audio, quality);
          active.toggle(visible);
        })
        .catch((error) => {
          el.perf.textContent = t('perf.unavailable');
          // i18n-ok: diagnostic context, never a fatal game error.
          console.error('Performance diagnostics failed to load', url.href, error);
          globalThis.MTE_FAULT?.(error, 'performance/load ' + url.href);
        })
        .finally(() => {
          loading = null;
        });
    },
    frame(interval, logic, draw, tiles, meta) {
      last = { logicMs: logic, drawMs: draw, tiles };
      samples.push(interval);
      if (samples.length > 120) samples.shift();
      active?.frame(interval, logic, draw, tiles, meta);
    },
    snapshot() {
      return (
        active?.snapshot() || {
          fps: samples.length ? 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
          worstMs: Math.max(0, ...samples),
          ...last,
          quality: quality.level
        }
      );
    },
    suspend() {
      samples = [];
      active?.suspend();
    },
    details() {
      active?.details();
    },
    tick(dt) {
      active?.tick(dt);
    }
  };
  return host;
}
