/* Clipping is an illegal state: no two solid parts of Mica (coat, limbs,
 * hood, Wiki, carried gear) may pass through one another. findClips() takes a
 * posed rig-model and returns every pair of solids whose surfaces cross, with
 * the joints and grips the model declares in contacts() left out.
 * Pure geometry, no renderer: the unit tests sweep every pose with it, and the
 * dev viewer (?clips) throws on the first clip it sees. */
import * as T from '../../vendor/three/three.module.js';
const CELL = 0.04,
  EPS = 1e-9;
const v = new T.Vector3();
// World-space triangles of a mesh, skinning applied: 9 coordinates each, plus
// a box per triangle (6 numbers: min xyz, max xyz).
function triangles(mesh) {
  const g = mesh.geometry,
    p = g.attributes.position,
    index = g.index,
    count = ((index ? index.count : p.count) / 3) | 0,
    world = new Float64Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v);
    else v.fromBufferAttribute(p, i);
    v.applyMatrix4(mesh.matrixWorld);
    world[i * 3] = v.x;
    world[i * 3 + 1] = v.y;
    world[i * 3 + 2] = v.z;
  }
  const tris = new Float64Array(count * 9),
    boxes = new Float64Array(count * 6),
    all = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let n = 0; n < count; n++) {
    for (let k = 0; k < 3; k++) {
      const j = index ? index.getX(n * 3 + k) : n * 3 + k;
      for (let c = 0; c < 3; c++) tris[n * 9 + k * 3 + c] = world[j * 3 + c];
    }
    for (let c = 0; c < 3; c++) {
      const x0 = tris[n * 9 + c],
        x1 = tris[n * 9 + 3 + c],
        x2 = tris[n * 9 + 6 + c],
        lo = Math.min(x0, x1, x2),
        hi = Math.max(x0, x1, x2);
      boxes[n * 6 + c] = lo;
      boxes[n * 6 + 3 + c] = hi;
      if (lo < all[c]) all[c] = lo;
      if (hi > all[c + 3]) all[c + 3] = hi;
    }
  }
  return { tris, boxes, count, bounds: all };
}
function merge(parts) {
  const count = parts.reduce((n, p) => n + p.count, 0),
    tris = new Float64Array(count * 9),
    boxes = new Float64Array(count * 6),
    all = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  let at = 0;
  for (const p of parts) {
    tris.set(p.tris, at * 9);
    boxes.set(p.boxes, at * 6);
    at += p.count;
    for (let c = 0; c < 3; c++) {
      all[c] = Math.min(all[c], p.bounds[c]);
      all[c + 3] = Math.max(all[c + 3], p.bounds[c + 3]);
    }
  }
  return { tris, boxes, count, bounds: all };
}
const overlap = (a, b, i = 0, j = 0) =>
  a[i] <= b[j + 3] &&
  b[j] <= a[i + 3] &&
  a[i + 1] <= b[j + 4] &&
  b[j + 1] <= a[i + 4] &&
  a[i + 2] <= b[j + 5] &&
  b[j + 2] <= a[i + 5];
// Where segment p->q (offsets into arrays P and Q) crosses triangle t of
// array S, or null (Möller-Trumbore).
function crossing(P, p, q, S, t) {
  const dx = P[q] - P[p],
    dy = P[q + 1] - P[p + 1],
    dz = P[q + 2] - P[p + 2];
  const e1x = S[t + 3] - S[t],
    e1y = S[t + 4] - S[t + 1],
    e1z = S[t + 5] - S[t + 2],
    e2x = S[t + 6] - S[t],
    e2y = S[t + 7] - S[t + 1],
    e2z = S[t + 8] - S[t + 2];
  const hx = dy * e2z - dz * e2y,
    hy = dz * e2x - dx * e2z,
    hz = dx * e2y - dy * e2x,
    det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < EPS) return null;
  const f = 1 / det,
    sx = P[p] - S[t],
    sy = P[p + 1] - S[t + 1],
    sz = P[p + 2] - S[t + 2],
    u = f * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return null;
  const qx = sy * e1z - sz * e1y,
    qy = sz * e1x - sx * e1z,
    qz = sx * e1y - sy * e1x,
    w = f * (dx * qx + dy * qy + dz * qz);
  if (w < 0 || u + w > 1) return null;
  const s = f * (e2x * qx + e2y * qy + e2z * qz);
  if (s < 0 || s > 1) return null;
  return [P[p] + dx * s, P[p + 1] + dy * s, P[p + 2] + dz * s];
}
// Where triangle a of A and triangle b of B cross, or null.
function cross(A, a, B, b) {
  const i = a * 9,
    j = b * 9;
  for (const [p, q] of [
    [0, 3],
    [3, 6],
    [6, 0]
  ]) {
    const x = crossing(A, i + p, i + q, B, j) ?? crossing(B, j + p, j + q, A, i);
    if (x) return x;
  }
  return null;
}
export function trianglesCross(a, b) {
  return cross(Float64Array.from(a), 0, Float64Array.from(b), 0);
}
const hash = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
function grid(B, limit) {
  const cells = new Map();
  for (let n = 0; n < B.count; n++) {
    if (!overlap(B.boxes, limit, n * 6)) continue;
    const o = n * 6;
    for (let i = Math.floor(B.boxes[o] / CELL); i <= Math.floor(B.boxes[o + 3] / CELL); i++)
      for (let j = Math.floor(B.boxes[o + 1] / CELL); j <= Math.floor(B.boxes[o + 4] / CELL); j++)
        for (
          let k = Math.floor(B.boxes[o + 2] / CELL);
          k <= Math.floor(B.boxes[o + 5] / CELL);
          k++
        ) {
          const id = hash(i, j, k);
          let c = cells.get(id);
          if (!c) cells.set(id, (c = []));
          c.push(n);
        }
  }
  const seen = new Int32Array(B.count).fill(-1);
  return (boxes, o, stamp, visit) => {
    for (let i = Math.floor(boxes[o] / CELL); i <= Math.floor(boxes[o + 3] / CELL); i++)
      for (let j = Math.floor(boxes[o + 1] / CELL); j <= Math.floor(boxes[o + 4] / CELL); j++)
        for (let k = Math.floor(boxes[o + 2] / CELL); k <= Math.floor(boxes[o + 5] / CELL); k++)
          for (const n of cells.get(hash(i, j, k)) ?? [])
            if (seen[n] !== stamp) {
              seen[n] = stamp;
              if (overlap(boxes, B.boxes, o, n * 6)) visit(n);
            }
  };
}
function pairClips(A, B, allowed, { self = false, all = false } = {}) {
  if (!overlap(A.bounds, B.bounds)) return null;
  const limit = [
    Math.max(A.bounds[0], B.bounds[0]),
    Math.max(A.bounds[1], B.bounds[1]),
    Math.max(A.bounds[2], B.bounds[2]),
    Math.min(A.bounds[3], B.bounds[3]),
    Math.min(A.bounds[4], B.bounds[4]),
    Math.min(A.bounds[5], B.bounds[5])
  ];
  const near = grid(B, limit),
    points = [];
  let crossings = 0,
    at = null;
  for (let m = 0; m < A.count; m++) {
    if (!overlap(A.boxes, limit, m * 6)) continue;
    near(A.boxes, m * 6, m, (n) => {
      // A surface crossing itself: neighbours that share a corner always touch.
      if (self && (n <= m || sharesCorner(A.tris, m, n))) return;
      const x = cross(A.tris, m, B.tris, n);
      if (x && !allowed(x)) {
        crossings++;
        at ??= x;
        if (all) points.push(x);
      }
    });
  }
  return crossings ? { crossings, at: at.map((n) => +n.toFixed(3)), ...(all && { points }) } : null;
}
function sharesCorner(T, a, b) {
  for (let i = a * 9; i < a * 9 + 9; i += 3)
    for (let j = b * 9; j < b * 9 + 9; j += 3)
      if (
        Math.abs(T[i] - T[j]) < 1e-7 &&
        Math.abs(T[i + 1] - T[j + 1]) < 1e-7 &&
        Math.abs(T[i + 2] - T[j + 2]) < 1e-7
      )
        return true;
  return false;
}
// The bone a rigid mesh rides on; a skinned mesh bends with many, so it is its own.
function carrier(mesh) {
  if (mesh.isSkinnedMesh) return mesh;
  let a = mesh.parent;
  while (a && !a.isBone) a = a.parent;
  return a;
}
const near = (x, c) => Math.hypot(x[0] - c.at.x, x[1] - c.at.y, x[2] - c.at.z) <= c.r;
// Every clip in the rig's current pose: [{a,b,crossings,at:[x,y,z]}]. Two
// solids may not cross each other; within one solid, parts on different bones
// may not cross (a self-clip) except at the joints the model declares, and a
// bending surface may not fold through itself. Parts on the same bone are one
// authored rigid piece and never move against each other.
// only: check just the pairs that involve these solids (for quick placement work).
export function findClips(rig, { all = false, only = null } = {}) {
  const want = (...names) => !only || names.some((n) => only.includes(n));
  const contacts = rig.contacts(),
    clips = [];
  const solids = rig.solids().map((s) => {
    const parts = s.meshes.map((mesh) => ({ mesh, carrier: carrier(mesh), ...triangles(mesh) }));
    return { name: s.name, parts, ...merge(parts) };
  });
  const meets = (a, b) =>
    contacts.filter((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
  for (let i = 0; i < solids.length; i++)
    for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i],
        B = solids[j],
        meet = meets(A.name, B.name);
      if (!want(A.name, B.name) || meet.some((c) => !c.at)) continue;
      const hit = pairClips(A, B, (x) => meet.some((c) => near(x, c)), { all });
      if (hit) clips.push({ a: A.name, b: B.name, ...hit });
    }
  for (const S of solids) {
    if (!want(S.name)) continue;
    const joints = meets(S.name, S.name),
      allowed = (x) => joints.some((c) => near(x, c));
    for (let i = 0; i < S.parts.length; i++)
      for (let j = i; j < S.parts.length; j++) {
        const A = S.parts[i],
          B = S.parts[j];
        if (i === j ? !A.mesh.isSkinnedMesh : A.carrier === B.carrier) continue;
        const hit = pairClips(A, B, allowed, { self: i === j, all });
        if (hit)
          clips.push({
            a: S.name,
            b: S.name,
            self: true,
            parts: [A.mesh.name || A.mesh.geometry.type, B.mesh.name || B.mesh.geometry.type],
            ...hit
          });
      }
  }
  return clips;
}
