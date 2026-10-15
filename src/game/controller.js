/* The player's intents, applied to the game: each one calls the core and then
 * gives feedback (effects, sound, HUD, and the wanderer acting it out) and
 * schedules a save. Feedback is visual and audible only. */

import * as Core from '../core/index.js';
import { randomSeed } from './storage.js';
import { t } from '../i18n/i18n.js';
import { fmt } from './format.js';

const GATHER_COOLDOWN = 0.25; // seconds between repeated actions while held
const ARRIVE_DIST = 0.18;     // tap-to-walk stops this close to the target
const STALL_SECONDS = 0.35;   // tap-to-walk gives up after this long blocked

// `gathered(held)` hears every gather: `held` when a hold repeated it.
export function createController({ game, cam, fx, audio, hud, look, ask, actor, gathered = () => {} }) {
  let cooldown = 0;
  let walkTo = null;
  let stalled = 0;
  const drilling = { x: 0, y: 0, t: 0 }; // progress into the wall you're pushing

  const state = () => game.state;
  const player = () => game.state.player;
  const say = (text, color, icon) => fx.text(player().x, player().y - 0.4, text, color, icon);
  // "+n" of a resource over your head, adding up with the gains just before it.
  const tally = (res, amount) => fx.tally(player().x, player().y - 0.4, amount, look.color(Core.resourceLook(res)), Core.resourceLook(res));
  const toolLevel = (res) => state().tools[res === 'mycelium' ? 'basket' : 'pickaxe'];

  function changed() {
    hud.update(state());
    game.saveSoon();
  }

  // Milestones are celebrated when reached (a burst, a fanfare and a banner
  // naming each one), never announced ahead: what's next is for the wiki.
  function checkGoals() {
    const from = state().goalIndex;
    if (!Core.advanceGoals(state())) return;
    for (let i = from; i < state().goalIndex; i++) hud.milestone(Core.GOALS[i].text, i + 1, Core.goalsTotal(state()));
    fx.celebrate(player().x, player().y);
    actor.act('cheer');
    audio.fanfare();
  }

  // Every swing shakes what it hit and knocks chips off it. Plain dirt holds
  // nothing: its clods are tossed aside and it says +0, so digging through it
  // reads as clearing the way, not as gathering that failed.
  function harvested(r) {
    actor.act(r.res === 'mycelium' ? 'pick' : 'swing');
    fx.hit(Core.packKey(r.x, r.y, r.z), r.x, r.y, look.color(Core.tileLook(r.type)));
    if (r.found) {
      fx.found(r.x, r.y, look.color(Core.tileLook(r.type)), r.found);
      audio.collect();
      return;
    }
    if (r.newKind) {
      // A kind of mushroom never found before, in any world.
      fx.text(r.x + 0.5, r.y - 1, t('fx.newMushroom', { name: Core.MUSHROOMS[r.mushroom].name }), '#c9a6ff', null, -0.5, 2.6);
      audio.collect();
    }
    if (r.res) {
      fx.gathered(r.x, r.y, r.res, r.amount);
      audio.gather(r.res, r.amount, toolLevel(r.res));
      return;
    }
    fx.dug(r.x, r.y);
    if (r.type === Core.T.SOIL) fx.tossed(r.x, r.y, look.color(Core.tileLook(r.type)));
    audio.dig();
  }

  function collectNearby() {
    const got = Core.collect(state());
    if (!got) return false;
    for (const src of got.sources) fx.flyersFrom(src.x, src.y, src.res, src.amt);
    for (const r of Object.keys(got.gained)) tally(r, got.gained[r]);
    actor.act('collect');
    audio.collect();
    changed();
    return true;
  }

  // Works tile (tx, ty) if it's in reach: gather it, or collect the building
  // on it. Returns true if something was done.
  function workAt(tx, ty) {
    const r = Core.harvestAt(state(), tx, ty);
    if (r) { faceTile(tx, ty); harvested(r); changed(); return true; }
    const near = Core.collectTarget(state());
    if (!near || !near.list.some((e) => e.x === tx && e.y === ty)) return false;
    faceTile(tx, ty);
    return collectNearby();
  }

  // Turn to face tile (tx, ty), to work it.
  function faceTile(tx, ty) {
    const dx = tx + 0.5 - player().x, dy = ty + 0.5 - player().y;
    if (dx || dy) controller.facing = { x: dx, y: dy };
  }

  // Something to gather or collect on (tx, ty), wherever it is.
  function workable(tx, ty) {
    const s = state();
    return Core.harvestable(s, tx, ty) || s.extractors.some((e) => e.x === tx && e.y === ty && e.z === s.player.z && e.buffer >= 1);
  }

  // Walk to (tx, ty); with `work`, work it once it's in reach.
  function walkToward(tx, ty, work) {
    walkTo = { x: tx + 0.5, y: ty + 0.5, work: work ? { x: tx, y: ty } : null };
    stalled = 0;
  }

  // What Gather does right now: empty nearby extractors, else work the
  // nearest deposit. Underground there is no automatic target.
  function act() {
    if (Core.collectTarget(state())) return collectNearby();
    const r = Core.harvest(state());
    if (!r) return false;
    harvested(r);
    changed();
    return true;
  }

  function layerChanged(from) {
    actor.act(player().z < from ? 'down' : 'up');
    fx.clear();
    walkTo = null;
    hud.update(state());
    hud.updateButtons(state());
    game.saveNow();
  }

  // Through a way between layers within reach: down a hole, or up a ladder.
  function passAt(x, y) {
    const from = player().z;
    if (!Core.descendAt(state(), x, y) && !Core.climbAt(state(), x, y)) return false;
    layerChanged(from);
    return true;
  }

  const controller = {
    facing: { x: 0, y: 1 },
    checkGoals,

    // Moves by the input vector, or else toward a tapped destination.
    // Returns true if the player moved.
    steer(dt, dir) {
      const p = player();
      const before = { x: p.x, y: p.y };
      if (dir.x || dir.y) {
        walkTo = null;
        Core.move(state(), dir.x, dir.y, dt);
        controller.facing = dir;
        // Underground, pushing into rock digs it.
        const dug = Core.drill(state(), drilling, dir.x, dir.y, dt);
        if (dug) { harvested(dug); changed(); }
        else if (drilling.t > 0 && !actor.busy) actor.act('swing'); // chipping at the wall
      } else if (walkTo) {
        const dx = walkTo.x - p.x, dy = walkTo.y - p.y;
        // Walking to something tapped: work it as soon as it's in reach.
        if (walkTo.work && workAt(walkTo.work.x, walkTo.work.y)) { walkTo = null; gathered(false); }
        else if (Math.hypot(dx, dy) < ARRIVE_DIST) walkTo = null;
        else {
          Core.move(state(), dx, dy, dt);
          controller.facing = { x: dx, y: dy };
        }
      }
      const moved = Math.abs(p.x - before.x) + Math.abs(p.y - before.y) > 0.0004;
      if (walkTo) {
        stalled = moved ? 0 : stalled + dt;
        if (stalled > STALL_SECONDS) walkTo = null;
      }
      return moved;
    },

    // Gather pressed: act at once, then the hold repeats via tick().
    press() {
      if (cooldown <= 0 && act()) { cooldown = GATHER_COOLDOWN; gathered(false); }
    },

    // `holdAt`: a finger held still on the map (screen point), or null. It
    // works that tile over and over, like holding Gather.
    tick(dt, holding, holdAt) {
      cooldown -= dt;
      // The first gather of a hold is press()'s; these are its repeats.
      if (holding && cooldown <= 0 && act()) { cooldown = GATHER_COOLDOWN; gathered(true); }
      if (holdAt && cooldown <= 0) {
        const w = cam.unproject(holdAt.x, holdAt.y);
        const tx = Math.floor(w.x), ty = Math.floor(w.y);
        if (workAt(tx, ty)) { cooldown = GATHER_COOLDOWN; gathered(true); }
        else if (!walkTo && workable(tx, ty)) walkToward(tx, ty, true);
      }
    },

    // A tap on the map acts on that tile if it can (go down or up, harvest, collect).
    // Otherwise it walks there, and gathers or collects on arrival if there's
    // something to work: tapping a forest across the clearing goes and forages it.
    tap(sx, sy) {
      const w = cam.unproject(sx, sy);
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      if (passAt(tx, ty)) return;
      if (workAt(tx, ty)) { gathered(false); return; }
      walkToward(tx, ty, workable(tx, ty));
    },

    // A finished Trail stroke (world points), or null if it was abandoned.
    trailEnded(points) {
      if (!points) return;
      const s = state();
      const below = Core.isUnderground(s);
      let count = 0;
      const gathered = {};
      for (const t of Core.sweepTargets(s, points)) {
        const r = Core.harvestAt(s, t.x, t.y);
        if (!r) continue;
        count++;
        if (below) harvested(r);
        else if (r.amount > 0) {
          fx.hit(Core.packKey(r.x, r.y, r.z), r.x, r.y, look.color(Core.tileLook(r.type)));
          gathered[r.res] = (gathered[r.res] || 0) + r.amount;
          audio.gather(r.res, r.amount, toolLevel(r.res));
          fx.flyersFrom(r.x, r.y, r.res, r.amount);
        }
      }
      if (!count) return;
      if (!below) actor.act(gathered.mycelium ? 'pick' : 'swing');
      for (const res of Object.keys(gathered)) tally(res, gathered[res]);
      changed();
    },

    // The layer button: down the way you stand in, or up the ladder.
    toggleMine() {
      const from = player().z;
      if (Core.takeWay(state())) layerChanged(from);
    },

    buy(id) {
      const s = state();
      if (!Core.buy(s, id).ok) return;
      audio.upgrade();
      actor.act('cheer');
      say('✦', Core.UPGRADES[id].currency === 'insight' ? '#cbb0f0' : '#9fe08a');
      changed();
      checkGoals();
    },

    placeProp(kind) {
      const s = state();
      const res = Core.placeProp(s, kind);
      if (!res.ok) return;
      fx.built(res.x, res.y);
      actor.act('build');
      audio.build();
      changed();
    },

    place(key) {
      const s = state();
      const res = Core.place(s, key);
      if (!res.ok) return;
      fx.built(res.x, res.y);
      actor.act('build');
      audio.build();
      changed();
      checkGoals();
    },

    // Embark destroys a world, so it asks first.
    async embark() {
      if (!Core.canEmbark(state())) return;
      const yes = await ask({ title: t('ask.embark.title'), text: t('ask.embark.text', { n: fmt(Core.embarkGain(state())) }), yes: t('ask.embark.yes') });
      const s = state();
      if (!yes || !Core.canEmbark(s)) return;
      const res = Core.embark(s, randomSeed());
      game.replace(res.state);
      audio.fanfare();
      say('+' + res.gained, look.color('resource.insight'), 'resource.insight');
    },

    // Forget per-world intents when the world itself is replaced.
    forget() {
      walkTo = null;
      cooldown = 0;
    }
  };
  return controller;
}
