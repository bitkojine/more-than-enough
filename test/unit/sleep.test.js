/* Asleep until a tap (src/game/sleep.js): the game starts asleep, shows the
 * wake screen once drawn, wakes on one click or key (not a modifier), keys
 * do nothing else while asleep, a press while loading opens it awake, and
 * it falls asleep again whenever the tab is hidden; held while a crystal
 * world's room can't be reached, no press lifts it, and play goes on as the
 * room answers. Run on stand-in page objects. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

function target() {
  const on = {};
  return {
    on,
    addEventListener(type, fn) {
      (on[type] ||= []).push(fn);
    },
    fire(type, e = {}) {
      let stopped = false;
      const ev = {
        type,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {
          stopped = true;
        },
        ...e
      };
      for (const fn of on[type] || []) {
        if (stopped) break;
        fn(ev);
      }
      return stopped;
    }
  };
}

globalThis.window ||= target();
const { createSleep } = await import('../../src/game/sleep.js');

function page() {
  const classes = new Set();
  const root = { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
  const held = new Set();
  const wake = {
    ...target(),
    hidden: true,
    style: { setProperty() {} },
    classList: { toggle: (c, on) => (on ? held.add(c) : held.delete(c)) },
    held
  };
  const doc = { ...target(), hidden: false };
  const frames = [];
  const parts = {
    game: { state: { player: { x: 1, y: 2, z: 0 } } },
    cam: { project: (x, y) => ({ x: x * 10, y: y * 10 }) },
    input: { release() {}, releasePerfect() {} },
    wiki: { sleeping: null },
    loop: {
      resumed: 0,
      resume() {
        this.resumed++;
      }
    },
    together: {
      paused: false,
      told: [],
      away(h) {
        this.told.push(h);
      }
    },
    frame: (fn) => frames.push(fn)
  };
  const drawn = () => {
    while (frames.length) frames.shift()();
  };
  return { classes, root, wake, doc, parts, drawn };
}

test('starts asleep, shows the wake screen once drawn, and one click wakes it', () => {
  const p = page();
  const sleep = createSleep({ root: p.root, wake: p.wake, doc: p.doc });
  sleep.attach(p.parts);
  assert.equal(sleep.asleep, true);
  assert.equal(p.parts.wiki.sleeping, true, 'Wiki dozes');
  assert.equal(p.wake.hidden, true, 'nothing shows before the first frames');
  p.drawn();
  assert.equal(p.wake.hidden, false);
  assert.ok(p.classes.has('asleep'), 'the page goes grey');
  p.wake.fire('click');
  assert.equal(sleep.asleep, false);
  assert.equal(p.wake.hidden, true);
  assert.ok(!p.classes.has('asleep'));
  assert.equal(p.parts.wiki.sleeping, false);
  assert.equal(p.parts.loop.resumed, 1, 'the clock goes on from now');
  assert.deepEqual(p.parts.together.told, [false], 'a shared world hears you are back');
});

test('asleep, keys go no further; a modifier does not wake, another key does', () => {
  const p = page();
  const sleep = createSleep({ root: p.root, wake: p.wake, doc: p.doc });
  sleep.attach(p.parts);
  p.drawn();
  assert.ok(window.fire('keydown', { key: 'Shift' }), 'a key is stopped');
  assert.equal(sleep.asleep, true, 'Shift alone does not wake');
  assert.ok(window.fire('keydown', { key: 'ArrowUp' }));
  assert.equal(sleep.asleep, false, 'another key wakes');
  assert.equal(window.fire('keydown', { key: 'ArrowUp' }), false, 'awake, keys reach the game');
});

test('hiding the tab puts it back to sleep; a press while loading opens it awake', () => {
  const p = page();
  const sleep = createSleep({ root: p.root, wake: p.wake, doc: p.doc });
  window.fire('click');
  assert.equal(sleep.asleep, false, 'a tap during loading woke it');
  sleep.attach(p.parts);
  p.drawn();
  assert.equal(p.wake.hidden, true, 'and it opens awake');
  p.doc.hidden = true;
  p.doc.fire('visibilitychange');
  assert.equal(sleep.asleep, true);
  assert.equal(p.wake.hidden, false);
  assert.equal(p.parts.wiki.sleeping, true);
});

test('switched off (browser tests), it never sleeps', () => {
  const p = page();
  const sleep = createSleep({ root: p.root, wake: p.wake, doc: p.doc, enabled: false });
  sleep.attach(p.parts);
  p.drawn();
  p.doc.hidden = true;
  p.doc.fire('visibilitychange');
  assert.equal(sleep.asleep, false);
  assert.equal(p.wake.hidden, true);
});

test('held while the room is out of reach: no press lifts it, the room answering does', () => {
  const p = page();
  const sleep = createSleep({ root: p.root, wake: p.wake, doc: p.doc });
  sleep.attach(p.parts);
  p.drawn();
  p.wake.fire('click');
  assert.equal(sleep.rest(), false, 'awake and connected: the world runs');
  p.parts.together.paused = true;
  assert.equal(sleep.rest(), true, 'the connection is lost: the world stops');
  assert.ok(p.wake.held.has('held'), 'the screen says it is waiting');
  assert.equal(p.wake.hidden, false);
  assert.ok(p.classes.has('asleep'), 'the page goes grey');
  p.wake.fire('click');
  assert.equal(sleep.rest(), true, 'a tap does not lift it');
  assert.equal(window.fire('keydown', { key: 'a' }), true, 'keys go no further');
  p.parts.together.paused = false;
  assert.equal(sleep.rest(), false, 'the room answered: play goes on');
  assert.equal(p.wake.hidden, true);
  assert.ok(!p.classes.has('asleep'));
  assert.ok(!p.wake.held.has('held'));
  assert.equal(p.parts.loop.resumed, 2, 'the clock goes on from here');
});

test('held while asleep: back online, it is the wake screen again, not play', () => {
  const p = page();
  const sleep = createSleep({ root: p.root, wake: p.wake, doc: p.doc });
  sleep.attach(p.parts);
  p.drawn();
  p.parts.together.paused = true;
  assert.equal(sleep.rest(), true);
  p.parts.together.paused = false;
  assert.equal(sleep.rest(), true, 'still asleep until a tap');
  assert.equal(p.wake.hidden, false);
  assert.ok(!p.wake.held.has('held'), 'it says tap to wake again');
  p.wake.fire('click');
  assert.equal(sleep.rest(), false);
});

test('switched off (browser tests), it still holds while the room is out of reach', () => {
  const p = page();
  const sleep = createSleep({ root: p.root, wake: p.wake, doc: p.doc, enabled: false });
  sleep.attach(p.parts);
  p.drawn();
  assert.equal(sleep.rest(), false);
  p.parts.together.paused = true;
  assert.equal(sleep.rest(), true);
  assert.equal(p.wake.hidden, false);
});
