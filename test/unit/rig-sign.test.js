// Every player is 3D Mica (Watch, 2026-11-08): holding the invite sign, the
// rig's own mittens grip its bottom edge, and asleep Mica's eyes are shut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../src/vendor/three/three.module.js';
import { createRigModel } from '../../src/game/render/rig-model.js';
import { MITTENS } from '../../src/game/render/rig-limbs.js';
const rig = createRigModel();
const at = (name) => rig.scene.getObjectByName(name).getWorldPosition(new T.Vector3());

test('holding the sign up, both mittens are out in front at one height', () => {
  rig.pose({ steady: true });
  const restLeft = at('leftHand'),
    restRight = at('rightHand');
  rig.pose({ steady: true, sign: true });
  const left = at('leftHand'),
    right = at('rightHand');
  assert.ok(left.y > restLeft.y + 0.2 && right.y > restRight.y + 0.2, 'raised');
  assert.ok(left.z > 0.3 && right.z > 0.3, 'in front of the coat, toward you');
  assert.ok(Math.abs(left.y - right.y) < 0.01, 'level, like the board they hold');
  assert.ok(left.distanceTo(right) > 0.3, 'apart, one at each side of the edge');
  // The sign is centred on the point between them.
  const mid = rig.marks().hand;
  assert.ok(mid.distanceTo(left.clone().lerp(right, 0.5)) < 1e-6);
});

test('only the mittens are on the layer drawn over the sign', () => {
  const layer = new T.Layers();
  layer.set(MITTENS);
  const on = [];
  rig.scene.traverse((o) => {
    if (o.isMesh && o.layers.test(layer)) on.push(o.parent.name);
  });
  assert.deepEqual([...new Set(on)].sort(), ['leftHand', 'rightHand']);
  assert.equal(on.length, 4, 'a mitten and a thumb on each hand');
});

test('asleep, Mica shuts their eyes', () => {
  const eyes = () => {
    const out = [];
    rig.scene.getObjectByName('head').traverse((o) => {
      if (o.isMesh && Math.abs(o.scale.x - 0.034) < 1e-9) out.push(o.scale.y);
    });
    return out;
  };
  rig.pose({ steady: true });
  const open = eyes();
  rig.pose({ steady: true, asleep: true });
  const shut = eyes();
  assert.equal(open.length, 2);
  for (let i = 0; i < 2; i++) assert.ok(shut[i] < open[i] * 0.2);
});

test('another player wears their own colour, a shade darker; nobody else is orange', async () => {
  const { coatColours, COAT, PATCH } = await import('../../src/game/render/rig-colours.js');
  assert.deepEqual(coatColours(null), { coat: COAT, patch: PATCH }, 'Mica alone keeps orange');
  assert.deepEqual(coatColours('nonsense'), { coat: COAT, patch: PATCH });
  const { coat, patch } = coatColours('#6fb7ff');
  assert.equal(coat, 0x5b96d1);
  assert.ok(patch > coat, 'the patch a little lighter');
  const hood = () => {
    let colour = null;
    rig.scene.getObjectByName('head').traverse((o) => {
      if (colour === null && o.isMesh && o.material.side === T.FrontSide) colour = o.material.color;
    });
    return colour.getHex(T.SRGBColorSpace);
  };
  rig.pose({ coat: '#6fb7ff' });
  assert.equal(hood(), 0x5b96d1);
  rig.pose({});
  assert.equal(hood(), COAT, 'and back to orange for the next one drawn');
});
