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
  assert.deepEqual(HUD_COLLAPSE_ORDER, ['performance', 'friends', 'status', 'messages']);
  const common = { status: 40, performance: 120, friends: 34, messages: 100 };
  assert.equal(hudSpacePlan({ ...common, room: 500 }).level, 0);
  assert.equal(hudSpacePlan({ ...common, room: 250 }).level, 1);
  assert.equal(hudSpacePlan({ ...common, room: 185 }).level, 2);
  assert.equal(hudSpacePlan({ ...common, status: 160, room: 170 }).level, 3);
  assert.equal(hudSpacePlan({ ...common, room: 110 }).level, 4);
});

test('HUD policy has bounded work even when the available space is exhausted', () => {
  const input = { room: -100, status: 1e9, performance: 1e9, friends: 1e9, messages: 1e9 };
  assert.deepEqual(hudSpacePlan(input), {
    level: 4,
    performance: true,
    friends: true,
    status: true,
    messages: true
  });
  assert.equal(input.messages, 1e9, 'policy does not mutate its observations');
});

test('friends arriving after compaction keep the compact count and Players access', async () => {
  const { setChipCompact, renderChips } = await import('../../src/game/players.js');
  const original = globalThis.document;
  const element = () => ({
    children: [],
    listeners: {},
    style: { setProperty() {} },
    setAttribute() {},
    append(...nodes) {
      this.children.push(...nodes);
    },
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    }
  });
  globalThis.document = { createElement: element };
  try {
    const box = {
      children: [],
      scrollWidth: 0,
      clientWidth: 100,
      replaceChildren(...nodes) {
        this.children = nodes;
      },
      append(node) {
        this.children.push(node);
      }
    };
    let opened = 0;
    setChipCompact(box, true);
    renderChips(
      box,
      Array.from({ length: 99 }, (_, id) => ({
        id,
        name: 'Mica ' + id,
        st: 'online',
        color: '#fff'
      })),
      {
        tap() {},
        more() {
          opened++;
        }
      }
    );
    assert.equal(box.children.length, 1);
    assert.equal(box.children[0].textContent, '+99');
    box.children[0].listeners.click();
    assert.equal(opened, 1);
    setChipCompact(box, false);
    assert.equal(box.children.length, 6);
    setChipCompact(box, true);
    assert.equal(box.children.length, 1);
    assert.equal(box.children[0].textContent, '+99');
  } finally {
    globalThis.document = original;
  }
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
