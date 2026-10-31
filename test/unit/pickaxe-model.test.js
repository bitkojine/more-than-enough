import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPickaxeModel } from '../../src/game/render/pickaxe-model.js';
const file = (p) => readFileSync(new URL('../../' + p, import.meta.url));
test('baked pickaxe icons match the canonical model and recorded tier images', () => {
  const manifest = JSON.parse(file('art/characters/pickaxe-model.json'));
  const sha = (p) => createHash('sha256').update(file(p)).digest('hex');
  assert.equal(
    sha(manifest.source),
    manifest.sourceSha256,
    'regenerate icons when the canonical model changes'
  );
  assert.deepEqual(
    manifest.assets.map((a) => a.tier),
    [1, 2, 3, 4, 5, 6]
  );
  for (const a of manifest.assets)
    assert.equal(sha(a.file), a.sha256, a.file + ' must be generated from the same model revision');
  assert.equal(new Set(manifest.assets.map((a) => a.sha256)).size, 6);
});
test('tool geometry stays finite and hand-sized; empty hands create no asset', () => {
  assert.equal(createPickaxeModel(0), null);
  for (let level = 1; level <= 6; level++) {
    const asset = createPickaxeModel(level),
      geometry = asset.root.children[0].geometry;
    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    assert.ok(
      b.max.y - b.min.y < 0.85 && b.max.y - b.min.y > 0.6,
      'fits the character and icon camera'
    );
    assert.ok(
      b.max.x - b.min.x < 0.8 && b.max.z - b.min.z < 0.2,
      'no oversized head or hidden depth'
    );
    assert.deepEqual(asset.grip.toArray(), [0, 0, 0]);
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
    assert.equal(asset.root.children.length, 1, 'one flat fill draw per tier, no ink hull');
    asset.dispose();
  }
});
