/* The stockpile on the map: keeps the yard in step with what you own
 * (src/core/stockpile.js decides where piles go) and makes changes visible:
 * new piles grow out of the ground, and piles that go (you spent them, or ten
 * of them became one bigger pile) vanish in a puff.
 *
 * The yard stays put while you gather: piles that are still called for never
 * move, new ones take the best free spot. Only once in a while (TIDY_EVERY)
 * is it laid out tidily again, biggest piles back in the middle. */

import * as Core from '../core/index.js';

const REFRESH = 0.2;     // seconds between layout checks while amounts change
const GROW_TIME = 0.35;  // seconds a new pile takes to grow to full size
const TIDY_EVERY = 90;   // seconds between tidy-ups of the yard

export function createYard({ fx, look }) {
  let signature = null;
  let piles = new Map(); // packed key of a pile's front-middle tile -> { x, y, span, res, tier, born }
  let covered = new Set(); // packed keys of every tile under a pile
  let wait = 0;
  let tidyIn = TIDY_EVERY;
  let middle = { x: 0.5, y: 0.5 }; // the middle of home ground
  const memo = {}; // the ground the yard stands on, kept between layouts

  // Everything the layout depends on.
  const signatureOf = (s) => Core.RESOURCES.map((r) => Math.floor(s.inv[r])).join() +
    '|' + s.extractors.length + '|' + s.world.revealed;

  // `fresh` lays the yard out tidily; otherwise it settles around what stands.
  function refresh(s, quiet, fresh) {
    const h = Core.home(s);
    middle = { x: h.x + 0.5, y: h.y + 0.5 };
    const next = new Map();
    const under = new Set();
    const layout = fresh ? Core.yardLayout(s, memo) : Core.yardSettle(s, [...piles.values()], memo);
    for (const p of layout) {
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
      tidyIn -= dt;
      if ((wait -= dt) > 0) return;
      const sig = signatureOf(s);
      const tidy = tidyIn <= 0;
      if (sig === signature && !tidy) return;
      wait = REFRESH;
      if (tidy) tidyIn = TIDY_EVERY;
      const first = signature === null;
      refresh(s, first, first || tidy);
      signature = sig;
    },

    // A different world: lay its yard out afresh, without fanfare.
    reset() {
      signature = null;
      wait = 0;
      piles = new Map();
      tidyIn = TIDY_EVERY;
    },

    // How grown a pile is, 0..1 (new piles grow in).
    growth(p, time) {
      const t = Math.min(1, (time - p.born) / GROW_TIME);
      return t < 1 ? 1 - (1 - t) * (1 - t) : 1;
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
