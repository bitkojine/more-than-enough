// The words the Invite links panel puts on each link (src/game/invite-list.js).
// The panel itself is drawn in the browser; these are its pure parts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lifeText, timeLeft, inviteState } from '../../src/game/invite-list.js';
import { t } from '../../src/i18n/i18n.js';

const MIN = 60_000;

test('a link lifetime reads in minutes, hours or days', () => {
  assert.equal(lifeText(30), t('invites.minutes', { n: 30 }));
  assert.equal(lifeText(60), t('invites.hours', { n: 1 }));
  assert.equal(lifeText(1440), t('invites.days', { count: 1 }));
  assert.equal(lifeText(10080), t('invites.days', { count: 7 }));
});

test('time left rounds to what a person reads, never less than a minute', () => {
  assert.equal(timeLeft(1), t('invites.minutes', { n: 1 }));
  assert.equal(timeLeft(59 * MIN), t('invites.minutes', { n: 59 }));
  assert.equal(timeLeft(90 * MIN), t('invites.hours', { n: 2 }));
  // Hours up to two days, so "1 day" never hides 47 hours.
  assert.equal(timeLeft(47 * 60 * MIN), t('invites.hours', { n: 47 }));
  assert.equal(timeLeft(3 * 1440 * MIN), t('invites.days', { count: 3 }));
});

test('a link says why it stopped working, stopped first', () => {
  const now = 1_000_000;
  const live = { off: false, until: now + 5 * MIN, uses: 1, max: 3 };
  assert.equal(inviteState(live, now), t('invites.left', { time: timeLeft(5 * MIN) }));
  assert.equal(inviteState({ ...live, uses: 3 }, now), t('invites.usedUp'));
  assert.equal(inviteState({ ...live, until: now }, now), t('invites.expired'));
  assert.equal(inviteState({ ...live, until: now, uses: 3, off: true }, now), t('invites.stopped'));
});
