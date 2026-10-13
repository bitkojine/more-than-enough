/* The stockpile on the map: keeps the yard's layout in step with what you
 * own (src/core/stockpile.js decides where every pile goes) and makes changes
 * visible: new piles grow out of the ground, and piles that go (you spent
 * them, or ten of them became one bigger pile) vanish in a puff. */

import * as Core from '../core/index.js';

const REFRESH = 0.2;     // seconds between layout checks while amounts change
const GROW_TIME = 0.35;  // seconds a new pile takes to grow to full size

export function createYard({ fx, look }) {
  let signature = null;
  let piles = new Map(); // packed key of a pile's front-middle tile -> { x, y, span, res, tier, born }
  let covered = new Set(); // packed keys of every tile under a pile
  let wait = 0;
  const memo = {}; // the ground the yard stands on, kept between layouts

  // Everything the layout depends on.
  const signatureOf = (s) => Core.RESOURCES.map((r) => Math.floor(s.inv[r])).join() +
    '|' + s.extractors.length + '|' + s.world.holes.size + '|' + s.world.revealed;

  function refresh(s, quiet) {
    const next = new Map();
    const under = new Set();
    for (const p of Core.yardLayout(s, memo)) {
      // Drawn with the row of its front edge, so it covers what's behind it.
      const key = Core.packKey(p.x + (p.span >> 1), p.y + p.span - 1, Core.SURFACE);
      for (let y = p.y; y < p.y + p.span; y++) for (let x = p.x; x < p.x + p.span; x++) under.add(Core.packKey(x, y, Core.SURFACE));
      const old = piles.get(key);
      const same = old && old.res === p.res && old.tier === p.tier;
      next.set(key, same ? old : { ...p, born: quiet ? -Infinity : s.time });
    }
    if (!quiet && s.player.z === Core.SURFACE) {
      for (const [key, old] of piles) {
        const now = next.get(key);
        if (!now || now.res !== old.res || now.tier !== old.tier) fx.poof(old.x + old.span / 2, old.y + old.span / 2, look.color(Core.resourceLook(old.res)));
      }
    }
    piles = next;
    covered = under;
  }

  return {
    // Called every frame; recomputes at most every REFRESH seconds.
    update(s, dt) {
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
    },

    // How grown a pile is, 0..1 (new piles grow in).
    growth(p, time) {
      const t = Math.min(1, (time - p.born) / GROW_TIME);
      return t < 1 ? 1 - (1 - t) * (1 - t) : 1;
    },

    get piles() { return piles; },
    get covered() { return covered; }
  };
}
