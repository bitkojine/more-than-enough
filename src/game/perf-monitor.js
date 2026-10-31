import { RENDER_FPS } from './quality.js';
/* Bounded, browser-independent measurements. Timings are CPU time, not GPU time.
 * A window never mixes deliberate frame rates or background suspension gaps. */
export const PERF_PHASES = [
  'simulation',
  'presentation',
  'scene',
  'terrain',
  'actors',
  'lighting',
  'effects',
  'other'
];
const LIMIT = 600,
  HISTORY = 60,
  INCIDENTS = 20;
const TIMING_KEYS = [
  'callbackWorkMs',
  'outsideLoopMs',
  'capAllowanceMs',
  'overTargetMs',
  'rafCallbacks',
  'rafAgeMs'
];
function timingSummary(samples) {
  const measured = samples.filter((s) => s.pacing);
  const result = { available: measured.length > 0, samples: measured.length };
  for (const key of TIMING_KEYS)
    result[key] = measured.length
      ? measured.reduce((sum, s) => sum + s.pacing[key], 0) / measured.length
      : null;
  return result;
}
function cleanTiming(value) {
  if (!value || !TIMING_KEYS.every((key) => Number.isFinite(value[key]) && value[key] >= 0))
    return null;
  return Object.fromEntries(TIMING_KEYS.map((key) => [key, value[key]]));
}
export function createPerfMonitor() {
  let samples = [],
    cursor = 0,
    clock = 0,
    history = [],
    incidents = [],
    target = RENDER_FPS,
    elapsed = 0,
    settle = 1000,
    ack = new Map(),
    latest = null;
  const ordered = () =>
    samples.length < LIMIT ? samples : samples.slice(cursor).concat(samples.slice(0, cursor));
  const summarize = () => {
    const window = ordered().filter((s) => clock - s.end < 2000);
    const n = window.length || 1,
      values = window.map((s) => s.interval).sort((a, b) => a - b);
    const phases = PERF_PHASES.map((key) => ({
      key,
      ms: window.reduce((v, s) => v + (s.phases[key] || 0), 0) / n,
      worst: Math.max(0, ...window.map((s) => s.phases[key] || 0))
    }));
    const frameMs = values.reduce((a, b) => a + b, 0) / n;
    return {
      target,
      budget: 1000 / target,
      count: samples.length,
      windowFrames: window.length,
      fps: frameMs ? 1000 / frameMs : 0,
      frameMs,
      p95: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] || 0,
      worstMs: values.at(-1) || 0,
      phases,
      cpuMs: phases.reduce((sum, p) => sum + p.ms, 0),
      pacing: timingSummary(window),
      history: [...history],
      incidents: [...incidents],
      latest
    };
  };
  return {
    reset() {
      samples = [];
      cursor = 0;
      clock = 0;
      history = [];
      latest = null;
      elapsed = 0;
      settle = 1000;
    },
    acknowledge() {
      for (const issue of incidents)
        ack.set(issue.cause, Math.max(ack.get(issue.cause) || 0, issue.ratio));
    },
    sample(interval, phases, nextTarget, context = {}, pacing = null) {
      if (!(interval > 0) || !Number.isFinite(interval)) return null;
      if (nextTarget !== target) {
        target = nextTarget;
        samples = [];
        cursor = 0;
        clock = 0;
        history = [];
        latest = null;
        elapsed = 0;
        settle = 1000;
      }
      const clean = {};
      for (const key of PERF_PHASES) clean[key] = Math.max(0, Number(phases[key]) || 0);
      if (settle > 0) {
        settle -= Math.min(interval, 250);
        return null;
      }
      clock += interval;
      const sample = { interval, phases: clean, pacing: cleanTiming(pacing), end: clock };
      if (samples.length < LIMIT) samples.push(sample);
      else {
        samples[cursor] = sample;
        cursor = (cursor + 1) % LIMIT;
      }
      elapsed += interval;
      // A visible hitch is retained even if the one-second average masks it.
      if (elapsed < 1000 && interval < Math.max(100, 3000 / target)) return null;
      elapsed = 0;
      const recent = ordered().filter((s) => clock - s.end < 1000);
      const avg = recent.reduce((a, s) => a + s.interval, 0) / recent.length,
        budget = 1000 / target;
      const costs = PERF_PHASES.map((key) => ({
        key,
        ms: recent.reduce((a, s) => a + s.phases[key], 0) / recent.length
      })).sort((a, b) => b.ms - a.ms);
      const cpu = costs.reduce((a, p) => a + p.ms, 0),
        ratio = Math.max(avg / budget, interval / budget / 2);
      const timing = timingSummary(recent),
        overTarget = Math.max(0, avg - budget);
      const loopOverBudget = timing.available && timing.callbackWorkMs > budget;
      const warning =
        avg > budget * 1.12 ||
        interval >= Math.max(100, budget * 3) ||
        cpu > budget ||
        loopOverBudget;
      const small = costs[0].ms > Math.max(2, budget * 0.1);
      // A largest cost below budget is an observation, not a proven cause.
      // Deliberate cap waiting is never called unexplained browser/GPU work.
      const cadence = avg > budget * 1.04;
      const cause = warning
        ? cpu > budget
          ? costs[0].key
          : loopOverBudget
            ? 'loop'
            : 'unattributed'
        : cadence
          ? 'cadence'
          : costs[0].key;
      const evidence =
        cpu > budget
          ? 'cpu-over-budget'
          : loopOverBudget
            ? 'loop-over-budget'
            : cadence
              ? 'interval-over-target'
              : warning
                ? 'unexplained-hitch'
                : 'cost-observation';
      const issue = {
        cause,
        warning,
        evidence,
        pacing: timing,
        overTargetMs: overTarget,
        ratio,
        frameMs: avg,
        worstMs: Math.max(...recent.map((s) => s.interval)),
        cpuMs: cpu,
        phases: costs,
        preceding: history.slice(-10),
        context: { ...context },
        at: Date.now()
      };
      history.push({ ms: avg, budget });
      if (history.length > HISTORY) history.shift();
      latest = warning || small || cadence ? issue : null;
      if (!latest) return null;
      const previous = incidents.at(-1);
      if (previous?.cause === cause && previous.warning === warning) {
        issue.occurrences = (previous.occurrences || 1) + 1;
        incidents[incidents.length - 1] = issue;
      } else {
        incidents.push(issue);
        if (incidents.length > INCIDENTS) incidents.shift();
      }
      const acknowledged = ack.get(cause) || 0;
      return warning && (!acknowledged || ratio > acknowledged * 1.5) ? issue : null;
    },
    snapshot: summarize
  };
}
