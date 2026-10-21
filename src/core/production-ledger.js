/* Event-time hauling ledger. No per-tick or per-building update loop.
 * Rate/structure changes start a new epoch with materialized buffers; ordinary
 * observations use one binary search per distinct production rate.
 * This kernel uses cumulative production, independently of observation cadence.
 * The fixed-step compatibility path remains in sim.js until integration and
 * arithmetic/migration checks are complete. */

export function createProductionLedger(buildings, { tickHz = 60, epoch = 0 } = {}) {
  if (!Number.isSafeInteger(epoch) || epoch < 0 || !Number.isSafeInteger(tickHz) || tickHz < 1) {
    throw new Error('production-ledger-clock');
  }
  const groups = [], byRate = new Map(), members = new Map(), earned = Object.create(null);
  const work = { groups: 0, comparisons: 0, snapshots: 0, sortComparisons: 0 };
  let current = epoch;
  for (const b of buildings) {
    if (members.has(b.id) || !Number.isFinite(b.rate) || b.rate < 0 || !Number.isFinite(b.buffer) || b.buffer < 0 || b.buffer >= 1) {
      throw new Error('production-ledger-building');
    }
    let resources = byRate.get(b.resource);
    if (!resources) { resources = new Map(); byRate.set(b.resource, resources); earned[b.resource] = 0; }
    let group = resources.get(b.rate);
    if (!group) {
      group = { resource: b.resource, rate: b.rate, phases: [], credited: 0 };
      resources.set(b.rate, group); groups.push(group);
    }
    group.phases.push(b.buffer);
    members.set(b.id, { group, phase: b.buffer });
  }
  for (const g of groups) g.phases.sort((a, b) => { work.sortComparisons++; return a - b; });

  function accrued(group, tick) { return (tick - epoch) * group.rate / tickHz; }
  function validate(tick) {
    if (!Number.isSafeInteger(tick) || tick < current) throw new Error('production-ledger-time');
  }
  function advanceTo(tick) {
    validate(tick);
    if (tick === current) return { ...earned };
    for (const group of groups) {
      work.groups++;
      const amount = accrued(group, tick), whole = Math.floor(amount), phases = group.phases;
      // floor(phase + amount) is monotone in phase. Use the same floating
      // addition as scalar cumulative accounting, including boundary rounding.
      let lo = 0, hi = phases.length;
      while (lo < hi) {
        work.comparisons++;
        const mid = (lo + hi) >>> 1;
        if (Math.floor(phases[mid] + amount) > whole) hi = mid;
        else lo = mid + 1;
      }
      const total = phases.length * whole + phases.length - lo;
      const gain = total - group.credited, next = earned[group.resource] + gain;
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(next) || gain < 0) throw new Error('production-ledger-overflow');
      earned[group.resource] = next;
      group.credited = total;
    }
    current = tick;
    return { ...earned };
  }
  function snapshot(tick = current) {
    validate(tick);
    const out = [];
    for (const [id, member] of members) {
      work.snapshots++;
      const total = member.phase + accrued(member.group, tick);
      out.push({ id, resource: member.group.resource, rate: member.group.rate, buffer: total - Math.floor(total) });
    }
    return out;
  }
  function buffer(id, tick = current) {
    validate(tick);
    const member = members.get(id);
    if (!member) throw new Error('production-ledger-member');
    const total = member.phase + accrued(member.group, tick);
    return total - Math.floor(total);
  }
  return { advanceTo, snapshot, buffer,
    get tick() { return current; },
    get groups() { return groups.length; },
    get work() { return { ...work }; }
  };
}
