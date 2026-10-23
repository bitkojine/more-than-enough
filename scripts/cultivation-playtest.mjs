/* Fresh-world manual-strategy playtest. Uses the shipped controller and clock;
 * never grants materials, edits terrain/fog, or assigns player positions.
 * This is not an evaluation of the legacy AUTO strategy. */
import * as C from '../src/core/index.js';
import {createController} from '../src/game/controller.js';
import {createSimulation} from '../src/engine/simulation.js';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {VERSION} from '../src/version.js';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {invariants} from '../test/property/invariants.js';
import {reserveSeeds} from './playtest.mjs';

export function playCultivation(seed,{wallSeconds=20,log=()=>{}}={}){
 const hash=createHash('sha256');
 for(const name of readdirSync(new URL('../src/core/',import.meta.url)).filter(f=>f.endsWith('.js')).sort())hash.update(name).update(readFileSync(new URL('../src/core/'+name,import.meta.url)));
 for(const name of ['../src/game/controller.js','../src/engine/simulation.js','../src/engine/clock.js','./cultivation-playtest.mjs'])hash.update(name).update(readFileSync(new URL(name,import.meta.url)));
 const sourceHash=hash.digest('hex');
 const started=performance.now(),state=C.createState(seed,{cultivation:true}),trace=[],stages=[];
 const rules=invariants();
 const noop=()=>{},proxy=new Proxy({}, {get:()=>noop});
 const game={state,saveSoon:noop,saveNow:noop};
 const controller=createController({game,cam:{},fx:proxy,audio:proxy,hud:proxy,look:{color:()=>''},actor:{act:noop},ask:async()=>false});
 const simulation=createSimulation({game,controller,autoplay:{tick:noop},input:{perfect:false,held:false,trail:null,holdPoint:()=>null,moveVector:()=>({x:0,y:0})}});
 const visits=new Map();let actions=0,ticks=0,activationSave=null;
 function budget(){if(performance.now()-started>wallSeconds*1000)throw Error('wall-budget');if(state.time>7200)throw Error('game-time-budget');}
 function advance(n){budget();trace.push({ticks:n});for(let i=0;i<n;i++){simulation.tick();ticks++;}}
 function act(intent){budget();const result=controller.perform(intent,false);trace.push({intent,result});actions++;if(!result)throw Error('refused '+JSON.stringify(intent));advance(15);return result;}
 function command(type,kind,at=feet()){
  const cmd={type,kind,x:at.x,y:at.y};const result=C.cultivationCommand(state,cmd);trace.push({cultivation:cmd,result});actions++;
  if(!['ok','discovery','activated'].includes(result))throw Error(result+' '+JSON.stringify(cmd));controller.checkGoals();advance(15);return result;
 }
 function stage(name){if(!name.startsWith('blocked:')){for(const rule of rules)rule.check(state);if(!C.deserialize(C.serialize(state)))throw Error('unreadable stage save');}const point={name,seconds:state.time,inv:{...state.inv},position:{...state.player}};stages.push(point);log(point);}
 function feet(){return {x:Math.floor(state.player.x),y:Math.floor(state.player.y)};}
 const key=p=>p.x+','+p.y;
 const seen=(x,y)=>C.isExplored(state.world,x,y,state.player.z);
 function info(x,y){if(!seen(x,y))throw Error('hidden terrain query');return C.TILE_INFO[C.tileAt(state.world,x,y,state.player.z)];}
 function pass(x,y){const i=info(x,y);return i.walk?(!i.swim||C.canWade(state)):i.solid&&i.harvest&&C.tileAt(state.world,x,y,state.player.z)!==C.T.GEODE&&!C.gearNeeded(state,x,y);}
 // Integer-cost shortest search visits only observed tiles. O(observed tiles)
 // per new target; routes are followed without searching again at every tick.
 function search(predicate,frontier=false){
  const origin=feet(),buckets=[[origin]],cost=new Map([[key(origin),0]]),prev=new Map();let best=null,bestScore=Infinity;
  for(let d=0;d<buckets.length&&d<=1200;d++)for(const p of buckets[d]||[]){
   if(cost.get(key(p))!==d)continue;
   if(predicate(p))return {at:p,path:path(p)};
   const ns=[[p.x+1,p.y],[p.x-1,p.y],[p.x,p.y+1],[p.x,p.y-1]];
   if(frontier&&ns.some(([x,y])=>!seen(x,y))){const score=d+(visits.get(key(p)+','+state.player.z)||0)*20;if(score<bestScore){best=p;bestScore=score;}}
   for(const [x,y]of ns){if(Math.abs(x-origin.x)>256||Math.abs(y-origin.y)>256||!seen(x,y)||(!predicate({x,y})&&!pass(x,y)))continue;
    const n={x,y},k=key(n),nd=d+(info(x,y).walk?1:4);if((cost.get(k)??Infinity)<=nd)continue;
    cost.set(k,nd);prev.set(k,p);(buckets[nd]??=[]).push(n);
   }
  }
  return best?{at:best,path:path(best)}:null;
  function path(p){const out=[];while(key(p)!==key(origin)){out.push(p);p=prev.get(key(p));}return out.reverse();}
 }
 function walkTile(p){
  const i=info(p.x,p.y);
  if(!i.walk){let guard=0;while(!info(p.x,p.y).walk){if(++guard>100)throw Error('undiggable path');act({type:'harvestAt',...p});}}
  act({type:'walk',...p});let n=0;while(controller.walking){advance(1);if(++n>240)throw Error('movement stall');}
  const f=feet();if(key(f)!==key(p))throw Error('failed route '+JSON.stringify({p,f}));
 }
 function follow(route,stopNear=false){for(const p of route.path){if(stopNear&&Math.hypot(route.at.x+.5-state.player.x,route.at.y+.5-state.player.y)<=1.6)break;walkTile(p);}}
 function explore(){const r=search(()=>false,true);if(!r)throw Error('no exploration frontier');visits.set(key(r.at)+','+state.player.z,(visits.get(key(r.at)+','+state.player.z)||0)+1);follow(r);}
 function seek(predicate,stopNear=false){for(let i=0;i<600;i++){const route=search(predicate);if(route){follow(route,stopNear);return route.at;}explore();}throw Error('no target');}
 function gather(res,n){let tries=0;while(state.inv[res]+1e-8<n){if(++tries>2000)throw Error('gather stall '+res);
   const at=seek(p=>{const i=info(p.x,p.y);return i.res===res&&C.harvestable(state,p.x,p.y)&&!C.gearNeeded(state,p.x,p.y);},true);
   act({type:'harvestAt',...at});
  }}
 function buy(id){act({type:'buy',id});}
 function buildProducer(kind){const at=seek(p=>{const t=C.tileAt(state.world,p.x,p.y,state.player.z),d=C.EXTRACTORS[kind];return t===d.tile&&C.richness(state.world,p.x,p.y,state.player.z)>0&&!C.extractorAt(state,p.x,p.y,state.player.z)&&!C.holeBelow(state.world,p.x,p.y,state.player.z)&&!C.wayUp(state.world,p.x,p.y,state.player.z);},true);act({type:'place',key:kind,...at});}
 function go(at){const r=search(p=>key(p)===key(at));if(!r)throw Error('unreachable '+JSON.stringify(at));follow(r,true);}
 function buildingSite(near,radius=3,extra=()=>true){return seek(p=>extra(p)&&Math.abs(p.x-near.x)+Math.abs(p.y-near.y)<=radius&&pass(p.x,p.y)&&!info(p.x,p.y).rise&&!info(p.x,p.y).descend&&!C.cultivationAt(state,p.x,p.y)&&!C.extractorAt(state,p.x,p.y,state.player.z)&&!state.world.props.has(C.packKey(p.x,p.y,state.player.z)));}
 try{
  stage('empty hands');gather('mycelium',34);buy('basket');gather('mycelium',8);gather('stone',5);buy('pickaxe');
  gather('mycelium',32);buy('boots');gather('mycelium',180);gather('stone',230);buy('pickaxe');buildProducer('garden');buildProducer('quarry');stage('surface settlement');
  const cave=seek(p=>!!info(p.x,p.y).descend,true);act({type:'descend',...cave});stage('first descent');
  gather('ore',160);stage('metal gathered');
  const shaft=seek(p=>info(p.x,p.y).descend||C.tileAt(state.world,p.x,p.y,state.player.z)===C.T.SHAFT,true);
  while(!C.canDescendAt(state,shaft.x,shaft.y))act({type:'harvestAt',...shaft});act({type:'descend',...shaft});stage('deep underground');
  // Reveal a reachable wild colony, never read its position from the seed.
  const wild=seek(p=>C.tileAt(state.world,p.x,p.y,state.player.z)===C.T.GEODE,true);
  stage('wild colony discovered');
  const roomAt=buildingSite(feet(),3);go(roomAt);command('build','chamber',roomAt);
  const coolAt=buildingSite(roomAt,3);go(coolAt);command('build','cooler',coolAt);
  go(wild);command('starter',null,wild);go(roomAt);command('shutter',null,roomAt);command('plant',null,roomAt);
  const room=C.cultivationAt(state,roomAt.x,roomAt.y);if(room.needsTend)command('tend',null,roomAt);command('shutter',null,roomAt);stage('colony growing');
  command('craft','carrier');const vaultAt=buildingSite(roomAt,3);go(vaultAt);command('build','vault',vaultAt);
  const linkAt=buildingSite(roomAt,3,p=>Math.abs(p.x-vaultAt.x)+Math.abs(p.y-vaultAt.y)<=4);go(linkAt);command('build','conduit',linkAt);
  const machine=state.cultivation.facilities.find(b=>b.kind==='machine');if(!machine)throw Error('machine not discovered');
  const machineCool=buildingSite(machine,3);go(machineCool);command('build','cooler',machineCool);
  const crystalNeeded=C.MACHINE_REPAIRS.reduce((sum,cost)=>sum+cost.crystal,0);
  const vault=C.cultivationAt(state,vaultAt.x,vaultAt.y);go(vaultAt);
  while(state.inv.crystal<crystalNeeded){
   if(vault.buffer>=1)command('collect',null,vaultAt);else advance(15);
  }
  go(machine);for(let i=0;i<C.MACHINE_REPAIRS.length;i++){command('repair',null,machine);stage('machine section '+(i+1)+' restored');}
  activationSave=C.serialize(state);command('activate',null,machine);stage('machine activated');
  if(!C.canEmbark(state))throw Error('activation did not complete world');
  const saved=C.deserialize(C.serialize(state));if(!saved?.cultivation.completed||!C.canEmbark(saved))throw Error('completion lost on reload');
  const next=C.embark(saved,(seed%4294967294)+1);if(!next.ok||Object.values(next.state.inv).some(n=>n!==0)||Object.values(next.state.tools).some(n=>n!==0))throw Error('next world not empty-handed');
  return finish('won');
 }catch(e){stage('blocked: '+e.message);return finish('blocked',e.message);}
 function finish(result,error){return {seed,result,error,version:VERSION,sourceHash,driver:'manual strategy through shipped controller; no AUTO claim',win:'machine activation and Core.canEmbark',seconds:state.time,wallMs:performance.now()-started,actions,ticks,stages,trace,activationSave,save:C.serialize(state)};}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=resolve(process.argv[2]||'../.mte-cultivation-playtests');mkdirSync(dir,{recursive:true});
 const [seed]=reserveSeeds(resolve(dir,'seeds'),1);console.log('Fresh seed',seed);
 const result=playCultivation(seed,{log:p=>console.log(p.name,Math.round(p.seconds)+'s',p.position,p.inv)});
 writeFileSync(resolve(dir,seed+'.json'),JSON.stringify(result,null,2)+'\n');console.log(result.result,Math.round(result.wallMs)+'ms',result.error||'');if(result.result==='blocked')process.exitCode=1;
}
