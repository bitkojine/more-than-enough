/* The page's side of src/game/faults.js: what the player did (taps, keys,
 * the screen turning) for a report's "before it", the toast that says a
 * problem was got past, and the Problems list under Nerds, where each report
 * can be copied to send to whoever fixes the game. */

import { createFaults } from './faults.js';
import { VERSION } from '../version.js';
import { stampOf } from './update.js';
import { t } from '../i18n/i18n.js';

const SHOWN = 1; // decimals of a position in a report

let store = null;
try { store = window.localStorage; } catch { store = null; }

// What a tap landed on, in a few words: a button's id or what it is for.
function label(target) {
  const el = target && target.closest ? target.closest('button, a, input, [id]') : null;
  if (!el) return 'page';
  if (el.id === 'game') return 'map';
  const what = el.id ? '#' + el.id : el.tagName.toLowerCase();
  const data = el.dataset ? Object.entries(el.dataset).filter(([k]) => !k.startsWith('i18n')).map(([k, v]) => `${k}=${v}`).join(' ') : '';
  return data ? `${what} [${data}]` : what;
}

/**
 * @param {object} o
 * @param {() => object} o.game what the game was doing, as label -> value (main.js)
 * @param {(text: string) => void} o.toast
 * @param {HTMLElement} o.list the Problems group under Nerds
 */
export function createProblems({ game, toast, list }) {
  const started = Date.now();
  const build = stampOf(import.meta.url) || 'source';
  const faults = createFaults({
    store,
    context: () => ({
      version: `${VERSION} (build ${build})`,
      browser: navigator.userAgent,
      language: navigator.language,
      screen: `${window.innerWidth}x${window.innerHeight} CSS px at ${window.devicePixelRatio || 1}x` + // i18n-ok: a report for developers, in English
        (screen.orientation ? `, ${screen.orientation.type}` : ''),
      page: location.pathname + location.search, // never the #: invite links carry secrets there
      'playing for': `${Math.round((Date.now() - started) / 1000)} s`, // i18n-ok: a report for developers, in English
      online: navigator.onLine,
      ...game()
    }),
    onFault(fault, first) {
      // Only a new problem redraws the list: one that fails every frame
      // mustn't rebuild it sixty times a second. Opening Nerds shows counts.
      if (!first) return;
      toast(t('problems.toast'));
      show();
    }
  });

  // Taps, keys and the page coming and going, for "before it".
  window.addEventListener('pointerdown', (e) => faults.crumb(`${e.pointerType || 'pointer'} down on ${label(e.target)} at ${Math.round(e.clientX)},${Math.round(e.clientY)}`), { capture: true, passive: true }); // i18n-ok: a report for developers, in English
  window.addEventListener('keydown', (e) => faults.crumb(`key ${e.key}`), { capture: true, passive: true });
  window.addEventListener('resize', () => faults.crumb(`resize ${window.innerWidth}x${window.innerHeight}`), { passive: true });
  document.addEventListener('visibilitychange', () => faults.crumb(document.hidden ? 'page hidden' : 'page shown')); // i18n-ok: a report for developers, in English

  function show() {
    const all = faults.list();
    list.hidden = !all.length;
    if (!all.length) return;
    const head = document.createElement('div');
    head.className = 'problemsHead';
    head.textContent = t('problems.title');
    const rows = all.map((f) => {
      const row = document.createElement('div');
      row.classList.add('setRow', 'problem');
      const text = document.createElement('span');
      text.textContent = f.head + (f.count > 1 ? ` (${f.count}x)` : '');
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = t('problems.copy');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(faults.report(f)); copy.textContent = t('problems.copied'); } catch { copy.textContent = t('problems.copyFailed'); }
      });
      row.append(text, copy);
      return row;
    });
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'setRow';
    clear.textContent = t('problems.clear');
    clear.addEventListener('click', () => { faults.clear(); show(); });
    list.replaceChildren(head, ...rows, clear);
  }
  show();

  // Errors outside a frame (a tap's handler, a message from the room) are
  // got past too, once the game is running (index.html sends them here).
  window.MTE_FAULT = (err, where) => faults.record(err, where);

  return {
    faults,
    show,
    crumb: faults.crumb,
    // A frame that threw: carry on, unless frames keep failing. Then the
    // crash screen shows, with the full report to copy.
    frameFailed(err) {
      const { fault, fatal } = faults.frameFailed(err);
      if (fatal) window.MTE_CRASH(faults.report(fault));
      return fatal;
    }
  };
}

// A position for a report: x, y and the layer.
export const where = (p) => `${p.x.toFixed(SHOWN)}, ${p.y.toFixed(SHOWN)}, layer ${p.z}`;
