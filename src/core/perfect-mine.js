/* The Perfect brain underground and on the battery (perfect.js): keeping
 * the lamp charged at a charger or a solar panel, the way back up, digging
 * toward the finds that glint in the dark, lighting tunnels and opening the
 * way down. */

import { SURFACE, CHUNK_SIZE, tileDist2, unpackKey } from './coords.js';
import { T } from './tiles.js';
import {
  tileAt,
  isExplored,
  nearestExploredTile,
  wayUp,
  waysIn,
  walkable,
  observationVersion
} from './world.js';
import { atInteraction } from './interaction.js';
import { REACH, GEAR, FINDS, PROPS, GLINT_RANGE } from './content.js';
import { canAfford } from './economy.js';
import { canHarvest, gearNeeded } from './actions.js';
import { canWade, swimsAt } from './sim.js';
import { canDescendAt, canClimbAt, canPlaceProp, findsNear } from './underground.js';
import { charging } from './light.js';
import { key, dist, layerOf } from './perfect-util.js';
import { caveMouth } from './perfect-find.js';
import { walkTo, unreachable, explore } from './perfect-walk.js';

/* ------------------------------------------------------------ the battery */

const CHARGE_BELOW = 0.5; // battery share that sends it off to a charger
const CHARGE_FULL = 0.98; // ... and that it stays there until
const CHARGE_TRIP = 60; // tiles it'll go for a charge
const SOLAR_NEAR = 40; // tiles from home it puts its solar panel within

// Keeping the light up: once the battery has begun to run down, a solar
// panel on water near home; when it's low, off to a charger that works now
// (a solar panel only by day), staying by it till the battery is full.
export function power(s, mind) {
  if (s.player.z !== SURFACE) {
    mind.charger = null;
    return null;
  }
  let c = mind.charger;
  if (
    c &&
    (s.battery >= CHARGE_FULL || !charging(s.world.props.get(key(c.x, c.y, SURFACE)), s.time))
  )
    c = mind.charger = null;
  if (!c && s.battery < CHARGE_BELOW) c = mind.charger = nearestCharger(s, mind);
  if (!c) return solar(s, mind);
  const badge = 'mark.' + s.world.props.get(key(c.x, c.y, SURFACE));
  // Physics can charge from an unseen prop, but AUTO may only decide to
  // wait beside the observed charger it actually selected.
  if (atInteraction(s, c.x, c.y)) return { type: 'charge', badge };
  const step = walkTo(s, mind, c.x, c.y, badge);
  if (!step) mind.charger = null;
  return step;
}

// The nearest charger that works now within CHARGE_TRIP of you.
function nearestCharger(s, mind) {
  let best = null,
    bestD = CHARGE_TRIP;
  for (const [k, kind] of s.world.props) {
    const t = unpackKey(k);
    if (
      t.z !== SURFACE ||
      !isExplored(s.world, t.x, t.y, SURFACE) ||
      !charging(kind, s.time) ||
      mind.bad.has(k)
    )
      continue;
    const d = dist(s, t.x, t.y);
    if (d < bestD) {
      bestD = d;
      best = { x: t.x, y: t.y };
    }
  }
  return best;
}

// A solar panel on the water nearest home that's beside the shore, so it
// charges you from land too, unless there's a charger near home already.
function solar(s, mind) {
  if (s.battery >= 0.9 || !canWade(s) || !canAfford(s.inv, PROPS.solar.cost)) return null;
  const h = mind.home;
  for (const [k, kind] of s.world.props) {
    const t = unpackKey(k);
    if (
      t.z === SURFACE &&
      isExplored(s.world, t.x, t.y, SURFACE) &&
      PROPS[kind].charge &&
      Math.hypot(t.x - h.x, t.y - h.y) < SOLAR_NEAR
    )
      return null;
  }
  const w = s.world,
    land = (x, y) =>
      isExplored(w, x, y, SURFACE) && walkable(w, x, y, SURFACE) && !swimsAt(w, x, y, SURFACE);
  const free = (x, y) =>
    isExplored(w, x, y, SURFACE) &&
    swimsAt(w, x, y, SURFACE) &&
    !w.props.has(key(x, y, SURFACE)) &&
    !mind.bad.has(key(x, y, SURFACE)) &&
    (land(x + 1, y) || land(x - 1, y) || land(x, y + 1) || land(x, y - 1));
  const c = mind.spots.solar;
  const spot =
    c && (c.tile ? free(c.tile.x, c.tile.y) : s.time - c.t < 120)
      ? c.tile
      : nearestExploredTile(w, h.x + 0.5, h.y + 0.5, SURFACE, SOLAR_NEAR, free, null, T.WATER);
  mind.spots.solar = { t: c && c.tile === spot ? c.t : s.time, tile: spot };
  if (!spot) return null;
  if (Math.floor(s.player.x) === spot.x && Math.floor(s.player.y) === spot.y) {
    if (canPlaceProp(s, 'solar')) return { type: 'prop', kind: 'solar', badge: 'mark.solar' };
    unreachable(s, mind, spot.x, spot.y);
    return null;
  }
  return walkTo(s, mind, spot.x, spot.y, 'mark.solar');
}

/* -------------------------------------------------------------- the mine */

const UP_LOOK = 2;

function knownWayUp(s, mind) {
  const w = s.world,
    z = s.player.z;
  let best = null,
    bestD = Infinity;
  // Only inspect ways in chunks the player has explored, and only accept
  // explored tiles. The exit can be farther than the old 60-tile search.
  for (const k of w.explored.keys()) {
    const c = unpackKey(k);
    if (c.z !== z) continue;
    const x = c.x * CHUNK_SIZE,
      y = c.y * CHUNK_SIZE;
    for (const t of waysIn(w, z, x, y, x + CHUNK_SIZE - 1, y + CHUNK_SIZE - 1)) {
      if (!isExplored(w, t.x, t.y, z) || !wayUp(w, t.x, t.y, z) || mind.bad.has(key(t.x, t.y, z)))
        continue;
      const d = dist(s, t.x, t.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
  }
  return best;
}

// Up toward the surface: the ladder in reach, else the way up you know of
// nearest (the one you came down by, at least).
export function up(s, mind) {
  if (s.player.z === SURFACE) return null;
  const z = s.player.z,
    w = s.world;
  const ladder = nearestExploredTile(w, s.player.x, s.player.y, z, 2, (x, y) =>
    canClimbAt(s, x, y)
  );
  if (ladder) return { type: 'climb', x: ladder.x, y: ladder.y, badge: 'ui.climb' };
  // Looked for afresh every UP_LOOK seconds, not every step.
  const c = mind.upWay;
  if (
    !c ||
    c.z !== z ||
    s.time - c.t > UP_LOOK ||
    (c.way && mind.bad.has(key(c.way.x, c.way.y, z)))
  ) {
    mind.upWay = { z, t: s.time, way: knownWayUp(s, mind) };
  }
  const a = mind.arrived[z];
  const known =
    mind.upWay.way || (a && wayUp(w, a.x, a.y, z) && !mind.bad.has(key(a.x, a.y, z)) ? a : null);
  return known
    ? walkTo(s, mind, known.x, known.y, 'ui.climb') || explore(s, mind)
    : explore(s, mind);
}

// A trip to dig finds on mine layer `layer`: down the nearest cave mouth,
// on down the shafts, then tunnel to whatever glints nearest. `idle` is
// what to do instead when the trip can't go on (perfect.js passes its own,
// so this file doesn't import it back).
export function mine(s, mind, layer, idle) {
  const here = layerOf(s);
  if (here === 0) {
    const cave = caveMouth(s, mind);
    if (!cave) return explore(s, mind) || idle(s, mind);
    if (canDescendAt(s, cave.x, cave.y))
      return { type: 'descend', x: cave.x, y: cave.y, badge: 'ui.climbDown' };
    return walkTo(s, mind, cave.x, cave.y, 'ui.climbDown') || idle(s, mind);
  }
  if (here > layer) return up(s, mind) || idle(s, mind);
  const mark = beacon(s, mind) || lamp(s);
  if (mark) return mark;
  if (here < layer) {
    const down = shaftDown(s, mind);
    if (down) return down;
  }
  const productive = dig(s, mind) || explore(s, mind);
  if (productive) return productive;
  mind.mineFailures.set(layer, {
    version: observationVersion(s.world, SURFACE - layer),
    glints: here === layer ? glintSignature(s) : null
  });
  mind.how = null; // retreat must not immediately re-enter with the same plan
  return up(s, mind) || idle(s, mind);
}

export const glintSignature = (s) =>
  findsNear(s)
    .map((f) => key(f.x, f.y, s.player.z))
    .sort((a, b) => a - b)
    .join(',');

// A flag beside where you came down onto this layer, to find the way back by
// (it shows through the dark from anywhere on screen).
function beacon(s, mind) {
  const z = s.player.z,
    a = mind.arrived[z];
  if (mind.flagged.has(z) || !a || !canPlaceProp(s, 'flag') || !canAfford(s.inv, PROPS.flag.cost))
    return null;
  if (Math.abs(Math.floor(s.player.x) - a.x) + Math.abs(Math.floor(s.player.y) - a.y) > 2)
    return null;
  mind.flagged.add(z);
  return { type: 'prop', kind: 'flag', badge: 'mark.flag' };
}

const LAMP_GAP = 6; // tiles between glowcaps along a tunnel

// A glowcap where the tunnel has gone dark: none within LAMP_GAP of you.
function lamp(s) {
  if (!canPlaceProp(s, 'glowcap') || !canAfford(s.inv, PROPS.glowcap.cost)) return null;
  const px = Math.floor(s.player.x),
    py = Math.floor(s.player.y),
    z = s.player.z,
    props = s.world.props;
  for (let y = py - LAMP_GAP; y <= py + LAMP_GAP; y++) {
    for (let x = px - LAMP_GAP; x <= px + LAMP_GAP; x++)
      if (isExplored(s.world, x, y, z) && props.has(key(x, y, z))) return null;
  }
  return { type: 'prop', kind: 'glowcap', badge: 'mark.glowcap' };
}

// Down the nearest shaft you've seen on this layer: open it (a deliberate
// dig, never done by a Trail), then drop through.
function shaftDown(s, mind) {
  const z = s.player.z,
    w = s.world;
  const valid = (x, y) =>
    isExplored(w, x, y, z) &&
    !mind.bad.has(key(x, y, z)) &&
    (tileAt(w, x, y, z) === T.SHAFT_OPEN ||
      (tileAt(w, x, y, z) === T.SHAFT && !gearNeeded(s, x, y)));
  // A detour can temporarily put an already discovered shaft outside the
  // search radius too. Finish the route instead of exploring back and forth.
  if (mind.shaft && (mind.shaft.z !== z || !valid(mind.shaft.x, mind.shaft.y))) mind.shaft = null;
  const shaft = mind.shaft || nearestExploredTile(w, s.player.x, s.player.y, z, 40, valid);
  if (shaft) mind.shaft = { ...shaft, z };
  if (!shaft) return null;
  if (canDescendAt(s, shaft.x, shaft.y))
    return { type: 'descend', x: shaft.x, y: shaft.y, badge: 'ui.climbDown' };
  if (canHarvest(s, shaft.x, shaft.y))
    return { type: 'harvestAt', x: shaft.x, y: shaft.y, badge: 'ui.climbDown' };
  return walkTo(s, mind, shaft.x, shaft.y, 'ui.climbDown');
}

// Tunnel to the nearest find glinting in the dark that your Pickaxe can break.
export function dig(s, mind) {
  const z = s.player.z;
  // A route may initially lead away from the glint (around bedrock). Keep
  // the find we actually saw until collected or unreachable; losing sight
  // must not replace that route with exploration back toward the glint.
  const f = mind.find;
  const valid = (f) =>
    s.tools.pickaxe >= (GEAR.rock[f.type] || 1) &&
    !mind.bad.has(key(f.x, f.y, z)) &&
    (!mind.goal?.cost || Object.keys(FINDS[f.type].loot).some((r) => mind.goal.cost[r] > s.inv[r]));
  const observed = findsNear(s);
  if (
    f &&
    (f.z !== z ||
      !valid(f) ||
      (isExplored(s.world, f.x, f.y, z) && tileAt(s.world, f.x, f.y, z) !== f.type) ||
      (tileDist2(s.player, f.x, f.y, z) <= GLINT_RANGE * GLINT_RANGE &&
        !observed.some((v) => v.x === f.x && v.y === f.y)))
  )
    mind.find = null;
  const finds = mind.find ? [mind.find] : observed.filter(valid).sort((a, b) => a.d - b.d);
  for (const f of finds.slice(0, 3)) {
    mind.find = { ...f, z };
    if (tileDist2(s.player, f.x, f.y, z) <= REACH * REACH && canHarvest(s, f.x, f.y))
      return { type: 'harvestAt', x: f.x, y: f.y, badge: 'tool.pickaxe' };
    const step = walkTo(s, mind, f.x, f.y, 'tool.pickaxe');
    if (step) return step;
  }
  return null;
}
