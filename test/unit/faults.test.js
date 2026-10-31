import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFaults,
  report,
  describe,
  CRUMBS,
  KEPT,
  FATAL_FRAMES
} from '../../src/game/faults.js';

// A clock the test moves by hand, and a store like localStorage.
function setup(extra = {}) {
  let now = Date.UTC(2026, 9, 25, 12);
  const told = [];
  const items = new Map();
  const store = {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => items.set(k, String(v))
  };
  const faults = createFaults({
    clock: () => now,
    context: () => ({ zoom: '8.70x', at: '3.5, -2.0, layer 0' }),
    onFault: (f, first) => told.push({ where: f.where, first }),
    store,
    ...extra
  });
  return {
    faults,
    told,
    store,
    tick: (ms) => {
      now += ms;
    }
  };
}

const boom = (message, name = 'InvalidStateError') => Object.assign(new Error(message), { name });

test('a part of the picture that throws is left out, and the rest goes on', () => {
  const { faults, told } = setup();
  let reset = 0,
    after = false;
  assert.equal(
    faults.layer(
      'fog',
      () => {
        throw boom('The object is in an invalid state.');
      },
      () => reset++
    ),
    undefined
  );
  assert.equal(
    faults.layer(
      'lighting',
      () => {
        after = true;
        return 7;
      },
      () => reset++
    ),
    7
  );
  assert.ok(after, 'the next layer still draws');
  assert.equal(reset, 1, 'the canvas is put back once, after the one that threw');
  assert.deepEqual(told, [{ where: 'draw fog', first: true }]);
});

test('the same error again only counts; the first report keeps its details', () => {
  const { faults, told, tick } = setup();
  for (let i = 0; i < 50; i++) {
    faults.layer('fog', () => {
      throw boom('bad');
    });
    tick(16);
  }
  const [f] = faults.list();
  assert.equal(faults.list().length, 1);
  assert.equal(f.count, 50);
  assert.equal(told.filter((t) => t.first).length, 1, 'the player is told once');
  assert.ok(f.last > f.first);
});

test('a frame that throws is got past; only frames failing in a row stop the game', () => {
  const { faults } = setup();
  for (let i = 1; i < FATAL_FRAMES; i++)
    assert.equal(faults.frameFailed(boom('x', 'TypeError')).fatal, false);
  faults.frameDone(); // one good frame and the count starts over
  for (let i = 1; i < FATAL_FRAMES; i++)
    assert.equal(faults.frameFailed(boom('x', 'TypeError')).fatal, false);
  const last = faults.frameFailed(boom('x', 'TypeError'));
  assert.equal(last.fatal, true);
  assert.equal(last.fault.where, 'frame');
});

test('a report says what broke, where, what was going on and what came before', () => {
  const { faults, tick } = setup();
  faults.crumb('touch down on map at 200,400');
  tick(500);
  faults.crumb('zoom 8.70x');
  faults.crumb('zoom 8.70x'); // the same again folds into one line
  tick(1500);
  const err = boom('The object is in an invalid state.');
  err.stack =
    'createPattern@[native code]\nTu@https://play.robertasrudys.com/src/game/main.js:3:224345';
  faults.layer('fog', () => {
    throw err;
  });
  const text = report(faults.list()[0], () => Date.UTC(2026, 9, 25, 12, 1));
  assert.match(text, /^InvalidStateError: The object is in an invalid state\./);
  assert.match(text, /where: draw fog/);
  assert.match(text, /main\.js:3:224345/);
  assert.match(text, /zoom: 8\.70x/);
  assert.match(text, /-2\.0s touch down on map/);
  assert.match(text, /-1\.5s zoom 8\.70x \(x2\)/);
});

test('only the last few things done and the last few reports are kept', () => {
  const { faults } = setup();
  for (let i = 0; i < CRUMBS + 10; i++) faults.crumb('tap ' + i);
  for (let i = 0; i < KEPT + 3; i++) faults.record(boom('error ' + i), 'event');
  const list = faults.list();
  assert.equal(list.length, KEPT);
  assert.equal(list[0].head, `InvalidStateError: error ${KEPT + 2}`, 'newest first');
  assert.equal(list[0].crumbs.length, CRUMBS);
  assert.equal(list[0].crumbs[0].text, 'tap 10');
});

test('reports outlive a reload, and a broken store or context never throws', () => {
  const { faults, store } = setup();
  faults.record(boom('kept'), 'event');
  const again = createFaults({ store });
  assert.equal(again.list()[0].head, 'InvalidStateError: kept');
  const broken = createFaults({
    store: {
      getItem: () => '{not json',
      setItem: () => {
        throw new Error('full');
      }
    },
    context: () => {
      throw new Error('no state yet');
    }
  });
  const f = broken.record('a plain string thrown', 'promise');
  assert.equal(f.head, 'a plain string thrown');
  assert.match(f.context.context, /no state yet/);
  broken.clear();
  assert.equal(broken.list().length, 0);
});

test("a stack that repeats the error's own first line isn't shown twice", () => {
  const err = new TypeError('x is undefined');
  const { head, stack } = describe(err);
  assert.equal(head, 'TypeError: x is undefined');
  assert.ok(!stack.includes('TypeError: x is undefined'));
});
