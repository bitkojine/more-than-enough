/* Four canonical resource models. Authored 3D faces/curves produce both real
 * Three.js geometry and compact projected SVGs; no separately drawn icons. */
import * as T from '../../vendor/three/three.module.js';
export const RESOURCE_MODEL_KEYS = Object.freeze(['mycelium', 'stone', 'ore', 'crystal']);
const INK = '#1d1712',
  V = (p) => new T.Vector3(...p);
const LIGHT = new T.Vector3(-0.5, 0.85, 0.6).normalize();
export const RESOURCE_ICON_VIEWS = Object.freeze({
  mycelium: { camera: [0.8, 1.7, 6], padding: 3, offset: [0, 1] },
  stone: { camera: [3.8, 3.0, 5], padding: 3, offset: [0, 0.5] },
  ore: { camera: [1.7, 2.3, 5.5], padding: 3, offset: [0, 0.5] },
  crystal: { camera: [0.7, 1.6, 6], padding: 3, offset: [0, 0] }
});
const palettes = {
  stone: ['#9aa096', '#c7ccc4', '#7f857b'],
  host: ['#66503c', '#8a7054', '#493b32'],
  ore: ['#d48435', '#f2b85c', '#995626'],
  crystal: ['#df69ab', '#ffc2e6', '#ad4f92']
};
export function resourceCamera(position = [2.8, 2.2, 5]) {
  const c = new T.OrthographicCamera(-0.85, 0.85, 0.85, -0.35, 0.1, 20);
  c.position.set(...position);
  c.lookAt(0, 0.3, 0);
  c.updateMatrixWorld();
  return c;
}
export function createResourceModel(
  key,
  { form = 'specimen', variant = 0, depleted = false } = {}
) {
  if (!RESOURCE_MODEL_KEYS.includes(key)) throw Error('Unknown resource model: ' + key); // i18n-ok: developer-only asset-authoring diagnostic.
  const compact = form === 'icon',
    faces = [],
    curves = [];
  let partId = 0;
  const root = new T.Group();
  root.name = 'resource-' + key;
  function solid(points, polys, colors, { offset = [0, 0, 0], scale = 1, rotation = 0 } = {}) {
    const part = partId++;
    const transform = new T.Matrix4().compose(
      V(offset),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rotation),
      new T.Vector3(scale, scale, scale)
    );
    const vertices = points.map((p) => V(p).applyMatrix4(transform)),
      center = vertices
        .reduce((a, b) => a.add(b), new T.Vector3())
        .multiplyScalar(1 / vertices.length);
    for (let i = 0; i < polys.length; i++) {
      const points = polys[i].map((j) => vertices[j].clone()),
        normal = new T.Vector3().crossVectors(
          points[1].clone().sub(points[0]),
          points[2].clone().sub(points[0])
        );
      const mid = points
        .reduce((a, b) => a.add(b), new T.Vector3())
        .multiplyScalar(1 / points.length);
      if (normal.dot(mid.sub(center)) < 0) {
        points.reverse();
        normal.negate();
      }
      const value = normal.normalize().dot(LIGHT),
        tone = colors.length === 1 ? 0 : value > 0.35 ? 1 : value < -0.25 ? 2 : 0;
      faces.push({ points, color: colors[tone % colors.length], part });
    }
  }
  function rock(offset, scale, palette, rotation = 0) {
    const bottom = [
        [-0.36, 0.04, 0.16],
        [-0.3, 0.03, -0.22],
        [0.18, 0, -0.28],
        [0.39, 0.06, 0.07],
        [0.18, 0.02, 0.27]
      ],
      top = [
        [-0.36, 0.27, 0.14],
        [-0.22, 0.46, -0.19],
        [0.17, 0.38, -0.25],
        [0.31, 0.22, 0.08],
        [0.08, 0.38, 0.23]
      ];
    const points = [...bottom, ...top, [-0.06, 0.47, -0.02]],
      polys = [];
    for (let i = 0; i < 5; i++) {
      polys.push([i, (i + 1) % 5, ((i + 1) % 5) + 5, i + 5]);
      polys.push([i + 5, ((i + 1) % 5) + 5, 10]);
    }
    solid(
      compact
        ? points.map(([x, y, z], i) => [x * (i < 5 ? 0.82 : 1), y * 0.72, z * (i < 5 ? 0.85 : 1)])
        : points,
      polys,
      palette,
      { offset, scale, rotation }
    );
  }
  function prism(a, b, r, palette) {
    const start = V(a),
      end = V(b),
      axis = end.clone().sub(start).normalize(),
      side = new T.Vector3(0, 0, 1).cross(axis).normalize(),
      other = axis.clone().cross(side).normalize(),
      points = [];
    for (const p of [start, end])
      for (let i = 0; i < 5; i++)
        points.push(
          p
            .clone()
            .addScaledVector(side, Math.cos((i / 5) * Math.PI * 2) * r)
            .addScaledVector(other, Math.sin((i / 5) * Math.PI * 2) * r)
            .toArray()
        );
    points.push(
      end
        .clone()
        .addScaledVector(axis, r * 1.5)
        .toArray()
    );
    const polys = [];
    for (let i = 0; i < 5; i++)
      polys.push([i, (i + 1) % 5, ((i + 1) % 5) + 5, i + 5], [i + 5, ((i + 1) % 5) + 5, 10]);
    solid(points, polys, palette);
  }
  function fibre(points, radius = 0.014, color = '#eee1bd') {
    curves.push({ points: points.map(V), radius, color });
  }
  function mushroom(x, z, height, radius, color) {
    prism([x, 0.03, z], [x, height, z], 0.022, ['#f3e7cf', '#e4cfaa', '#d2bda0']);
    const points = [[x, height + radius * 0.55, z]],
      polys = [],
      n = 16;
    for (const [r, y] of [
      [radius * 0.7, height + radius * 0.4],
      [radius, height]
    ])
      for (let i = 0; i < n; i++)
        points.push([
          x + r * Math.cos((i / n) * Math.PI * 2),
          y,
          z + r * Math.sin((i / n) * Math.PI * 2)
        ]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      polys.push([0, 1 + i, 1 + j], [1 + i, 1 + n + i, 1 + n + j, 1 + j]);
    }
    solid(points, polys, [color]);
    // Two broad cream spots carry fungal identity at actual inventory sizes.
    for (const dx of [-0.045, 0.045])
      rock([x + dx, height + radius * 0.4, z + 0.04], 0.042, ['#fff0d4']);
  }
  if (key === 'mycelium') {
    // Caps and stems are the readable material identity. The owner removed
    // exposed hyphae/root shapes because they confuse small resource icons.
    if (!depleted) {
      mushroom(-0.12, 0.04, compact ? 0.23 : 0.27, compact ? 0.2 : 0.17, '#c8553d');
      mushroom(0.19, -0.08, 0.16, compact ? 0.1 : 0.12, '#b64c37');
    }
  } else if (key === 'stone') {
    if (depleted) {
      rock([-0.18, 0, 0.02], 0.23, palettes.stone);
      rock([0.19, 0, 0.02], 0.16, palettes.stone, 0.6);
    } else {
      rock([0, 0, 0], 1, palettes.stone, (variant * Math.PI) / 4);
      if (variant) rock([0.34, 0, 0.14], 0.38, palettes.stone, 0.6);
    }
  } else if (key === 'ore') {
    if (form === 'deposit' && !depleted) {
      rock([0, 0, 0], 1, palettes.host, (variant * Math.PI) / 4);
      for (const [x, y, z, s] of [
        [-0.19, 0.31, 0.2, 0.24],
        [0.18, 0.25, 0.25, 0.2],
        [0.04, 0.46, 0.02, 0.25]
      ])
        rock([x, y, z], s, palettes.ore, 0.3);
    } else if (depleted) {
      rock([-0.12, 0, 0], 0.25, palettes.host);
      rock([0.2, 0, 0], 0.16, palettes.host);
    } else {
      rock([-0.12, 0, 0.06], compact ? 0.75 : 0.6, palettes.ore, 0.5);
      rock([compact ? 0.26 : 0.21, 0, -0.05], compact ? 0.3 : 0.42, palettes.ore, 0.1);
    }
  } else {
    // Living crystal is coloured, never emissive: art does not grant light or
    // exempt colonies/material from the canonical darkness/temperature rules.
    rock([0, 0, 0], 0.34, ['#756374', '#a38b9d', '#5b4a5c']);
    if (depleted) {
      prism([0, 0.06, 0], [0.01, 0.18, 0], 0.045, palettes.crystal);
    } else if (compact) {
      prism([0, 0.05, 0], [0.01, 0.59, 0], 0.105, palettes.crystal);
      prism([0, 0.22, 0], [-0.24, 0.47, 0.03], 0.07, palettes.crystal);
      prism([0.01, 0.34, 0], [0.24, 0.59, -0.02], 0.07, palettes.crystal);
    } else {
      prism([0, 0.05, 0], [0.01, 0.57, 0], 0.062, palettes.crystal);
      prism([0, 0.2, 0], [-0.21, 0.4, 0.03], 0.045, palettes.crystal);
      prism([-0.21, 0.4, 0.03], [-0.25, 0.59, 0.02], 0.04, palettes.crystal);
      prism([0.01, 0.32, 0], [0.22, 0.54, -0.03], 0.045, palettes.crystal);
      prism([0.22, 0.54, -0.03], [0.31, 0.68, -0.02], 0.031, palettes.crystal);
      prism([-0.2, 0.4, 0.03], [-0.33, 0.47, 0.07], 0.026, palettes.crystal);
      prism([0.21, 0.53, -0.03], [0.11, 0.69, -0.05], 0.025, palettes.crystal);
      if (variant) prism([0.01, 0.16, 0.03], [0.25, 0.29, 0.13], 0.033, palettes.crystal);
    }
  }
  // Mesh triangles and SVG polygons share these exact authored vertices.
  const position = [],
    normal = [],
    color = [];
  for (const f of faces) {
    const n = new T.Vector3()
        .crossVectors(f.points[1].clone().sub(f.points[0]), f.points[2].clone().sub(f.points[0]))
        .normalize(),
      c = new T.Color(f.color);
    for (let i = 1; i < f.points.length - 1; i++)
      for (const v of [f.points[0], f.points[i], f.points[i + 1]]) {
        position.push(...v.toArray());
        normal.push(...n.toArray());
        color.push(c.r, c.g, c.b);
      }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new T.Float32BufferAttribute(color, 3));
  const material = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  root.add(new T.Mesh(geometry, material));
  for (const f of curves) {
    const c = new T.CubicBezierCurve3(...f.points),
      g = new T.TubeGeometry(c, 24, f.radius, 6, false),
      m = new T.MeshBasicMaterial({ color: f.color, toneMapped: false });
    root.add(new T.Mesh(g, m));
  }
  return {
    key,
    root,
    faces,
    curves,
    anchors: { base: new T.Vector3(), collect: new T.Vector3(0, 0.25, 0) },
    dispose() {
      root.traverse((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
  };
}
// The fixed-view vector finish gives world-size contours rounded joins and
// stable native-size thickness. No live renderer is needed by each deposit.
export function resourceSVG(
  asset,
  { width = 64, height = 64, heading = 0, grounded = false, view = 'world' } = {}
) {
  const profile = view === 'icon' ? RESOURCE_ICON_VIEWS[asset.key] : null,
    camera = resourceCamera(profile?.camera),
    rotation = new T.Matrix4().makeRotationY((Math.round(heading) * Math.PI) / 4),
    viewMatrix = new T.Matrix4().multiplyMatrices(camera.matrixWorldInverse, rotation);
  const project = (p) => p.clone().applyMatrix4(viewMatrix),
    polys = [];
  for (const f of asset.faces) {
    const p = f.points.map(project),
      n = new T.Vector3().crossVectors(p[1].clone().sub(p[0]), p[2].clone().sub(p[0]));
    if (n.z > 1e-8)
      polys.push({
        points: p,
        color: f.color,
        part: f.part,
        z: p.reduce((s, v) => s + v.z, 0) / p.length
      });
  }
  const curves = asset.curves.map((c) => ({
    ...c,
    points: c.points.map(project),
    z: c.points.map(project).reduce((s, v) => s + v.z, 0) / 4
  }));
  const points = [...polys.flatMap((p) => p.points), ...curves.flatMap((c) => c.points)],
    xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys),
    padding = profile?.padding ?? 4;
  const scale = Math.min(
      (width - padding * 2) / (maxX - minX || 1),
      (height - padding * 2) / (maxY - minY || 1)
    ),
    cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2,
    centerY = grounded ? height - 1.2 - ((maxY - minY) * scale) / 2 : height / 2;
  const xy = (p) =>
    [
      (width / 2 + (p.x - cx) * scale + ((profile?.offset[0] ?? 0) * width) / 64).toFixed(1),
      (centerY - (p.y - cy) * scale + ((profile?.offset[1] ?? 0) * height) / 64).toFixed(1)
    ].join(',');
  // Flat cel finish: one ink silhouette around the whole object, then flat
  // value planes with no ink between faces or parts. Each fill is stroked in
  // its own colour so anti-aliased seams never show the mesh underneath.
  const ink = [
    ...polys.map(
      (p) =>
        `<path d="M${p.points.map(xy).join('L')}Z" fill="${INK}" stroke="${INK}" stroke-width="4.8"/>`
    ),
    ...curves.map(
      (c) =>
        `<path d="M${xy(c.points[0])}C${c.points.slice(1).map(xy).join(' ')}" fill="none" stroke="${INK}" stroke-width="${(c.radius * 2 * scale + 4.8).toFixed(1)}"/>`
    )
  ].join('');
  const groups = new Map();
  for (const p of polys) {
    if (!groups.has(p.part)) groups.set(p.part, []);
    groups.get(p.part).push(p);
  }
  const pieces = [
    ...[...groups.values()].map((group) => ({
      z: group.reduce((s, p) => s + p.z, 0) / group.length,
      svg: group
        .sort((a, b) => a.z - b.z)
        .map(
          (p) =>
            `<path d="M${p.points.map(xy).join('L')}Z" fill="${p.color}" stroke="${p.color}" stroke-width="1.2"/>`
        )
        .join('')
    })),
    ...curves.map((c) => ({
      z: c.z,
      svg: `<path d="M${xy(c.points[0])}C${c.points.slice(1).map(xy).join(' ')}" fill="none" stroke="${c.color}" stroke-width="${(c.radius * 2 * scale).toFixed(1)}"/>`
    }))
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><!-- Generated from resource-models.js; edit the 3D source. --><g stroke-linejoin="round" stroke-linecap="round"><g>${ink}</g>${pieces
    .sort((a, b) => a.z - b.z)
    .map((p) => p.svg)
    .join('')}</g></svg>\n`;
}

// Quantity tiers share the specimen geometry. Instances stay bounded even for
// enormous inventory totals; this is a visual magnitude marker, not one mesh
// per owned item. Existing stockpile footprints remain unchanged.
export function createResourcePile(key, tier) {
  if (!Number.isInteger(tier) || tier < 0 || tier > 3)
    throw Error('Resource pile tier must be 0..3'); // i18n-ok: developer-only asset-authoring diagnostic.
  const unit = createResourceModel(key),
    root = new T.Group(),
    instances = [];
  root.name = 'pile-' + key + '-' + tier;
  for (let i = 0; i < 1 + tier * 2; i++) {
    const row = Math.floor(i / 3) % 3,
      column = i % 3,
      layer = Math.floor(i / 9),
      offset = new T.Vector3((column - 1) * 0.86, layer * 0.55, (row - 1) * 0.64);
    const item = unit.root.clone(true);
    item.position.copy(offset);
    root.add(item);
    instances.push(offset);
  }
  return {
    key,
    tier,
    root,
    unit,
    instances,
    dispose() {
      unit.dispose();
    }
  };
}
export function resourcePileSVG(pile, { width = 64, height = 64 } = {}) {
  const camera = resourceCamera(),
    origin = new T.Vector3().applyMatrix4(camera.matrixWorldInverse),
    points = [
      ...pile.unit.faces.flatMap((f) => f.points),
      ...pile.unit.curves.flatMap((c) => c.points)
    ].map((p) => p.clone().applyMatrix4(camera.matrixWorldInverse));
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    unitScale = Math.min(
      56 / (Math.max(...xs) - Math.min(...xs) || 1),
      56 / (Math.max(...ys) - Math.min(...ys) || 1)
    );
  const offsets = pile.instances.map((p) => {
    const q = p.clone().applyMatrix4(camera.matrixWorldInverse).sub(origin);
    return { x: q.x * unitScale, y: -q.y * unitScale, z: q.z };
  });
  const minX = Math.min(...offsets.map((p) => p.x)),
    maxX = Math.max(...offsets.map((p) => p.x)) + 64,
    minY = Math.min(...offsets.map((p) => p.y)),
    maxY = Math.max(...offsets.map((p) => p.y)) + 64;
  const scale = Math.min((width - 4) / (maxX - minX), (height - 4) / (maxY - minY)),
    dx = width / 2 - ((minX + maxX) * scale) / 2,
    dy = height - 0.5 - maxY * scale;
  const unit = resourceSVG(pile.unit, { grounded: true })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><!-- Generated resource pile ${pile.key}, tier ${pile.tier}. --><defs><g id="unit">${unit}</g></defs><g transform="translate(${dx.toFixed(1)} ${dy.toFixed(1)}) scale(${scale.toFixed(3)})">${offsets
    .sort((a, b) => a.z - b.z)
    .map((p) => `<use href="#unit" x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}"/>`)
    .join('')}</g></svg>\n`;
}
