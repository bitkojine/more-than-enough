/* Cached physical work props. Their visibility is driven by earned gear;
 * none of these meshes emits gameplay light or grants carrying capacity. */
import * as T from '../../vendor/three/three.module.js';
const material = (color) => new T.MeshBasicMaterial({ color, toneMapped: false });
export function createBasketModel(level) {
  const tier = Math.max(0, Math.min(5, Math.floor(Number(level) || 0)));
  if (!tier) return null;
  const root = new T.Group(),
    fibre = material(0xd3c6a3),
    band = material(0x827054),
    inside = material(0x786747);
  const add = (geometry, mat, x = 0, y = 0, z = 0) => {
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  };
  const bowl = add(new T.CylinderGeometry(0.16, 0.1, 0.2, 16, 1, true), fibre, 0, -0.3);
  bowl.material.side = T.DoubleSide;
  bowl.scale.z = 0.8;
  const floor = add(new T.CircleGeometry(0.1, 16), inside, 0, -0.398);
  floor.rotation.x = -Math.PI / 2;
  floor.scale.y = 0.8;
  for (const y of [-0.2, ...Array.from({ length: tier }, (_, i) => -0.24 - i * 0.027)]) {
    const r = 0.16 + (y + 0.2) * 0.3,
      ring = add(new T.TorusGeometry(r, 0.009, 5, 24), band, 0, y);
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = 0.8;
  }
  const arc = Array.from({ length: 17 }, (_, i) => {
    const a = (i / 16) * Math.PI;
    return new T.Vector3(0.14 * Math.cos(a), -0.2 + 0.2 * Math.sin(a), 0);
  });
  add(new T.TubeGeometry(new T.CatmullRomCurve3(arc), 24, 0.015, 6, false), fibre);
  root.name = 'basket-' + tier;
  return {
    root,
    tier,
    dispose() {
      root.traverse((o) => o.geometry?.dispose());
      for (const m of [fibre, band, inside]) m.dispose();
    }
  };
}
export function createLanternModel() {
  const root = new T.Group(),
    frame = material(0x66503c),
    metal = material(0x809295),
    glass = material(0xe4cfaa),
    dark = material(0x302a20);
  const add = (geometry, mat, y) => {
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.y = y;
    root.add(mesh);
    return mesh;
  };
  const window = add(new T.CylinderGeometry(0.065, 0.065, 0.12, 8), glass, -0.12);
  add(new T.CylinderGeometry(0.085, 0.07, 0.035, 8), metal, -0.205);
  add(new T.ConeGeometry(0.09, 0.065, 8), frame, -0.03);
  add(new T.TorusGeometry(0.045, 0.009, 5, 12), metal, 0.025);
  return {
    root,
    setOn(on) {
      window.material = on ? glass : dark;
    },
    dispose() {
      root.traverse((o) => o.geometry?.dispose());
      for (const m of [frame, metal, glass, dark]) m.dispose();
    }
  };
}
// The ore flare (Watch, 2026-10-26): a metal stick with a head of ore dust
// and its spark. The stick runs along +Y from the grip; the light it gives is
// drawn by the world's lighting, not by this model.
export function createFlareModel() {
  const root = new T.Group(),
    metal = material(0x809295),
    dust = material(0xa0603a),
    spark = material(0xffcf6a),
    core = material(0xfff1c4);
  const add = (geometry, mat, y) => {
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.y = y;
    root.add(mesh);
    return mesh;
  };
  add(new T.CylinderGeometry(0.024, 0.024, 0.34, 6), metal, 0.07);
  add(new T.CylinderGeometry(0.045, 0.04, 0.08, 8), dust, 0.28);
  const flame = add(new T.OctahedronGeometry(0.075), spark, 0.38),
    heart = add(new T.OctahedronGeometry(0.036), core, 0.38);
  return {
    root,
    setBurn(time) {
      const k = 1 + 0.18 * Math.sin(time * 31) + 0.1 * Math.sin(time * 17);
      flame.scale.set(k * 0.9, k * 1.3, k * 0.9);
      heart.scale.setScalar(0.8 + 0.3 * k);
      flame.rotation.y = time * 4;
    },
    dispose() {
      root.traverse((o) => o.geometry?.dispose());
      for (const m of [metal, dust, spark, core]) m.dispose();
    }
  };
}
