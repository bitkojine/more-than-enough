/* What went wrong while playing, and getting past it. A layer of the picture
 * that throws (the clouds, the lighting) is skipped and the rest of the frame
 * still draws; an error anywhere else in a frame, or in a tap or a message,
 * skips that much and the game goes on. Only a frame that keeps failing, so
 * the game can't go on, still stops it with the crash screen (index.html).
 *
 * Each different error is kept once, as a report a developer can act on: what
 * broke and where, and what was going on: the version, the browser, the
 * screen, the view, where in which world, and the last things the player
 * did. Reports are in English: they are for whoever fixes the game, like the
 * performance panel. The last few are kept in this browser and listed under
 * Nerds, each with a Copy button. `scripts/decode-stack.mjs` turns a report's
 * stack, which points into the minified bundle, back into source lines.
 *
 * No DOM here, so tests can drive it; main.js wires it to the page. */

export const CRUMBS = 30;       // the last things the player did, kept for a report
export const KEPT = 5;          // reports kept in this browser
export const FATAL_FRAMES = 30; // frames in a row that fail before the game gives up
const STACK_LINES = 12;         // of each stack, in a report
const STORE_KEY = 'mte.faults';

// "TypeError: x is undefined" and the stack below it (Safari's stack leaves
// out the first line, other browsers repeat it).
export function describe(err) {
  if (!err || typeof err !== 'object') return { head: String(err), stack: '' };
  const head = (err.name || 'Error') + ': ' + (err.message || '(no message)'); // i18n-ok: a report for developers, in English
  let stack = String(err.stack || '');
  if (stack.startsWith(head)) stack = stack.slice(head.length);
  stack = stack.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, STACK_LINES).join('\n');
  return { head, stack };
}

/**
 * @param {object} [o]
 * @param {() => number} [o.clock] wall clock, ms
 * @param {() => object} [o.context] what was going on, as label -> value
 * @param {(fault: object, first: boolean) => void} [o.onFault] told of each error (first: not seen before)
 * @param {Storage | null} [o.store] where reports outlive a reload
 */
export function createFaults({ clock = () => Date.now(), context = () => ({}), onFault = () => {}, store = null } = {}) {
  const crumbs = [];
  let faults = load();
  let failing = 0; // frames in a row that failed

  function load() {
    try { return JSON.parse(store?.getItem(STORE_KEY) || '[]').slice(0, KEPT); } catch { return []; }
  }
  function keep() {
    try { store?.setItem(STORE_KEY, JSON.stringify(faults)); } catch { /* full or blocked: the list stays in memory */ }
  }

  function crumb(text) {
    const at = clock();
    const last = crumbs[crumbs.length - 1];
    if (last && last.text === text) { last.n++; last.at = at; return; }
    crumbs.push({ at, text, n: 1 });
    if (crumbs.length > CRUMBS) crumbs.shift();
  }

  // Notes an error from `where` (a layer, 'frame', 'tap', ...). The same
  // error again only counts; the report keeps the first time's details.
  function record(err, where) {
    let { head, stack } = describe(err);
    // Chrome's DOMExceptions carry no stack: say at least where it was caught.
    if (!stack) stack = String(new Error().stack || '').split('\n').filter((l) => /\bat\b|@/.test(l) && !/faults\.js/.test(l)).slice(0, STACK_LINES).map((l) => 'caught ' + l.trim()).join('\n'); // i18n-ok: a report for developers, in English
    const key = where + '|' + head + '|' + stack.split('\n')[0];
    const at = clock();
    let fault = faults.find((f) => f.key === key);
    const first = !fault;
    if (fault) { fault.count++; fault.last = at; } else {
      let about = {};
      try { about = context(); } catch (e) { about = { context: describe(e).head }; }
      fault = { key, where, head, stack, first: at, last: at, count: 1, context: about, crumbs: crumbs.map((c) => ({ ...c })) };
      faults.unshift(fault);
      faults.length = Math.min(faults.length, KEPT);
    }
    if (first || fault.count === 2 || fault.count % 100 === 0) keep();
    onFault(fault, first);
    return fault;
  }

  return {
    crumb,
    record,
    // Runs one part of the picture; if it throws, notes it, puts the canvas
    // back as `reset` says and goes on without it.
    layer(name, draw, reset) {
      try { return draw(); } catch (err) {
        record(err, 'draw ' + name);
        try { reset?.(); } catch { /* nothing more to do */ }
        return undefined;
      }
    },
    // A whole frame went through.
    frameDone() { failing = 0; },
    // A frame threw: its fault, and whether frames have failed so often in
    // a row that the game can't go on.
    frameFailed(err) {
      const fault = record(err, 'frame');
      return { fault, fatal: ++failing >= FATAL_FRAMES };
    },
    list: () => faults,
    clear() { faults = []; keep(); },
    report: (fault) => report(fault, clock)
  };
}

const stamp = (ms) => new Date(ms).toISOString();

// One report, as plain text to paste into an issue.
export function report(f, clock = () => Date.now()) {
  const lines = [`${f.head}`, `where: ${f.where}`, `seen: ${f.count}x, first ${stamp(f.first)}` + (f.count > 1 ? `, last ${stamp(f.last)}` : '')];
  if (f.stack) lines.push('', 'stack:', ...f.stack.split('\n').map((l) => '  ' + l));
  lines.push('', 'context:');
  for (const [k, v] of Object.entries(f.context || {})) lines.push(`  ${k}: ${v}`);
  if (f.crumbs?.length) {
    lines.push('', 'before it (seconds before, newest last):'); // i18n-ok: a report for developers, in English
    for (const c of f.crumbs) lines.push(`  -${((f.first - c.at) / 1000).toFixed(1)}s ${c.text}` + (c.n > 1 ? ` (x${c.n})` : ''));
  }
  lines.push('', `report made ${stamp(clock())}`); // i18n-ok: a report for developers, in English
  return lines.join('\n');
}
