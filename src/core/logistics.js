/* Physical collection coverage. Derived once per layout; no per-tick scans. */
import { economyForState } from './economy-context.js';
import { EXTRACTORS } from './content.js';

export const DEPOT_MODEL = 'depot-v1';
export const usesDepots = s => s.logisticsModel === DEPOT_MODEL;
const layouts = new WeakMap();
const key = (x,y,z) => `${x},${y},${z}`;

function layout(s) {
  const old = layouts.get(s);
  if (old && old.list === s.extractors && old.n === s.extractors.length) return old;
  const tiles = new Map(), served = new Map();
  for (const e of s.extractors) tiles.set(key(e.x,e.y,e.z),e);
  const next = { list:s.extractors,n:s.extractors.length,tiles,served };
  layouts.set(s,next);
  for (const d of s.extractors) {
    if (!EXTRACTORS[d.key].depot) continue;
    for (const e of depotTargets(s,d)) {
      const before = served.get(e);
      if (!before || (e.x-d.x)**2+(e.y-d.y)**2 < (e.x-before.x)**2+(e.y-before.y)**2) served.set(e,d);
    }
  }
  return next;
}
export function depotTargets(s,at) {
  const { tiles } = layout(s), out = [], r=EXTRACTORS.depot.depot.radius;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) {
    if(dx*dx+dy*dy>r*r)continue;
    const e=tiles.get(key(at.x+dx,at.y+dy,at.z));
    if(e && EXTRACTORS[e.key].rate>0 && e.owner===at.owner)out.push(e);
  }
  return out;
}
export const depotFor = (s,e) => layout(s).served.get(e) || null;
export function haulsBuilding(s,e) {
  if (e.owner && e.owner!==s.me) return false;
  return usesDepots(s) ? !!depotFor(s,e) : !!s.unlocks.logistics;
}
export const haulingEconomyAvailable = s => !s.shared && (usesDepots(s) || s.unlocks.logistics);
export function depotGain(s,at) {
  if(!at)return 0;
  return depotTargets(s,{z:s.player.z,owner:s.me||undefined,...at}).filter(e=>!depotFor(s,e)).length;
}

export function hasDepot(s) {
  const economy=economyForState(s);
  return economy ? economy.extractorCount('depot')>0 : s.extractors.some(e=>e.key==='depot'&&(!e.owner||e.owner===s.me));
}
