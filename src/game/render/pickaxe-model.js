/* Canonical pickaxe asset. The hand grip is local (0,0,0); +Y points to
 * the head. World equipment and baked icons use this exact geometry. */
import * as T from '../../vendor/three/three.module.js';
export const PICKAXE_MODEL_VERSION = 1;
const ink = 0x1d1712,
  fibre = 0xd3cfb9,
  stone = 0x9aa096,
  steel = 0x809295;
const heads = [
  [
    [-0.27, 0.48],
    [-0.16, 0.57],
    [0.07, 0.56],
    [0.28, 0.43],
    [0.06, 0.46],
    [-0.11, 0.44]
  ],
  [
    [-0.31, 0.46],
    [-0.19, 0.58],
    [0.07, 0.58],
    [0.32, 0.43],
    [0.09, 0.46],
    [-0.09, 0.44],
    [-0.23, 0.4]
  ],
  [
    [-0.32, 0.43],
    [-0.27, 0.58],
    [-0.1, 0.6],
    [0.13, 0.55],
    [0.34, 0.4],
    [0.1, 0.45],
    [-0.1, 0.47],
    [-0.26, 0.4]
  ],
  [
    [-0.32, 0.43],
    [-0.21, 0.57],
    [-0.02, 0.61],
    [0.17, 0.54],
    [0.35, 0.38],
    [0.12, 0.45],
    [-0.04, 0.5],
    [-0.19, 0.48]
  ],
  [
    [-0.34, 0.43],
    [-0.25, 0.59],
    [-0.08, 0.61],
    [0.16, 0.56],
    [0.36, 0.39],
    [0.11, 0.46],
    [-0.08, 0.5],
    [-0.2, 0.45],
    [-0.25, 0.38]
  ],
  [
    [-0.35, 0.39],
    [-0.29, 0.58],
    [-0.1, 0.63],
    [0.15, 0.58],
    [0.38, 0.37],
    [0.15, 0.44],
    [-0.07, 0.5],
    [-0.17, 0.47],
    [-0.21, 0.36],
    [-0.26, 0.47]
  ]
];
export function pickaxeTier(level) {
  return Math.max(0, Math.min(6, Math.floor(Number(level) || 0)));
}
export function createPickaxeModel(level) {
  const tier = pickaxeTier(level);
  if (!tier) return null;
  const parts = [],
    add = (g, color) => {
      parts.push({ g, color: new T.Color(color) });
    };
  function bar(radius, length, y, color, x = 0, z = 0) {
    const g = new T.CylinderGeometry(radius, radius, length, 8);
    g.translate(x, y, z);
    add(g, color);
  }
  function plate(points, depth, z, color) {
    const shape = new T.Shape();
    shape.moveTo(...points[0]);
    for (const p of points.slice(1)) shape.lineTo(...p);
    shape.closePath();
    const g = new T.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1
    });
    g.translate(0, 0, z);
    add(g, color);
  }
  // A laminated mineral/fibre shaft, never timber. Later metal frames and
  // collars are visible construction changes, not recoloured abstract buffs.
  bar(tier >= 4 ? 0.026 : 0.024, 0.68, 0.17, tier >= 4 ? steel : fibre);
  bar(0.033, 0.18, -0.025, 0x66705b);
  for (let i = 0; i < 4; i++) bar(0.035, 0.012, -0.09 + i * 0.045, fibre);
  plate(heads[tier - 1], 0.08, -0.04, tier >= 4 ? steel : stone);
  const facet = heads[tier - 1].slice(0, 4);
  plate(facet, 0.002, 0.041, tier >= 4 ? 0xbac6c0 : 0xc7ccc4);
  // Binding and a real socket holding the head onto the shaft.
  if (tier < 4) {
    for (let i = 0; i < tier + 1; i++) bar(0.043, 0.018, 0.445 + i * 0.027, fibre);
  } else {
    plate(
      [
        [-0.055, 0.43],
        [-0.055, 0.57],
        [0.055, 0.57],
        [0.055, 0.43]
      ],
      0.11,
      -0.055,
      0x46565b
    );
    const bolt = new T.CylinderGeometry(0.018, 0.018, 0.12, 8);
    bolt.rotateX(Math.PI / 2);
    bolt.translate(0, 0.5, 0);
    add(bolt, fibre);
  }
  if (tier >= 3) bar(0.043, 0.035, -0.14, tier >= 4 ? steel : stone);
  if (tier >= 5) {
    plate(
      [
        [-0.19, 0.51],
        [-0.16, 0.55],
        [0.12, 0.53],
        [0.25, 0.45],
        [0.12, 0.48]
      ],
      0.004,
      0.043,
      0x46565b
    );
    bar(0.043, 0.03, 0.29, steel);
    bar(0.043, 0.03, 0.35, steel);
  }
  if (tier === 6) {
    plate(
      [
        [-0.07, 0.39],
        [-0.07, 0.46],
        [0.07, 0.46],
        [0.07, 0.39]
      ],
      0.1,
      -0.05,
      0x46565b
    );
    plate(
      [
        [-0.28, 0.55],
        [-0.12, 0.6],
        [0.09, 0.57],
        [-0.09, 0.55]
      ],
      0.003,
      0.049,
      0xeeeadf
    );
  }
  // Merge parts into one flat vertex-colour draw call, regardless of tier. No
  // ink shell: an inverted hull leaks ink between parts and breaks at sharp
  // corners. Held, Mica's figure pass draws the outer contour; baked icons
  // get the same single silhouette in renderPickaxeIcons. Geometry is built
  // only when this tier is first used.
  const positions = [],
    normals = [],
    colors = [];
  for (const { g, color } of parts) {
    const flat = g.index ? g.toNonIndexed() : g;
    const p = flat.attributes.position,
      n = flat.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      colors.push(color.r, color.g, color.b);
    }
    if (flat !== g) flat.dispose();
    g.dispose();
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  const fill = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const root = new T.Group();
  root.name = 'pickaxe-' + tier;
  root.add(new T.Mesh(geometry, fill));
  return {
    root,
    tier,
    grip: new T.Vector3(),
    dispose() {
      geometry.dispose();
      fill.dispose();
    }
  };
}
// Offline/browser-authoring path only. The shipped UI uses the baked images;
// it does not create a WebGL renderer for each inventory icon.
export function renderPickaxeIcons() {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(192, 192, false);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  const scene = new T.Scene(),
    camera = new T.OrthographicCamera(-0.53, 0.53, 0.53, -0.53, 0.1, 10);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  // One ink silhouette around the whole tool: the flat render is stamped in
  // ink in a ring of offsets underneath itself, like the figure pass on Mica.
  const out = document.createElement('canvas');
  out.width = out.height = 192;
  const g = out.getContext('2d'),
    stamp = document.createElement('canvas');
  stamp.width = stamp.height = 192;
  const s = stamp.getContext('2d');
  const icons = [];
  for (let tier = 1; tier <= 6; tier++) {
    const asset = createPickaxeModel(tier);
    scene.add(asset.root);
    asset.root.rotation.set(0, -0.3, -0.48);
    asset.root.position.set(-0.08, -0.17, 0);
    renderer.render(scene, camera);
    s.clearRect(0, 0, 192, 192);
    s.globalCompositeOperation = 'source-over';
    s.drawImage(renderer.domElement, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = '#' + new T.Color(ink).getHexString();
    s.fillRect(0, 0, 192, 192);
    g.clearRect(0, 0, 192, 192);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      g.drawImage(stamp, Math.cos(a) * 4, Math.sin(a) * 4);
    }
    g.drawImage(renderer.domElement, 0, 0);
    icons.push(out.toDataURL('image/png'));
    scene.remove(asset.root);
    asset.dispose();
  }
  renderer.dispose();
  return icons;
}
