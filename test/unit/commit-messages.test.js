import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyOf, problem, SMALL } from '../../scripts/commit-messages.mjs';

const TRAILERS = '\n\nCo-Authored-By: Someone <a@b.c>\nClaude-Session: https://example.com/s';

test('trailers and blank lines are not an explanation', () => {
  assert.deepEqual(bodyOf('Fix the thing' + TRAILERS), []);
  assert.deepEqual(bodyOf('Fix the thing\n\nIt broke because of X.' + TRAILERS), [
    'It broke because of X.'
  ]);
});

test('a big change needs a body; a small one, a merge or an explained one does not', () => {
  assert.match(problem({ message: 'Release 1.2.3' + TRAILERS, changed: SMALL + 1 }), /no body/);
  assert.equal(problem({ message: 'Typo', changed: SMALL }), null);
  assert.equal(problem({ message: 'Merge x', changed: 500, parents: 2 }), null);
  assert.equal(problem({ message: 'Split it\n\nBecause it was too long.', changed: 500 }), null);
});

test('a body line that only looks like prose but is a trailer still counts as missing', () => {
  assert.ok(problem({ message: 'Big change\n\nSigned-off-by: me', changed: 100 }));
  // A sentence with a colon later on is prose, not a trailer.
  assert.equal(problem({ message: 'Big change\n\nNote that: it moved', changed: 100 }), null);
});
