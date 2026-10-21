/* The numbers the player reads have to fit where they stand. The short form
 * (src/game/format.js) is what the resource bar shows, where every character
 * counts: never more than four, so a count never spills into the next chip
 * and a rate under it never spills out of its own (docs/ui.md). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, fmtShort } from '../../src/game/format.js';
import { t, number } from '../../src/i18n/i18n.js';

const K = t('num.short.thousand'), M = t('num.short.million'), B = t('num.short.billion'), T = t('num.short.trillion');

// Every magnitude a world can reach, and a few numbers around each.
function samples() {
  const out = [];
  for (let e = 0; e <= 24; e++) {
    const base = 10 ** e;
    for (const f of [1, 1.05, 1.2, 1.5, 2.5, 9.9, 9.99]) out.push(Math.floor(base * f));
  }
  return out;
}

test('format: the short form is never wider than four characters', () => {
  for (const n of samples()) {
    const s = fmtShort(n);
    assert.ok(s.length <= 4, `${n} -> "${s}" is ${s.length} characters`);
  }
});

test('format: the short form abbreviates what a player reads at a glance', () => {
  assert.equal(fmtShort(0), '0');
  assert.equal(fmtShort(9999), '9999');
  assert.equal(fmtShort(45000), '45' + K);
  assert.equal(fmtShort(4.7e6), number(4.7, 1) + M);
  assert.equal(fmtShort(459e9), '459' + B);
  assert.equal(fmtShort(12e12), '12' + T);
});

test('format: past a thousand trillion the short form is scientific, one digit', () => {
  assert.equal(fmtShort(9.99e14), '999' + T);
  assert.equal(fmtShort(1e15), '1e15');
  assert.equal(fmtShort(1.2e15), '1e15');
  assert.equal(fmtShort(1.9e15), '2e15');
  assert.equal(fmtShort(9.9e15), '1e16');
});

test('format: the full form keeps two digits, where there is room for them', () => {
  assert.equal(fmt(1.2e15), number(1.2, 1) + 'e15');
  assert.equal(fmt(4.7e6), number(4.7, 2) + t('num.million'));
});
