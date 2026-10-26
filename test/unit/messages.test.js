// The message log (src/game/messages.js, Watch 2026-10-26): every line
// stays until the player folds the log away, a folded log counts what came
// in, repeats stack, and each world keeps its own lines on the device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessages, lineHtml } from '../../src/game/messages.js';

// Just enough of a page for the log to build itself into.
function fakePage() {
  const el = () => ({
    hidden: false, style: {}, children: [], listeners: {}, attrs: {}, textContent: '', html: '',
    scrollHeight: 0, scrollTop: 0, clientHeight: 0, offsetHeight: 0,
    set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; },
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); },
    addEventListener(k, fn) { this.listeners[k] = fn; },
    getBoundingClientRect: () => ({ left: 0, right: 300, top: 0, bottom: 600, width: 300, height: 100 })
  });
  globalThis.document = { createElement: el, getElementById: () => null, body: { classList: { toggle() {} } } };
  const root = el();
  return root;
}
function memoryStore() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m };
}
const byId = (root, id) => root.children.find((c) => c.id === id);

test('lines stay, repeats stack, and the log keeps only the newest', () => {
  const root = fakePage(), store = memoryStore();
  const log = createMessages({ world: () => 'solo.1', store, root });
  log.add({ kind: 'game', text: 'Saved' });
  log.add({ kind: 'game', text: 'Saved' });
  log.add({ kind: 'wiki', name: 'Fern', text: 'Grit hides under it.' });
  assert.deepEqual(log.lines, ['game: Saved', 'wiki: Fern. Grit hides under it.']);
  assert.match(lineHtml({ kind: 'game', text: 'Saved', n: 2 }), /×2/);
  for (let i = 0; i < 80; i++) log.add({ kind: 'game', text: 'n' + i });
  assert.equal(log.lines.length, 50);
  assert.equal(log.last, 'n79');
});

test('folded, new lines only count on the pill; only a tap opens it again', () => {
  const root = fakePage(), kept = [];
  const log = createMessages({ world: () => 'solo.1', store: memoryStore(), root, keepOpen: (on) => kept.push(on) });
  log.add({ kind: 'wiki', text: 'Hello' });
  const box = byId(root, 'log'), pill = byId(root, 'logPill');
  assert.ok(!box.hidden && pill.hidden, 'a new player starts with the log open');
  box.children[1].children[0].listeners.click();
  assert.ok(box.hidden && !pill.hidden, 'Hide folds it into the pill');
  log.add({ kind: 'milestone', text: 'First pick', of: '1 of 12' });
  log.add({ kind: 'game', text: 'Lantern low' });
  assert.equal(log.unread, 2);
  assert.ok(box.hidden, 'new lines never open it by themselves');
  pill.listeners.click();
  assert.ok(!box.hidden && log.unread === 0, 'tapping the pill opens it and clears the count');
  assert.deepEqual(kept, [false, true], 'the choice is kept');
});

test('each world keeps its own lines, and what came before any world joins the first', () => {
  const root = fakePage(), store = memoryStore();
  let world = null;
  const log = createMessages({ world: () => world, store, root });
  log.add({ kind: 'game', text: 'Your save was kept to one side' });
  world = 'solo.1';
  log.add({ kind: 'wiki', text: 'Hello' });
  assert.deepEqual(log.lines, ['game: Your save was kept to one side', 'wiki: Hello']);
  world = 'room-a'; log.tick();
  assert.deepEqual(log.lines, [], 'another world starts with its own (empty) log');
  log.add({ kind: 'game', text: "You're in Fern Valley" });
  world = 'solo.1'; log.tick();
  assert.equal(log.lines.length, 2, 'back home, its lines are there');
  const again = createMessages({ world: () => 'room-a', store, root: fakePage() });
  again.tick();
  assert.deepEqual(again.lines, ["game: You're in Fern Valley"], 'and they survive a reload');
});

test('a long press sliding over the map rewrites its one line', () => {
  const log = createMessages({ world: () => 'solo.1', store: memoryStore(), root: fakePage() });
  log.add({ kind: 'wiki', name: 'Fern', text: 'a' }, 'press1');
  log.add({ kind: 'wiki', name: 'Moss', text: 'b' }, 'press1');
  log.add({ kind: 'wiki', name: 'Rock', text: 'c' }, 'press2');
  assert.deepEqual(log.lines, ['wiki: Moss. b', 'wiki: Rock. c']);
});

test('names and words from the world are escaped, never markup', () => {
  assert.doesNotMatch(lineHtml({ kind: 'wiki', name: '<img>', text: '<b>x</b>' }), /<img>|<b>x/);
});
