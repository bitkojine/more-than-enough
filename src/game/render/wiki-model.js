/* Wiki, the mycelium sprite on Mica's hood: one small rigged model, posed by
 * wiki-motion.js. Flat fills like Mica; the shared figure outline inks it.
 * Wiki gives off no light: it is cast in plain, non-emissive colours.
 * Model faces +Z, feet at the origin. */
import * as T from '../../vendor/three/three.module.js';
import { wikiPose } from './wiki-motion.js';
const material = (color, side = T.FrontSide) =>
  new T.MeshBasicMaterial({ color, toneMapped: false, side });
export const WIKI_HEIGHT = 0.31;
const CAP_Y = 0.165,
  RIM = 0.155;
export function createWikiModel() {
  const root = new T.Group();
  root.name = 'wiki';
  const spot = material(0xf4fff9),
    stalk = material(0xf2ecd8),
    ink = material(0x1d1712),
    fibre = material(0xd9cba6);
  const bones = [],
    bone = (name, parent, y = 0) => {
      const b = new T.Bone();
      b.name = name;
      b.position.y = y;
      parent.add(b);
      bones.push(b);
      return b;
    };
  const base = bone('wikiBase', root),
    body = bone('wikiStalk', base),
    top = bone('wikiCap', body, CAP_Y),
    rim = bone('wikiRim', top);
  const add = (geometry, mat, parent, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  // A soft stalk, a little wider at the belly, rigid on the stalk bone.
  const profile = [
    [0.05, 0],
    [0.062, 0.035],
    [0.064, 0.08],
    [0.056, 0.13],
    [0.046, CAP_Y + 0.01],
    [0, CAP_Y + 0.012]
  ].map(([r, y]) => new T.Vector2(r, y));
  add(new T.LatheGeometry(profile, 24), stalk, body);
  // The cap is skinned: its crown follows the cap bone, its rim the rim bone,
  // so folding pulls the rim down and in like a closing umbrella. Gills and
  // crown are one closed surface, coloured per ring, so the rim is a fold in
  // the cloth rather than two surfaces meeting edge to edge.
  function skinnedCap(points, colors) {
    const g = new T.LatheGeometry(
        points.map(([r, y]) => new T.Vector2(r, y)),
        32
      ),
      v = g.attributes.position,
      ids = [],
      weights = [],
      tint = [];
    for (let i = 0; i < v.count; i++) {
      const r = Math.hypot(v.getX(i), v.getZ(i)),
        w = Math.min(1, Math.max(0, (r / RIM - 0.35) / 0.55));
      ids.push(bones.indexOf(top), bones.indexOf(rim), 0, 0);
      weights.push(1 - w, w, 0, 0);
      tint.push(...colors[i % points.length].toArray());
    }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(ids, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    g.setAttribute('color', new T.Float32BufferAttribute(tint, 3));
    const mesh = new T.SkinnedMesh(g, capMaterial);
    root.add(mesh);
    return mesh;
  }
  const dome = [
    [RIM, -0.004],
    [RIM * 0.99, 0.022],
    [RIM * 0.9, 0.065],
    [RIM * 0.7, 0.105],
    [RIM * 0.42, 0.13],
    [0, 0.14]
  ].map(([r, y]) => [r, CAP_Y + y]);
  const under = [
    [0.04, CAP_Y + 0.008],
    [RIM * 0.6, CAP_Y - 0.002]
  ];
  const domeHeight = (f) => {
    const r = Math.min(RIM, f * RIM);
    for (let i = 1; i < dome.length; i++) {
      const [r0, y0] = dome[i - 1],
        [r1, y1] = dome[i];
      if (r <= r0 && r >= r1) return y0 + ((y1 - y0) * (r0 - r)) / (r0 - r1 || 1) - CAP_Y;
    }
    return 0.14;
  };
  const capMaterial = new T.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    side: T.DoubleSide
  });
  const crownColor = new T.Color(0x7fe6c4),
    gillColor = new T.Color(0x4fc29d);
  // The rim ring is doubled so the colour changes on a hard edge, not a blend.
  const crown = skinnedCap(
    [...under, dome[0], ...dome],
    [...under.map(() => gillColor), gillColor, ...dome.map(() => crownColor)]
  );
  // Flat spots lie on the crown, where the cap bone alone carries them.
  root.updateMatrixWorld(true);
  for (const [a, r, size] of [
    [0.4, 0.48, 0.034],
    [2.3, 0.42, 0.028],
    [4.1, 0.36, 0.03],
    [5.6, 0.1, 0.022],
    [1.3, 0.22, 0.018]
  ]) {
    const x = Math.sin(a) * r * RIM,
      z = Math.cos(a) * r * RIM,
      h = domeHeight(r),
      normal = new T.Vector3(x / RIM ** 2, h / 0.14 ** 2, z / RIM ** 2).normalize();
    const d = add(
      new T.CircleGeometry(size, 12),
      spot,
      top,
      x + normal.x * 0.002,
      h + normal.y * 0.002,
      z + normal.z * 0.002
    );
    d.updateMatrixWorld(true);
    d.lookAt(d.getWorldPosition(new T.Vector3()).add(normal));
  }
  // Two flat oval eyes, the same eye language as Mica's mask, and a small mouth.
  const eyes = [-0.025, 0.025].map((x) => {
    const e = add(new T.SphereGeometry(1, 12, 8), ink, body, x, 0.108, 0.059);
    e.scale.set(0.013, 0.021, 0.004);
    return e;
  });
  const mouth = add(new T.SphereGeometry(1, 10, 6), ink, body, 0, 0.078, 0.062);
  mouth.scale.set(0.011, 0.008, 0.003);
  // Fibre feet: hyphae spreading onto the hood.
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * Math.PI * 2 + 0.3,
      points = [0, 0.5, 1].map(
        (t) =>
          new T.Vector3(
            Math.sin(a) * (0.035 + 0.05 * t),
            0.012 - 0.016 * t * t,
            Math.cos(a) * (0.035 + 0.05 * t)
          )
      );
    add(new T.TubeGeometry(new T.CatmullRomCurve3(points), 6, 0.007, 5, false), fibre, base);
  }
  root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones);
  crown.bind(skeleton);
  return {
    root,
    pose(options) {
      const p = wikiPose(options);
      base.position.y = p.bob;
      body.rotation.set(p.lean, p.turn, 0);
      body.scale.y = p.squash;
      top.position.y = CAP_Y - p.capDrop;
      top.rotation.set(p.capTilt, 0, 0);
      rim.position.y = -p.rimDrop;
      rim.scale.set(p.rimScale, 1, p.rimScale);
      for (const e of eyes) e.scale.y = 0.021 * p.blink;
      mouth.visible = p.mouth > 0.05;
      mouth.scale.y = 0.003 + 0.009 * p.mouth;
      return p;
    },
    // A point on top of the cap, for speech bubbles and taps.
    top: () => top.localToWorld(new T.Vector3(0, 0.15, 0)),
    inspect: () => ({
      turn: body.rotation.y,
      lean: body.rotation.x,
      fold: 1 - rim.scale.x,
      blink: eyes[0].scale.y / 0.021,
      mouth: mouth.visible
    }),
    // The fibre feet ride the base bone; the rest of Wiki rides the stalk.
    base,
    body,
    cap: top,
    bones: bones.length,
    dispose() {
      root.traverse((o) => o.geometry?.dispose());
      for (const m of [capMaterial, spot, stalk, ink, fibre]) m.dispose();
    }
  };
}
