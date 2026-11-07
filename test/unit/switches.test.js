/* The Settings and Nerds switches (src/game/switches.js), with stand-ins for
 * the page. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSwitches } from '../../src/game/switches.js';
import { t } from '../../src/i18n/i18n.js';

// A stand-in for one element: hidden, text, attributes and click listeners.
function element() {
  const clicks = [];
  return {
    hidden: false,
    textContent: '',
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    addEventListener(type, fn) {
      if (type === 'click') clicks.push(fn);
    },
    click() {
      for (const fn of clicks) fn();
    }
  };
}

function wire({ showAuto = false, cultivation = null } = {}) {
  const els = {},
    el = new Proxy(els, { get: (o, k) => (o[k] ??= element()) }),
    tipCalls = [];
  const savedView = { showAuto, awayProduce: false, heard: [] };
  const switches = createSwitches({
    el,
    game: { state: { cultivation }, saveNow() {} },
    input: {},
    audio: { muted: false, music: false, track: () => null, onTrack() {} },
    wiki: { mode: 'chatty', setMode() {} },
    hud: {
      toast() {},
      // As hud.js does: words only when shown, hidden for 0.
      autoTip(seconds) {
        tipCalls.push(seconds);
        if (seconds) el.autoTip.textContent = t('tip.auto');
        el.autoTip.hidden = !seconds;
      }
    },
    together: { setAwayProduce() {} },
    savedView,
    keepView() {}
  });
  return { el, switches, savedView, tipCalls };
}

test('switches: showing AUTO never shows its hold-me bubble, so it is never an empty bubble', () => {
  for (const cultivation of [null, {}]) {
    const { el, switches } = wire({ showAuto: true, cultivation });
    el.autoTip.hidden = true; // as the page starts
    switches.showAuto(); // boot, and every world change (game-host changedMode)
    assert.equal(el.perfect.hidden, false, 'AUTO itself shows');
    assert.equal(el.autoTip.hidden, true, 'the bubble stays hidden until a quick tap');
    el.showAuto.click(); // off
    assert.equal(el.perfect.hidden, true);
    assert.equal(el.autoTip.hidden, true);
    el.showAuto.click(); // on again
    assert.equal(el.perfect.hidden, false);
    assert.equal(el.autoTip.hidden, true);
  }
});

test('switches: hiding AUTO also takes away a hold-me bubble that was up', () => {
  const { el, switches, savedView } = wire({ showAuto: true });
  el.autoTip.hidden = false;
  el.autoTip.textContent = t('tip.auto');
  el.showAuto.click();
  assert.equal(savedView.showAuto, false);
  assert.equal(el.autoTip.hidden, true);
  assert.equal(switches.autoShown(), false);
  assert.equal(el.autoState.textContent, t('settings.off'));
});
