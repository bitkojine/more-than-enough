/* AUTO's brain in a crystal world: what to do next to wake the machine.
 *
 * nextCrystalIntent(s, mind) looks at the game and names one step, as
 * perfect.js does for the old economy, and the game carries it out through
 * the calls a press makes (src/game/perfect.js), so a crystal room replays
 * it like any player's acts. It never changes the state itself; `mind`
 * (newCrystalMind) only remembers the route it is walking, the ways down it
 * took and where it has been, so it needn't search every time.
 *
 * The plan is the one scripts/cultivation-playtest.mjs proved wins fresh
 * worlds, but read afresh from the world each step, so it picks up wherever
 * the world is: a reload, a world played by hand, a shared world. What it
 * still needs comes from what is not yet built (needs()): tools first, then
 * stone and mycelium on the surface, metal underground, then deep down a
 * chamber and its cooler, a wild colony's starter planted, the carrier, the
 * machine's cooler, crystal enough for every repair, the first repair, the
 * heart fetched home in the shade with a camp at the hiding place, the other
 * repairs and the waking. It only goes by what has been seen: fog stays fog.
 *
 * Intents are perfect.js's (walk, harvestAt, buy, descend, climb, wait) and
 *   cultivate {cmd}       a crystal-world command (cultivation-commands.js),
 *                         in reach */

import { SURFACE } from './coords.js';
import { T, TILE_INFO } from './tiles.js';
import { tileAt, isExplored, nearestExploredTile, findSpawn } from './world.js';
import { harvestable, gearNeeded } from './actions.js';
import { canWade } from './sim.js';
import { canDescendAt } from './underground.js';
import { atInteraction } from './interaction.js';
import { canBuy, upgradeCost } from './upgrades.js';
import {
  CULTIVATION_RECIPES as R,
  MACHINE_REPAIRS,
  machineSections,
  machineRepairCost
} from './cultivation-model.js';
import { hidingPlace, carrierSun, carrierLoaded, HEART_WARM_LINE } from './cultivation-heart.js';
import { cultivationAt, cultivationTarget, facilitySite, DEEP } from './cultivation.js';
import { COOL, MIN_QUALITY } from './cultivation-commands.js';
import { sunLightStrength } from './illumination.js';
import { machineSeat } from './cultivation-seats.js';

// The tools bought first, in order, and the level each is bought to.
const TOOLS = [
  ['pickaxe', 2],
  ['boots', 2],
  ['pickaxe', 3]
];
const LEG = 48; // tiles walked on one plan toward somewhere far before planning again
const STUCK = 6; // walks asked for from the same tile before a target counts as out of reach
const FAR = 160; // tiles off, along the grid, past which a place is headed for, not routed to
const FIND_FOR = 10; // game seconds something found (or not) is kept before looking again
const wait = (why) => ({ type: 'wait', why, badge: 'ui.wait' });

/** @returns {object} a blank memory for nextCrystalIntent */
export function newCrystalMind() {
  return { state: null };
}

function fresh(s, mind) {
  if (mind.state !== s)
    Object.assign(mind, {
      state: s,
      route: null,
      ways: {}, // layer -> the way down taken from it last
      visits: new Map(),
      bad: new Set(),
      last: null,
      same: 0
    });
}

/** @returns {{type: string, badge: string}} the next step in crystal world `s` */
export function nextCrystalIntent(s, mind) {
  fresh(s, mind);
  const c = s.cultivation;
  if (!c) return wait('none');
  if (c.completed) return wait('done');
  const b = new Brain(s, mind);
  return b.decide() || wait('stuck');
}

// What the rest of the chapter costs, from what isn't built or done yet.
// `stock`: with something over for tending (gathering up top before going
// down); without, only a tend that's due now counts.
export function needs(s, stock = true) {
  const c = s.cultivation,
    f = c.facilities,
    n = { mycelium: 0, stone: 0, ore: 0, crystal: 0 };
  const add = (r, times = 1) => {
    for (const k in r) n[k] += r[k] * times;
  };
  const has = (k) => f.some((b) => b.kind === k);
  const machine = f.find((b) => b.kind === 'machine');
  if (!has('chamber')) add(R.chamber);
  add(R.cooler, Math.max(0, 2 - f.filter((b) => b.kind === 'cooler').length));
  if (!c.gear.carrier) add(R.carrier);
  if (stock) add(R.tend, 3);
  else if (f.some((b) => b.kind === 'chamber' && b.needsTend)) add(R.tend);
  if (c.heart?.where !== 'installed') {
    if (!has('bench') && !c.gear.lining) add(R.bench);
    if (!c.gear.lining) add(R.lining);
    if (!has('shelter')) add(R.shelter);
  }
  for (let i = machine ? machineSections(machine) : 0; i < MACHINE_REPAIRS.length; i++)
    add(MACHINE_REPAIRS[i]);
  return n;
}

class Brain {
  constructor(s, mind) {
    this.s = s;
    this.mind = mind;
    this.c = s.cultivation;
    this.z = s.player.z;
  }

  get feet() {
    return { x: Math.floor(this.s.player.x), y: Math.floor(this.s.player.y) };
  }
  seen(x, y) {
    return isExplored(this.s.world, x, y, this.z);
  }
  info(x, y) {
    return TILE_INFO[tileAt(this.s.world, x, y, this.z)];
  }
  pass(x, y) {
    if (!this.seen(x, y)) return false;
    const i = this.info(x, y);
    return i.walk
      ? !i.swim || canWade(this.s)
      : i.solid &&
          !!i.harvest &&
          tileAt(this.s.world, x, y, this.z) !== T.GEODE &&
          !gearNeeded(this.s, x, y);
  }
  short(res) {
    const want = needs(this.s, this.z === SURFACE)[res];
    return Math.max(0, want - (this.s.inv[res] || 0));
  }

  decide() {
    const { s, c } = this;
    for (const [id, level] of TOOLS) if (s.tools[id] < level) return this.tool(id);
    const machine = c.facilities.find((b) => b.kind === 'machine');
    const sections = machine ? machineSections(machine) : 0;
    if (c.heart?.where === 'carried') return this.heartHome(machine);
    if (sections >= 1 && sections < MACHINE_REPAIRS.length && c.heart?.where !== 'installed')
      return this.heartTrip();
    const top = this.topUp();
    if (top) return top;
    if (this.short('ore')) {
      if (this.z === SURFACE) return this.down();
      return this.gather('ore');
    }
    if (this.z > DEEP) return this.down();
    return this.deep(machine, sections);
  }

  // Short of what's gathered up top: up to get it.
  topUp() {
    if (!this.short('mycelium') && !this.short('stone')) return null;
    if (this.z < SURFACE) return this.climb();
    return this.gather(this.short('mycelium') ? 'mycelium' : 'stone');
  }

  tool(id) {
    if (canBuy(this.s, id)) return { type: 'buy', id, badge: 'ui.upgrade' };
    if (this.z < SURFACE) return this.climb();
    const cost = upgradeCost(this.s, id) || {};
    const res = Object.keys(cost).find((k) => (this.s.inv[k] || 0) < cost[k]);
    return res ? this.gather(res) : wait('tool');
  }

  /* -------------------------------------------------------- deep down */

  deep(machine, sections) {
    const { s, c } = this;
    const chamber = c.facilities.find((b) => b.kind === 'chamber');
    const growing = this.grow(chamber);
    if (growing) return growing;
    if (!c.gear.carrier) return { type: 'cultivate', cmd: { type: 'craft', kind: 'carrier' } };
    if (!machine) return this.findMachine();
    if (!this.coolerBy(machine)) return this.build('cooler', machine, 3);
    if (sections >= MACHINE_REPAIRS.length) return this.atMachine(machine, 'activate');
    // Only what the next repair takes: crystal carried up into the sun goes
    // dull, and dull crystal is freshened with new.
    if (s.inv.crystal < MACHINE_REPAIRS[sections].crystal || c.quality < MIN_QUALITY) {
      if (chamber.buffer >= 1) return this.command({ type: 'collect' }, chamber);
      return this.near(chamber) ? wait('growing') : this.go(chamber, true);
    }
    return this.atMachine(machine, 'repair');
  }

  // In a shared world the machine waits at your seat in the row: go there.
  findMachine() {
    const seat = this.s.shared && machineSeat(this.s.world, this.s.seat);
    if (!seat || seat.z !== this.z) return this.explore();
    if (!this.near(seat)) return this.go(seat, true);
    // It lies buried in the rock: dig it out.
    return this.info(seat.x, seat.y).walk ? this.explore() : this.harvest(seat);
  }

  // Work `type` at the machine once it's cool enough.
  atMachine(machine, type) {
    const cost = type === 'repair' ? machineRepairCost(machine) || {} : {};
    const res = ['ore', 'stone', 'mycelium'].find((k) => (this.s.inv[k] || 0) < (cost[k] || 0));
    if (res === 'ore') return this.gather('ore');
    if (res) return this.z < SURFACE ? this.climb() : this.gather(res);
    if (this.ready(machine)) return this.command({ type }, machine);
    return this.near(machine) ? wait('cooling') : this.go(machine, true);
  }

  // A chamber growing crystal: built by a wild colony, cooled, planted, tended.
  grow(chamber) {
    const { c } = this;
    if (!chamber) {
      // A chamber goes near a wild colony: its starter is planted there.
      const wild = this.find('wild', (p) => this.isWild(p));
      if (!wild) return this.explore();
      return this.build('chamber', wild.at, 4);
    }
    if (!this.coolerBy(chamber)) return this.build('cooler', chamber, 3);
    if (!chamber.health) {
      if (!c.starter) {
        const wild = this.find('wild', (p) => this.isWild(p));
        if (!wild) return this.explore();
        return this.command({ type: 'starter' }, wild.at);
      }
      return this.command({ type: 'plant' }, chamber);
    }
    if (chamber.needsTend) return this.command({ type: 'tend' }, chamber);
    return null;
  }

  // Whether the machine is cool enough to work on, and the crystal good enough.
  ready(machine) {
    const s = this.s;
    return (
      machine.temperature <= COOL &&
      cultivationTarget(s, machine) <= COOL &&
      this.c.quality >= MIN_QUALITY
    );
  }

  isWild(p) {
    return tileAt(this.s.world, p.x, p.y, this.z) === T.GEODE && !cultivationAt(this.s, p.x, p.y);
  }
  coolerBy(b) {
    return this.c.facilities.some(
      (f) => f.kind === 'cooler' && f.z === b.z && Math.abs(f.x - b.x) + Math.abs(f.y - b.y) <= 3
    );
  }

  /* ------------------------------------------------------- the heart */

  heartTrip() {
    const { c } = this;
    // A heart resting in a shelter is picked up there.
    if (typeof c.heart?.where === 'number') {
      const shelter = c.facilities.find((b) => b.id === c.heart.where);
      if (shelter && shelter.z === this.z) return this.command({ type: 'heart' }, shelter);
      if (shelter && this.z < shelter.z) return this.climb();
    }
    const top = this.topUp();
    if (top) return top;
    if (this.z < SURFACE) return this.climb();
    const hide = hidingPlace(this.s.world.seed);
    if (!this.near(hide)) return this.toward(hide);
    // Make camp: a bench lines the carrier, a shelter beside it is a stop.
    if (!c.gear.lining) {
      const bench = c.facilities.find((b) => b.kind === 'bench');
      if (!bench) return this.build('bench', hide, 3);
      return this.command({ type: 'line' }, bench);
    }
    if (!c.facilities.some((b) => b.kind === 'shelter')) return this.build('shelter', hide, 4);
    return this.command({ type: 'heart' }, hide);
  }

  heartHome(machine) {
    if (this.z === SURFACE) {
      const cool = this.keepCool();
      if (cool) return cool;
    }
    if (this.z > DEEP) return this.down(true);
    // Home: crystal from the chamber for the repair, then the heart goes in.
    return this.deep(machine, machine ? machineSections(machine) : 0);
  }

  // The sun warms the loaded carrier: near the line, into the nearest shade
  // seen (water, a riverbank, a cave mouth) until it has cooled.
  keepCool() {
    const { s, mind } = this;
    const warmth = this.c.carrierWarmth || 0;
    const sunAt = (p) => carrierSun(s, { ...p, z: this.z });
    if (!carrierLoaded(s) || sunLightStrength(s) <= 0) return ((mind.cooling = false), null);
    if (mind.cooling && warmth <= 0.5) mind.cooling = false;
    if (!mind.cooling && warmth < HEART_WARM_LINE * 0.6) return null;
    mind.cooling = true;
    if (sunAt(this.feet) === 0) return wait('cooling');
    const spot = this.route(
      'shade',
      (p) => this.pass(p.x, p.y) && this.info(p.x, p.y).walk && sunAt(p) === 0
    );
    if (!spot) return ((mind.cooling = false), null);
    return this.stepOn(spot) || wait('cooling');
  }

  /* --------------------------------------------- moving between layers */

  // `home`: the way down near home (carrying the heart back), not the nearest.
  down(home = false) {
    const { s, mind } = this;
    const z = this.z;
    const way = (p) =>
      this.info(p.x, p.y).descend || (z < SURFACE && tileAt(s.world, p.x, p.y, z) === T.SHAFT);
    const known = mind.ways[z];
    const at =
      known && this.seen(known.x, known.y) && way(known)
        ? { at: known }
        : home
          ? this.wayHome(way) || this.find('down', way)
          : this.find('down', way) || this.wayHome(way);
    if (!at) return this.explore();
    if (!this.near(at.at)) return this.go(at.at, true);
    if (!canDescendAt(s, at.at.x, at.at.y)) return this.harvest(at.at);
    mind.ways[z] = at.at;
    return { type: 'descend', x: at.at.x, y: at.at.y, badge: 'ui.climbDown' };
  }

  // A way down seen near home (the machine is under it), for the way back
  // from far off, when the one taken isn't remembered (a reload).
  wayHome(way) {
    const home = findSpawn(this.s.world);
    const at = nearestExploredTile(this.s.world, home.x, home.y, this.z, 300, (x, y) =>
      way({ x, y })
    );
    return at ? { at } : null;
  }

  climb() {
    const up = this.find('up', (p) => !!this.info(p.x, p.y).rise);
    if (!up) return this.explore();
    if (!this.near(up.at)) return this.go(up.at, true);
    return { type: 'climb', x: up.at.x, y: up.at.y, badge: 'ui.climb' };
  }

  /* ------------------------------------------------- doing things */

  gather(res) {
    const s = this.s;
    const t = this.find('res:' + res, (p) => {
      const i = this.info(p.x, p.y);
      return i.res === res && harvestable(s, p.x, p.y) && !gearNeeded(s, p.x, p.y);
    });
    if (!t) return this.explore();
    return this.harvest(t.at, 'resource.' + res);
  }

  harvest(at, badge = 'tool.pickaxe') {
    if (!this.near(at)) return this.go(at, true);
    return { type: 'harvestAt', x: at.x, y: at.y, badge };
  }

  near(at) {
    return atInteraction(this.s, at.x, at.y);
  }

  command(cmd, at) {
    if (at.z !== undefined && at.z !== this.z) return this.z < at.z ? this.climb() : this.down();
    if (!this.near(at)) return this.go(at, true);
    return { type: 'cultivate', cmd: { ...cmd, x: at.x, y: at.y }, badge: 'ui.build' };
  }

  // Building `kind` on a free tile within `radius` of `near`; rock there is dug out first.
  build(kind, near, radius) {
    const s = this.s;
    const close = (p) => Math.abs(p.x - near.x) + Math.abs(p.y - near.y) <= radius;
    const free = this.find(
      'site:' + kind,
      (p) => close(p) && this.info(p.x, p.y).walk && facilitySite(s, kind, p.x, p.y) === null
    );
    if (free) return this.command({ type: 'build', kind }, free.at);
    const rock = this.find(
      'rock:' + kind,
      (p) => close(p) && !this.info(p.x, p.y).walk && this.pass(p.x, p.y) && this.z < SURFACE
    );
    if (rock) return this.harvest(rock.at);
    if (Math.hypot(near.x - s.player.x, near.y - s.player.y) > 12) return this.toward(near);
    return this.explore();
  }

  /* --------------------------------------------------------- walking */

  // The nearest seen tile matching `want`, by the way there ({at}); what was
  // found is kept a while (under `name`) while it still matches.
  find(name, want) {
    const { mind, s } = this;
    const k = name + ',' + this.z;
    const f = mind.found?.[k];
    if (f && s.time - f.t < FIND_FOR && (!f.at || want(f.at))) return f.at ? { at: f.at } : null;
    const r = this.search(want);
    (mind.found ??= {})[k] = { t: s.time, at: r?.at ?? null };
    return r;
  }

  go(at, stopNear) {
    if (this.far(at)) return this.toward(at);
    const r = this.route('go:' + at.x + ',' + at.y, (p) => p.x === at.x && p.y === at.y, {
      stopNear: stopNear ? at : null
    });
    if (!r) {
      this.mind.bad.add(at.x + ',' + at.y + ',' + this.z);
      return this.toward(at);
    }
    return this.stepOn(r);
  }

  // Too far for one search to find the way (it looks FAR tiles out at most).
  far(at) {
    return Math.abs(at.x - this.s.player.x) + Math.abs(at.y - this.s.player.y) > FAR;
  }

  // Somewhere far on a map only partly seen: straight there once the way is
  // known, else to the edge of the known map that leads closest to it.
  toward(target) {
    const going =
      this.kept('go:' + target.x + ',' + target.y) ||
      this.kept('toward:' + target.x + ',' + target.y);
    if (going) return this.stepOn(going);
    const aim = (p) => 2 * Math.hypot(p.x - target.x, p.y - target.y);
    const known =
      !this.far(target) &&
      this.seen(target.x, target.y) &&
      this.route('go:' + target.x + ',' + target.y, (p) => p.x === target.x && p.y === target.y, {
        stopNear: target
      });
    const r =
      known ||
      this.route('toward:' + target.x + ',' + target.y, () => false, { frontier: true, aim });
    return r ? this.stepOn(r) : this.explore();
  }

  explore() {
    const r = this.route('explore', () => false, { frontier: true });
    if (!r) return this.nudge();
    return this.stepOn(r);
  }

  // Nothing seen to go by (back in a shared world, whose room keeps no fog):
  // a step into what's unseen beside you shows what's there.
  nudge() {
    const f = this.feet;
    const k = (this.mind.nudges = (this.mind.nudges || 0) + 1);
    for (let i = 0; i < 4; i++) {
      const [dx, dy] = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1]
      ][(k + i) % 4];
      if (!this.seen(f.x + dx, f.y + dy))
        return { type: 'walk', x: f.x + dx, y: f.y + dy, badge: 'ui.explore' };
    }
    return null;
  }

  // A route for `purpose`, kept while it is followed (or made afresh).
  route(purpose, want, opts = {}) {
    const { mind } = this;
    const f = this.feet;
    const kept = this.kept(purpose);
    if (kept) return kept;
    const found = this.search(want, opts);
    if (!found) return (mind.route = null);
    const path = [f, ...found.path].slice(0, opts.frontier && opts.aim ? LEG : Infinity);
    if (opts.frontier && !opts.aim) {
      const k = found.at.x + ',' + found.at.y + ',' + this.z;
      mind.visits.set(k, (mind.visits.get(k) || 0) + 1);
    }
    mind.route = { purpose, z: this.z, path, i: 0, stopNear: opts.stopNear || null };
    return mind.route;
  }

  // The route for `purpose` being walked, if it still leads on from here.
  kept(purpose) {
    const r = this.mind.route;
    const f = this.feet;
    if (!r || r.purpose !== purpose || r.z !== this.z) return null;
    const i = r.path.findLastIndex((p) => p.x === f.x && p.y === f.y);
    if (i < 0 || i >= r.path.length - 1 || (r.stopNear && this.near(r.stopNear))) return null;
    r.i = i;
    return r;
  }

  // The next step along route `r`: dig the tile if it's rock, else step on.
  stepOn(r) {
    const { mind } = this;
    const next = r.path[r.i + 1];
    if (!next) return ((mind.route = null), null);
    if (!this.info(next.x, next.y).walk)
      return { type: 'harvestAt', x: next.x, y: next.y, badge: 'tool.pickaxe' };
    const here = this.feet.x + ',' + this.feet.y + ',' + this.z;
    mind.same = mind.last === here ? mind.same + 1 : 0;
    mind.last = here;
    if (mind.same > STUCK) {
      mind.same = 0;
      mind.bad.add(next.x + ',' + next.y + ',' + this.z);
      mind.route = null;
      return wait('stuck');
    }
    return { type: 'walk', x: next.x, y: next.y, badge: 'ui.explore' };
  }

  // Cheapest-first over seen tiles (rock you could dig counts, dearer), to
  // the nearest tile `want` takes; with `frontier`, to the best seen tile
  // beside fog (the least visited, or by `aim`) if nothing is wanted.
  search(want, { frontier = false, aim = null } = {}) {
    const o = this.feet,
      q = { o, want, buckets: [[o]], cost: new Map([[o.x + ',' + o.y, 0]]), prev: new Map() };
    const edge = frontier ? this.edgeScore(aim) : () => Infinity;
    const home = (p) => p.x === o.x && p.y === o.y;
    let best = null,
      bestScore = Infinity;
    for (let d = 0; d < q.buckets.length && d <= 1200; d++)
      for (const p of q.buckets[d] || []) {
        if (q.cost.get(p.x + ',' + p.y) !== d) continue;
        if (!home(p) && want(p)) return { at: p, path: trace(q, p) };
        const score = edge(p, d);
        if (score < bestScore && !home(p)) [best, bestScore] = [p, score];
        this.spread(q, p, d);
      }
    return best && { at: best, path: trace(q, best) };
  }

  // How good a frontier tile `p`, `d` away, is to head for (Infinity: not one).
  edgeScore(aim) {
    const { mind, z } = this;
    return (p, d) => {
      const key = p.x + ',' + p.y + ',' + z;
      if (mind.bad.has(key)) return Infinity;
      const open =
        !this.seen(p.x + 1, p.y) ||
        !this.seen(p.x - 1, p.y) ||
        !this.seen(p.x, p.y + 1) ||
        !this.seen(p.x, p.y - 1);
      if (!open) return Infinity;
      return d + (aim ? aim(p) : (mind.visits.get(key) || 0) * 20);
    };
  }

  // The search reaching on from tile `p`, `d` away, to its four neighbours.
  spread(q, p, d) {
    const { mind, z } = this;
    for (const [x, y] of [
      [p.x + 1, p.y],
      [p.x - 1, p.y],
      [p.x, p.y + 1],
      [p.x, p.y - 1]
    ]) {
      if (Math.abs(x - q.o.x) > 256 || Math.abs(y - q.o.y) > 256 || !this.seen(x, y)) continue;
      const k = x + ',' + y;
      if (!q.want({ x, y }) && (!this.pass(x, y) || mind.bad.has(k + ',' + z))) continue;
      const nd = d + (this.info(x, y).walk ? 1 : 4);
      if ((q.cost.get(k) ?? Infinity) <= nd) continue;
      q.cost.set(k, nd);
      q.prev.set(k, p);
      (q.buckets[nd] ??= []).push({ x, y });
    }
  }
}

// The way from the search's start to tile `p`, start left out.
function trace(q, p) {
  const out = [];
  while (!(p.x === q.o.x && p.y === q.o.y)) {
    out.push(p);
    p = q.prev.get(p.x + ',' + p.y);
  }
  return out.reverse();
}
