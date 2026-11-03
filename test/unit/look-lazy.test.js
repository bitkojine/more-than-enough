import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPack,
  svgSize,
  setPictureRetryPause,
  PICTURE_TRIES
} from '../../src/game/look/look.js';

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

test('a picture that fails to load is tried again, and reported only when every try fails', async () => {
  let fail = 2;
  const made = [];
  const faults = [];
  const waits = [];
  const previous = { Image: globalThis.Image, fault: globalThis.MTE_FAULT };
  globalThis.MTE_FAULT = (err, where) => faults.push(where);
  globalThis.Image = class {
    set src(url) {
      made.push(url);
      this.naturalWidth = 64;
      this.naturalHeight = 64;
      queueMicrotask(() => (fail-- > 0 ? this.onerror() : this.onload()));
    }
  };
  setPictureRetryPause(async (ms) => waits.push(ms));
  const settle = () => new Promise((r) => setTimeout(r, 0));
  try {
    const { pack } = await loadPack(
      { tile: 64, looks: { 'a.thing': { image: svg('width="64" height="64"') } } },
      'https://example.test/pack.json'
    );
    const a = pack.slots.get('a.thing').image.pics[0];
    assert.equal(a.want(), false);
    await settle();
    assert.equal(made.length, 3, 'two failures, then a third try');
    assert.deepEqual(waits, [1000, 2000], 'each wait twice as long');
    assert.equal(a.want(), true, 'the third try drew it');
    assert.deepEqual(faults, [], 'a failure that recovered is not a problem');

    fail = Infinity;
    const { pack: other } = await loadPack(
      { tile: 64, looks: { 'b.thing': { image: svg('width="32" height="32"') } } },
      'https://example.test/pack.json'
    );
    const b = other.slots.get('b.thing').image.pics[0];
    for (let i = 0; i < 5; i++) {
      b.want();
      await settle();
    }
    assert.deepEqual(faults, ['picture'], 'reported once, after the last try');
    assert.equal(made.length, 3 + PICTURE_TRIES, 'four tries, then it stops asking');

    // A picture loaded at boot (a file, or one that doesn't say its size)
    // gets the same tries before the pack counts as broken.
    fail = 3;
    made.length = 0;
    const { pack: eager, problems } = await loadPack(
      { tile: 64, looks: { 'c.thing': { image: 'c.svg' } } },
      'https://example.test/pack.json'
    );
    assert.deepEqual(problems, []);
    assert.ok(eager);
    assert.equal(made.length, 4);
  } finally {
    globalThis.Image = previous.Image;
    globalThis.MTE_FAULT = previous.fault;
    setPictureRetryPause((ms) => new Promise((r) => setTimeout(r, ms)));
  }
});
