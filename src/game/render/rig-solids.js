/* Mica's solid parts and where they are meant to touch, for the clip test
 * (rig-clips.js): every visible mesh grouped into the solids that must never
 * pass through one another, and the joints and seams where two may meet.
 * `p` is rig-model.js's live view of its parts. */
import * as T from '../../vendor/three/three.module.js';

export const WIKI_ROOT = 0.13,
  WIKI_NECK = 0.1,
  SHOULDER = 0.17,
  COWL = 0.21,
  ELBOW = 0.13,
  KNEE = 0.11,
  ANKLE = 0.11,
  NECK = 0.3;

// Every visible mesh, grouped into the solid things that must never pass
// through one another (rig-clips.js). A group is one rigid or jointed piece.
export function solidsOf(scene, p) {
  const owner = new Map([
    [p.coat, 'coat'],
    [p.hem, 'coat'],
    [p.patch, 'coat'],
    [p.neck, 'collar'],
    [p.head, 'head'],
    [p.wiki.root, 'wiki'],
    [p.wiki.body, 'wiki'],
    [p.wiki.base, 'wikiFeet'],
    [p.leftArm.upper, 'leftArm'],
    [p.rightArm.upper, 'rightArm'],
    [p.leftArm.hand, 'leftHand'],
    [p.rightArm.hand, 'rightHand'],
    [p.leftLeg.upper, 'leftLeg'],
    [p.rightLeg.upper, 'rightLeg'],
    [p.toolGrip, 'pickaxe'],
    [p.toolBack, 'pickaxe'],
    [p.basketGrip, 'basket'],
    [p.basketBack, 'basket'],
    [p.lanternModel.root, 'lantern'],
    [p.flareModel.root, 'flare'],
    [p.cargoRoot, 'cargo']
  ]);
  const groups = new Map();
  scene.traverseVisible((o) => {
    if (!o.isMesh) return;
    let a = o;
    while (a && !owner.has(a)) a = a.parent;
    if (!a) return;
    const name = owner.get(a);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(o);
  });
  return [...groups].map(([name, meshes]) => ({ name, meshes }));
}

// Where two solids are meant to meet: a joint (the whole pair) or a seam
// near one point. A hand only meets the gear it is holding right now.
export function contactsOf(p) {
  const at = (b) => b.getWorldPosition(new T.Vector3()),
    list = [
      ['leftArm', 'leftHand'],
      ['rightArm', 'rightHand'],
      ['collar', 'coat'],
      ['collar', 'head']
    ].map(([a, b]) => ({ a, b }));
  // The p.coat and collar close over the shoulder, and the hood's cowl drapes
  // a little further down over it.
  for (const [side, arm] of [
    ['left', p.leftArm],
    ['right', p.rightArm]
  ])
    for (const [b, r] of [
      ['coat', SHOULDER],
      ['collar', SHOULDER],
      ['head', COWL]
    ])
      list.push({ a: side + 'Arm', b, at: at(arm.upper), r }); // i18n-ok: solid names for the clip test.
  // Bending joints: elbows, knees and ankles, where a limb's two segments meet.
  for (const [side, arm] of [
    ['left', p.leftArm],
    ['right', p.rightArm]
  ])
    list.push({ a: side + 'Arm', b: side + 'Arm', at: at(arm.lower), r: ELBOW }); // i18n-ok: solid names for the clip test.
  for (const [side, leg] of [
    ['left', p.leftLeg],
    ['right', p.rightLeg]
  ])
    list.push(
      // i18n-ok: solid names for the clip test.
      { a: side + 'Leg', b: side + 'Leg', at: at(leg.lower), r: KNEE },
      // i18n-ok: solid names for the clip test.
      { a: side + 'Leg', b: side + 'Leg', at: at(leg.foot), r: ANKLE }
    );
  // The hood's rim tucks into the p.coat around the p.neck.
  list.push({ a: 'head', b: 'coat', at: at(p.neck), r: NECK });
  // Wiki's fibre feet grow out of its stalk and hold onto the hood.
  list.push(
    { a: 'wikiFeet', b: 'head' },
    { a: 'wikiFeet', b: 'wiki', at: at(p.wiki.base), r: WIKI_ROOT },
    { a: 'wiki', b: 'wiki', at: at(p.wiki.cap), r: WIKI_NECK }
  );
  const held = p.equippedPickaxe && p.equippedPickaxe.root.parent === p.toolGrip;
  if (held) list.push({ a: 'rightHand', b: 'pickaxe' });
  if (p.basketHeld) list.push({ a: 'leftHand', b: 'basket' });
  if (p.cargoKind) list.push({ a: 'leftHand', b: 'cargo' }, { a: 'rightHand', b: 'cargo' });
  if (p.renderedAction === 'collect' && p.renderedWork === 'lantern')
    list.push({ a: 'leftHand', b: 'lantern' });
  if (p.flareHand && p.flareModel.root.visible) list.push({ a: p.flareHand + 'Hand', b: 'flare' }); // i18n-ok: solid names for the clip test.
  return list;
}
