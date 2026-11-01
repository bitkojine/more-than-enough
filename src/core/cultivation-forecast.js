/* Clocks for what can go wrong with crystal, read straight from the rules
 * (Watch, 2026-11-01: "timers that tick down", not bars). Each forecast plays
 * the same rules forward on copies of the few numbers involved, as if
 * nothing around changed, so it reads like a fuse: walk into shade and the
 * clock changes with you. Read-only: nothing here touches the state. */
import { cultivationTarget, cultivationExposure } from './cultivation.js';
import {
  carrierSun,
  carrierLoaded,
  warmCarrier,
  heatDamage,
  heartLight,
  HEART_SUN,
  HEART_MEND
} from './cultivation-heart.js';
import { contentLocked } from './progression.js';

export const FORECAST_STEP = 0.25; // seconds: the rules' own step (stepCultivation)
export const FORECAST_HORIZON = 600; // seconds looked ahead; past it, no clock

// What Mica carries that can crack, most precious first, with the health it
// has and the health at which it is lost: the heart cracks right through at
// 0, a starter dies at 0, and carried crystal crumbles at 0% quality, the
// whole load at once (Watch, 2026-11-01).
function cargo(s) {
  const c = s.cultivation;
  if (c.heart?.where === 'carried') return { what: 'heart', health: c.heart.health, lostAt: 0 };
  if (c.starter) return { what: 'starter', health: c.starter.health, lostAt: 0 };
  if (s.inv.crystal > 0) return { what: 'crystal', health: c.quality, lostAt: 0 };
  return null;
}

/* What Mica carries, and its clocks, standing where Mica stands:
 *   what     'heart' | 'starter' | 'crystal'
 *   health   % sound now
 *   state    'cracking' (losing health now) | 'warming' (will start) | 'safe'
 *   crackIn  seconds until it starts cracking ('warming' only)
 *   lostIn   seconds until it is lost, if that happens within the horizon
 *   safeIn   seconds until a cracking carrier has cooled below the line
 * or null when nothing is carried. */
export function cargoForecast(s) {
  const item = s.cultivation ? cargo(s) : null;
  if (!item) return null;
  const run = playForward(item, carriedDamage(s, item.what));
  const out = { what: item.what, health: item.health, state: 'safe' };
  if (run.lostIn !== undefined) out.lostIn = run.lostIn;
  if (run.cracking === 0) {
    out.state = 'cracking';
    if (run.cooled !== null) out.safeIn = run.cooled;
  } else if (run.cracking !== null) {
    out.state = 'warming';
    out.crackIn = run.cracking;
  }
  return out;
}

// The damage what Mica carries takes, step by step, if Mica stands still:
// heat (the spot plus the carrier's sun warmth, warmed on a copy) and any
// light that gets in. `rising` says whether it can still get worse.
function carriedDamage(s, what) {
  const c = s.cultivation,
    p = { x: Math.floor(s.player.x), y: Math.floor(s.player.y), z: s.player.z };
  const base = cultivationTarget(s, p),
    carrier = !!c.gear.carrier,
    sun = carrier ? carrierSun(s, p) : 0,
    loaded = carrierLoaded(s);
  let light = carrier ? 0 : 9 * cultivationExposure(s, p);
  if (what === 'heart') light = HEART_SUN * heartLight(s, p);
  const copy = { carrierWarmth: c.carrierWarmth || 0 };
  return {
    rising: sun > 0,
    next: () =>
      heatDamage(base + (carrier ? warmCarrier(copy, sun, FORECAST_STEP, loaded) : 0)) + light
  };
}

// When cracking starts, when it stops (the carrier cooled) and when the
// item is lost, within the horizon; null for what doesn't happen.
function playForward(item, damage) {
  let health = item.health;
  const run = { cracking: null, cooled: null };
  for (let t = 0; t < FORECAST_HORIZON; t += FORECAST_STEP) {
    const d = damage.next();
    if (d > 0 && run.cracking === null) run.cracking = t;
    if (run.cracking === null) {
      if (!damage.rising) break; // cool and nothing warming it: safe
      continue;
    }
    if (d <= 0) {
      run.cooled = t;
      break;
    }
    health -= d * FORECAST_STEP;
    if (health <= item.lostAt) {
      run.lostIn = t + FORECAST_STEP;
      break;
    }
  }
  return run;
}

/* A building's clock: a chamber hotter than CRACK_ABOVE cracks its colony
 * (`dies`: seconds until its health reaches 0); a shelter holding the heart
 * mends it when cool (`mended`: seconds until 100%) and cracks it when hot
 * (`breaks`). Null when no clock runs. Temperatures settle as the rules
 * settle them (stepCultivation: toward the spot's own, over ~6 s). */
export function facilityForecast(s, b) {
  const c = s.cultivation;
  if (!c || contentLocked(s, b.kind)) return null;
  const heart = b.kind === 'shelter' && c.heart?.where === b.id ? c.heart : null;
  if (b.kind === 'chamber' && b.health > 0) return chamberClock(s, b);
  return heart?.health > 0 ? shelterClock(s, b, heart.health) : null;
}
// Settles a building's temperature one step toward its spot's.
function settling(s, b) {
  const target = cultivationTarget(s, b);
  let temperature = b.temperature ?? target;
  return () => (temperature = target + (temperature - target) * Math.exp(-FORECAST_STEP / 6));
}
function chamberClock(s, b) {
  const next = settling(s, b);
  let health = b.health;
  for (let t = 0; t < FORECAST_HORIZON; t += FORECAST_STEP) {
    const hot = heatDamage(next());
    if (!hot) return null; // cool: it heals, no clock
    health -= hot * FORECAST_STEP;
    if (health <= 0) return { dies: t + FORECAST_STEP };
  }
  return null;
}
function shelterClock(s, b, health) {
  const next = settling(s, b);
  for (let t = 0; t < FORECAST_HORIZON; t += FORECAST_STEP) {
    const hot = heatDamage(next());
    health += (hot ? -hot : HEART_MEND) * FORECAST_STEP;
    if (health <= 0) return { breaks: t + FORECAST_STEP };
    if (health >= 100) return t ? { mended: t + FORECAST_STEP } : null;
  }
  return null;
}
