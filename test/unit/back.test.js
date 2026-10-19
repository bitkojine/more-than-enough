import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBack } from '../../src/game/back.js';

// A browser's history, just enough of it: entries with states, Back.
function fakeWindow() {
  const entries = [null];
  let at = 0;
  const listeners = [];
  return {
    entries: () => entries.length,
    history: {
      get state() { return entries[at]; },
      pushState(state) { entries.splice(at + 1, Infinity, state); at++; }
    },
    addEventListener(type, fn) { if (type === 'popstate') listeners.push(fn); },
    // The phone's Back: false if it would leave the game.
    back() {
      if (at === 0) return false;
      at--;
      for (const fn of listeners) fn();
      return true;
    }
  };
}

// Settings, with Nerds open inside it, as a stack of screens.
function setup(screens) {
  const win = fakeWindow();
  const back = createBack({ win, isOpen: () => screens.length > 0, goBack: () => screens.pop() });
  return { win, back };
}

test('Back steps out of the menus one screen at a time, then leaves the game', () => {
  const screens = ['settings', 'nerds'];
  const { win, back } = setup(screens);
  back.tick();
  back.tick();
  assert.equal(win.entries(), 2, 'one entry of our own, however many frames');
  assert.equal(win.back(), true);
  assert.deepEqual(screens, ['settings'], 'Nerds goes back to Settings');
  back.tick();
  assert.equal(win.back(), true);
  assert.deepEqual(screens, [], 'Settings closes');
  back.tick();
  assert.equal(win.back(), false, 'with nothing open, Back leaves the game');
});

test('nothing open: no entry of our own, Back leaves at once', () => {
  const { win, back } = setup([]);
  back.tick();
  assert.equal(win.entries(), 1);
  assert.equal(win.back(), false);
});

test('a menu closed by its own button leaves our entry for the next one', () => {
  const screens = ['build'];
  const { win, back } = setup(screens);
  back.tick();
  screens.pop();           // ×
  back.tick();
  screens.push('upgrades');
  back.tick();
  assert.equal(win.entries(), 2, 'no second entry piles up');
  win.back();
  assert.deepEqual(screens, [], 'Back still closes the sheet');
});
