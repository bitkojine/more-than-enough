/* Authoritative physical light, independent of drawing, fog and frame rate.
 * Sky access and installed light are demand-cached in 16x16 chunks. Each
 * field records the geometry chunks it read, so edits invalidate only fields
 * that depend on them. Bounded flood fills use strongest-path propagation;
 * discarded fields rebuild from surviving sources (including light decreases).
 * A carried source has its own small field, rebuilt only at cell/strength
 * changes. None of these derived arrays are saved. */
import {SURFACE,Z_MIN,CHUNK_SIZE,chunkCoord,chunkIndex,packKey,unpackKey} from './coords.js';
import {tileAt,holeAbove,holeBelow} from './world.js';
import {TILE_INFO} from './tiles.js';
import {PROPS,FLARE_LIGHT} from './content.js';
import {daylight,SUN_CRACKS,isDark,lightScale} from './light.js';
import {VersionedMap} from './versioned-map.js';
import {VersionedSet} from './versioned-set.js';

export const LIGHT_MAX = 15;
export const LANTERN_LEVEL = 4; // source plus three open steps at full charge
const MAX_FIELDS = 256;
const contexts = new WeakMap();
const chunkKey = (x,y,z) => packKey(chunkCoord(x),chunkCoord(y),z);
const valid = (x,y,z) => Math.abs(x)<2**20 && Math.abs(y)<2**20 && z>=Z_MIN && z<=SURFACE;
const steps = [[1,0],[-1,0],[0,1],[0,-1]];

function drop(c,key) {
  const field=c.fields.get(key); if(!field)return;
  c.fields.delete(key);
  for(const dep of field.deps){const users=c.users.get(dep);users?.delete(key);if(!users?.size)c.users.delete(dep);}
}
function changed(c,key) {
  const {x,y,z}=unpackKey(key), dep=chunkKey(x,y,z);
  for(const id of [...(c.users.get(dep)||[])])drop(c,id);
}
function context(s) {
  const w=s.world;
  let c=contexts.get(s);
  if(c&&c.world===w&&c.mods===w.mods&&c.holes===w.holes&&c.props===w.props&&c.shaded===s.cultivation?.shaded)return c;
  if(c)for(const off of c.off)off();
  // Shared snapshots and older saves may provide ordinary Maps/Sets. Adopt
  // observable equivalents without changing any contents or save shape.
  if(!(w.mods instanceof VersionedMap))w.mods=new VersionedMap(w.mods);
  if(!(w.props instanceof VersionedMap))w.props=new VersionedMap(w.props);
  if(!(w.holes instanceof VersionedSet))w.holes=new VersionedSet(w.holes);
  c={world:w,mods:w.mods,holes:w.holes,props:w.props,shaded:s.cultivation?.shaded,fields:new Map(),users:new Map(),off:[],lights:0};
  for(const kind of w.props.values())if(PROPS[kind]?.light)c.lights++;
  const ref=new WeakRef(c);
  c.off.push(w.mods.observe((key,after,before)=>{const v=ref.deref();if(v&&(before===0)!==(after===0))changed(v,key);}));
  c.off.push(w.holes.observe(key=>{const v=ref.deref();if(v)changed(v,key);}));
  c.off.push(w.props.observe((key,after,before)=>{const v=ref.deref();if(!v)return;v.lights+=Number(!!PROPS[after]?.light)-Number(!!PROPS[before]?.light);changed(v,key);}));
  contexts.set(s,c);return c;
}
function keep(c,key,field) {
  if(c.fields.size>=MAX_FIELDS)drop(c,c.fields.keys().next().value);
  c.fields.set(key,field);
  for(const dep of field.deps){let users=c.users.get(dep);if(!users)c.users.set(dep,users=new Set());users.add(key);}
  return field;
}
// Called when a paid hood is opened/closed. Geometry and prop mutations notify
// automatically, including changes arriving from replay or a loaded snapshot.
export function invalidateIllumination(s,x,y,z=s.player.z) {
  const c=contexts.get(s);if(c)changed(c,packKey(x,y,z));
}
function reader(c,deps,work) {
  const tiles=new Map(), skies=new Map();
  const read=(x,y,z)=>{
    const key=packKey(x,y,z);
    if(tiles.has(key))return tiles.get(key);
    deps.add(chunkKey(x,y,z));
    if(work)work.terrain=(work.terrain||0)+1;
    const open=!!TILE_INFO[tileAt(c.world,x,y,z)].walk;
    tiles.set(key,open);return open;
  };
  const above=(x,y,z)=>{if(z>=SURFACE)return false;deps.add(chunkKey(x,y,z+1));return holeAbove(c.world,x,y,z);};
  const below=(x,y,z)=>{if(z<=Z_MIN)return false;deps.add(chunkKey(x,y,z));return holeBelow(c.world,x,y,z);};
  const sky=(x,y,z)=>{
    const chain=[];let lit;
    while(true){
      const key=packKey(x,y,z);
      if(skies.has(key)){lit=skies.get(key);break;}
      chain.push(key);
      if(z===SURFACE){lit=LIGHT_MAX;break;}
      if(!read(x,y,z)||!above(x,y,z)){lit=0;break;}
      z++;
    }
    for(const key of chain)skies.set(key,lit);
    return lit;
  };
  const neighbours=(p,visit)=>{
    for(const [dx,dy]of steps)if(valid(p.x+dx,p.y+dy,p.z))visit(p.x+dx,p.y+dy,p.z);
    if(above(p.x,p.y,p.z))visit(p.x,p.y,p.z+1);
    if(below(p.x,p.y,p.z))visit(p.x,p.y,p.z-1);
  };
  return {read,sky,neighbours};
}
function propagate(nodes,channel,neighbours,work) {
  const queue=Array.from({length:LIGHT_MAX+1},()=>[]);
  for(const node of nodes.values())if(node[channel]>0)queue[node[channel]].push(node);
  for(let level=LIGHT_MAX;level>1;level--){
    for(const p of queue[level]){
      if(p[channel]!==level||!p.open)continue;
      if(work)work.propagated=(work.propagated||0)+1;
      neighbours(p,(x,y,z)=>{
        const next=nodes.get(packKey(x,y,z));
        if(next&&next[channel]<level-1){next[channel]=level-1;queue[level-1].push(next);}
      });
    }
  }
}
function installed(c,cx,cy,z,work) {
  const id=packKey(cx,cy,z), cached=c.fields.get(id);if(cached)return cached;
  if(work)work.builds=(work.builds||0)+1;
  const deps=new Set(), {read,sky,neighbours}=reader(c,deps,work), nodes=new Map(), queue=[];
  const add=(x,y,z,d)=>{
    const key=packKey(x,y,z);if(nodes.has(key))return;
    const open=read(x,y,z), kind=c.props.get(key);
    const p={x,y,z,d,open,sky:sky(x,y,z),block:c.shaded?.[key]?0:Math.min(LIGHT_MAX,Math.ceil(PROPS[kind]?.light||0)+Number(!!PROPS[kind]?.light))};
    nodes.set(key,p);queue.push(p);
  };
  for(let y=cy*CHUNK_SIZE;y<(cy+1)*CHUNK_SIZE;y++)for(let x=cx*CHUNK_SIZE;x<(cx+1)*CHUNK_SIZE;x++)add(x,y,z,0);
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if((!p.open&&p.d>0)||p.d>=LIGHT_MAX-1)continue;
    neighbours(p,(x,y,z)=>add(x,y,z,p.d+1));
  }
  propagate(nodes,'sky',neighbours,work);propagate(nodes,'block',neighbours,work);
  const field={deps,sky:new Uint8Array(CHUNK_SIZE**2),block:new Uint8Array(CHUNK_SIZE**2)};
  for(let y=cy*CHUNK_SIZE;y<(cy+1)*CHUNK_SIZE;y++)for(let x=cx*CHUNK_SIZE;x<(cx+1)*CHUNK_SIZE;x++){
    const p=nodes.get(packKey(x,y,z)),i=chunkIndex(x,y);field.sky[i]=p.sky;field.block[i]=p.block;
  }
  return keep(c,id,field);
}
export function carriedLightLevel(s) {
  const on=s.cultivation?s.cultivation.lantern:isDark(s);
  const lantern=on?Math.ceil(LANTERN_LEVEL*lightScale(s)):0;
  return Math.max(lantern,s.flare>0?Math.min(LIGHT_MAX,FLARE_LIGHT+1):0);
}
function carried(c,s,work) {
  const {z}=s.player,x=Math.floor(s.player.x),y=Math.floor(s.player.y),level=carriedLightLevel(s);
  if(!level)return null;
  const signature=packKey(x,y,z)+':'+level, cached=c.fields.get('carried');
  if(cached?.signature===signature)return cached;
  drop(c,'carried');if(work)work.carriedBuilds=(work.carriedBuilds||0)+1;
  const deps=new Set(), {read,neighbours}=reader(c,deps,work), nodes=new Map();
  const initial={x,y,z,open:read(x,y,z),block:level};nodes.set(packKey(x,y,z),initial);
  // Discover only the finite source footprint, recording blocked boundary cells
  // too: digging any one of them must invalidate this field.
  const queue=[{...initial,d:0}];
  for(let i=0;i<queue.length;i++){
    const p=queue[i];if(!p.open||p.d>=level-1)continue;
    neighbours(p,(x,y,z)=>{const k=packKey(x,y,z);if(nodes.has(k))return;const n={x,y,z,open:read(x,y,z),block:0,d:p.d+1};nodes.set(k,n);queue.push(n);});
  }
  propagate(nodes,'block',neighbours,work);
  return keep(c,'carried',{deps,nodes,signature});
}
// Sky strength changes with the sun, but the cached connectivity never does.
export function sunLightStrength(s) { return Math.max(0,Math.min(1,(daylight(s.time)-SUN_CRACKS)/(1-SUN_CRACKS))); }
export function illuminationAt(s,x,y,z=s.player.z,work=null) {
  x=Math.floor(x);y=Math.floor(y);
  if(!valid(x,y,z))return {sky:0,block:0,level:0};
  const c=context(s);let sky=LIGHT_MAX,block=0;
  // Surface tiles see the sky directly. With no installed emitters there is
  // no reason to construct a static field while crossing kilometres of land.
  if(z<SURFACE||c.lights){const field=installed(c,chunkCoord(x),chunkCoord(y),z,work),i=chunkIndex(x,y);sky=field.sky[i];block=field.block[i];}
  const moving=carried(c,s,work);block=Math.max(block,moving?.nodes.get(packKey(x,y,z))?.block||0);
  return {sky,block,level:Math.max(sky*sunLightStrength(s),block)};
}
