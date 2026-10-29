/* The player's intents, applied to the game: each one calls the core and then
 * gives feedback (effects, sound, HUD, and the wanderer acting it out) and
 * schedules a save. Feedback is visual and audible only. */

import * as Core from '../core/index.js';
import { randomSeed } from './storage.js';
import { t } from '../i18n/i18n.js';
import { fmt } from './format.js';

const ARRIVE_DIST = 0.18;     // tap-to-walk stops this close to the target
const STALL_SECONDS = 0.35;   // tap-to-walk gives up after this long blocked
const REPLANS = 40;           // times a tapped walk finds a new way when one turns out blocked

// `gathered(held)` hears every gather: `held` when a hold repeated it.
export function createController({ game, cam, fx, audio, hud, look, ask, actor, gathered = () => {} }) {
  // Every way of working a tile takes turns on one clock (core pace.js), so
  // holding Gather is as fast as it gets: a press, a tap, a Trail, a dug
  // wall or AUTO waits for the next turn instead of coming sooner.
  let hand = Core.handClock(), handOf = null;
  let pressed = false; // a press that came early: done on the next turn
  let trail = [];      // a Trail's tiles still to work, a turn each
  let walkTo = null, walkSerial = 0;
  let stalled = 0;
  const drilling = { x: 0, y: 0, t: 0 }; // progress into the wall you're pushing

  const state = () => game.state;
  const player = () => game.state.player;
  const say = (text, color, icon) => fx.text(player().x, player().y - 0.4, text, color, icon);
  // "+n" of a resource over your head, adding up with the gains just before it.
  const tally = (res, amount) => fx.tally(player().x, player().y - 0.4, amount, look.color(Core.resourceLook(res)), Core.resourceLook(res));
  const toolLevel = (res) => state().tools[res === 'mycelium' ? 'basket' : 'pickaxe'];

  function handFree() {
    if (handOf !== state()) { handOf = state(); hand = Core.handClock(); pressed = false; trail = []; }
    return Core.handReady(hand, state().stats.playedMs);
  }
  const handUsed = () => Core.useHand(hand, state().stats.playedMs);

  function performAct(kind,detail={}){actor.act(kind,{...detail,facing:{...controller.facing}});}

  function changed() {
    hud.update(state());
    game.saveSoon();
  }

  // Milestones are celebrated when reached: a burst, a fanfare and a banner
  // naming each one. The Awards sheet shows the next one.
  function checkGoals() {
    const from = state().goalIndex;
    const reached = Core.advanceGoals(state());
    if (!reached.length) return;
    const next = Core.nextGoal(state());
    reached.forEach((g, i) => hud.milestone(g.reached, from + i + 1, Core.goalsTotal(state()), i === reached.length - 1 && next ? next.text : null));
    fx.celebrate(player().x, player().y);
    performAct('cheer');
    audio.fanfare();
  }

  // Every swing shakes what it hit and knocks chips off it. Plain dirt holds
  // nothing: its clods are tossed aside and it says +0, so digging through it
  // reads as clearing the way, not as gathering that failed.
  function harvested(r) {
    faceTile(r.x,r.y);
    performAct(r.res === 'mycelium' || state().tools.pickaxe === 0 ? 'pick' : 'swing');
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

  function collectNearby(at=null) {
    if (!handFree()) return false;
    const got = Core.collect(state(),at);
    if (!got) return false;
    handUsed();
    for (const src of got.sources) fx.flyersFrom(src.x, src.y, src.res, src.amt);
    for (const r of Object.keys(got.gained)) tally(r, got.gained[r]);
    const sources=got.sources;
    const target=at&&sources.find(p=>p.x===at.x&&p.y===at.y)||sources.reduce((best,p)=>!best||Core.tileDist2(player(),p.x,p.y,player().z)<Core.tileDist2(player(),best.x,best.y,player().z)?p:best,null);
    if(target)faceTile(target.x,target.y);
    performAct('collect');
    audio.collect();
    changed();
    return true;
  }

  // Says which tool level something takes, when that's all that's missing.
  function needsGear(g) {
    hud.toast(t('reason.gear', { tool: Core.TOOLS[g.tool].name, lv: g.level }));
  }

  // Works tile (tx, ty) if it's in reach: collect the building on it, or
  // gather it. Returns true if something was done, 'gear' if it's in reach
  // but takes a better tool (the player is told which), 'wait' if it's in
  // reach but this turn of the hand is used, else false.
  function workAt(tx, ty) {
    const near = Core.collectTarget(state(),{x:tx,y:ty});
    const collects = near && near.list.some((e) => e.x === tx && e.y === ty);
    if (!handFree()) return collects || Core.canHarvest(state(), tx, ty) ? 'wait' : false;
    if (collects) { faceTile(tx, ty); return collectNearby({x:tx,y:ty}); }
    const r = Core.harvestAt(state(), tx, ty);
    if (r) { handUsed(); faceTile(tx, ty); harvested(r); changed(); return true; }
    const gear = Core.gearBlocks(state(), tx, ty);
    if (gear) { faceTile(tx, ty); needsGear(gear); return 'gear'; }
    return false;
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
  // `stand`: walk there instead, and work (tx, ty) from it.
  // `around`: find the way round whatever is in the way (core paths.js),
  // as a tap does; else head straight there, as AUTO's single steps do.
  function walkToward(tx, ty, work, stand = null, around = false) {
    const to = stand || { x: tx, y: ty };
    walkTo = { id: ++walkSerial, x: to.x + 0.5, y: to.y + 0.5, work: work ? { x: tx, y: ty } : null,
      goal: to, plan: around ? Core.planWalk(state(), to.x, to.y) : null, replans: 0 };
    stalled = 0;
  }

  // Where a walk heads this tick: along its way round, planned again when
  // that turns out blocked (straight at it once there's none). 'done' when
  // you're beside a goal you can't stand on.
  function aimOf(w) {
    if (!w.plan) return w;
    let aim = w.plan.nodes.length ? Core.walkAim(state(), w.plan) : {x:w.x,y:w.y};
    if (aim === null && w.replans++ < REPLANS) {
      w.plan = Core.planWalk(state(), w.goal.x, w.goal.y);
      aim = w.plan && Core.walkAim(state(), w.plan);
    }
    if(aim==='done'){
      const nodes=w.plan.nodes,goal=nodes.at(-1),stop=goal&&Core.walkable(state().world,goal.x,goal.y,player().z)?goal:nodes.at(-2)||w.plan.from;
      if(stop&&Math.hypot(stop.x+.5-player().x,stop.y+.5-player().y)>=ARRIVE_DIST)aim={x:stop.x+.5,y:stop.y+.5};
    }
    if (!aim) { w.plan = null; return w; }
    return aim;
  }

  // One approach/action path for UI and automation. Four observed contact
  // sites are routed once per order, never searched again on ordinary ticks.
  function approach(x,y,action){
    walkTo=null;
    if(Core.atInteraction(state(),x,y)){faceTile(x,y);return action();}
    const s=state();let best=null;
    for(const site of Core.interactionSites(s,x,y)){
      if(Core.swimsAt(s.world,site.x+.5,site.y+.5,s.player.z)&&!Core.canWade(s))continue;
      const plan=Core.planWalk(s,site.x,site.y);if(!plan)continue;
      const cost=plan.nodes.length+Math.hypot(site.x+.5-player().x,site.y+.5-player().y)*.001;
      if(!best||cost<best.cost)best={site,plan,cost};
    }
    if(!best)return false;
    walkToward(best.site.x,best.site.y,false);
    walkTo.plan=best.plan;walkTo.action={x,y,run:action,state:s,z:player().z};
    return 'walking';
  }

  // What Gather does right now: empty nearby extractors, else work the
  // nearest deposit; underground, dig the rock around you.
  function act() {
    if (!handFree() || walkTo?.action) return false;
    if (Core.collectTarget(state())) return collectNearby();
    const r = Core.harvest(state());
    if (!r) return false;
    handUsed();
    harvested(r);
    changed();
    return true;
  }

  // Works the Trail's next tile still in reach (one turn of the hand).
  function workTrail() {
    if(walkTo?.action)return;
    while (trail.length) {
      const t = trail[0];
      if(!Core.atInteraction(state(),t.x,t.y)){
        if(Core.harvestable(state(),t.x,t.y)&&!Core.gearNeeded(state(),t.x,t.y)){if(!approach(t.x,t.y,()=>true))trail.shift();return;}
        trail.shift();continue;
      }
      trail.shift();
      const r = Core.harvestAt(state(), t.x, t.y);
      if (!r) continue;
      handUsed();
      faceTile(t.x, t.y);
      harvested(r);
      changed();
      return;
    }
  }

  function layerChanged(from) {
    performAct(player().z < from ? 'down' : 'up');
    fx.clear();
    walkTo = null;
    hud.update(state());
    hud.updateButtons(state());
    game.saveNow();
  }

  // Through a way between layers within reach: down a hole, or up a ladder.
  function passAt(x, y) {
    const from = player().z;
    if(!Core.atInteraction(state(),x,y))return false;
    faceTile(x,y);
    if (!Core.descendAt(state(), x, y) && !Core.climbAt(state(), x, y)) return false;
    layerChanged(from);
    return true;
  }

  // Explore pressed with nothing in reach (a new player's first press, in
  // the bare clearing at home): head for the nearest resource in sight and
  // work it on arrival, as a tap on it would; underground, for the rock most
  // worth digging in sight. Nothing in sight: say how to walk, or which tool
  // the rock around you takes.
  function explore(quiet = false) {
    const s = state();
    const to = s.player.z === Core.SURFACE ? Core.nearestWork(s) : Core.nearestDig(s);
    if (to) walkToward(to.x, to.y, true, to.stand, true);
    else if (quiet) return;
    else if (!Core.isUnderground(s)) hud.toast(t('tip.walk'));
    else {
      // Rock all around but no pick to dig it with: say which tool it takes.
      const px = Math.floor(s.player.x), py = Math.floor(s.player.y);
      for (let y = py - 3; y <= py + 3; y++) for (let x = px - 3; x <= px + 3; x++) {
        const g = Core.harvestable(s, x, y) && Core.gearNeeded(s, x, y);
        if (g) return needsGear(g);
      }
    }
  }

  const controller = {
    facing: { x: 0, y: 1 },
    checkGoals,
    approach,
    cultivation(cmd,finished=null){
      const x=cmd.x??Math.floor(player().x),y=cmd.y??Math.floor(player().y);
      if(!['craft','lantern'].includes(cmd.type)){
        if(!Core.atInteraction(state(),x,y)){const queued=approach(x,y,()=>controller.cultivation(cmd,finished));if(!queued)finished?.('reach');return queued||'reach';}
        walkTo=null;
      }
      const result=Core.cultivationCommand(state(),cmd);
      if(['ok','lifted','discovery','activated'].includes(result)){
        faceTile(cmd.x??Math.floor(player().x),cmd.y??Math.floor(player().y));
        const action={build:'build',repair:'build',reinforce:'build',craft:'build',collect:'collect',store:'collect',shade:'collect',lantern:'collect',plant:'pick',tend:'pick',starter:'pick',heart:'pick',activate:'cheer'}[cmd.type];
        if(action)performAct(action,{work:cmd.type});
        changed();checkGoals();
      }
      finished?.(result);
      return result;
    },

    // Moves by the input vector, or else toward a tapped destination.
    // Returns true if the player moved.
    steer(dt, dir) {
      const p = player();
      const before = { x: p.x, y: p.y };
      if (dir.x || dir.y) {
        walkTo = null;trail=[];pressed=false;
        Core.move(state(), dir.x, dir.y, dt);
        if (Core.waterAhead(state(), dir.x, dir.y)) needsGear({ tool: 'boots', level: Core.GEAR.water });
        if(p.x!==before.x||p.y!==before.y)controller.facing = {x:p.x-before.x,y:p.y-before.y};
        // Underground, pushing into rock digs it.
        const dug = handFree() && Core.drill(state(), drilling, dir.x, dir.y, dt);
        if (dug) { handUsed(); harvested(dug); changed(); }
        else if (drilling.t > 0 && !actor.busy) performAct('swing'); // chipping at the wall
      } else if (walkTo) {
        const pending=walkTo.action;
        if(pending&&(pending.state!==state()||pending.z!==p.z)){walkTo=null;return false;}
        if(pending&&Core.atInteraction(state(),pending.x,pending.y)){
          faceTile(pending.x,pending.y);const run=pending.run;walkTo=null;run();return false;
        }
        const d = Math.hypot(walkTo.x - p.x, walkTo.y - p.y);
        // Walking to something tapped: work it as soon as it's in reach.
        const done = walkTo.work && workAt(walkTo.work.x, walkTo.work.y);
        const aim = done || d < ARRIVE_DIST ? null : aimOf(walkTo);
        if (done === 'wait') stalled = 0; // in reach: work it on the next turn
        else if (done) { walkTo = null; if (done === true) gathered(false); }
        else if (d < ARRIVE_DIST) walkTo = null;
        else if (aim === 'done') {
          // Beside it: water your Boots can't take you onto says so.
          if (Core.swimsAt(state().world, walkTo.x, walkTo.y, p.z) && !Core.canWade(state())) needsGear({ tool: 'boots', level: Core.GEAR.water });
          walkTo = null;
        } else {
          const dx = aim.x - p.x, dy = aim.y - p.y;
          const far = aim.x === walkTo.x && aim.y === walkTo.y ? d : Infinity; // never past the end
          Core.move(state(), dx, dy, Math.min(dt, far / Core.walkSpeed(state())));
          if (!walkTo.plan && Core.waterAhead(state(), dx, dy)) { needsGear({ tool: 'boots', level: Core.GEAR.water }); walkTo = null; }
          if(p.x!==before.x||p.y!==before.y)controller.facing = {x:p.x-before.x,y:p.y-before.y};
          // Finish on the tick that arrives, so AUTO can choose its next
          // step immediately instead of spending another tick standing still.
          if (walkTo && !walkTo.work && Math.hypot(walkTo.x - p.x, walkTo.y - p.y) < ARRIVE_DIST) {
            const next=walkTo.action;walkTo=null;
            if(next&&Core.atInteraction(state(),next.x,next.y)){faceTile(next.x,next.y);next.run();}
          }
        }
      }
      const moved = Math.abs(p.x - before.x) + Math.abs(p.y - before.y) > 0.0004;
      if (walkTo) {
        stalled = moved ? 0 : stalled + dt;
        if (stalled > STALL_SECONDS) walkTo = null;
      }
      return moved;
    },

    // Gather pressed: act at once, then the hold repeats via tick(). A
    // press before the hand's next turn is kept for that turn, not done
    // sooner, so pressing again and again is never faster than holding.
    press() {
      if (!handFree()) { pressed = true; return; }
      if (act()) { gathered(false); return; }
      if (!walkTo) explore();
    },

    // Each turn of the hand: a Trail's next tile, else a press that came
    // early, else the hold's repeat.
    tick(dt, holding) {
      if (!handFree()) return;
      if (trail.length) { workTrail(); return; }
      if (pressed) { pressed = false; if (act()) gathered(false); else if (!walkTo) explore(true); return; }
      // The first gather of a hold is press()'s; these are its repeats. With
      // nothing left in reach, a hold heads for the next thing in sight, as
      // the first press did (quietly: the press already said if there's none).
      if (holding) {
        if (act()) gathered(true);
        else if (!walkTo) explore(true);
      }
    },

    // Whether the wanderer is on the way somewhere tapped (or stepped toward).
    get walking() { return !!walkTo; },
    get walkToken() { return walkTo?.id ?? null; },

    // Carries out one of the Perfect button's intents (core perfect.js)
    // through the very calls a tap or press makes, feedback and all.
    // `held`: a hold repeated it. Returns whether it was done.
    perform(intent, held) {
      switch (intent.type) {
        case 'walk': walkToward(intent.x, intent.y, false); return true;
        case 'harvestAt': return approach(intent.x,intent.y,()=>{
          const done=workAt(intent.x,intent.y);
          if(done===true)gathered(held);
          if(done==='wait')walkToward(intent.x,intent.y,true,null,true);
          return !!done;
        });
        case 'collect': return collectNearby();
        case 'buy': return controller.buy(intent.id);
        case 'place': return approach(intent.x,intent.y,()=>controller.place(intent.key, { x: intent.x, y: intent.y }));
        case 'descend': case 'climb': return approach(intent.x,intent.y,()=>passAt(intent.x,intent.y));
        case 'prop': return controller.placeProp(intent.kind);
        case 'charge': return !!Core.chargerNear(state());
        default: return false;
      }
    },

    // A tap on the map acts on that tile if it can (go down or up, harvest, collect).
    // Otherwise it walks there, and gathers or collects on arrival if there's
    // something to work: tapping a forest across the clearing goes and forages it.
    tap(sx, sy) {
      const w = cam.unproject(sx, sy);
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      if(!Core.isExplored(state().world,tx,ty,player().z)){walkToward(tx,ty,false,null,true);return;}
      const type=Core.TILE_INFO[Core.tileAt(state().world,tx,ty,player().z)];
      if(type.rise||type.descend){approach(tx,ty,()=>passAt(tx,ty));return;}
      if(workable(tx,ty)){
        approach(tx,ty,()=>{const done=workAt(tx,ty);if(done==='wait')walkToward(tx,ty,true,null,true);else if(done===true)gathered(false);return done;});
        return;
      }
      walkToward(tx,ty,false,null,true);
    },

    // A finished Trail stroke (world points), or null if it was abandoned:
    // the tiles it crossed are worked one a turn, as holding Gather would.
    trailEnded(points) {
      const free = handFree();
      if (points) trail = Core.sweepTargets(state(), points);
      if (free && trail.length) workTrail();
    },

    // The layer button: down the way you stand in, or up the ladder.
    toggleMine() {
      const way=Core.layerWay(state());
      if(way)approach(way.x,way.y,()=>passAt(way.x,way.y));
    },

    buy(id) {
      const s = state();
      if (!Core.buy(s, id).ok) return false;
      audio.upgrade();
      performAct('cheer');
      say('✦', Core.UPGRADES[id].currency === 'insight' ? '#cbb0f0' : '#9fe08a');
      changed();
      checkGoals();
      return true;
    },

    placeProp(kind) {
      const s = state();
      const res = Core.placeProp(s, kind);
      if (!res.ok) return false;
      faceTile(res.x,res.y);
      fx.built(res.x, res.y);
      performAct('build');
      audio.build();
      changed();
      return true;
    },

    // On the nearest free tile, or on `at` ({x, y}) when one is picked.
    place(key, at = null) {
      const s = state();
      const res = Core.place(s, key, at);
      if (!res.ok) return false;
      faceTile(res.x,res.y);
      fx.built(res.x, res.y);
      performAct('build');
      audio.build();
      changed();
      checkGoals();
      return true;
    },

    // Moves your building `b` (one of your buildings, or a crystal-world
    // facility) to tile `at` beside you: free (Watch, 2026-10-26).
    move(b, at) {
      const s = state();
      const ok = s.extractors.includes(b) ? Core.moveExtractor(s, b, at.x, at.y).ok : Core.moveFacility(s, b, at.x, at.y) === 'ok';
      if (!ok) return false;
      faceTile(at.x, at.y);
      fx.built(at.x, at.y);
      performAct('build');
      audio.build();
      changed();
      return true;
    },

    // Walks to tile (x, y), finding the way round what's in the way.
    walk(x, y) { trail=[];walkToward(x, y, false, null, true); },
    // Works tile (x, y) if it's in reach: collects a building's goods, gathers.
    work(x, y) {
      const done = workAt(x, y);
      if (done === true) gathered(false);
      return !!done;
    },

    // Embark starts another preserved world, so it asks first.
    async embark() {
      if (!Core.canEmbark(state())) return;
      const yes = await ask({ title: t('ask.embark.title'), text: t('ask.embark.empty'), yes: t('ask.embark.yes') });
      const s = state();
      if (!yes || !Core.canEmbark(s)) return;
      // The world you leave is kept as it is now, or you don't leave it.
      if (!game.keep()) return;
      const res = Core.embark(s, randomSeed());
      game.replace(res.state);
      audio.fanfare();
      hud.toast(t('world.emptyStart'));
    },

    // Forget per-world intents when the world itself is replaced.
    // Stops walking to wherever it was headed.
    stop() { walkTo = null; },

    forget() {
      walkTo = null;
      pressed = false;
      trail = [];
    }
  };
  return controller;
}
