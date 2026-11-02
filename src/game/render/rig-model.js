/* Mica's rigged model: bones, meshes and carried gear, posed without a
 * renderer. rigged-character.js draws it; rig-clips.js proves no two solid
 * parts pass through each other, in tests and in the dev viewer.
 * Model faces +Z; +X is its anatomical left. */
import * as T from '../../vendor/three/three.module.js';
import { rigPose } from './rig-motion.js';
import { createPickaxeModel, pickaxeTier } from './pickaxe-model.js';
import { characterDirection, CHARACTER_DIRECTIONS } from './character-direction.js';
import { miningStroke, workHands, workWeight, WORK_HANDS } from './work-motion.js';
import { createBasketModel, createLanternModel, createFlareModel } from './work-equipment.js';
import { createWikiModel } from './wiki-model.js';
import { wrapAngle } from './wiki-motion.js';
import { poseArm, poseLeg, buildArm, buildLeg, REST_SPREAD } from './rig-limbs.js';
import { solidsOf, contactsOf } from './rig-solids.js';
import {
  coatRadius,
  besideCoat,
  HIPS_REST,
  hoodGeometry,
  faceGeometry,
  faceArchGeometry,
  collarGeometry,
  coatShellGeometry,
  hemRibbonGeometry,
  repairPatchGeometry
} from './rig-geometry.js';
export { coatRadius, besideCoat };
// The lantern's ring sits this high on the hip; its widest part hangs this far
// below the ring; the skirt sways about this much while walking.
// The flare: where it sits in the left mitten and how it leans out of it,
// and where it tucks into the belt while that hand is busy.
const FLARE_SIZE = 0.7,
  FLARE_GRIP = [0, -0.03, 0.02],
  FLARE_TILT = [0.8, 0, -1.2],
  FLARE_BELT_SIDE = -1.55,
  FLARE_BELT_Y = 0.05,
  FLARE_BELT_GAP = 0.11,
  FLARE_BELT_TILT = [0, 0, 0];
const LANTERN_SIDE = 2.2,
  LANTERN_RING = 0.16,
  LANTERN_DROP = 0.22,
  LANTERN_RADIUS = 0.09,
  SKIRT_SWAY = 0.045;
export function createRigModel() {
  const scene = new T.Scene(),
    model = new T.Group();
  scene.add(model);
  // Match the default world's painted SVGs: authored flat fills, not light
  // responses to curved surfaces. The world's day/night overlay still applies
  // to the composited character together with trees, rocks and buildings.
  const material = (color) => new T.MeshBasicMaterial({ color, toneMapped: false });
  const orange = material(0xc8743a),
    inner = material(0x1d1712),
    black = material(0x3a2a1c),
    cream = material(0xeeeadf),
    linen = material(0xded4b7),
    thread = material(0xefe1bc);
  const bones = [],
    bone = (name, parent, x = 0, y = 0, z = 0) => {
      const b = new T.Bone();
      b.name = name;
      b.position.set(x, y, z);
      parent.add(b);
      bones.push(b);
      return b;
    };
  const root = bone('root', model),
    hips = bone('hips', root, 0, HIPS_REST),
    spine = bone('spine', hips, 0, 0.38),
    neck = bone('neck', spine, 0, 0.18),
    head = bone('head', neck, 0, 0.3);
  const clothFront = bone('cloakFront', hips, 0, 0.32),
    clothBack = bone('cloakBack', hips, 0, 0.32),
    clothLeft = bone('cloakLeft', hips, 0, 0.32),
    clothRight = bone('cloakRight', hips, 0, 0.32);
  const mesh = (g, m, parent, x = 0, y = 0, z = 0) => {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const ellipsoid = (parent, m, x, y, z, rx, ry, rz) => {
    const o = mesh(new T.SphereGeometry(1, 32, 24), m, parent, x, y, z);
    o.scale.set(rx, ry, rz);
    return o;
  };
  const hood = hoodGeometry();
  mesh(hood, orange, head);
  const inside = inner.clone();
  inside.side = T.BackSide;
  mesh(hood, inside, head);
  const faceMaterial = material(0xefe1bc);
  mesh(faceGeometry(1.22, 0, 1), inner, head, 0, 0, -0.012);
  mesh(faceGeometry(), faceMaterial, head);
  // Simple facial marks remain attached to the shallow face. Eye scale supplies
  // blinking without repainting/uploading a canvas texture every frame.
  const eyes = [-0.094, 0.094].map((x) =>
    ellipsoid(head, inner, x, 0.043, 0.324, 0.034, 0.046, 0.008)
  );
  mesh(faceArchGeometry(), inner, head);
  mesh(collarGeometry(), orange, neck);
  const bodyMat = orange.clone();
  bodyMat.side = T.DoubleSide;
  // Four weighted skirt panels lag behind the torso. Outline and hem use
  // exactly the same weights, so decoration cannot float above moving cloth.
  function clothGeometry(g) {
    const skinIndices = [],
      skinWeights = [],
      v = g.attributes.position;
    for (let i = 0; i < v.count; i++) {
      const t = Math.max(0, Math.min(1, (v.getY(i) - 0.48) / 0.55)),
        a = Math.atan2(v.getX(i), v.getZ(i) / 0.76);
      const upper = Math.min(1, Math.max(0, (t - 0.25) / 0.6)),
        cloth = (1 - upper) * Math.max(0, 1 - t / 0.7);
      const side = Math.abs(Math.sin(a)),
        front = Math.abs(Math.cos(a)),
        sum = side + front || 1;
      skinIndices.push(
        bones.indexOf(hips),
        bones.indexOf(spine),
        bones.indexOf(Math.sin(a) >= 0 ? clothLeft : clothRight),
        bones.indexOf(Math.cos(a) >= 0 ? clothFront : clothBack)
      );
      skinWeights.push(1 - upper - cloth, upper, (cloth * side) / sum, (cloth * front) / sum);
    }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndices, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(skinWeights, 4));
    return g;
  }
  const coatGeometry = coatShellGeometry();
  clothGeometry(coatGeometry);
  const coat = new T.SkinnedMesh(coatGeometry, bodyMat);
  model.add(coat);
  // A narrow skinned ribbon follows the split hem exactly, including its notch.
  const hemGeometry = hemRibbonGeometry();
  clothGeometry(hemGeometry);
  const hem = new T.SkinnedMesh(hemGeometry, thread);
  model.add(hem);
  // Broad, cloth-bound repair patch. Its geometry follows the coat surface and
  // uses the same skeleton; it is not a floating inventory badge.
  const patchGeometry = repairPatchGeometry();
  clothGeometry(patchGeometry);
  const patch = new T.SkinnedMesh(patchGeometry, material(0xd18b54));
  patch.material.side = T.DoubleSide;
  model.add(patch);
  const kit = { bone, mesh, ellipsoid, spine, hips, orange, thread, black, linen, cream };
  kit.sole = material(0x66503c);
  const leftArm = buildArm(kit, 1),
    rightArm = buildArm(kit, -1),
    leftLeg = buildLeg(kit, 1),
    rightLeg = buildLeg(kit, -1);
  const toolGrip = new T.Group();
  toolGrip.position.set(0, -0.02, 0.025);
  toolGrip.rotation.set(1.9, 0, 0.12);
  rightArm.hand.add(toolGrip);
  const toolBack = new T.Group();
  toolBack.name = 'toolBack';
  toolBack.position.set(-0.186, -0.3, -0.426);
  toolBack.rotation.set(-0.346, 0.219, 0.722);
  spine.add(toolBack);
  toolBack.visible = false;
  const holster = mesh(new T.TorusGeometry(0.052, 0.012, 6, 16), black, toolBack);
  holster.rotation.x = Math.PI / 2;
  // Cargo represents only a real starter or harvested crystal already carried
  // by the player. Both objects are cached, non-emissive presentation geometry.
  const cargoRoot = new T.Group();
  cargoRoot.name = 'cargo';
  cargoRoot.position.set(0.01, -0.06, 0.41);
  spine.add(cargoRoot);
  cargoRoot.visible = false;
  const specimen = new T.Group(),
    sealed = new T.Group();
  cargoRoot.add(specimen, sealed);
  const crystalMaterial = material(0xdf69ab);
  const shard = mesh(new T.ConeGeometry(0.078, 0.22, 5), crystalMaterial, specimen, 0, 0, 0);
  shard.rotation.z = -0.15;
  const fork = mesh(
    new T.ConeGeometry(0.045, 0.13, 5),
    crystalMaterial,
    specimen,
    0.065,
    -0.015,
    0
  );
  fork.rotation.z = -0.65;
  mesh(new T.CylinderGeometry(0.13, 0.12, 0.2, 10), black, sealed);
  mesh(new T.CylinderGeometry(0.14, 0.14, 0.035, 10), linen, sealed, 0, 0.105, 0);
  mesh(new T.CylinderGeometry(0.133, 0.133, 0.018, 10), linen, sealed, 0, -0.1, 0);
  // The carrier bench's woven mycelium lining (Watch, 2026-11-01): a pale band round the middle.
  const lining = mesh(new T.CylinderGeometry(0.134, 0.128, 0.07, 10), linen, sealed, 0, 0, 0);
  const pickaxes = new Map();
  let equippedPickaxe = null;
  let cargoKind = null,
    drivingGrip = 0;
  function equipPickaxe(level, action, steady, carrying = false) {
    const tier = pickaxeTier(level);
    if (equippedPickaxe && equippedPickaxe.tier !== tier) {
      equippedPickaxe.root.removeFromParent();
      equippedPickaxe = null;
    }
    if (!tier) {
      toolBack.visible = false;
      return;
    }
    if (!pickaxes.has(tier)) {
      // The complete-figure pass supplies the tool's outer ink.
      pickaxes.set(tier, createPickaxeModel(tier));
    }
    equippedPickaxe = pickaxes.get(tier);
    const stowed =
        steady || carrying || ['build', 'pick', 'collect', 'up', 'down', 'cheer'].includes(action),
      socket = stowed ? toolBack : toolGrip;
    toolBack.visible = stowed;
    if (equippedPickaxe.root.parent !== socket) socket.add(equippedPickaxe.root);
  }
  const basketGrip = new T.Group();
  basketGrip.position.set(0, -0.015, 0.02);
  leftArm.hand.add(basketGrip);
  const basketBack = new T.Group();
  basketBack.name = 'basketBack';
  basketBack.position.set(0.061, 0.126, -0.354);
  basketBack.rotation.set(0.239, 0, 0.07);
  spine.add(basketBack);
  // The lantern hangs at the back of the left hip, just clear of the coat's
  // skirt where it flares widest beside it, so it never swings into the cloth.
  const lanternHip = new T.Group();
  lanternHip.name = 'lanternHip';
  lanternHip.position
    .copy(besideCoat(LANTERN_SIDE, LANTERN_RING - LANTERN_DROP, LANTERN_RADIUS + SKIRT_SWAY))
    .setY(LANTERN_RING);
  hips.add(lanternHip);
  const baskets = new Map();
  let equippedBasket = null,
    basketHeld = false;
  // Wiki sits on top of the hood and turns with Mica's head.
  const wiki = createWikiModel();
  wiki.root.position.set(0.05, 0.48, 0);
  wiki.root.rotation.set(-0.12, 0, -0.1);
  wiki.root.scale.setScalar(1.75);
  head.add(wiki.root);
  wiki.root.visible = false;
  const lanternModel = createLanternModel();
  lanternModel.root.name = 'lantern';
  lanternHip.add(lanternModel.root);
  lanternModel.root.visible = false;
  // A burning flare is held in the left hand. While that hand works the
  // lantern the right one takes it; while it holds the basket or the cargo,
  // it rides tucked in the belt instead.
  const flareGrip = new T.Group();
  flareGrip.name = 'flareGrip';
  flareGrip.position.set(...FLARE_GRIP);
  flareGrip.rotation.set(...FLARE_TILT);
  flareGrip.scale.setScalar(FLARE_SIZE);
  leftArm.hand.add(flareGrip);
  const flareRight = new T.Group();
  flareRight.name = 'flareRight';
  flareRight.position.set(-FLARE_GRIP[0], FLARE_GRIP[1], FLARE_GRIP[2]);
  flareRight.rotation.set(FLARE_TILT[0], -FLARE_TILT[1], -FLARE_TILT[2]);
  flareRight.scale.setScalar(FLARE_SIZE);
  rightArm.hand.add(flareRight);
  const flareBelt = new T.Group();
  flareBelt.name = 'flareBelt';
  flareBelt.position.copy(besideCoat(FLARE_BELT_SIDE, FLARE_BELT_Y, FLARE_BELT_GAP));
  flareBelt.rotation.set(...FLARE_BELT_TILT);
  flareBelt.scale.setScalar(FLARE_SIZE);
  hips.add(flareBelt);
  const flareModel = createFlareModel();
  flareModel.root.name = 'flare';
  flareGrip.add(flareModel.root);
  flareModel.root.visible = false;
  let flareHand = null;
  // `where`: 'left', 'right' or 'belt'.
  function equipFlare(lit, time, where) {
    flareModel.root.visible = !!lit;
    flareHand = lit && where !== 'belt' ? where : null;
    if (!lit) return;
    const parent = where === 'left' ? flareGrip : where === 'right' ? flareRight : flareBelt;
    if (flareModel.root.parent !== parent) parent.add(flareModel.root);
    flareModel.setBurn(time);
  }
  function equipBasket(level, held) {
    const tier = Math.max(0, Math.min(5, Math.floor(Number(level) || 0)));
    basketHeld = !!(tier && held);
    if (equippedBasket && equippedBasket.tier !== tier) {
      equippedBasket.root.removeFromParent();
      equippedBasket = null;
    }
    if (!tier) return;
    if (!baskets.has(tier)) baskets.set(tier, createBasketModel(tier));
    equippedBasket = baskets.get(tier);
    const parent = held ? basketGrip : basketBack;
    if (equippedBasket.root.parent !== parent) parent.add(equippedBasket.root);
  }
  function constrainWork(
    action,
    progress,
    { basket = false, work = null, carrying = false, flow = null } = {}
  ) {
    model.updateMatrixWorld(true);
    if (action === 'swing' && equippedPickaxe) {
      const plan = miningStroke(progress, flow),
        spineWorld = spine.getWorldQuaternion(new T.Quaternion()),
        inverse = spineWorld.clone().invert();
      const basePosition = spine.worldToLocal(toolGrip.getWorldPosition(new T.Vector3()));
      const baseQ = inverse.clone().multiply(toolGrip.getWorldQuaternion(new T.Quaternion()));
      const position = basePosition.lerp(plan.position, plan.weight),
        rotation = baseQ.slerp(plan.quaternion, plan.weight);
      const gripQ = toolGrip.quaternion.clone(),
        handQ = rotation.clone().multiply(gripQ.clone().invert());
      drivingGrip = plan.grip * plan.weight;
      const offset = new T.Vector3(0, -0.02, 0.025);
      const right = position
        .clone()
        .add(new T.Vector3(0, drivingGrip, 0).applyQuaternion(rotation))
        .sub(offset.clone().applyQuaternion(handQ));
      toolGrip.position.copy(offset).sub(new T.Vector3(0, drivingGrip, 0).applyQuaternion(gripQ));
      // One-handed: two mittens on the short shaft would always crush together.
      poseArm(rightArm, -1, right.toArray(), handQ);
      return;
    }
    const hands = carrying
      ? { weight: 1, ...WORK_HANDS.carry }
      : workHands(action, progress, {
          basket,
          work,
          flow,
          lantern: spine.worldToLocal(lanternModel.root.getWorldPosition(new T.Vector3())).toArray()
        });
    if (hands) {
      const orientation = new T.Quaternion(),
        leftOrientation = basket ? spine.quaternion.clone().invert() : orientation;
      poseArm(leftArm, 1, hands.left, leftOrientation, hands.weight);
      poseArm(rightArm, -1, hands.right, orientation, hands.weight);
    }
  }
  model.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones);
  coat.bind(skeleton);
  hem.bind(skeleton);
  patch.bind(skeleton);
  let direction = 's',
    renderedAction = null,
    renderedProgress = 0,
    renderedWork = null;

  // What the clip test needs to know (rig-clips.js, rig-solids.js), read live.
  const clipParts = {
    coat,
    hem,
    patch,
    neck,
    head,
    wiki,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    toolGrip,
    toolBack,
    basketGrip,
    basketBack,
    lanternModel,
    flareModel,
    cargoRoot,
    get equippedPickaxe() {
      return equippedPickaxe;
    },
    get basketHeld() {
      return basketHeld;
    },
    get cargoKind() {
      return cargoKind;
    },
    get renderedAction() {
      return renderedAction;
    },
    get renderedWork() {
      return renderedWork;
    },
    get flareHand() {
      return flareHand;
    }
  };
  return {
    scene,
    model,
    // Poses every bone and carried thing for one frame; the same options as draw().
    pose({
      facing = { x: 0, y: 1 },
      phase = 0,
      walking = false,
      blend = null,
      action = null,
      progress = 0,
      flow = null,
      time = 0,
      steady = false,
      pickaxe = 0,
      basket = 0,
      work = null,
      lantern = false,
      lanternOn = false,
      flare = false,
      cargo = null,
      wiki: wikiState = null
    } = {}) {
      renderedAction = action;
      renderedProgress = progress;
      renderedWork = work;
      cargoKind =
        !steady && !action && ['specimen', 'sealed', 'lined'].includes(cargo) ? cargo : null;
      cargoRoot.visible = !!cargoKind;
      specimen.visible = cargoKind === 'specimen';
      sealed.visible = cargoKind === 'sealed' || cargoKind === 'lined';
      lining.visible = cargoKind === 'lined';
      const forage = action === 'pick' && !['plant', 'tend', 'starter'].includes(work);
      // The basket is in hand only while the arm is out in front: hanging low
      // from a hand at Mica's side it would sweep through the flared skirt.
      equipBasket(basket, forage && !steady && workWeight(progress, flow) > 0.5);
      lanternModel.root.visible = !!lantern;
      lanternModel.setOn(lanternOn);
      const p = rigPose({
        phase,
        walking,
        blend,
        action,
        progress,
        time,
        steady,
        carrying: !!cargoKind
      });
      hips.position.y = p.hipY;
      spine.rotation.set(p.lean, p.twist, p.roll);
      spine.position.y = 0.38 * Math.cos(p.lean) + p.breath;
      spine.position.z = 0.38 * Math.sin(p.lean);
      if (action && Math.hypot(facing.x, facing.y) > 1e-6) {
        const yaw = Math.atan2(facing.x, facing.y),
          snap =
            Math.PI / 2 -
            (CHARACTER_DIRECTIONS.indexOf(characterDirection(facing, direction)) * Math.PI) / 4;
        spine.rotation.y +=
          Math.atan2(Math.sin(yaw - snap), Math.cos(yaw - snap)) *
          Math.sin(Math.PI * progress) ** 2;
      }
      head.rotation.set(p.headPitch, p.headYaw, p.headRoll);
      for (const eye of eyes) eye.scale.y = 0.046 * p.blink;
      clothFront.rotation.x = p.clothFront;
      clothBack.rotation.x = p.clothBack;
      clothLeft.rotation.z = p.clothLeft;
      clothRight.rotation.z = p.clothRight;
      // Use the same eight world sectors as directional sprite art. Only the
      // displayed heading snaps; movement and action targeting keep their vectors.
      direction = characterDirection(facing, direction);
      model.rotation.y = Math.PI / 2 - (CHARACTER_DIRECTIONS.indexOf(direction) * Math.PI) / 4;
      poseLeg(p.left, leftLeg, p.hipY);
      poseLeg(p.right, rightLeg, p.hipY);
      leftArm.upper.rotation.set(p.leftArm, 0, REST_SPREAD + p.armSpread);
      rightArm.upper.rotation.set(p.rightArm, 0, -REST_SPREAD - p.armSpread);
      leftArm.lower.rotation.set(p.leftElbow, 0, 0);
      rightArm.lower.rotation.set(p.rightElbow, 0, 0);
      leftArm.hand.rotation.set(p.leftWrist, 0, 0);
      rightArm.hand.rotation.set(p.rightWrist, 0, 0);
      // Wiki looks toward a world direction; turn it into hood-relative yaw.
      wiki.root.visible = !!wikiState;
      if (wikiState) {
        const look =
          wikiState.look && Math.hypot(wikiState.look.x, wikiState.look.y) > 1e-6
            ? wrapAngle(
                Math.atan2(wikiState.look.x, wikiState.look.y) -
                  model.rotation.y -
                  spine.rotation.y -
                  head.rotation.y
              )
            : null;
        wiki.pose({
          time,
          look,
          fold: wikiState.fold || 0,
          talk: wikiState.talk ?? null,
          rest: !!wikiState.rest,
          sleep: !!wikiState.sleep
        });
      }
      drivingGrip = 0;
      toolGrip.position.set(0, -0.02, 0.025);
      equipPickaxe(pickaxe, action, steady, !!cargoKind);
      equipFlare(
        flare,
        time,
        basketHeld || cargoKind
          ? 'belt'
          : action === 'collect' && work === 'lantern'
            ? 'right'
            : 'left'
      );
      if (!steady)
        constrainWork(action, progress, { basket: basketHeld, work, flow, carrying: !!cargoKind });
      scene.updateMatrixWorld(true);
      basketGrip.quaternion
        .copy(leftArm.hand.getWorldQuaternion(new T.Quaternion()))
        .invert()
        .multiply(model.getWorldQuaternion(new T.Quaternion()));
      scene.updateMatrixWorld(true);
    },
    // World points the 2D world needs: the top of the hood, the tool hand, Wiki's cap.
    marks() {
      return {
        head: new T.Vector3(0, 0.48, 0).applyMatrix4(head.matrixWorld),
        hand: rightArm.hand.getWorldPosition(new T.Vector3()),
        wiki: wiki.root.visible ? wiki.top() : null
      };
    },
    inspect() {
      const at = (b) => b.getWorldPosition(new T.Vector3()).toArray();
      return {
        work: { action: renderedAction, progress: renderedProgress },
        leftFoot: at(leftLeg.foot),
        rightFoot: at(rightLeg.foot),
        leftKnee: at(leftLeg.lower),
        rightKnee: at(rightLeg.lower),
        pickaxe: equippedPickaxe
          ? {
              tier: equippedPickaxe.tier,
              stowed: equippedPickaxe.root.parent === toolBack,
              grip: equippedPickaxe.root.localToWorld(new T.Vector3(0, drivingGrip, 0)).toArray(),
              socket:
                equippedPickaxe.root.parent === toolBack
                  ? at(toolBack)
                  : rightArm.hand.localToWorld(new T.Vector3(0, -0.02, 0.025)).toArray(),
              hand: at(rightArm.hand),
              head: equippedPickaxe.root.localToWorld(new T.Vector3(0, 0.5, 0)).toArray()
            }
          : null,
        basket: equippedBasket
          ? { tier: equippedBasket.tier, held: basketHeld, grip: at(equippedBasket.root) }
          : null,
        lantern: lanternModel.root.visible,
        flare: flareModel.root.visible
          ? {
              held: !!flareHand,
              hand: flareHand,
              tip: flareModel.root.localToWorld(new T.Vector3(0, 0.38, 0)).toArray()
            }
          : null,
        wiki: wiki.root.visible ? wiki.inspect() : null,
        lanternPosition: at(lanternModel.root),
        cargo: cargoKind,
        blink: eyes[0].scale.y / 0.046,
        leftHand: at(leftArm.hand),
        rightHand: at(rightArm.hand),
        hipY: hips.position.y,
        yaw: model.rotation.y,
        head: head.rotation.toArray().slice(0, 3),
        spine: spine.rotation.toArray().slice(0, 3),
        cloak: [
          clothFront.rotation.x,
          clothBack.rotation.x,
          clothLeft.rotation.z,
          clothRight.rotation.z
        ]
      };
    },
    solids: () => solidsOf(scene, clipParts),
    contacts: () => contactsOf(clipParts),
    bones: bones.length + wiki.bones,
    dispose() {
      for (const asset of baskets.values()) {
        asset.root.removeFromParent();
        asset.dispose();
      }
      lanternModel.root.removeFromParent();
      lanternModel.dispose();
      flareModel.root.removeFromParent();
      flareModel.dispose();
      wiki.root.removeFromParent();
      wiki.dispose();
      for (const asset of pickaxes.values()) {
        asset.root.removeFromParent();
        asset.dispose();
      }
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material)
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      });
    }
  };
}
