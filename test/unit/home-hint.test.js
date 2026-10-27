/* The one Wiki line that asks iPhone and iPad Safari players to add the game
 * to the Home Screen (src/game/home-hint.js): only there, only after a
 * milestone, once per device. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsHomeScreen, createHomeHint } from '../../src/game/home-hint.js';

const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('only Safari on an iPhone or iPad, outside the Home Screen', () => {
  assert.equal(needsHomeScreen({ userAgent: SAFARI, maxTouchPoints: 5 }, false), true);
  assert.equal(needsHomeScreen({ userAgent: IPAD, maxTouchPoints: 5 }, false), true, 'iPadOS calls itself a Mac');
  assert.equal(needsHomeScreen({ userAgent: IPAD, maxTouchPoints: 0 }, false), false, 'a real Mac');
  assert.equal(needsHomeScreen({ userAgent: SAFARI, maxTouchPoints: 5 }, true), false, 'already on the Home Screen');
  assert.equal(needsHomeScreen({ userAgent: CHROME_IOS, maxTouchPoints: 5 }, false), false);
  assert.equal(needsHomeScreen({ userAgent: ANDROID, maxTouchPoints: 5 }, false), false);
});

test('said as a milestone is reached, once per device', () => {
  const s = store(), said = [];
  const nav = { userAgent: SAFARI, maxTouchPoints: 5 };
  const hint = createHomeHint({ store: s, nav, say: () => said.push(1) });
  assert.equal(hint.check(0, 5_000), false, 'not in the opening');
  assert.equal(hint.check(0, 600_000), false, 'nor before any milestone');
  assert.equal(hint.check(1, 601_000), true);
  assert.equal(hint.check(2, 700_000), false);
  assert.equal(createHomeHint({ store: s, nav, say: () => said.push(1) }).check(3, 900_000), false, 'never again on this device');
  assert.equal(said.length, 1);
});

test('a game opened past its first milestone says it after a minute', () => {
  const hint = createHomeHint({ store: store(), nav: { userAgent: SAFARI, maxTouchPoints: 5 }, say: () => {} });
  assert.equal(hint.check(4, 1_000), false);
  assert.equal(hint.check(4, 61_000), true);
});
