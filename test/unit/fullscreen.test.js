import test from 'node:test';
import assert from 'node:assert/strict';
import { createFullscreen } from '../../src/game/fullscreen.js';

function host({ supported = true, prefixed = false, enabled = true, installed = false, system = false, enter } = {}) {
  const node = () => ({ attrs: {}, listeners: {}, textContent: '', hidden: false,
    setAttribute(k,v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    addEventListener(k,v) { this.listeners[k] = v; } });
  const button = node(), state = node(), hint = node(), doc = node(), win = node();
  const root = {}; doc.documentElement = root; win.navigator = { standalone: installed };
  win.matchMedia = query => ({ matches: query.includes('fullscreen') ? system : installed, addEventListener() {} });
  let enters = 0, exits = 0, changes = 0, lastOptions, failures = [];
  const property = prefixed ? 'webkitFullscreenElement' : 'fullscreenElement';
  const change = prefixed ? 'webkitfullscreenchange' : 'fullscreenchange';
  if (supported) {
    doc[prefixed ? 'webkitFullscreenEnabled' : 'fullscreenEnabled'] = enabled;
    root[prefixed ? 'webkitRequestFullscreen' : 'requestFullscreen'] = function(options) {
      assert.equal(this, root); enters++; lastOptions = options;
      if (enter) return enter();
      doc[property] = root; doc.listeners[change]();
      return prefixed ? undefined : Promise.resolve();
    };
    doc[prefixed ? 'webkitExitFullscreen' : 'exitFullscreen'] = function() {
      assert.equal(this, doc); exits++; doc[property] = null; doc.listeners[change]();
      return prefixed ? undefined : Promise.resolve();
    };
  }
  const control = createFullscreen({ button, state, hint, doc, win,
    changed: () => changes++, report: error => failures.push(error) });
  return { button, state, hint, doc, root, win, control,
    get enters() { return enters; }, get exits() { return exits; },
    get changes() { return changes; }, get options() { return lastOptions; }, failures };
}

test('fullscreen uses the whole document and invokes the API inside the gesture', async () => {
  const h = host();
  const pending = h.button.listeners.click();
  assert.equal(h.enters, 1, 'request runs synchronously before the first await');
  assert.equal(h.doc.fullscreenElement, h.root);
  assert.deepEqual(h.options, { navigationUI: 'hide' });
  await pending;
  assert.equal(h.control.mode, 'native'); assert.equal(h.button.attrs['aria-pressed'], 'true');
  await h.button.listeners.click();
  assert.equal(h.exits, 1); assert.equal(h.button.attrs['aria-pressed'], 'false');
  assert.ok(h.changes >= 2);
});

test('browser Escape or external exit updates the actual state', async () => {
  const h = host(); await h.control.toggle();
  h.doc.fullscreenElement = null; h.doc.listeners.fullscreenchange();
  assert.equal(h.control.mode, 'windowed');
  assert.equal(h.state.textContent, 'off');
});

test('prefixed Safari fullscreen works with void-returning APIs', async () => {
  const h = host({ prefixed: true }); await h.control.toggle();
  assert.equal(h.control.mode, 'native'); assert.equal(h.options, undefined);
  await h.control.toggle(); assert.equal(h.exits, 1); assert.equal(h.control.mode, 'windowed');
});

test('permission rejection leaves a usable button, accurate state and helpful feedback', async () => {
  const error = new DOMException('Permission denied', 'NotAllowedError');
  const h = host({ enter: () => Promise.reject(error) });
  await h.control.toggle();
  assert.equal(h.control.mode, 'windowed'); assert.equal(h.button.disabled, false);
  assert.equal(h.button.attrs['aria-pressed'], 'false'); assert.equal(h.hint.hidden, false);
  assert.equal(h.control.error, error); assert.deepEqual(h.failures, [error]);
  h.win.listeners.pageshow();
  assert.equal(h.control.error, null); assert.equal(h.hint.hidden, true);
});

test('an asynchronous prefixed error after a void return still gives feedback', async () => {
  const h = host({ prefixed: true, enter: () => undefined });
  await h.control.toggle();
  h.doc.listeners.webkitfullscreenerror();
  assert.equal(h.control.mode, 'windowed'); assert.equal(h.hint.hidden, false);
  assert.equal(h.button.disabled, false); assert.equal(h.failures.length, 1);
});

test('repeated input cannot issue concurrent fullscreen requests', async () => {
  let finish;
  const h = host({ enter: () => new Promise(resolve => { finish = resolve; }) });
  const first = h.control.toggle(); await h.control.toggle();
  assert.equal(h.enters, 1); assert.equal(h.button.disabled, true);
  finish(); await first; assert.equal(h.button.disabled, false);
  assert.equal(h.control.mode, 'windowed', 'a resolved promise alone never invents fullscreen state');
});

test('unsupported and policy-disabled browsers give instructions without pretending to toggle', async () => {
  for (const options of [{ supported: false }, { enabled: false }]) {
    const h = host(options); await h.control.toggle();
    assert.equal(h.enters, 0); assert.equal(h.control.mode, 'unsupported');
    assert.equal(h.button.attrs['aria-pressed'], undefined);
    assert.equal(h.button.attrs['aria-expanded'], 'true');
    assert.match(h.hint.textContent, /Home Screen/);
    await h.control.toggle(); assert.equal(h.hint.hidden, true);
  }
});

test('installed and system-managed views explain how to leave rather than claiming a native toggle', async () => {
  for (const options of [{ supported: false, installed: true }, { system: true }]) {
    const h = host(options); await h.control.toggle();
    assert.equal(h.enters, 0); assert.equal(h.button.attrs['aria-pressed'], undefined);
    assert.equal(h.hint.hidden, false); assert.match(h.hint.textContent, /system/i);
  }
});
