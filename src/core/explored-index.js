/* Fog remains a Map on the wire and in saves. Its derived sparse quadtree
 * indexes existing chunks by layer: empty space costs no radius-squared scan.
 * Chunk coordinates fit the same fixed range as coords.js tile packing. */
import { unpackKey, CHUNK_SIZE } from './coords.js';

const HALF = 2 ** 20;
const SPAN = HALF * 2;

export class ExploredChunks extends Map {
  #layers = new Map();
  #revision = 0;
  get revision() { return this.#revision; }

  constructor(entries = []) {
    super();
    if (entries != null) for (const [key, mask] of entries) this.set(key, mask);
  }

  set(key, mask) {
    this.#revision++;
    if (!Number.isSafeInteger(key) || key < 0) return super.set(key, mask);
    const { x, y, z } = unpackKey(key);
    let node = this.#layers.get(z);
    if (!node) { node = { children: [], count: 0 }; this.#layers.set(z, node); }
    const added = !this.has(key);
    let ox = -HALF, oy = -HALF, size = SPAN;
    if (added) node.count++;
    while (size > 1) {
      const half = size / 2, right = x >= ox + half, down = y >= oy + half;
      const index = (down ? 2 : 0) + (right ? 1 : 0);
      if (right) ox += half;
      if (down) oy += half;
      size = half;
      node = node.children[index] ||= { children: [], count: 0 };
      if (added) node.count++;
    }
    node.entry = { x, y, mask };
    return super.set(key, mask);
  }

  delete(key) {
    if (!super.delete(key)) return false;
    this.#revision++;
    if (!Number.isSafeInteger(key) || key < 0) return true;
    const { x, y, z } = unpackKey(key);
    let node = this.#layers.get(z), ox = -HALF, oy = -HALF, size = SPAN;
    const path = [];
    node.count--;
    while (size > 1) {
      const half = size / 2, right = x >= ox + half, down = y >= oy + half;
      const index = (down ? 2 : 0) + (right ? 1 : 0);
      path.push([node, index]);
      if (right) ox += half;
      if (down) oy += half;
      size = half;
      node = node.children[index]; node.count--;
    }
    delete node.entry;
    for (let i = path.length - 1; i >= 0; i--) {
      const [parent, index] = path[i];
      if (!parent.children[index].count) delete parent.children[index];
    }
    if (!this.#layers.get(z).count) this.#layers.delete(z);
    return true;
  }

  clear() { super.clear(); this.#layers.clear(); this.#revision++; }

  // Inclusive chunk rectangle. Work counters are optional test diagnostics.
  visit(z, left, top, right, bottom, visitor, work = null) {
    const visit = (node, x, y, size) => {
      if (!node) return;
      if (work) work.nodes++;
      if (x > right || y > bottom || x + size <= left || y + size <= top) return;
      if (size === 1) {
        if (work) work.chunks++;
        const e = node.entry; visitor(e.x, e.y, e.mask); return;
      }
      const half = size / 2;
      visit(node.children[0], x, y, half);
      visit(node.children[1], x + half, y, half);
      visit(node.children[2], x, y + half, half);
      visit(node.children[3], x + half, y + half, half);
    };
    visit(this.#layers.get(z), -HALF, -HALF, SPAN);
  }

  // Nearest-first branch-and-bound. The visitor returns its best tile-ring
  // radius; branches strictly farther away cannot improve that answer.
  visitNearest(z, px, py, maxRadius, visitor, work = null) {
    let radius = maxRadius;
    const lowerBound = (x, y, size) => Math.max(
      x * CHUNK_SIZE - px, px - ((x + size) * CHUNK_SIZE - 1),
      y * CHUNK_SIZE - py, py - ((y + size) * CHUNK_SIZE - 1), 0);
    const visit = (node, x, y, size, lower) => {
      if (!node) return;
      if (work) work.nodes++;
      if (lower > radius) return;
      if (size === 1) {
        if (work) work.chunks++;
        const e = node.entry;
        radius = Math.min(radius, visitor(e.x, e.y, e.mask));
        return;
      }
      const half = size / 2, children = [];
      for (let i = 0; i < 4; i++) if (node.children[i]) {
        const cx = x + (i % 2) * half, cy = y + (i >> 1) * half;
        children.push({ node: node.children[i], x: cx, y: cy, lower: lowerBound(cx, cy, half) });
      }
      children.sort((a, b) => a.lower - b.lower);
      for (const c of children) visit(c.node, c.x, c.y, half, c.lower);
    };
    visit(this.#layers.get(z), -HALF, -HALF, SPAN, 0);
  }
}

// Plain Maps remain supported, including structuredClone snapshots and old
// callers. They iterate existing fog chunks, never every empty grid position.
export function visitExploredChunks(map, z, left, top, right, bottom, visitor, work = null) {
  if (map instanceof ExploredChunks) return map.visit(z, left, top, right, bottom, visitor, work);
  for (const [key, mask] of map) {
    if (work) work.nodes++;
    const p = unpackKey(key);
    if (p.z !== z || p.x < left || p.x > right || p.y < top || p.y > bottom) continue;
    if (work) work.chunks++;
    visitor(p.x, p.y, mask);
  }
}

export function visitNearestExploredChunks(map, z, px, py, maxRadius, visitor, work = null) {
  if (map instanceof ExploredChunks) return map.visitNearest(z, px, py, maxRadius, visitor, work);
  const left = Math.floor((px - maxRadius) / CHUNK_SIZE), right = Math.floor((px + maxRadius) / CHUNK_SIZE);
  const top = Math.floor((py - maxRadius) / CHUNK_SIZE), bottom = Math.floor((py + maxRadius) / CHUNK_SIZE);
  return visitExploredChunks(map, z, left, top, right, bottom, visitor, work);
}
