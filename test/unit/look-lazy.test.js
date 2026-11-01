import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPack, svgSize } from '../../src/game/look/look.js';

const svg = (attrs) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect/></svg>`;

test('an inline picture says its size from its root svg', () => {
  assert.deepEqual(svgSize(svg('width="64" height="32" viewBox="0 0 64 32"')), {
    width: 64,
    height: 32
  });
  assert.deepEqual(svgSize(svg('width="12.5px" height="10"')), { width: 12.5, height: 10 });
  assert.equal(svgSize(svg('viewBox="0 0 64 64"')), null, 'no width or height: decode it to know');
  assert.equal(svgSize(svg('stroke-width="3" height="4"')), null, 'stroke-width is not width');
  assert.equal(svgSize('<g/>'), null);
});

test('inline pictures are decoded only when first drawn', async () => {
  const made = [];
  const previous = globalThis.Image;
  globalThis.Image = class {
    set src(url) {
      made.push(url);
      this.naturalWidth = 64;
      this.naturalHeight = 32;
      queueMicrotask(() => this.onload());
    }
  };
  try {
    const json = {
      tile: 64,
      looks: {
        'a.thing': { image: svg('width="64" height="32"') },
        'b.thing': { image: svg('width="128" height="128"') }
      }
    };
    const { pack, problems } = await loadPack(json, 'https://example.test/pack.json?v=1');
    assert.deepEqual(problems, []);
    assert.equal(made.length, 0, 'nothing decoded at load');
    const a = pack.slots.get('a.thing').image.pics[0];
    const b = pack.slots.get('b.thing').image.pics[0];
    assert.equal(a.units, 1);
    assert.equal(a.aspect, 0.5);
    assert.equal(b.units, 2);
    assert.equal(a.want(), false, 'first ask starts it');
    assert.equal(a.img, null);
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(a.want(), true);
    assert.equal(a.img.naturalWidth, 64);
    assert.equal(made.length, 1, 'only the picture asked for');
  } finally {
    globalThis.Image = previous;
  }
});
