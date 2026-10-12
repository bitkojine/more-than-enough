/* The player's intents, applied to the game: each one calls the core and then
 * gives feedback (effects, sound, HUD, toasts) and schedules a save. */

import * as Core from '../core/index.js';
import { fmt } from './format.js';
import { RES_COLOR } from './effects.js';
import { clearSave, randomSeed } from './storage.js';

const GATHER_COOLDOWN = 0.25; // seconds between repeated actions while held
const ARRIVE_DIST = 0.18;     // tap-to-walk stops this close to the target
const STALL_SECONDS = 0.35;   // tap-to-walk gives up after this long blocked

const BUY_LABEL = { resup: ['✦ REFINE', '#9fe08a'], perk: ['✦ PERK', '#cbb0f0'] };

export function createController({ game, cam, fx, audio, hud }) {
  let cooldown = 0;
  let walkTo = null;
  let stalled = 0;

  const state = () => game.state;
  const player = () => game.state.player;
  const say = (text, color) => fx.text(player().x, player().y - 0.4, text, color);

  function changed() {
    hud.update(state());
    game.saveSoon();
  }

  function checkGoals() {
    if (!Core.advanceGoals(state())) return;
    hud.flashGoal();
    audio.fanfare();
    hud.update(state());
  }

  function harvested(r) {
    if (r.res) {
      fx.gathered(r.x, r.y, r.res, r.amount);
      audio.gather(r.res, r.amount, state().tools[r.res === 'wood' ? 'axe' : 'pickaxe']);
    } else {
      fx.dug(r.x, r.y);
      audio.dig();
    }
    if (r.now === Core.T.SHAFT_OPEN) hud.toast('Way down uncovered · tap the marked hatch to descend');
  }

  function collectNearby() {
    const got = Core.collect(state());
    if (!got) return false;
    for (const src of got.sources) fx.flyersFrom(src.x, src.y, src.res, src.amt);
    for (const r of Object.keys(got.gained)) say('+' + fmt(got.gained[r]) + ' ' + Core.RESOURCE_ICON[r], RES_COLOR[r]);
    audio.collect();
    changed();
    return true;
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

  function layerChanged(message) {
    fx.clear();
    walkTo = null;
    hud.toast(message);
    hud.update(state());
    hud.updateButtons(state());
    game.saveNow();
  }

  function descend(x, y) {
    if (!Core.descendAt(state(), x, y)) return false;
    layerChanged('Down to layer ' + (Core.SURFACE - player().z));
    return true;
  }

  const controller = {
    facing: { x: 0, y: 1 },
    hasMoved: false,
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
      } else if (walkTo) {
        const dx = walkTo.x - p.x, dy = walkTo.y - p.y;
        if (Math.hypot(dx, dy) < ARRIVE_DIST) walkTo = null;
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
      if (moved) controller.hasMoved = true;
      return moved;
    },

    // Gather pressed: act at once, then the hold repeats via tick().
    press() {
      if (cooldown <= 0 && act()) cooldown = GATHER_COOLDOWN;
    },

    tick(dt, holding) {
      cooldown -= dt;
      if (holding && cooldown <= 0 && act()) cooldown = GATHER_COOLDOWN;
    },

    // A tap on the map acts on that tile if it can (descend, harvest, collect),
    // otherwise walks there.
    tap(sx, sy) {
      const s = state();
      const w = cam.unproject(sx, sy);
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      if (descend(tx, ty)) return;
      const r = Core.harvestAt(s, tx, ty);
      if (r) { harvested(r); changed(); return; }
      const near = Core.collectTarget(s);
      if (near && near.list.some((e) => e.x === tx && e.y === ty)) { collectNearby(); return; }
      walkTo = { x: tx + 0.5, y: ty + 0.5 };
      stalled = 0;
    },

    // A finished Trail stroke (world points), or null if it was abandoned.
    trailEnded(points) {
      hud.hideTrailHint();
      if (!points) return;
      const s = state();
      const below = Core.isUnderground(s);
      let count = 0, gathered = 0;
      for (const t of Core.sweepTargets(s, points)) {
        const r = Core.harvestAt(s, t.x, t.y);
        if (!r) continue;
        count++;
        gathered += r.amount;
        if (below) harvested(r);
        else if (r.amount > 0) {
          audio.gather(r.res, r.amount, s.tools[r.res === 'wood' ? 'axe' : 'pickaxe']);
          fx.flyersFrom(r.x, r.y, r.res, r.amount);
        }
      }
      if (count) changed();
      if (below) hud.toast(count ? 'Trail dug ' + count + (count === 1 ? ' tile' : ' tiles') : 'Draw across nearby rock to dig');
      else if (!count) hud.toast('No green tiles crossed');
      else {
        say('Trail +' + fmt(gathered), '#b8ec9a');
        hud.toast('Trail gathered ' + fmt(gathered) + ' resources');
      }
    },

    toggleMine() {
      const s = state();
      if (Core.isUnderground(s)) {
        Core.leaveMine(s);
        layerChanged('Back in the forest');
      } else {
        Core.enterMine(s);
        layerChanged('Layer ' + (Core.SURFACE - s.player.z) + ' · dig through the rock to find a shaft');
      }
    },

    buy(id) {
      const s = state();
      const res = Core.buy(s, id);
      if (!res.ok) { hud.toast(res.reason); return; }
      const [label, color] = BUY_LABEL[Core.UPGRADES[id].kind] || ['✦ UPGRADE', '#9fe08a'];
      audio.upgrade();
      audio.drone(s.extractors.length, Core.overclockMult(s));
      say(label, color);
      changed();
      checkGoals();
    },

    place(key) {
      const s = state();
      const res = Core.place(s, key);
      if (!res.ok) { hud.toast(res.reason); return; }
      fx.built(res.x, res.y);
      audio.build();
      audio.drone(s.extractors.length, Core.overclockMult(s));
      changed();
      checkGoals();
    },

    embark() {
      const s = state();
      if (!Core.canEmbark(s)) { hud.toast('Gather ' + fmt(Core.EMBARK_MIN_TOTAL) + ' resources in this world first'); return; }
      const gain = Core.embarkGain(s);
      if (!window.confirm('Embark on a new world?\n\nYour world, inventory, extractors and upgrades reset. You keep Insight and perks, and gain ' + gain + ' Insight.')) return;
      const res = Core.embark(s, randomSeed());
      game.replace(res.state);
      audio.fanfare();
      hud.toast('New world — gained ' + res.gained + ' Insight');
    },

    reset() {
      if (!window.confirm('Start a brand new world? Current progress will be lost.')) return;
      clearSave();
      game.replace(Core.createState(randomSeed()));
      hud.toast('New world generated');
    },

    // Forget per-world intents when the world itself is replaced.
    forget() {
      walkTo = null;
      cooldown = 0;
    }
  };
  return controller;
}
