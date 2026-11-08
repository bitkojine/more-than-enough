import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearOfActions,
  hudSpacePlan,
  hudRegions,
  HUD_COLLAPSE_ORDER
} from '../../src/game/hud-layout.js';

test('stable HUD regions distinguish roomy screens from tall phones and short landscape', () => {
  const frame = { edgeBottom: 20, action: 84 };
  const phone = hudRegions({ ...frame, width: 390, height: 844 });
  const desktop = hudRegions({ ...frame, width: 1366, height: 768 });
  assert.equal(phone.wide, false);
  assert.equal(desktop.wide, true);
  assert.equal(
    phone.messageBottom,
    desktop.messageBottom,
    'the access anchor uses permanent controls, not panel geometry'
  );
  const short = hudRegions({ ...frame, width: 1366, height: 430 });
  assert.equal(short.wide, false, 'short windows need landscape regions despite their width');
  assert.equal(short.landscape, true);
  assert.equal(short.messageBottom, frame.edgeBottom);
});

test('HUD detail yields in the agreed order, independently of world size', () => {
  assert.deepEqual(HUD_COLLAPSE_ORDER, ['performance', 'status', 'messages']);
  const common = { status: 40, performance: 120, messages: 100 };
  assert.equal(hudSpacePlan({ ...common, room: 500 }).level, 0);
  assert.equal(hudSpacePlan({ ...common, room: 200 }).level, 1);
  assert.equal(hudSpacePlan({ ...common, status: 160, room: 170 }).level, 2);
  assert.equal(hudSpacePlan({ ...common, room: 110 }).level, 3);
});

test('HUD policy has bounded work even when the available space is exhausted', () => {
  const input = { room: -100, status: 1e9, performance: 1e9, messages: 1e9 };
  assert.deepEqual(hudSpacePlan(input), {
    level: 3,
    performance: true,
    status: true,
    messages: true
  });
  assert.equal(input.messages, 1e9, 'policy does not mutate its observations');
});

test('the person button counts everyone awake, you included, never sleepers', async () => {
  const { awakeCount } = await import('../../src/game/players.js');
  assert.equal(awakeCount([]), 1, 'alone: just you');
  const st = ['online', 'away', 'lost', 'offline', 'offline'];
  assert.equal(awakeCount(st.map((s) => ({ st: s }))), 4);
});

test('the open log stands above AUTO or the climb button when they reach into its corner', () => {
  const portrait = hudRegions({ width: 390, height: 844, edgeBottom: 20, action: 88 });
  const log = { left: 12, right: 302, width: 290 };
  const auto = { left: 230, right: 290, top: 640, height: 60 };
  const climb = { left: 318, right: 378, top: 640, height: 60 };
  assert.equal(clearOfActions(portrait, log, [], 844), portrait.logBottom, 'nothing above Gather');
  assert.equal(clearOfActions(portrait, log, [climb], 844), portrait.logBottom, 'climb is clear');
  assert.equal(
    clearOfActions(portrait, log, [auto, climb], 844),
    844 - 640 + 8,
    'AUTO is under it'
  );
  assert.equal(
    clearOfActions(portrait, { left: 0, right: 0, width: 0 }, [auto], 844),
    portrait.logBottom,
    'a hidden log keeps its place'
  );
  const landscape = hudRegions({ width: 844, height: 390, edgeBottom: 12, action: 72 });
  assert.equal(
    clearOfActions(landscape, log, [auto], 390),
    landscape.logBottom,
    'short screens keep their own layout'
  );
});
