// Bug (Watch, 2026-10-26): a craft button must never look ready while you
// can't pay for the thing. Every Craft, Place and upgrade button on the
// crystal-world sheets is greyed out until the price is in hand, and lit
// once it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { cultivationUpgradeRows, cultivationBuildRows, useLook } from '../../src/game/sheet.js';

useLook({ src: () => '', color: () => '#000' });

// Each button on the rendered rows: what it does, and whether it's enabled.
const buttons = (html) => [...html.matchAll(/<button class="buy[^"]*" ([^>]*)>/g)].map(([, attrs]) => ({
  id: /data-id="([^"]*)"/.exec(attrs)?.[1], action: /data-action="([^"]*)"/.exec(attrs)?.[1] ?? /data-kind="([^"]*)"/.exec(attrs)?.[1],
  enabled: !/\bdisabled\b/.test(attrs)
}));
const world = () => { const s = C.createState(7, { cultivation: true }); s.player = { x: 0.5, y: 0.5, z: -2 }; return s; };

test('with nothing in hand, no craft, place or upgrade button looks ready', () => {
  const s = world();
  const all = buttons(cultivationUpgradeRows(s) + cultivationBuildRows(s));
  assert.ok(all.some((b) => b.action === 'craft') && all.some((b) => b.action === 'build'));
  for (const b of all) assert.equal(b.enabled, false, `${b.action} ${b.id} looks ready with an empty pack`);
});

test('each crystal-world button lights exactly when its price is in hand', () => {
  for (const kind of ['lantern', 'carrier', 'chamber', 'cooler', 'vault', 'conduit', 'shelter']) {
    const recipe = C.CULTIVATION_RECIPES[kind], s = world();
    const html = () => kind === 'lantern' || kind === 'carrier' ? cultivationUpgradeRows(s) : cultivationBuildRows(s);
    const shown = () => buttons(html()).find((b) => b.id === kind);
    // One short of any single resource is still greyed out.
    for (const short of Object.keys(recipe)) {
      s.inv = Object.fromEntries(C.RESOURCES.map((r) => [r, 0]));
      for (const [r, n] of Object.entries(recipe)) s.inv[r] = r === short ? n - 1 : n;
      assert.equal(shown().enabled, false, `${kind} looks ready one ${short} short`);
      assert.equal(C.canAfford(s.inv, recipe), false);
    }
    for (const [r, n] of Object.entries(recipe)) s.inv[r] = n;
    assert.equal(shown().enabled, true, `${kind} stays greyed out with its price in hand`);
  }
});

test('tool upgrades in a crystal world follow what you can pay too', () => {
  const s = world();
  for (const b of buttons(cultivationUpgradeRows(s)).filter((x) => x.action === 'tool')) assert.equal(b.enabled, C.canBuy(s, b.id), b.id);
  for (const r of C.RESOURCES) C.earn(s, r, 500, 'hand');
  for (const b of buttons(cultivationUpgradeRows(s)).filter((x) => x.action === 'tool')) assert.equal(b.enabled, C.canBuy(s, b.id), b.id);
});
