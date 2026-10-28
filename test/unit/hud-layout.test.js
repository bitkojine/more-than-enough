import test from 'node:test';
import assert from 'node:assert/strict';
import { hudSpacePlan, HUD_COLLAPSE_ORDER } from '../../src/game/hud-layout.js';

test('HUD detail yields in the agreed order, independently of world size', () => {
  assert.deepEqual(HUD_COLLAPSE_ORDER, ['performance','friends','status','messages']);
  const common = { status: 40, performance: 120, friends: 34, messages: 100 };
  assert.equal(hudSpacePlan({ ...common, room: 500 }).level, 0);
  assert.equal(hudSpacePlan({ ...common, room: 250 }).level, 1);
  assert.equal(hudSpacePlan({ ...common, room: 185 }).level, 2);
  assert.equal(hudSpacePlan({ ...common, status: 160, room: 170 }).level, 3);
  assert.equal(hudSpacePlan({ ...common, room: 110 }).level, 4);
});

test('HUD policy has bounded work even when the available space is exhausted', () => {
  const input = { room: -100, status: 1e9, performance: 1e9, friends: 1e9, messages: 1e9 };
  assert.deepEqual(hudSpacePlan(input), { level: 4, performance: true, friends: true, status: true, messages: true });
  assert.equal(input.messages, 1e9, 'policy does not mutate its observations');
});
