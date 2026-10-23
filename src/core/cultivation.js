/* Living crystal extends the existing world, inventory and commands. No
 * separate map, movement system or renderer; no DOM or wall-time dependency. */
import {tileAt,isExplored,richness} from './world.js';
import {packKey,unpackKey} from './coords.js';
import {T,TILE_INFO} from './tiles.js';
import {PROPS} from './content.js';
import {daylight} from './light.js';
import {earn,pay as payInventory,canAfford} from './economy.js';
export const CULTIVATION_MODEL='living-crystal-1';
export const CULTIVATION_RECIPES={
  chamber:{mycelium:8,stone:14,ore:8},cooler:{stone:10,ore:6},
  vault:{stone:6,ore:4},conduit:{stone:2,ore:4},
  carrier:{mycelium:8,stone:4,ore:12},lantern:{stone:3,ore:2},
  tend:{mycelium:2,ore:1},reinforce:{crystal:2},
  repair:{stone:16,ore:16,crystal:6},shade:{mycelium:1}
};
// Each stage installs physical machine components; activation is a separate act.
export const MACHINE_REPAIRS=[CULTIVATION_RECIPES.repair,{stone:24,ore:24,crystal:8},{stone:32,ore:32,crystal:12}];
export function machineSections(b){return b.sections??(b.health>0?1:0);}
export function machineRepairCost(b){return MACHINE_REPAIRS[machineSections(b)]??(b.health<=0||b.quality<60?MACHINE_REPAIRS.at(-1):null);}
const qualityMean=(a,an,b,bn)=>Math.max(0,Math.min(100,a+(b-a)*(bn/(an+bn))));
// Recover saves produced by the earlier weighted-average rounding bug, while
// keeping genuinely invalid condition values rejected by the validator.
export function recoverCultivationRounding(c){
 const fix=b=>{if(typeof b?.quality==='number'&&b.quality>100&&b.quality<=100+1e-9)b.quality=100;};
 fix(c);if(Array.isArray(c?.facilities))c.facilities.forEach(b=>{fix(b);if(b?.kind==='machine'&&b.sections===undefined)b.sections=c.restored?1:0;});
}
export const CULTIVATION_LOOK={chamber:'building.observatory',cooler:'building.stoneworks',vault:'building.depot',conduit:'building.foundry',machine:'building.resonator',carrier:'unlock.logistics',lantern:'mark.lamp'};
export function newCultivation(){return {model:CULTIVATION_MODEL,facilities:[],wild:{},starter:null,quality:100,gear:{lantern:false,carrier:false},lantern:false,phase:0,clock:0,nextId:1,restored:false};}
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const nearby=(a,b,r)=>a.z===b.z&&distance(a,b)<=r;
const cell=(x,y,z)=>`${x},${y},${z}`;
const indexCache=new WeakMap();
function index(s){
 const c=s.cultivation;let v=indexCache.get(c);
 const propsVersion=s.world.props.revision??s.world.props.size;
 if(v&&v.n===c.facilities.length&&v.mines===s.extractors.length&&v.props===s.world.props&&v.version===propsVersion)return v;
 v={n:c.facilities.length,mines:s.extractors.length,props:s.world.props,version:propsVersion,cells:new Map(),ids:new Map(),lightCells:new Map(),heat:new Map(),routes:[]};
 const heat=(b,n,r)=>{for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(Math.abs(dx)+Math.abs(dy)<=r){const k=cell(b.x+dx,b.y+dy,b.z);v.heat.set(k,(v.heat.get(k)||0)+n);}};
 for(const b of c.facilities){v.cells.set(cell(b.x,b.y,b.z),b);v.ids.set(b.id,b);if(b.kind==='cooler')heat(b,-12,3);}
 for(const b of s.extractors)if(b.key==='mine')heat(b,10,3);
 for(const [k,kind] of s.world.props){if(c.shaded?.[k])continue;const radius=PROPS[kind]?.light;if(!radius)continue;const p=unpackKey(k),r=Math.ceil(radius);for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(Math.hypot(dx,dy)<=radius)v.lightCells.set(cell(p.x+dx,p.y+dy,p.z),true);}
 for(const b of c.facilities)if(b.kind==='conduit'){const from=v.ids.get(b.from),to=v.ids.get(b.to);if(from&&to)v.routes.push({from,to});}
 indexCache.set(c,v);return v;
}
export function cultivationAt(s,x,y,z=s.player.z){return s.cultivation?index(s).cells.get(cell(x,y,z)):null;}
export function cultivationLight(s,p){return (p.z===0&&daylight(s.time)>.3)||!!index(s).lightCells.get(cell(p.x,p.y,p.z))||(s.cultivation.lantern&&p.z===s.player.z&&Math.hypot(p.x+.5-s.player.x,p.y+.5-s.player.y)<=3);}
export function cultivationTarget(s,b){return Math.max(4,(b.z<=-2?12:18)+(b.kind==='chamber'||b.kind==='machine'?18:0)+(index(s).heat.get(cell(b.x,b.y,b.z))||0));}
export function cultivationStatus(s,b){
 if(b.kind==='cooler'||b.kind==='conduit')return 'ready';
 if(b.health===0)return 'dead';if(b.temperature>22)return 'hot';
 if(!b.closed&&cultivationLight(s,b))return 'light';if(b.needsTend)return 'injured';
 if(b.kind==='chamber'&&b.health===undefined)return 'empty';return 'growing';
}
const canPay=(s,cost)=>canAfford(s.inv,cost);
function pay(s,cost){payInventory(s.inv,cost);if(!s.inv.crystal)s.cultivation.quality=100;}
function earned(s,res,n){earn(s,res,n,'buildings');}
function expose(s,b){
 if(!cultivationLight(s,b)||b.closed)return;
 if(b.health>0){b.health=Math.max(0,b.health-1);if(b.kind==='chamber')b.needsTend=true;}
 if(b.buffer)b.quality=Math.max(10,b.quality-1);
}
function exposeCargo(s){const c=s.cultivation,p={x:Math.floor(s.player.x),y:Math.floor(s.player.y),z:s.player.z};if(!c.gear.carrier&&cultivationLight(s,p)){if(c.starter)c.starter.health=Math.max(0,c.starter.health-1);if(s.inv.crystal)c.quality=Math.max(10,c.quality-1);}}

export function wildColony(s,x,y,z=s.player.z){
 if(!s.cultivation||z> -2||!isExplored(s.world,x,y,z)||tileAt(s.world,x,y,z)!==T.GEODE)return null;
 const k=packKey(x,y,z);return s.cultivation.wild[k]??=( {x,y,z,health:100,regrow:0} );
}
export function takeStarter(s,x,y){
 const c=s.cultivation,p={x,y,z:s.player.z};
 if(!c||Math.hypot(x+.5-s.player.x,y+.5-s.player.y)>1.65)return 'reach';
 if(s.tools.pickaxe<3)return 'equipment';
 const w=wildColony(s,x,y);if(!w)return 'site';if(c.starter)return 'carrying';if(w.regrow||w.health<=0)return 'regrow';
 c.starter={health:100};w.health=0;w.regrow=45;exposeCargo(s);return 'ok';
}
export function cultivationCommand(s,cmd){
 const c=s.cultivation;if(!c||s.shared)return 'invalid';
 const x=cmd.x??Math.floor(s.player.x),y=cmd.y??Math.floor(s.player.y),z=s.player.z;
 if(!Number.isInteger(x)||!Number.isInteger(y)||!isExplored(s.world,x,y,z))return 'unseen';
 if(Math.hypot(x+.5-s.player.x,y+.5-s.player.y)>1.65)return 'reach';
 const b=cultivationAt(s,x,y,z),cost=CULTIVATION_RECIPES[cmd.kind||cmd.type];
 if(cmd.type==='shade'){
  const k=packKey(x,y,z);if(!PROPS[s.world.props.get(k)]?.light)return 'site';
  c.shaded??={};if(!(k in c.shaded)){if(!canPay(s,CULTIVATION_RECIPES.shade))return 'materials';pay(s,CULTIVATION_RECIPES.shade);}
  c.shaded[k]=!c.shaded[k];indexCache.delete(c);return 'ok';
 }
 if(cmd.type==='starter')return takeStarter(s,x,y);
 if(cmd.type==='lantern'){if(!c.gear.lantern)return 'equipment';c.lantern=!c.lantern;exposeCargo(s);if(c.lantern)for(const b of c.facilities)expose(s,b);return 'ok';}
 if(cmd.type==='craft'){
  if(!['carrier','lantern'].includes(cmd.kind)||c.gear[cmd.kind])return 'invalid';
  if(!canPay(s,cost))return 'materials';pay(s,cost);c.gear[cmd.kind]=true;return 'ok';
 }
 if(cmd.type==='build'){
  if(!['chamber','cooler','vault','conduit'].includes(cmd.kind))return 'invalid';
  if(z> -2)return 'deep';const type=tileAt(s.world,x,y,z);
  if(!TILE_INFO[type].walk||TILE_INFO[type].rise||TILE_INFO[type].descend||b||s.extractors.some(e=>e.x===x&&e.y===y&&e.z===z)||s.world.props.has(packKey(x,y,z)))return 'occupied';
  if(!canPay(s,cost))return 'materials';
  const next={kind:cmd.kind,id:c.nextId,x,y,z,temperature:12,closed:true,buffer:0,quality:100};
  if(cmd.kind==='conduit'){
   const from=c.facilities.find(a=>a.kind==='chamber'&&nearby(a,next,4)),to=c.facilities.find(a=>a.kind==='vault'&&nearby(a,next,4));
   if(!from||!to)return 'route';next.from=from.id;next.to=to.id;
  }
  pay(s,cost);c.nextId++;c.facilities.push(next);return 'ok';
 }
 if(!b)return 'building';
 if(cmd.type==='shutter'&&['chamber','vault','machine'].includes(b.kind)){b.closed=!b.closed;expose(s,b);return 'ok';}
 if(cmd.type==='plant'&&b.kind==='chamber'){
  if(!c.starter)return 'starter';if(b.health>0)return 'occupied';if(b.closed)return 'open';
  b.health=c.starter.health;b.needsTend=b.health<100;b.temperature=cultivationTarget(s,b);c.starter=null;expose(s,b);return 'ok';
 }
 if(cmd.type==='tend'&&b.kind==='chamber'){
  if(!b.health)return 'dead';if(b.closed)return 'open';if(cultivationLight(s,b)||b.temperature>22)return 'unsafe';
  if(!canPay(s,CULTIVATION_RECIPES.tend))return 'materials';pay(s,CULTIVATION_RECIPES.tend);b.needsTend=false;return 'ok';
 }
 if(cmd.type==='collect'&&['chamber','vault'].includes(b.kind)){
  if(b.closed&&!c.gear.carrier)return 'open';if(b.buffer<1)return 'empty';
  c.quality=s.inv.crystal?qualityMean(c.quality,s.inv.crystal,b.quality,b.buffer):b.quality;earned(s,'crystal',b.buffer);b.buffer=0;exposeCargo(s);return 'ok';
 }
 if(cmd.type==='store'&&b.kind==='vault'){
  if(b.closed&&!c.gear.carrier)return 'open';const n=Math.min(s.inv.crystal,(b.reinforced?40:20)-b.buffer);if(n<=0)return 'empty';
  b.quality=b.buffer?qualityMean(b.quality,b.buffer,c.quality,n):c.quality;b.buffer+=n;pay(s,{crystal:n});return 'ok';
 }
 if(cmd.type==='reinforce'&&['chamber','vault'].includes(b.kind)){
  if(b.reinforced)return 'occupied';if(!canPay(s,CULTIVATION_RECIPES.reinforce))return 'materials';pay(s,CULTIVATION_RECIPES.reinforce);b.reinforced=true;return 'ok';
 }
 if(cmd.type==='repair'&&b.kind==='machine'){
  const recipe=machineRepairCost(b);if(!recipe)return 'repaired';
  if(c.quality<60)return 'quality';if(cultivationTarget(s,b)>22)return 'cooling';
  if(!b.closed)return 'close';
  if(!canPay(s,recipe))return 'materials';const quality=c.quality;pay(s,recipe);
  b.sections=Math.min(MACHINE_REPAIRS.length,machineSections(b)+1);b.health=100;b.quality=quality;b.temperature=cultivationTarget(s,b);c.restored=true;return 'discovery';
 }
 if(cmd.type==='activate'&&b.kind==='machine'){
  if(c.completed)return 'completed';if(machineSections(b)<MACHINE_REPAIRS.length)return 'sections';
  if(!b.closed)return 'close';if(b.health<=0||b.quality<60)return 'quality';
  if(cultivationTarget(s,b)>22||b.temperature>22)return 'cooling';
  c.completed=true;c.completedAt=s.time;return 'activated';
 }
 return 'invalid';
}
function discoverMachine(s){
 const c=s.cultivation;if(s.player.z> -2||c.facilities.some(b=>b.kind==='machine'))return;
 const x=Math.floor(s.player.x),y=Math.floor(s.player.y),z=s.player.z;
 for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
  const px=x+dx,py=y+dy;if(!isExplored(s.world,px,py,z)||tileAt(s.world,px,py,z)!==T.TUNNEL||cultivationAt(s,px,py,z))continue;
  c.facilities.push({kind:'machine',sections:0,id:c.nextId++,x:px,y:py,z,temperature:30,closed:true,health:0,quality:100,buffer:0});return;
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
 const carriedDamage=heat+(!c.gear.carrier&&cultivationLight(s,p)?9:0);
 if(c.starter){c.starter.health-=carriedDamage*seconds;if(c.starter.health<=0)c.starter=null;}
 if(s.inv.crystal)c.quality=Math.max(10,c.quality-carriedDamage*seconds);
 for(const w of Object.values(c.wild)){
  if(w.regrow>0){w.regrow=Math.max(0,w.regrow-seconds);if(!w.regrow)w.health=100;}
  else {w.health=Math.max(0,w.health-((cultivationLight(s,w)?9:0)+Math.max(0,cultivationTarget(s,w)-22)*.8)*seconds);if(!w.health)w.regrow=45;}
 }
 for(const b of c.facilities){
  const target=cultivationTarget(s,b);b.temperature=target+(b.temperature-target)*Math.exp(-seconds/6);
  const damage=(Math.max(0,b.temperature-22)*.8)+(!b.closed&&cultivationLight(s,b)?9:0);
  if(b.buffer)b.quality=Math.max(10,b.quality-damage*seconds);
  if(b.health>0){
   if(damage){b.health=Math.max(0,b.health-damage*seconds);if(b.kind==='chamber')b.needsTend=true;}
   else if(!b.needsTend)b.health=Math.min(100,b.health+4*seconds);
   if(b.kind==='chamber'&&b.health>0&&!b.needsTend&&b.temperature<=22){if(!b.buffer)b.quality=100;b.buffer=Math.min(b.reinforced?40:20,b.buffer+.3*seconds);}
  }
 }
 for(const {from,to} of index(s).routes){const n=Math.max(0,Math.min(from.buffer,.8*seconds,(to.reinforced?40:20)-to.buffer));if(n){to.quality=to.buffer?qualityMean(to.quality,to.buffer,from.quality,n):from.quality;to.buffer+=n;from.buffer-=n;}}
}
export function validCultivation(c){
 const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
 const pos=b=>!!b&&Number.isInteger(b.x)&&Number.isInteger(b.y)&&Math.abs(b.x)<2**20&&Math.abs(b.y)<2**20&&Number.isInteger(b.z)&&b.z>=-512&&b.z<=-2;
 if(!c||c.model!==CULTIVATION_MODEL||!Array.isArray(c.facilities)||!c.wild||Array.isArray(c.wild)||typeof c.wild!=='object'||!c.gear||!number(c.quality,0,100)||!number(c.phase,0,.25-1e-10)||!Number.isSafeInteger(c.nextId)||!number(c.clock,0,Number.MAX_SAFE_INTEGER))return false;
 if(c.starter&&!number(c.starter.health,0,100))return false;
 if(c.completed!==undefined&&typeof c.completed!=='boolean')return false;
 if(c.completedAt!==undefined&&!number(c.completedAt,0,Number.MAX_SAFE_INTEGER))return false;
 const ids=new Map(),cells=new Set();
 for(const b of c.facilities){
  if(!b||!['chamber','cooler','vault','conduit','machine'].includes(b.kind)||!Number.isSafeInteger(b.id)||b.id<1||b.id>=c.nextId||ids.has(b.id)||!pos(b)||!number(b.temperature,-1000,1000)||!number(b.buffer,0,40)||!number(b.quality,0,100)||(b.health!==undefined&&!number(b.health,0,100)))return false;
  if(b.sections!==undefined&&(b.kind!=='machine'||!Number.isInteger(b.sections)||b.sections<0||b.sections>MACHINE_REPAIRS.length))return false;
  const k=cell(b.x,b.y,b.z);if(cells.has(k))return false;cells.add(k);ids.set(b.id,b);
 }
 for(const b of c.facilities)if(b.kind==='conduit'&&(ids.get(b.from)?.kind!=='chamber'||ids.get(b.to)?.kind!=='vault'))return false;
 if(c.completed&&!c.facilities.some(b=>b.kind==='machine'&&machineSections(b)===MACHINE_REPAIRS.length))return false;
 return Object.values(c.wild).every(w=>pos(w)&&number(w.health,0,100)&&number(w.regrow,0,45));
}
