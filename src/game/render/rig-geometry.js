/* The shapes Mica is made of (rig-model.js builds Mica from them): the
 * hood, face, collar, coat, hem, patch and boots, each a three.js geometry
 * made from numbers alone, so tests can look at it without a renderer. */
import * as T from '../../vendor/three/three.module.js';

const COAT_TAPER = 0.16;
// The coat's radius from hem (t=0) to collar (t=1). It narrows under the hood
// so the sleeves hang outside it rather than through it.
export const coatRadius = (t) =>
  0.44 - 0.2 * t + 0.015 * Math.sin(t * Math.PI) - COAT_TAPER * t ** 3;

// The hood: a pear-shaped shell swept along a spline of rings.
export function hoodGeometry() {
  const controls = [
      [0.3, 0.39, 0.17, 0],
      [0.33, 0.42, 0.12, 0],
      [0.43, 0.47, 0.02, 0],
      [0.45, 0.43, -0.2, 0],
      [0.34, 0.31, -0.4, 0.13],
      [0.12, 0.14, -0.5, 0.23],
      [0.001, 0.001, -0.53, 0.25]
    ],
    pos = [],
    idx = [],
    segments = 64;
  const interpolate = (a, b, c, d, t) =>
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t * t +
      (-a + 3 * b - 3 * c + d) * t * t * t);
  const rings = Array.from({ length: 33 }, (_, i) => {
    const f = (i / 32) * (controls.length - 1),
      k = Math.min(controls.length - 2, Math.floor(f)),
      t = f - k;
    return controls[k].map((_, j) =>
      interpolate(
        controls[Math.max(0, k - 1)][j],
        controls[k][j],
        controls[k + 1][j],
        controls[Math.min(controls.length - 1, k + 2)][j],
        t
      )
    );
  });
  for (const [j, [rx, ry, z, cy]] of rings.entries())
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        pear = 1 - 0.22 * Math.sin(a) * Math.max(0, 1 - j / 12);
      pos.push(
        rx * 1.1 * Math.cos(a) * pear + 0.045 * (j / 32) ** 2,
        cy + ry * Math.sin(a) + 0.018 * Math.cos(a) * Math.min(1, rx / 0.12),
        z
      );
    }
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i,
        b = a + segments + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The original art has a pointed arch, broad lower cheeks and flat oval
// eyes. A shallow pear-shaped mask avoids the former protruding egg shape.
export function faceGeometry(size = 1, depth = 0.16, rows = 12) {
  const positions = [],
    uv = [],
    indices = [],
    segments = 64;
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= segments; i++) {
      const r = j / rows,
        a = (i / segments) * Math.PI * 2,
        x = size * r * 0.27 * Math.cos(a) * (1 - 0.22 * Math.sin(a)),
        y = size * r * 0.32 * Math.sin(a);
      positions.push(x, y, 0.18 + depth * (1 - r * r));
      uv.push((x + 0.3) / 0.6, (y + 0.4) / 0.8);
    }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i,
        b = a + segments + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// The dark line round the face's pointed arch.
export function faceArchGeometry() {
  const arch = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    arch.push(
      new T.Vector3(
        1.22 * 0.27 * Math.cos(a) * (1 - 0.22 * Math.sin(a)),
        1.22 * 0.32 * Math.sin(a),
        0.176
      )
    );
  }
  return new T.TubeGeometry(new T.CatmullRomCurve3(arch, true), 128, 0.014, 8, true);
}

// Soft collar joins hood and cloak rather than adding a floating costume icon.
export function collarGeometry() {
  const collarPath = [
    [-0.24, 0, 0],
    [-0.17, -0.015, 0.16],
    [0, -0.1, 0.23],
    [0.17, -0.015, 0.16],
    [0.24, 0, 0],
    [0.17, 0.02, -0.15],
    [0, 0.025, -0.21],
    [-0.17, 0.02, -0.15]
  ].map((p) => new T.Vector3(...p));
  return new T.TubeGeometry(new T.CatmullRomCurve3(collarPath, true), 64, 0.038, 10, true);
}

// The coat: a tapering shell (coatRadius) with a V notch at the front hem.
export function coatShellGeometry() {
  const positions = [],
    indices = [],
    segments = 64,
    rows = 16;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows,
      y = 0.48 + t * 0.55,
      r = coatRadius(t);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        x = Math.sin(a) * r,
        z = Math.cos(a) * r * 0.76;
      // A front V opens the overlapping hem instead of forming a rigid bell.
      const notch =
        Math.cos(a) > 0.6
          ? 0.13 * Math.max(0, 1 - Math.abs(Math.sin(a)) / 0.32) * Math.max(0, 1 - t / 0.28)
          : 0;
      positions.push(x, y + notch, z);
    }
  }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i,
        b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// A narrow ribbon along the split hem, including its notch.
export function hemRibbonGeometry() {
  const segments = 64;
  const hemPoints = [],
    hemIndices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2,
      n = Math.cos(a) > 0.6 ? 0.13 * Math.max(0, 1 - Math.abs(Math.sin(a)) / 0.32) : 0;
    for (const dy of [0, 0.009])
      hemPoints.push(Math.sin(a) * 0.441, 0.484 + n + dy, Math.cos(a) * 0.441 * 0.76);
    if (i < segments) {
      const q = i * 2;
      hemIndices.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  }
  const hemGeometry = new T.BufferGeometry();
  hemGeometry.setAttribute('position', new T.Float32BufferAttribute(hemPoints, 3));
  hemGeometry.setIndex(hemIndices);
  hemGeometry.computeVertexNormals();
  return hemGeometry;
}

// The repair patch, following the coat's surface just above it.
export function repairPatchGeometry() {
  const patchPoints = [],
    patchIndices = [];
  for (let j = 0; j <= 4; j++) {
    const y = 0.62 + j * 0.027,
      t = (y - 0.48) / 0.55,
      r = coatRadius(t) + 0.006;
    for (let i = 0; i <= 6; i++) {
      const a = -0.63 + (i * 0.35) / 6;
      patchPoints.push(Math.sin(a) * r, y, Math.cos(a) * r * 0.76);
    }
    if (j < 4)
      for (let i = 0; i < 6; i++) {
        const q = j * 7 + i;
        patchIndices.push(q, q + 7, q + 1, q + 1, q + 7, q + 8);
      }
  }
  const patchGeometry = new T.BufferGeometry();
  patchGeometry.setAttribute('position', new T.Float32BufferAttribute(patchPoints, 3));
  patchGeometry.setIndex(patchIndices);
  patchGeometry.computeVertexNormals();
  return patchGeometry;
}

// Rounded boot lasts: broad toe, narrower heel and a curved instep. Rings
// replace the old extruded rectangle; all points stay inside the existing
// conservative ankle/sole clearance envelope used by the walk solver.
export function shoeGeometry(width, length, height, { sole = false } = {}) {
  const rings = sole
    ? [
        [0.96, 0, 0],
        [1, 0.35, 0],
        [0.99, 0.8, 0],
        [0.96, 1, 0]
      ]
    : [
        [1, 0, 0],
        [0.99, 0.32, -0.005],
        [0.88, 0.68, -0.03],
        [0.63, 0.91, -0.09],
        [0.31, 1, -0.12]
      ];
  const points = [],
    indices = [],
    segments = 32;
  for (const [scale, h, shift] of rings)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        c = Math.cos(a),
        heel = 0.78 + (0.22 * (c + 1)) / 2;
      const x = Math.sin(a) * width * 0.5 * heel * scale,
        z = length * (0.17 + shift) + c * length * 0.5 * scale;
      points.push(x, h * height + (sole ? 0.006 * Math.max(0, c) ** 2 : 0), z);
    }
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * (segments + 1) + i,
        b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const bottom = points.length / 3;
  points.push(0, 0, length * 0.17);
  const top = points.length / 3;
  points.push(0, height, length * 0.05);
  for (let i = 0; i < segments; i++) {
    indices.push(bottom, i + 1, i);
    const a = (rings.length - 1) * (segments + 1) + i;
    indices.push(top, a, a + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(points, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// A point just outside the coat, hips-local: around the body by `angle`
// (0 = front, +PI/2 = Mica's left) at height `y` above the hips, `gap` out
// from the cloth along the coat's horizontal normal. Below the hem the hem counts.
export const HIPS_REST = 0.51;
export function besideCoat(angle, y, gap) {
  const t = Math.max(0, Math.min(1, (y + HIPS_REST - 0.48) / 0.55)),
    r = coatRadius(t),
    s = Math.sin(angle),
    c = Math.cos(angle);
  const n = new T.Vector3(s / r, 0, c / (0.76 * r)).normalize();
  return new T.Vector3(s * r, y, c * 0.76 * r).addScaledVector(n, gap);
}
