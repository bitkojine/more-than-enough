/* The moderator's page (server/src/admin.js): it names worlds and players
 * as the game does, runs only its own script, and holds nothing secret. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adminPage, worldOf, isSmokeTest } from '../../server/src/admin.js';
import { nameNumbers, nameWord, PLAYER_NAMES } from '../../src/net/naming.js';
import en from '../../src/i18n/en.js';
import lt from '../../src/i18n/lt.js';

const ROOM = 'ZixSTX1BMH-ibklLzCMCqA';

test('admin: worlds and players are named in English and Lithuanian, as in the game', () => {
  // Two ids that pick the same name: the lower colour keeps it, the other takes the next.
  const a = '00000000aaaaaaaa', b = '00000018bbbbbbbb'; // 0 and 24 both give PLAYER_NAMES[0]
  const w = worldOf({ id: ROOM, seed: 1, last: 0 }, [{ id: b, c: 2 }, { id: a, c: 1 }], []);
  const byId = Object.fromEntries(w.players.map((p) => [p.id, p.name]));
  assert.equal(byId[a].en, en['together.name.' + PLAYER_NAMES[0]]);
  assert.equal(byId[b].lt, lt['together.name.' + PLAYER_NAMES[1]]);
  assert.match(w.name.en, /^\S+ \S+$/);
  assert.notEqual(w.name.lt, w.name.en);
  // A tombstone keeps its name, so a living player can't take it.
  const g = worldOf({ id: ROOM, seed: 1, last: 0 }, [{ id: b, c: 2 }], [[a, 1, 0, 0, 0, 'ban']]);
  assert.equal(g.players[0].name.en, en['together.name.' + PLAYER_NAMES[1]]);
});

test('admin: names past the last one come round numbered', () => {
  const ids = Array.from({ length: PLAYER_NAMES.length + 1 }, (_, i) => [i.toString(16).padStart(8, '0') + 'ffffffff', i]);
  const k = nameNumbers(ids).get(ids.at(-1)[0]);
  assert.deepEqual(nameWord(k), { key: 'together.name.' + PLAYER_NAMES[0], n: 2 });
});

test('admin: the smoke test\'s worlds are told apart by the server\'s mark, never by their seed', () => {
  assert.equal(isSmokeTest({ smk: true, seed: 12345 }), true);
  assert.equal(isSmokeTest({ smk: true, seed: 2275619781 }), true);
  assert.equal(isSmokeTest({ smk: false, seed: 12345 }), false);
  assert.equal(isSmokeTest({ seed: 12345 }), false, 'the seed alone says nothing');
});

test('admin: the page runs only its own script and style, and writes no HTML from data', async () => {
  const { html, headers } = await adminPage();
  const csp = headers['Content-Security-Policy'];
  const hash = (text) => "'sha256-" + createHash('sha256').update(text).digest('base64') + "'";
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const style = html.match(/<style>([\s\S]*)<\/style>/)[1];
  assert.ok(csp.includes('script-src ' + hash(script)), 'the script\'s hash is in the CSP');
  assert.ok(csp.includes('style-src ' + hash(style)), 'the style\'s hash is in the CSP');
  for (const rule of ["default-src 'none'", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(rule), rule);
  assert.doesNotMatch(csp, /unsafe/);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, 'data goes in as text only');
  assert.doesNotMatch(html, /[0-9a-f]{32,}/, 'nothing token-like in the page');
});

test('admin: the page opens the copy links the room service makes', async () => {
  const { html } = await adminPage();
  const re = new RegExp(html.match(/if \(!\/(\^https.*?\$)\/\.test\(c\.link\)\)/)[1]);
  const link = 'https://play.robertasrudys.com/#copy=' + 'a'.repeat(22) + '.' + 'f'.repeat(64);
  assert.match(link, re);
  assert.match(link + '&of=' + ROOM, re, 'with the real world (v0.103.2)');
  assert.doesNotMatch('javascript:alert(1)//#copy=' + 'a'.repeat(22) + '.' + 'f'.repeat(64), re);
  assert.doesNotMatch(link + '&of=<b>', re);
});
