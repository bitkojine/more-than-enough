/* The stockpile on the map: keeps the yard in step with what you own
 * (src/core/stockpile.js decides where piles go) and makes changes visible,
 * like the tiles of 2048: when ten piles become one bigger pile they slide
 * together and the bigger one pops up where they meet; piles that move to
 * make room slide there; new piles grow out of the ground; piles that just go
 * (you spent them) vanish in a puff. */

import * as Core from '../core/index.js';

const REFRESH = 0.2;     // seconds between layout checks while amounts change
const GROW_TIME = 0.35;  // seconds a new pile takes to grow to full size
const SLIDE_TIME = 0.8;  // seconds a pile takes to slide to a new spot or into a merge
const MERGED_SHRINK = 0.35; // how small a merging pile gets as it reaches the bigger one

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
const dist2 = (a, b) => (a.x + a.span / 2 - b.x - b.span / 2) ** 2 + (a.y + a.span / 2 - b.y - b.span / 2) ** 2;
const middleOf = (p) => ({ x: p.x + p.span / 2, y: p.y + p.span / 2 });

export function createYard({ fx, look }) {
  let signature = null;
  let piles = new Map(); // packed key of a pile's front-middle tile -> { x, y, span, res, tier, born, from?, moved? }
  let merging = []; // piles sliding into a bigger one: { x, y, span, res, tier, to, start }
  let covered = new Set(); // packed keys of every tile under a pile
  let wait = 0;
  const h = Core.home();
  const middle = { x: h.x + 0.5, y: h.y + 0.5 }; // the crossroads in the middle of home

  // Everything the layout depends on.
  const signatureOf = (s) => Core.RESOURCES.map((r) => Math.floor(s.inv[r])).join();

  function refresh(s, quiet) {
    const now = s.time;
    const show = !quiet && s.player.z === Core.SURFACE;
    const next = new Map();
    const under = new Set();
    const left = new Set(piles.values()); // piles not yet matched to the new layout
    const layout = Core.yardLayout(s);
    const placed = [];
    for (const p of layout) {
      // Drawn with the row of its front edge, so it covers what's behind it.
      const key = Core.packKey(p.x + (p.span >> 1), p.y + p.span - 1, Core.SURFACE);
      for (let y = p.y; y < p.y + p.span; y++) for (let x = p.x; x < p.x + p.span; x++) under.add(Core.packKey(x, y, Core.SURFACE));
      const old = piles.get(key);
      if (old && old.res === p.res && old.tier === p.tier && old.x === p.x && old.y === p.y) {
        next.set(key, old);
        left.delete(old);
      } else placed.push([key, p]);
    }
    // A pile of the same kind elsewhere slides over; otherwise it's new.
    const born = [];
    for (const [key, p] of placed) {
      let from = null;
      for (const o of left) if (o.res === p.res && o.tier === p.tier && (!from || dist2(o, p) < dist2(from, p))) from = o;
      if (from) {
        left.delete(from);
        next.set(key, show ? { ...p, born: from.born, from: { x: from.x, y: from.y }, moved: now } : { ...p, born: from.born });
      } else {
        const q = { ...p, born: quiet ? -Infinity : now };
        next.set(key, q);
        born.push(q);
      }
    }
    // Piles that go: into a new pile one size up of the same resource if
    // there is one (ten became one: it pops up once they reach it), else in
    // a puff.
    for (const o of left) {
      if (!show) continue;
      let into = null;
      for (const q of born) if (q.res === o.res && q.tier > o.tier && (!into || dist2(o, q) < dist2(o, into))) into = q;
      if (into) {
        into.born = now + SLIDE_TIME;
        merging.push({ ...o, to: into, start: now });
      } else fx.poof(o.x + o.span / 2, o.y + o.span / 2, look.color(Core.resourceLook(o.res)));
    }
    piles = next;
    covered = under;
  }

  return {
    // Called every frame; recomputes at most every REFRESH seconds.
    update(s, dt) {
      if (merging.length) {
        merging = merging.filter((m) => {
          if (s.time - m.start < SLIDE_TIME) return true;
          const at = middleOf(m.to);
          fx.poof(at.x, at.y, look.color(Core.resourceLook(m.res)));
          return false;
        });
      }
      if ((wait -= dt) > 0) return;
      const sig = signatureOf(s);
      if (sig === signature) return;
      wait = REFRESH;
      refresh(s, signature === null);
      signature = sig;
    },

    // A different world: lay its yard out afresh, without fanfare.
    reset() {
      signature = null;
      wait = 0;
      piles = new Map();
      merging = [];
    },

    // How grown a pile is (new piles grow in, overshooting a little like a
    // merged tile in 2048): 0 before it's born, then 1 once grown.
    growth(p, time) {
      const t = (time - p.born) / GROW_TIME;
      if (t >= 1) return 1;
      if (t <= 0) return 0;
      return 1 + 3 * (t - 1) ** 3 + 2 * (t - 1) ** 2;
    },

    // Where pile `p` stands now (its north-west corner, sliding if it moved),
    // and how big, 0..1 of its full size.
    at(p, time) {
      if (p.from) {
        const t = (time - p.moved) / SLIDE_TIME;
        if (t < 1) {
          const k = ease(Math.max(0, t));
          return { x: p.from.x + (p.x - p.from.x) * k, y: p.from.y + (p.y - p.from.y) * k, size: this.growth(p, time) };
        }
      }
      return { x: p.x, y: p.y, size: this.growth(p, time) };
    },

    // Piles sliding into a bigger one, each where it is now.
    *merging(time) {
      for (const m of merging) {
        const k = ease(Math.min(1, (time - m.start) / SLIDE_TIME));
        const to = middleOf(m.to), half = m.span / 2;
        yield {
          pile: m,
          x: m.x + (to.x - half - m.x) * k,
          y: m.y + (to.y - half - m.y) * k,
          size: 1 - (1 - MERGED_SHRINK) * k
        };
      }
    },

    // Where a newly gathered `res` lands: the middle of its smallest pile
    // (where single units go), or the middle of home before it has one.
    landing(res) {
      let best = null;
      for (const p of piles.values()) if (p.res === res && (!best || p.tier < best.tier)) best = p;
      return best ? { x: best.x + best.span / 2, y: best.y + best.span / 2 } : middle;
    },

    get piles() { return piles; },
    get covered() { return covered; }
  };
}
