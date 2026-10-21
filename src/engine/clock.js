/* Simulation time is a count of fixed ticks. Browser wall time is only an
 * adapter; headless runs advance the very same ticks without waiting. */
export const TICK_HZ = 60;
export const TICK_SECONDS = 1 / TICK_HZ;

export function createTickClock(tick) {
  let remainder = 0, ticks = 0;
  function advanceTicks(count) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid tick count'); // i18n-ok: invalid engine API arguments, a developer diagnostic
    for (let i = 0; i < count; i++) { tick(); ticks++; }
    return count;
  }
  return {
    get ticks() { return ticks; },
    get alpha() { return remainder; },
    advanceTicks,
    advance(elapsed) {
      if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid elapsed time'); // i18n-ok: invalid engine API arguments, a developer diagnostic
      // Retain the browser's existing 0.1-second active catch-up budget.
      // A slow screen cannot create an unbounded backlog and lock the UI.
      remainder += Math.min(elapsed, 0.1) * TICK_HZ;
      const count = Math.min(6, Math.floor(remainder + 1e-9));
      remainder = Math.max(0, remainder - count);
      return advanceTicks(count);
    },
    reset() { remainder = 0; }
  };
}
