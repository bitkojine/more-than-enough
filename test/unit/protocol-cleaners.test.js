/* What the room takes from a game, field by field (src/net/protocol.js).
 * Every message comes from a client nobody controls, so each cleaner must
 * keep what is well formed and drop the rest. Mutation sweep 1
 * (2026-11-04) found 235 planted bugs in protocol.js that no test caught:
 * most loosened or tightened one of these checks. Here each field of a good
 * act, edit and position is set to the last value it may take and to the
 * first it may not. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/net/protocol.js';

const XY_MAX = 2 ** 20 - 1;
const KEY_MAX = 2 ** 52;
const ID = '0123456789abcdef';

// `good` with field i set to v, cleaned.
const withField = (clean, good, i, v) => {
  const x = good.slice();
  x[i] = v;
  return clean(x);
};
function edges(clean, good, i, ok, bad) {
  for (const v of ok)
    assert.notEqual(withField(clean, good, i, v), null, `${good[0]}[${i}] = ${v} is kept`);
  for (const v of bad)
    assert.equal(withField(clean, good, i, v), null, `${good[0]}[${i}] = ${String(v)} is dropped`);
}
const XY = [
  [XY_MAX, -XY_MAX, 0.5],
  [XY_MAX + 1, -XY_MAX - 1, NaN, Infinity, '1', null]
];
const TILE = [
  [XY_MAX, -XY_MAX, 0],
  [XY_MAX + 1, -XY_MAX - 1, 0.5, '1', null]
];
const Z = [
  [0, -512],
  [1, -513, 0.5, '0', null]
];
const NAME = [
  ['a', 'garden', 'a' + 'B'.repeat(23)],
  ['', 'A', '1a', 'a-b', 'a' + 'b'.repeat(24), 7]
];

test('protocol cleanAct: the head every act shares', () => {
  const good = ['w', 1000, 1.5, -2.5, -3];
  assert.deepEqual(P.cleanAct(good), good);
  assert.equal(P.cleanAct('w'), null);
  edges(P.cleanAct, good, 1, [0, 2 ** 53 - 1], [-1, 0.5, '1', null, 2 ** 53]);
  edges(P.cleanAct, good, 2, ...XY);
  edges(P.cleanAct, good, 3, ...XY);
  edges(P.cleanAct, good, 4, ...Z);
  assert.deepEqual(P.cleanAct(['w', 1, 1.23456, 2.00049, 0]), ['w', 1, 1.235, 2, 0], 'mm');
  assert.equal(P.cleanAct(['q', 1, 0, 0, 0]), null, 'an unknown kind');
});

test('protocol cleanAct: each kind and its own fields', () => {
  const h = ['h', 1, 0, 0, 0, 5, -6];
  assert.deepEqual(P.cleanAct(h), h);
  edges(P.cleanAct, h, 5, ...TILE);
  edges(P.cleanAct, h, 6, ...TILE);
  assert.equal(P.cleanAct(['h', 1, 0, 0, 0]), null, 'a gather names its tile');
  assert.equal(P.cleanAct([...h, 1]), null);

  const c = ['c', 1, 0, 0, 0, 5, 6];
  assert.deepEqual(P.cleanAct(c), c, 'a collect may name its building');
  assert.deepEqual(P.cleanAct(['c', 1, 0, 0, 0]), ['c', 1, 0, 0, 0], 'or not');
  edges(P.cleanAct, c, 5, ...TILE);
  assert.equal(P.cleanAct(['c', 1, 0, 0, 0, 5]), null);
  assert.deepEqual(P.cleanAct(['w', 1, 0, 0, 0]), ['w', 1, 0, 0, 0]);
  assert.equal(P.cleanAct(['w', 1, 0, 0, 0, 5, 6]), null, 'a walk has no tile');

  const b = ['b', 1, 0, 0, 0, 'garden', 5, 6];
  assert.deepEqual(P.cleanAct(b), b);
  edges(P.cleanAct, b, 5, ...NAME);
  edges(P.cleanAct, b, 6, ...TILE);
  edges(P.cleanAct, b, 7, ...TILE);
  assert.equal(P.cleanAct(b.slice(0, 7)), null);

  const v = ['v', 1, 0, 0, 0, 1, 2, 3, 4];
  assert.deepEqual(P.cleanAct(v), v);
  for (const i of [5, 6, 7, 8]) edges(P.cleanAct, v, i, ...TILE);
  assert.equal(P.cleanAct(v.slice(0, 8)), null);

  const p = ['p', 1, 0, 0, 0, 'lamp'];
  assert.deepEqual(P.cleanAct(p), p);
  edges(P.cleanAct, p, 5, ...NAME);
  assert.equal(P.cleanAct([...p, 1]), null);

  const u = ['u', 1, 0, 0, 0, 'boots'];
  assert.deepEqual(P.cleanAct(u), u);
  edges(P.cleanAct, u, 5, ...NAME);
  assert.equal(P.cleanAct(['u', 1, 0, 0, 0]), null);
});

test('protocol cleanEdit: richness, props, buildings, moves', () => {
  assert.equal(P.cleanEdit('m'), null);
  const m = ['m', 7, 200];
  assert.deepEqual(P.cleanEdit(m), m);
  edges(P.cleanEdit, m, 1, [0, KEY_MAX - 1], [-1, KEY_MAX, 0.5, '7']);
  edges(P.cleanEdit, m, 2, [0, 255], [-1, 256, 0.5, '1']);
  assert.equal(P.cleanEdit([...m, 1]), null);

  const p = ['p', 7, 'lamp'];
  assert.deepEqual(P.cleanEdit(p), p);
  edges(P.cleanEdit, p, 1, [0, KEY_MAX - 1], [-1, KEY_MAX, '7']);
  edges(P.cleanEdit, p, 2, ...NAME);
  assert.equal(P.cleanEdit([...p, 1]), null);

  const x = ['x', 'garden', 1, -2, -3];
  assert.deepEqual(P.cleanEdit(x), x);
  assert.deepEqual(P.cleanEdit([...x, ID]), [...x, ID], 'with its owner');
  assert.equal(P.cleanEdit([...x, 'someone']), null, 'an owner is an id');
  assert.equal(P.cleanEdit([...x, ID, 1]), null);
  assert.equal(P.cleanEdit(x.slice(0, 4)), null);
  edges(P.cleanEdit, x, 1, ...NAME);
  edges(P.cleanEdit, x, 2, ...TILE);
  edges(P.cleanEdit, x, 3, ...TILE);
  edges(P.cleanEdit, x, 4, ...Z);

  const v = ['v', 1, 2, -3, 4, 5];
  assert.deepEqual(P.cleanEdit(v), v);
  for (const i of [1, 2, 4, 5]) edges(P.cleanEdit, v, i, ...TILE);
  edges(P.cleanEdit, v, 3, ...Z);
  assert.equal(P.cleanEdit(v.slice(0, 5)), null);
  assert.equal(P.cleanEdit(['q', 1, 2]), null);
});

test('protocol cleanPos: where a player stands, and what they show', () => {
  const pos = {
    x: 1.23456,
    y: -2,
    z: -1,
    fx: 0.123,
    fy: -2,
    m: true,
    sign: 1,
    gear: 3,
    a: 'swing',
    n: 999
  };
  assert.deepEqual(P.cleanPos(pos), {
    x: 1.235,
    y: -2,
    z: -1,
    fx: 0.12,
    fy: -1,
    m: true,
    sign: false,
    gear: 3,
    a: 'swing',
    n: 999
  });
  for (const [k, ok, bad] of [
    ['x', ...XY],
    ['y', ...XY],
    ['z', ...Z]
  ]) {
    for (const v of ok) assert.notEqual(P.cleanPos({ ...pos, [k]: v }), null, `${k} = ${v}`);
    for (const v of bad) assert.equal(P.cleanPos({ ...pos, [k]: v }), null, `${k} = ${v}`);
  }
  assert.equal(P.cleanPos(null), null);
  assert.equal(P.cleanPos([1, 2, 3]), null);
  const bare = P.cleanPos({ x: 0, y: 0, z: 0, fx: 'a', fy: 2, m: 1, a: 'dance', n: 1000 });
  assert.deepEqual(bare, { x: 0, y: 0, z: 0, fx: 0, fy: 1, m: false, sign: false, a: null, n: 0 });
  assert.equal(P.cleanPos({ ...pos, gear: 4 }).gear, undefined);
  assert.equal(P.cleanPos({ ...pos, gear: -1 }).gear, undefined);
  assert.equal(P.cleanPos({ ...pos, gear: 0 }).gear, 0);
  assert.equal(P.cleanPos({ ...pos, n: -1 }).n, 0);
  assert.equal(P.cleanPos({ ...pos, n: 0 }).n, 0);
  assert.equal(P.cleanPos({ ...pos, n: 1.5 }).n, 0);
  assert.equal(P.cleanPos({ ...pos, sign: true }).sign, true);
  assert.equal(P.cleanPos({ ...pos, fx: -1 }).fx, -1);
});

test('protocol parse and byteLength: messages are measured as UTF-8 bytes', () => {
  assert.equal(P.byteLength('a'), 1);
  assert.equal(P.byteLength('\u007f'), 1);
  assert.equal(P.byteLength('\u0080'), 2);
  assert.equal(P.byteLength('ą'), 2);
  assert.equal(P.byteLength('߿'), 2);
  assert.equal(P.byteLength('ࠀ'), 3);
  assert.equal(P.byteLength('€'), 3);
  assert.equal(P.byteLength('🍄'), 4);
  assert.equal(P.byteLength('a🍄b'), 6);
  assert.equal(P.byteLength(String.fromCharCode(0xd800, 0xdc00)), 4, 'the first surrogate pair');
  assert.equal(P.byteLength('􏿿'), 4, 'the last surrogate pair');
  assert.equal(P.byteLength('\udc00'), 3, 'a lone low surrogate');
  assert.equal(P.byteLength(''), 3);
  const msg = JSON.stringify({ t: 'hi', s: 'ąą' }); // 19 characters, 21 bytes
  assert.deepEqual(P.parse(msg, 21), { t: 'hi', s: 'ąą' });
  assert.equal(P.parse(msg, 20), null, 'too many bytes, though few enough characters');
  assert.equal(P.parse(msg, 18), null);
  assert.equal(P.parse('{"t":1}'), null, 'the type is a string');
  assert.equal(P.parse('[]'), null);
  assert.equal(P.parse('null'), null);
  assert.equal(P.parse('{'), null);
  assert.equal(P.parse(7), null);
});

// Fields that fit another kind, or a name that is a list holding one: a
// check that looked only at the length, or let a list pass as its text,
// would take them.
test('protocol cleaners: one kind is never taken for another', () => {
  for (const e of [
    ['p', 7, 200],
    ['m', 7, 'lamp'],
    ['m', 'garden', 1, -2, -3],
    ['x', ['garden'], 1, -2, -3],
    ['x', 'garden', 1, -2, -3, 1234567890123456],
    ['m', 1, 2, -3, 4, 5],
    ['v', 1, 2, -3, 4, 5, 6],
    ['p', 7, ['lamp']]
  ])
    assert.equal(P.cleanEdit(e), null, JSON.stringify(e));
  for (const a of [
    ['p', 1, 0, 0, 0, 'garden', 5, 6],
    ['b', 1, 0, 0, 0, ['garden'], 5, 6],
    ['b', 1, 0, 0, 0, 1, 2, 3, 4],
    ['w', 1, 0, 0, 0, 'lamp'],
    ['p', 1, 0, 0, 0, ['lamp']],
    ['u', 1, 0, 0, 0, ['boots']],
    ['w', 1, 0, 0, 0, 5, 6],
    ['b', 1, 0, 0, 0, 'garden', 5, 6, 7],
    ['v', 1, 0, 0, 0, 1, 2, 3, 4, 5],
    ['u', 1, 0, 0, 0, 'boots', 1]
  ])
    assert.equal(P.cleanAct(a), null, JSON.stringify(a));
  // What comes back is a copy: the room keeps it, the message is let go.
  for (const e of [
    ['x', 'garden', 1, -2, -3],
    ['v', 1, 2, -3, 4, 5]
  ])
    assert.notEqual(P.cleanEdit(e), e);
});

test('protocol cleanActs: a whole message of acts, or none of it', () => {
  const w = ['w', 1, 0, 0, 0];
  const most = Array.from({ length: P.LIMITS.actsPerMessage }, () => w);
  assert.equal(P.cleanActs(most).length, P.LIMITS.actsPerMessage);
  assert.equal(P.cleanActs([...most, w]), null, 'one more than a message holds');
  assert.equal(P.cleanActs({ length: 1, 0: w }), null);
  assert.equal(P.cleanActs([w, ['q']]), null, 'one bad act drops the message');
  assert.deepEqual(P.cleanActs([]), []);
});

test('protocol: a facing that is not a number faces nowhere, and a message may fill its limit', () => {
  const pos = { x: 0, y: 0, z: 0 };
  assert.equal(P.cleanPos({ ...pos, fx: NaN }).fx, 0);
  assert.equal(P.cleanPos({ ...pos, fy: Infinity }).fy, 0);
  const msg = JSON.stringify({ t: 'hi' });
  assert.deepEqual(P.parse(msg, msg.length), { t: 'hi' }, 'exactly at the limit');
  assert.equal(P.parse(msg, msg.length - 1), null);
});
