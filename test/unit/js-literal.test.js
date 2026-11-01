import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsLiteral } from '../support/js-literal.js';

test('jsLiteral gives back the same value and never closes a script', () => {
  for (const v of [
    '</script><script>alert(1)</script>',
    'a\u2028b\u2029c',
    { a: [1, '/x>'] },
    3,
    null
  ]) {
    const src = jsLiteral(v);
    assert.doesNotMatch(src, /[<>/\u2028\u2029]/);
    assert.deepEqual(new Function('return ' + src)(), v);
  }
  assert.equal(jsLiteral(undefined), 'undefined');
});
