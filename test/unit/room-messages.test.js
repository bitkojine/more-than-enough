// What the room sends is checked before it touches the game
// (src/game/room-messages.js). A room service one version ahead may add
// fields; anything malformed, oversized or spoofed is refused whole, except
// tombstones, which only mark places and never keep anyone out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playedTime,
  cleanInvites,
  cleanPlayers,
  cleanGraves,
  cleanWelcome,
  cleanAway
} from '../../src/game/room-messages.js';
import { INVITE_DEFAULT, LIMITS } from '../../src/net/protocol.js';
import { AWAY_CAP, RESOURCES } from '../../src/core/index.js';

const ID = '0123456789abcdef';
const CODE = 'A'.repeat(22);
const POS = { x: 1.5, y: -2, z: 0 };

test('playedTime reads the play time of a progress string, -1 when it has none', () => {
  assert.equal(playedTime(JSON.stringify({ stats: { playedMs: 1234 } })), 1234);
  assert.equal(playedTime(JSON.stringify({ stats: {} })), -1);
  assert.equal(playedTime(JSON.stringify({ stats: { playedMs: '9' } })), -1);
  assert.equal(playedTime('not json'), -1);
  assert.equal(playedTime(null), -1);
});

test('invite links: well-formed rows come through, a list from before `max` gets the default', () => {
  const row = [CODE, ID, 1000, 2000, 1, false, 5];
  assert.deepEqual(cleanInvites([row]), [
    { code: CODE, by: ID, made: 1000, until: 2000, uses: 1, off: false, max: 5 }
  ]);
  assert.equal(cleanInvites([row.slice(0, 6)])[0].max, INVITE_DEFAULT.uses);
  // A newer room service may add columns: they're ignored.
  assert.equal(cleanInvites([[...row, 'later', 42]])[0].max, 5);
  assert.deepEqual(cleanInvites([]), []);
});

test('invite links: one bad row refuses the whole list', () => {
  const ok = [CODE, ID, 1000, 2000, 1, false, 5];
  const bad = [
    [CODE.slice(1), ID, 1000, 2000, 1, false, 5], // short code
    [CODE, 'nothex!!nothex!!', 1000, 2000, 1, false, 5],
    [CODE, ID, 1.5, 2000, 1, false, 5],
    [CODE, ID, 1000, 2000, -1, false, 5], // negative uses
    [CODE, ID, 1000, 2000, 1, 'no', 5],
    [CODE, ID, 1000, 2000, 1, false, 0], // no uses allowed at all
    [CODE, ID, 1000, 2000, 1], // too short
    'row'
  ];
  for (const b of bad) assert.equal(cleanInvites([ok, b]), null, JSON.stringify(b));
  assert.equal(cleanInvites('list'), null);
  assert.equal(cleanInvites(Array(101).fill(ok)), null, 'more than 100 rows');
});

test('players: colour, status and position are checked; one bad player refuses them all', () => {
  const out = cleanPlayers({ [ID]: { c: 3, st: 'away', p: POS } });
  assert.equal(out.get(ID).c, 3);
  assert.equal(out.get(ID).st, 'away');
  assert.equal(out.get(ID).p.x, 1.5);
  assert.equal(cleanPlayers({ [ID]: { c: 3, st: 'online' } }).get(ID).p, null);
  for (const p of [
    { c: -1, st: 'online' },
    { c: LIMITS.players, st: 'online' },
    { c: 1, st: 'dancing' },
    null
  ])
    assert.equal(cleanPlayers({ [ID]: p }), null, JSON.stringify(p));
  assert.equal(cleanPlayers({ 'not-an-id': { c: 1, st: 'online' } }), null);
  assert.equal(cleanPlayers([]), null, 'an array is not a player table');
  assert.equal(cleanPlayers(null), null);
});

test('players: a room listing more than the room limit is refused', () => {
  const many = {};
  for (let i = 0; i <= LIMITS.players; i++)
    many[i.toString(16).padStart(16, '0')] = { c: i % LIMITS.players, st: 'online' };
  assert.equal(cleanPlayers(many), null);
});

test('tombstones: good ones mark places; a bad list is dropped, never refused', () => {
  assert.deepEqual(cleanGraves([[ID, 2, 4, 5, -1, 'ice']]), [
    { id: ID, c: 2, x: 4, y: 5, z: -1, k: 'ice' }
  ]);
  for (const g of [
    [ID, 2, 4, 5, -1, 'deleted'], // only ban and freeze leave tombstones
    ['nobody', 2, 4, 5, -1, 'ban'],
    [ID, -3, 4, 5, -1, 'ban'],
    [ID, 2, 'x', 5, -1, 'ban'],
    [ID, 2, 4, 5]
  ])
    assert.deepEqual(cleanGraves([[ID, 1, 0, 0, 0, 'ban'], g]), [], JSON.stringify(g));
  assert.deepEqual(cleanGraves(Array(301).fill([ID, 1, 0, 0, 0, 'ban'])), []);
  assert.deepEqual(cleanGraves('graves'), []);
});

const welcomeMsg = (extra = {}) => ({
  you: ID,
  c: 0,
  seed: 42,
  mods: [],
  props: [],
  ext: [],
  players: { [ID]: { c: 0, st: 'online', p: POS } },
  save: null,
  fmt: 1,
  ...extra
});

test('welcome: a minimal welcome becomes the world, with safe defaults for what older rooms leave out', () => {
  const w = cleanWelcome(welcomeMsg());
  assert.equal(w.you, ID);
  assert.equal(w.seed, 42);
  assert.equal(w.gen, 0);
  assert.equal(w.save, null);
  assert.equal(w.p, null);
  assert.equal(w.time, null);
  assert.deepEqual(w.graves, []);
  assert.equal(w.moves, false, 'only a room that checks moves lets buildings move');
  assert.equal(w.collectAt, false);
  assert.ok(w.players instanceof Map);
});

test('welcome: flags must be exactly true, the save must parse, the clock must fit', () => {
  const w = cleanWelcome(
    welcomeMsg({ moves: 'yes', collectAt: 1, save: '{"stats":{}}', time: 12.5, p: POS })
  );
  assert.equal(w.moves, false);
  assert.equal(w.collectAt, false);
  assert.equal(w.save, '{"stats":{}}');
  assert.equal(w.time, 12.5);
  assert.equal(w.p.y, -2);
  assert.equal(cleanWelcome(welcomeMsg({ moves: true })).moves, true);
});

test('welcome: a spoofed or broken welcome is refused whole', () => {
  for (const extra of [
    { you: 'someone else' },
    { c: -1 },
    { seed: 0 }, // not a world seed
    { players: [] },
    { gen: -1 },
    { gen: 1.5 },
    { fmt: undefined },
    { fmt: '1' },
    { save: 'not json' },
    { save: '[]' } // progress is an object
  ])
    assert.equal(cleanWelcome(welcomeMsg(extra)), null, JSON.stringify(extra));
  assert.equal(cleanWelcome(welcomeMsg({ save: 'x'.repeat(LIMITS.saveBytes + 1) })), null);
});

test('time away: what buildings made, capped at the away limit; anything odd is ignored', () => {
  const made = Object.fromEntries(RESOURCES.map((r, i) => [r, i]));
  const a = cleanAway({ secs: AWAY_CAP * 10, made });
  assert.equal(a.secs, AWAY_CAP, 'never more than the cap');
  assert.deepEqual(a.made, made);
  assert.deepEqual(
    cleanAway({ secs: 5, made: {} }).made,
    Object.fromEntries(RESOURCES.map((r) => [r, 0]))
  );
  for (const d of [
    null,
    { secs: -1, made },
    { secs: NaN, made },
    { secs: Infinity, made },
    { secs: 5 },
    { secs: 5, made: { [RESOURCES[0]]: -1 } },
    { secs: 5, made: { [RESOURCES[0]]: Infinity } }
  ])
    assert.equal(cleanAway(d), null, JSON.stringify(d));
});
