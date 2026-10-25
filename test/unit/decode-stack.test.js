import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { decodeMappings, lookup, framesIn } from '../../scripts/decode-stack.mjs';

test("a minified stack frame maps back to the source line it came from", async () => {
  const source = ['export function drawFog(ctx) {', '  const a = 1;', '  return ctx.createPattern(a);', '}', ''].join('\n');
  const out = await esbuild.transform(source, { minify: true, sourcemap: 'external', sourcefile: 'render/fog.js', format: 'esm' });
  const map = JSON.parse(out.map);
  const at = out.code.indexOf('createPattern');
  const line = out.code.slice(0, at).split('\n').length;
  const column = at - out.code.lastIndexOf('\n', at - 1); // 1-based, as stacks print it
  const found = lookup(map, decodeMappings(map.mappings), line, column);
  assert.equal(found.source, 'render/fog.js');
  assert.equal(found.line, 3);
});

test("a report's frames are found once each, in Safari's and Chrome's styles", () => {
  const text = [
    'createPattern@[native code]',
    'Tu@https://play.robertasrudys.com/src/game/main.js:3:224345',
    'Tu@https://play.robertasrudys.com/src/game/main.js:3:224345',
    '  at frame (https://play.robertasrudys.com/src/game/main.js?v=abc:14:12534)'
  ].join('\n');
  const frames = framesIn(text).map(([, f]) => [f.url, f.line, f.column]);
  assert.deepEqual(frames, [
    ['https://play.robertasrudys.com/src/game/main.js', 3, 224345],
    ['https://play.robertasrudys.com/src/game/main.js', 14, 12534]
  ]);
});
