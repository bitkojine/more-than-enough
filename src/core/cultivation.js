import { focusedChapter, contentLocked, effectiveToolLevel } from './progression.js';
/* Living crystal extends the existing world, inventory and commands. No
 * separate map, movement system or renderer; no DOM or wall-time dependency. */
import {atInteraction} from './interaction.js';
import {tileAt,isExplored,richness} from './world.js';
import {packKey} from './coords.js';
import {T,TILE_INFO} from './tiles.js';
import {PROPS} from './content.js';
import {illuminationAt,invalidateIllumination,LIGHT_MAX} from './illumination.js';
import {earn,pay as payInventory,canAfford} from './economy.js';
import {generateChunk} from './terrain.js';
import {hash2} from './noise.js';
import {CHUNK_SIZE,chunkCoord,chunkIndex} from './coords.js';
export const CULTIVATION_MODEL='living-crystal-1';
export const CULTIVATION_RECIPES={
  chamber:{mycelium:8,stone:14,ore:8},cooler:{stone:10,ore:6},
  vault:{stone:6,ore:4},conduit:{stone:2,ore:4},
  carrier:{mycelium:8,stone:4,ore:12},lantern:{stone:3,ore:2},
  tend:{mycelium:2,ore:1},reinforce:{crystal:2},
  repair:{stone:16,ore:16,crystal:6},shade:{mycelium:1},
  shelter:{mycelium:6,stone:10}
};
/* The machine is a teleporter. Its heart was stolen and sent, in the last
 * teleport, to a hiding place far off on the surface; without it the machine
 * and all teleportation went dark (Watch, 2026-10-25). The heart cannot be
 * grown: it is carried home, and sunlight, lanterns and heat crack it. */
export const HEART_DISTANCE=2500;   // metres from home to the hiding place
export const HEART_MIN=50;          // the heart the machine accepts, % sound
export const HEART_SUN=.15;         // % lost per second carried in full sun
export const HEART_MEND=.25;        // % mended per second resting in a shelter
const hideouts=new Map();
// Where the last teleport landed: open grass about HEART_DISTANCE from home,
// chosen from the seed alone so it is the same before and after anyone looks.
export function hidingPlace(seed){
 let at=hideouts.get(seed);if(at)return at;
 const a=hash2(hash2(seed,17,7717)*1e9|0,29,seed)*Math.PI*2,bx=Math.round(Math.cos(a)*HEART_DISTANCE),by=Math.round(Math.sin(a)*HEART_DISTANCE),chunks=new Map();
 const type=(x,y)=>{const k=chunkCoord(x)+','+chunkCoord(y);let c=chunks.get(k);if(!c)chunks.set(k,c=generateChunk(seed,chunkCoord(x),chunkCoord(y),0));return c.type[chunkIndex(x,y)];};
 const grass=(x,y)=>type(x,y)===T.GRASS&&[[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dy])=>TILE_INFO[type(x+dx,y+dy)].walk&&!TILE_INFO[type(x+dx,y+dy)].swim);
 at=nearestGrass(bx,by,grass)??{x:bx,y:by};hideouts.set(seed,at);return at;
}
function nearestGrass(x,y,ok){for(let r=0;r<=4*CHUNK_SIZE;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx+=(dy===-r||dy===r)?1:2*r||1)if(ok(x+dx,y+dy))return {x:x+dx,y:y+dy};return null;}
const newHeart=()=>({where:'station',health:100});
export function heartAt(s,x,y,z=s.player.z){const h=hidingPlace(s.world.seed);return z===0&&x===h.x&&y===h.y;}
// Each stage installs physical machine components; activation is a separate act.
export const MACHINE_REPAIRS=[CULTIVATION_RECIPES.repair,{stone:24,ore:24,crystal:8},{stone:32,ore:32,crystal:12}];
export function machineSections(b){return b.sections??(b.health>0?1:0);}
export function machineRepairCost(b){return MACHINE_REPAIRS[machineSections(b)]??(b.health<=0||b.quality<60?MACHINE_REPAIRS.at(-1):null);}
const qualityMean=(a,an,b,bn)=>Math.max(0,Math.min(100,a+(b-a)*(bn/(an+bn))));
// Recover saves produced by the earlier weighted-average rounding bug, while
// keeping genuinely invalid condition values rejected by the validator.
export function recoverCultivationRounding(c){
 // Worlds from before the heart: a machine already past its second section has it.
 if(c&&typeof c==='object'&&!c.heart&&Array.isArray(c.facilities))c.heart=c.completed||c.facilities.some(b=>b?.kind==='machine'&&(b.sections??0)>=2)?{where:'installed',health:100}:newHeart();
 const fix=b=>{if(typeof b?.quality==='number'&&b.quality>100&&b.quality<=100+1e-9)b.quality=100;};
 fix(c);if(Array.isArray(c?.facilities))c.facilities.forEach(b=>{fix(b);if(b&&typeof b==='object')delete b.closed;if(b?.kind==='machine'&&b.sections===undefined)b.sections=c.restored?1:0;});
}
export const CULTIVATION_LOOK={chamber:'building.crystalChamber',cooler:'building.coolingTower',vault:'building.crystalVault',conduit:'building.sealedConduit',machine:'building.sleepingMachine',carrier:'tool.crystalCarrier',lantern:'tool.hoodedLantern',station:'building.hidingPlace',shelter:'building.heartShelter'};
export function newCultivation(){return {model:CULTIVATION_MODEL,facilities:[],wild:{},starter:null,quality:100,gear:{lantern:false,carrier:false},lantern:false,phase:0,clock:0,nextId:1,restored:false,heart:newHeart()};}
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const nearby=(a,b,r)=>a.z===b.z&&distance(a,b)<=r;
const cell=(x,y,z)=>`${x},${y},${z}`;
const indexCache=new WeakMap();
function index(s){
 const c=s.cultivation;let v=indexCache.get(c);
 const propsVersion=s.world.props.revision??s.world.props.size;
 if(v&&v.n===c.facilities.length&&v.mines===s.extractors.length&&v.props===s.world.props&&v.version===propsVersion&&v.focused===focusedChapter(s))return v;
 v={focused:focusedChapter(s),n:c.facilities.length,mines:s.extractors.length,props:s.world.props,version:propsVersion,cells:new Map(),ids:new Map(),heat:new Map(),routes:[]};
 const heat=(b,n,r)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(Math.abs(dx)+Math.abs(dy)<=r){const k=cell(b.x+dx,b.y+dy,b.z);v.heat.set(k,(v.heat.get(k)||0)+n);}};
 for(const b of c.facilities){v.cells.set(cell(b.x,b.y,b.z),b);v.ids.set(b.id,b);if(b.kind==='cooler')heat(b,-12,3);}
 for(const b of s.extractors)if(b.key==='mine'&&!contentLocked(s,'mine'))heat(b,10,3);
 for(const b of c.facilities)if(b.kind==='conduit'&&!contentLocked(s,'conduit')){const from=v.ids.get(b.from),to=v.ids.get(b.to);if(from&&to)v.routes.push({from,to});}
 indexCache.set(c,v);return v;
}
export function cultivationAt(s,x,y,z=s.player.z){return s.cultivation?index(s).cells.get(cell(x,y,z)):null;}
// Physical exposure uses the same propagated field as the world renderer.
export function cultivationExposure(s,p){return illuminationAt(s,p.x,p.y,p.z).level/LIGHT_MAX;}
export function cultivationLight(s,p){return cultivationExposure(s,p)>0;}
export function cultivationTarget(s,b){return Math.max(4,(b.z<=-2?12:18)+(b.kind==='chamber'||b.kind==='machine'?18:0)+(index(s).heat.get(cell(b.x,b.y,b.z))||0));}
export function cultivationStatus(s,b){
 if(b.kind==='cooler'||b.kind==='conduit'||b.kind==='shelter')return 'ready';
 if(b.health===0)return 'dead';if(b.temperature>22)return 'hot';
 if(b.needsTend)return 'injured';
 if(b.kind==='chamber'&&b.health===undefined)return 'empty';return 'growing';
}
const canPay=(s,cost)=>canAfford(s.inv,cost);
function pay(s,cost){payInventory(s.inv,cost);if(!s.inv.crystal)s.cultivation.quality=100;}
function earned(s,res,n){earn(s,res,n,'buildings');}
// Built facilities always protect their contents from light. Lighting changes
// still expose unprotected cargo; wild colonies use the physical light field.
export function lightCrystal(s){exposeCargo(s);}
function exposeCargo(s){
 const c=s.cultivation,p={x:Math.floor(s.player.x),y:Math.floor(s.player.y),z:s.player.z};
 const strength=c.gear.carrier?0:cultivationExposure(s,p);
 if(strength){if(c.starter)c.starter.health=Math.max(0,c.starter.health-strength);if(s.inv.crystal)c.quality=Math.max(10,c.quality-strength);}
}

export function wildColony(s,x,y,z=s.player.z){
 if(!s.cultivation||z> -2||!isExplored(s.world,x,y,z)||tileAt(s.world,x,y,z)!==T.GEODE)return null;
 const k=packKey(x,y,z);return s.cultivation.wild[k]??=( {x,y,z,health:100,regrow:0} );
}
export function takeStarter(s,x,y){
 const c=s.cultivation,p={x,y,z:s.player.z};
 if(!c||!atInteraction(s,x,y))return 'reach';
 if(effectiveToolLevel(s,'pickaxe')<3)return 'equipment';
 const w=wildColony(s,x,y);if(!w)return 'site';if(c.starter)return 'carrying';if(w.regrow||w.health<=0)return 'regrow';
 c.starter={health:100};w.health=0;w.regrow=45;exposeCargo(s);return 'ok';
}
// Crystal rooms are dug in from this layer down; a heart shelter goes anywhere.
export const DEEP=-2,DEEP_KINDS=['chamber','cooler','vault','conduit'];
export const BUILT_FACILITIES=Object.freeze(['chamber','cooler','vault','conduit','shelter']);
export const CONDUIT_REACH=4; // tiles, along the grid, from a conduit to its chamber and vault
// The chamber and vault a conduit at `at` would join, or null.
function conduitRoute(s,at,moving=null){
 const c=s.cultivation,from=c.facilities.find(a=>a!==moving&&a.kind==='chamber'&&nearby(a,at,CONDUIT_REACH)),to=c.facilities.find(a=>a!==moving&&a.kind==='vault'&&nearby(a,at,CONDUIT_REACH));
 return from&&to?{from,to}:null;
}
// Why facility `kind` can't go on tile (x, y) of your layer, or null if it
// can (reach and price aside). `moving`: one being moved, whose own tile
// counts as free and whose conduits must still reach it.
export function facilitySite(s,kind,x,y,moving=null){
 const c=s.cultivation,z=s.player.z;
 if(!c||!BUILT_FACILITIES.includes(kind))return 'invalid';
 if(!isExplored(s.world,x,y,z))return 'unseen';
 if(z>DEEP&&kind!=='shelter')return 'deep';if(kind==='shelter'&&heartAt(s,x,y,z))return 'occupied';
 const type=tileAt(s.world,x,y,z),b=cultivationAt(s,x,y,z);
 if(!TILE_INFO[type].walk||TILE_INFO[type].rise||TILE_INFO[type].descend||(b&&b!==moving)||s.extractors.some(e=>e.x===x&&e.y===y&&e.z===z)||s.world.props.has(packKey(x,y,z)))return 'occupied';
 const at={x,y,z};
 if(kind==='conduit'&&!conduitRoute(s,at,moving))return 'route';
 // A chamber or vault moved out of a conduit's reach would leave it joining nothing.
 if(moving)for(const d of c.facilities)if(d.kind==='conduit'&&(d.from===moving.id||d.to===moving.id)&&!nearby(d,at,CONDUIT_REACH))return 'route';
 return null;
}
// Moves facility `b` to tile (x, y) of its layer, in reach: free, and all it
// holds goes with it (Watch, 2026-10-26). A conduit joins what is near it there.
export function moveFacility(s,b,x,y){
 if(contentLocked(s,b?.kind))return 'locked';
 const c=s.cultivation;
 if(!c||s.shared||!c.facilities.includes(b)||!BUILT_FACILITIES.includes(b.kind)||b.z!==s.player.z)return 'invalid';
 if(!atInteraction(s,x,y))return 'reach';
 const why=facilitySite(s,b.kind,x,y,b);if(why)return why;
 if(b.kind==='conduit'){const r=conduitRoute(s,{x,y,z:b.z},b);b.from=r.from.id;b.to=r.to.id;}
 b.x=x;b.y=y;indexCache.delete(c);return 'ok';
}
export function cultivationCommand(s,cmd){
 const c=s.cultivation;if(!c||s.shared)return 'invalid';
 if(contentLocked(s,cmd.type)||cmd.type==='build'&&contentLocked(s,cmd.kind))return 'locked';
 const x=cmd.x??Math.floor(s.player.x),y=cmd.y??Math.floor(s.player.y),z=s.player.z;
 if(!Number.isInteger(x)||!Number.isInteger(y)||!isExplored(s.world,x,y,z))return 'unseen';
 if(cmd.type==='build'){const why=facilitySite(s,cmd.kind,x,y);if(why)return why;}
 if(!atInteraction(s,x,y))return 'reach';
 const b=cultivationAt(s,x,y,z),cost=CULTIVATION_RECIPES[cmd.kind||cmd.type];
 if(cmd.type==='shade'){
  const k=packKey(x,y,z);if(!PROPS[s.world.props.get(k)]?.light)return 'site';
  c.shaded??={};if(!(k in c.shaded)){if(!canPay(s,CULTIVATION_RECIPES.shade))return 'materials';pay(s,CULTIVATION_RECIPES.shade);}
  c.shaded[k]=!c.shaded[k];indexCache.delete(c);invalidateIllumination(s,x,y,z);return 'ok';
 }
 if(cmd.type==='starter')return takeStarter(s,x,y);
 if(cmd.type==='heart')return moveHeart(s,x,y,z);
 if(cmd.type==='lantern'){if(!c.gear.lantern)return 'equipment';c.lantern=!c.lantern;if(c.lantern)lightCrystal(s);else exposeCargo(s);return 'ok';}
 if(cmd.type==='craft'){
  if(!['carrier','lantern'].includes(cmd.kind)||c.gear[cmd.kind])return 'invalid';
  if(!canPay(s,cost))return 'materials';pay(s,cost);c.gear[cmd.kind]=true;return 'ok';
 }
 if(cmd.type==='build'){
  const why=facilitySite(s,cmd.kind,x,y);if(why)return why;
  if(!canPay(s,cost))return 'materials';
  const next={kind:cmd.kind,id:c.nextId,x,y,z,temperature:12,buffer:0,quality:100};
  if(cmd.kind==='conduit'){const r=conduitRoute(s,next);next.from=r.from.id;next.to=r.to.id;}
  pay(s,cost);c.nextId++;c.facilities.push(next);return 'ok';
 }
 if(!b)return 'building';
 if(contentLocked(s,b.kind))return 'locked';
 if(cmd.type==='plant'&&b.kind==='chamber'){
  if(!c.starter)return 'starter';if(b.health>0)return 'occupied';
  b.health=c.starter.health;b.needsTend=b.health<100;b.temperature=cultivationTarget(s,b);c.starter=null;return 'ok';
 }
 if(cmd.type==='tend'&&b.kind==='chamber'){
  if(!b.health)return 'dead';if(b.temperature>22)return 'unsafe';
  if(!canPay(s,CULTIVATION_RECIPES.tend))return 'materials';pay(s,CULTIVATION_RECIPES.tend);b.needsTend=false;return 'ok';
 }
 if(cmd.type==='collect'&&['chamber','vault'].includes(b.kind)){
  if(b.buffer<1)return 'empty';
  c.quality=s.inv.crystal?qualityMean(c.quality,s.inv.crystal,b.quality,b.buffer):b.quality;earned(s,'crystal',b.buffer);b.buffer=0;exposeCargo(s);return 'ok';
 }
 if(cmd.type==='store'&&b.kind==='vault'){
  const n=Math.min(s.inv.crystal,(b.reinforced?40:20)-b.buffer);if(n<=0)return 'empty';
  b.quality=b.buffer?qualityMean(b.quality,b.buffer,c.quality,n):c.quality;b.buffer+=n;pay(s,{crystal:n});return 'ok';
 }
 if(cmd.type==='reinforce'&&['chamber','vault'].includes(b.kind)){
  if(b.reinforced)return 'occupied';if(!canPay(s,CULTIVATION_RECIPES.reinforce))return 'materials';pay(s,CULTIVATION_RECIPES.reinforce);b.reinforced=true;return 'ok';
 }
 if(cmd.type==='repair'&&b.kind==='machine'){
  const recipe=machineRepairCost(b);if(!recipe)return 'repaired';
  if(c.quality<60)return 'quality';if(cultivationTarget(s,b)>22)return 'cooling';

  const heart=machineSections(b)===1;if(heart&&c.heart?.where!=='carried')return 'heart';if(heart&&c.heart.health<HEART_MIN)return 'cracked';
  if(!canPay(s,recipe))return 'materials';const quality=c.quality;pay(s,recipe);if(heart)c.heart={where:'installed',health:c.heart.health};
  b.sections=Math.min(MACHINE_REPAIRS.length,machineSections(b)+1);b.health=100;b.quality=quality;b.temperature=cultivationTarget(s,b);c.restored=true;return 'discovery';
 }
 if(cmd.type==='activate'&&b.kind==='machine'){
  if(c.completed)return 'completed';if(machineSections(b)<MACHINE_REPAIRS.length)return 'sections';
  if(b.health<=0||b.quality<60)return 'quality';
  if(cultivationTarget(s,b)>22||b.temperature>22)return 'cooling';
  c.completed=true;c.completedAt=s.time;return 'activated';
 }
 return 'invalid';
}
// Takes the heart from the hiding place or a shelter, or rests it in a shelter.
function moveHeart(s,x,y,z){
 const c=s.cultivation,h=c.heart??=newHeart(),b=cultivationAt(s,x,y,z);
 if(heartAt(s,x,y,z)){if(h.where!=='station')return 'gone';if(!c.gear.carrier)return 'equipment';h.where='carried';return 'lifted';}
 if(b?.kind!=='shelter')return 'site';
 if(h.where===b.id){h.where='carried';return 'lifted';}
 if(contentLocked(s,'shelter'))return 'locked';
 if(h.where!=='carried')return 'gone';h.where=b.id;return 'ok';
}
// A sealed carrier protects the heart exactly as it protects ordinary crystal.
export function heartLight(s,p){
 if(s.cultivation.gear.carrier)return 0;
 return Math.min(1,illuminationAt(s,p.x,p.y,p.z).level/LIGHT_MAX);
}
// Which clue the machine shows: one per restored section, 0 before any.
export function machineClue(s){const b=s.cultivation?.facilities.find(f=>f.kind==='machine');return b?Math.min(MACHINE_REPAIRS.length,machineSections(b)):0;}
function discoverMachine(s){
 const c=s.cultivation;if(s.player.z> -2||c.facilities.some(b=>b.kind==='machine'))return;
 const x=Math.floor(s.player.x),y=Math.floor(s.player.y),z=s.player.z;
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const px=x+dx,py=y+dy;if(!isExplored(s.world,px,py,z)||tileAt(s.world,px,py,z)!==T.TUNNEL||cultivationAt(s,px,py,z))continue;
  c.facilities.push({kind:'machine',sections:0,id:c.nextId++,x:px,y:py,z,temperature:30,health:0,quality:100,buffer:0});return;
 }
}
export function stepCultivation(s,dt){
 const c=s.cultivation;if(!c)return;discoverMachine(s);c.phase+=dt;
 if(c.phase<.25-1e-9)return;
 const seconds=Math.floor((c.phase+1e-9)*4)/4;c.phase=Math.max(0,c.phase-seconds);c.clock+=seconds;
 // Calls normally arrive at 60 Hz; only facility deadlines run at 4 Hz.
 // The host may batch a quiet interval without touching any terrain cells.
 const p={x:Math.floor(s.player.x),y:Math.floor(s.player.y),z:s.player.z};
 const heat=Math.max(0,cultivationTarget(s,p)-22)*.8;
 const carriedDamage=heat+(c.gear.carrier?0:9*cultivationExposure(s,p));
 if(c.starter){c.starter.health-=carriedDamage*seconds;if(c.starter.health<=0)c.starter=null;}
 if(s.inv.crystal)c.quality=Math.max(10,c.quality-carriedDamage*seconds);
 if(c.heart?.where==='carried'){
  c.heart.health-=(heat+HEART_SUN*heartLight(s,p))*seconds;
  // A heart that cracks right through falls apart and its light returns to the hiding place.
  if(c.heart.health<=0){c.heart=newHeart();c.heartLost=(c.heartLost||0)+1;}
 }else if(typeof c.heart?.where==='number'&&!contentLocked(s,'shelter'))c.heart.health=Math.min(100,c.heart.health+HEART_MEND*seconds);
 for(const w of Object.values(c.wild)){
  if(w.regrow>0){w.regrow=Math.max(0,w.regrow-seconds);if(!w.regrow)w.health=100;}
  else {w.health=Math.max(0,w.health-((9*cultivationExposure(s,w))+Math.max(0,cultivationTarget(s,w)-22)*.8)*seconds);if(!w.health)w.regrow=45;}
 }
 for(const b of c.facilities){
  if(contentLocked(s,b.kind))continue;
  const target=cultivationTarget(s,b);b.temperature=target+(b.temperature-target)*Math.exp(-seconds/6);
  const damage=Math.max(0,b.temperature-22)*.8;
  if(b.buffer)b.quality=Math.max(10,b.quality-damage*seconds);
  if(b.health>0){
   if(damage){b.health=Math.max(0,b.health-damage*seconds);if(b.kind==='chamber')b.needsTend=true;}
   else if(!b.needsTend)b.health=Math.min(100,b.health+4*seconds);
   if(b.kind==='chamber'&&b.health>0&&!b.needsTend&&b.temperature<=22){if(!b.buffer)b.quality=100;const cap=b.reinforced&&!contentLocked(s,'reinforce')?40:20;if(b.buffer<cap)b.buffer=Math.min(cap,b.buffer+.3*seconds);}
  }
 }
 for(const {from,to} of index(s).routes){const n=Math.max(0,Math.min(from.buffer,.8*seconds,(to.reinforced?40:20)-to.buffer));if(n){to.quality=to.buffer?qualityMean(to.quality,to.buffer,from.quality,n):from.quality;to.buffer+=n;from.buffer-=n;}}
}
export function validCultivation(c){
 const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
 const pos=(b,top=-2)=>!!b&&Number.isInteger(b.x)&&Number.isInteger(b.y)&&Math.abs(b.x)<2**20&&Math.abs(b.y)<2**20&&Number.isInteger(b.z)&&b.z>=-512&&b.z<=top;
 if(!c||c.model!==CULTIVATION_MODEL||!Array.isArray(c.facilities)||!c.wild||Array.isArray(c.wild)||typeof c.wild!=='object'||!c.gear||!number(c.quality,0,100)||!number(c.phase,0,.25-1e-10)||!Number.isSafeInteger(c.nextId)||!number(c.clock,0,Number.MAX_SAFE_INTEGER))return false;
 if(c.starter&&!number(c.starter.health,0,100))return false;
 if(c.completed!==undefined&&typeof c.completed!=='boolean')return false;
 if(c.completedAt!==undefined&&!number(c.completedAt,0,Number.MAX_SAFE_INTEGER))return false;
 const ids=new Map(),cells=new Set();
 for(const b of c.facilities){
  if(!b||!['chamber','cooler','vault','conduit','machine','shelter'].includes(b.kind)||!Number.isSafeInteger(b.id)||b.id<1||b.id>=c.nextId||ids.has(b.id)||!pos(b,b.kind==='shelter'?0:-2)||!number(b.temperature,-1000,1000)||!number(b.buffer,0,40)||!number(b.quality,0,100)||(b.health!==undefined&&!number(b.health,0,100)))return false;
  if(b.sections!==undefined&&(b.kind!=='machine'||!Number.isInteger(b.sections)||b.sections<0||b.sections>MACHINE_REPAIRS.length))return false;
  const k=cell(b.x,b.y,b.z);if(cells.has(k))return false;cells.add(k);ids.set(b.id,b);
 }
 for(const b of c.facilities)if(b.kind==='conduit'&&(ids.get(b.from)?.kind!=='chamber'||ids.get(b.to)?.kind!=='vault'))return false;
 if(c.completed&&!c.facilities.some(b=>b.kind==='machine'&&machineSections(b)===MACHINE_REPAIRS.length))return false;
 if(c.heart!==undefined&&(!c.heart||!number(c.heart.health,0,100)||!(['station','carried','installed'].includes(c.heart.where)||ids.get(c.heart.where)?.kind==='shelter')))return false;
 if(c.heartLost!==undefined&&!(Number.isSafeInteger(c.heartLost)&&c.heartLost>=0))return false;
 return Object.values(c.wild).every(w=>pos(w)&&number(w.health,0,100)&&number(w.regrow,0,45));
}
/* A saved cultivation mended so it loads: a number out of range goes back
 * inside it, a part that can't be placed (no position, an unknown kind, a
 * second one on the same cell, a conduit to nothing) is dropped, and the rest
 * of the world stays. One bad field never sets a whole save aside (nothing
 * loses player data, AGENTS.md). Null only for another model's state: a newer
 * game's save, set aside until the update arrives. */
export function mendCultivation(c){
 if(!c||typeof c!=='object'||Array.isArray(c))return newCultivation();
 if(c.model!==CULTIVATION_MODEL)return null;
 recoverCultivationRounding(c);
 const into=(n,min,max,dflt)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):dflt;
 const obj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const pos=(b,top=-2)=>obj(b)&&Number.isInteger(b.x)&&Number.isInteger(b.y)&&Math.abs(b.x)<2**20&&Math.abs(b.y)<2**20&&Number.isInteger(b.z)&&b.z>=-512&&b.z<=top;
 c.quality=into(c.quality,0,100,100);c.phase=into(c.phase,0,.25-1e-10,0);c.clock=into(c.clock,0,Number.MAX_SAFE_INTEGER,0);
 if(!obj(c.gear))c.gear={lantern:false,carrier:false};
 if(!obj(c.wild))c.wild={};
 for(const [k,w] of Object.entries(c.wild)){if(!pos(w)){delete c.wild[k];continue;}w.health=into(w.health,0,100,100);w.regrow=into(w.regrow,0,45,0);}
 if(c.starter!==null&&c.starter!==undefined)c.starter=obj(c.starter)?(c.starter.health=into(c.starter.health,0,100,100),c.starter):null;
 if(c.completed!==undefined&&typeof c.completed!=='boolean')c.completed=!!c.completed;
 if(c.completedAt!==undefined&&!Number.isFinite(c.completedAt))delete c.completedAt;else if(c.completedAt!==undefined)c.completedAt=into(c.completedAt,0,Number.MAX_SAFE_INTEGER,0);
 const kinds=['chamber','cooler','vault','conduit','machine','shelter'],cells=new Set(),ids=new Map(),renumber=[];
 c.facilities=(Array.isArray(c.facilities)?c.facilities:[]).filter(b=>{
  if(!obj(b)||!kinds.includes(b.kind)||!pos(b,b.kind==='shelter'?0:-2))return false;
  const k=cell(b.x,b.y,b.z);if(cells.has(k))return false;cells.add(k);
  b.temperature=into(b.temperature,-1000,1000,22);b.buffer=into(b.buffer,0,40,0);b.quality=into(b.quality,0,100,100);
  if(b.health!==undefined)b.health=into(b.health,0,100,0);
  if(b.kind==='machine')b.sections=Math.floor(into(b.sections,0,MACHINE_REPAIRS.length,0));else delete b.sections;
  if(Number.isSafeInteger(b.id)&&b.id>=1&&!ids.has(b.id))ids.set(b.id,b);else renumber.push(b);
  return true;
 });
 c.nextId=Math.max(Number.isSafeInteger(c.nextId)?c.nextId:1,...[...ids.keys()].map(id=>id+1));
 for(const b of renumber){b.id=c.nextId++;ids.set(b.id,b);}
 c.facilities=c.facilities.filter(b=>b.kind!=='conduit'||(ids.get(b.from)?.kind==='chamber'&&ids.get(b.to)?.kind==='vault'));
 // A world saved as won keeps its win: the machine it was won with is whole.
 if(c.completed){const m=c.facilities.find(b=>b.kind==='machine');if(m)m.sections=MACHINE_REPAIRS.length;else{c.completed=false;delete c.completedAt;}}
 if(c.heart!==undefined){
  const h=c.heart,placed=obj(h)&&(['station','carried','installed'].includes(h.where)||ids.get(h.where)?.kind==='shelter');
  // A heart with nowhere it can be is where the machine says: in it, or still at the hiding place.
  c.heart=placed?(h.health=into(h.health,0,100,100),h):{where:c.facilities.some(b=>b.kind==='machine'&&b.sections>=2)?'installed':'station',health:into(h?.health,0,100,100)};
 }
 if(c.heartLost!==undefined)c.heartLost=Math.floor(into(c.heartLost,0,Number.MAX_SAFE_INTEGER,0));
 return c;
}
