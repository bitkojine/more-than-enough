import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import {createController} from '../../src/game/controller.js';
import {createPerfect} from '../../src/game/perfect.js';
import {createInput} from '../../src/game/input.js';
import {createSimulation} from '../../src/engine/simulation.js';
import {createAutoplaySession} from '../../scripts/autoplay-driver.mjs';
import {bench, actionWasRefused} from '../../scripts/perfect-bench.mjs';
function feedback(){return new Proxy({}, {get:()=>()=>{}});}
function manual(s,gathered){return createController({game:{state:s,saveSoon(){},saveNow(){}},fx:feedback(),audio:feedback(),hud:feedback(),look:{color:()=>''},actor:{act(){}},cam:{unproject:(x,y)=>({x,y})},gathered});}

test('an unseen charger cannot turn travel to a known charger into a charge decision',()=>{
 const a=C.createState(12345);a.time=C.DAY_LENGTH/2;a.battery=0;a.tools.boots=2;
 const river=(x,y)=>C.swimsAt(a.world,x,y,0)&&C.landAt(a.seed,x,y).border==='river';
 const distance=(C.exploreRadius(a)*C.lightScale(a)+C.CHARGE_RANGE)/2;
 assert.ok(distance<C.CHARGE_RANGE);
 const hidden=C.nearestTile(a.player.x,a.player.y,200,(x,y)=>river(x,y)&&C.walkable(a.world,Math.floor(x+.5+distance),y,0));assert.ok(hidden);
 a.player={x:hidden.x+.5+distance,y:hidden.y+.5,z:0};
 assert.ok(C.tileDist2(a.player,hidden.x,hidden.y,0)<=C.CHARGE_RANGE**2);
 const known=C.nearestTile(a.player.x,a.player.y,30,(x,y)=>river(x,y)&&C.tileDist2(a.player,x,y,0)>25);assert.ok(known);
 a.world.explored.clear();C.revealAround(a);C.markExplored(a.world,known.x,known.y,0);
 assert.equal(C.isExplored(a.world,hidden.x,hidden.y,0),false);
 a.world.props.set(C.packKey(known.x,known.y,0),'wheel');
 const b=C.deserialize(C.serialize(a));b.world.props.set(C.packKey(hidden.x,hidden.y,0),'wheel');
 assert.ok(C.chargerNear(b),'physics can charge from an unseen nearby wheel');
 const intent=s=>C.nextIntent(s,C.newMind());
 assert.deepEqual(intent(b),intent(a),'only observable chargers may steer AUTO');
});

for(const fps of [10,20,30,60,120])test(`manual Gather and AUTO share four held actions per second at ${fps} updates`,()=>{
 const s=C.createState(12345);
 const tile=C.nearestTile(s.player.x,s.player.y,140,(x,y)=>C.tileAt(s.world,x,y,0)===C.T.FOREST&&C.richness(s.world,x,y,0)>=6&&!C.gearNeeded(s,x,y));assert.ok(tile);
 s.player={x:tile.x+.5,y:tile.y+.5,z:0};C.revealAround(s);
 let hand=0,auto=0;
 const controller=manual(s,()=>hand++);
 const button=createPerfect({game:{state:C.createState(12345)},hud:{toast(){}},controller:{walking:false,perform(){auto++;return true;}}});
 controller.press();button.press();
 for(let i=0;i<fps;i++){controller.tick(1/fps,true,null);button.tick(1/fps,true);}
 assert.equal(auto,5);assert.equal(hand,auto,'manual hold must not be slower than AUTO');
 button.release();
});


test('legacy regression reporting counts false and null refusals, not only failed purchase objects',()=>{
 for(const result of [false,null,{ok:false}])assert.equal(actionWasRefused(result),true);
 for(const result of [true,undefined,{ok:true},{res:'stone',amount:1}])assert.equal(actionWasRefused(result),false);
});

test('fresh headless initialization contains exactly normal new-world progress',()=>{
 for(const seed of [91381,91382,91383]){
  const normal=C.createState(seed), session=createAutoplaySession(seed);
  assert.equal(C.serialize(session.state),C.serialize(normal));
  assert.deepEqual(session.state.inv,Object.fromEntries(C.RESOURCES.map(r=>[r,0])));
  assert.equal(session.state.extractors.length,0);assert.equal(session.state.prestiges,0);
 }
});

test('browser-style callbacks and quiet headless scheduling yield identical AUTO commands and saved worlds',()=>{
 const headActs=[],browserActs=[];
 const head=createAutoplaySession(91384,intent=>headActs.push([head.state.time,{...intent}]));
 const s=C.createState(91384), controller=manual(s,()=>{}), perform=controller.perform.bind(controller);
 controller.perform=(intent,held)=>{browserActs.push([s.time,{...intent}]);return perform(intent,held);};
 const auto=createPerfect({game:{state:s},controller,hud:{toast(){}}});
 const input={perfect:true,held:false,trail:null,moveVector:()=>({x:0,y:0}),holdPoint:()=>null};
 const browser=createSimulation({game:{state:s},controller,autoplay:auto,input,
  afterCore(){C.settleEconomy(s);},onEvents(){}});
 // Constructed integration fixture only: both hosts get the same state.
 for(const state of [s,head.state]){state.unlocks.logistics=true;for(const r of C.RESOURCES)state.inv[r]=1e6;}
 head.press();auto.press();
 head.advanceTicks(1800);for(let i=0;i<1800;i++)browser.tick();
 assert.deepEqual(headActs,browserActs);assert.equal(C.serialize(head.state),C.serialize(s));
 assert.ok(head.work.updates<browser.work.updates);
 head.release();auto.release();
});

test('AUTO controller intents cannot bypass reach, prices, placement or ownership checks',()=>{
 const s=C.createState(91385);
 const tile=C.nearestTile(s.player.x,s.player.y,100,(x,y)=>C.tileAt(s.world,x,y,0)===C.T.FOREST);assert.ok(tile);
 s.player={x:tile.x+.5,y:tile.y+.5,z:0};s.inv.mycelium=15;assert.equal(C.place(s,'garden').ok,true);
 s.shared='audit';s.me='self';s.extractors[0].owner='other';s.extractors[0].buffer=100;
 const controller=manual(s,()=>{}), before=C.serialize(s);
 for(const intent of [{type:'harvestAt',x:10000,y:10000},{type:'buy',id:'basket'},
  {type:'place',key:'garden',x:10000,y:10000},{type:'prop',kind:'solar'},
  {type:'climb',x:10000,y:10000},{type:'collect'}])assert.equal(controller.perform(intent,true),false);
 assert.equal(C.serialize(s),before);
});


test('blocked UI rejects pointer presses on AUTO and Gather just as keyboard input does',t=>{
 for(const name of ['window','document']){
  const previous=Object.getOwnPropertyDescriptor(globalThis,name);
  Object.defineProperty(globalThis,name,{value:new EventTarget(),configurable:true});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,name,previous);else delete globalThis[name];});
 }
 const el=Object.fromEntries(['perfect','action','zoomIn','zoomOut','zoomLevel'].map(k=>[k,new EventTarget()]));
 let auto=0,hand=0;
 const input=createInput({canvas:new EventTarget(),cam:{},el,handlers:{blocked:()=>true,perfectPressed(){auto++;},actionPressed(){hand++;}}});
 el.perfect.dispatchEvent(new Event('pointerdown'));el.action.dispatchEvent(new Event('pointerdown'));
 assert.equal(auto,0);assert.equal(hand,0);assert.equal(input.perfect,false);assert.equal(input.held,false);
});

test('opening blocked UI stops an AUTO-started walk and resumes only when unblocked',()=>{
 const s=C.createState(91386),controller=manual(s,()=>{});let acts=0,allowed=true;
 const perform=controller.perform.bind(controller);controller.perform=(...args)=>{acts++;return perform(...args);};
 const auto=createPerfect({game:{state:s},controller,hud:{toast(){}}});
 const input={perfect:true,held:false,trail:null,moveVector:()=>({x:0,y:0}),holdPoint:()=>null};
 const engine=createSimulation({game:{state:s},controller,autoplay:auto,input,canAutoplay:()=>allowed});
 auto.press();for(let i=0;i<1200&&!controller.walking;i++)engine.tick();assert.ok(controller.walking);
 const before={...s.player},count=acts;allowed=false;
 for(let i=0;i<60;i++)engine.tick();
 assert.deepEqual(s.player,before);assert.equal(controller.walking,false);assert.equal(acts,count);
 allowed=true;for(let i=0;i<60;i++)engine.tick();assert.ok(acts>count);auto.release();
});


test('releasing AUTO does not cancel a replacement walk chosen manually',()=>{
 const s=C.createState(91387),controller=manual(s,()=>{});
 const auto=createPerfect({game:{state:s},controller,hud:{toast(){}}});
 auto.press();for(let i=0;i<1200&&!controller.walking;i++){controller.steer(1/60,{x:0,y:0});C.step(s,1/60);C.revealAround(s);auto.tick(1/60,true);}
 assert.ok(controller.walking);const token=controller.walkToken;
 controller.tap(s.player.x+10,s.player.y+10);assert.ok(controller.walking);assert.notEqual(controller.walkToken,token);
 auto.release();assert.ok(controller.walking,'the manual destination survives releasing AUTO');
});

test('surface AUTO planning cannot read unobserved terrain or richness',()=>{
 for(const seed of [91390,91391]){
  const s=C.createState(seed),w=s.world;
  const chunks=[...w.explored.keys()];
  for(const key of chunks){const c=C.unpackKey(key);C.tileAt(w,c.x*C.CHUNK_SIZE,c.y*C.CHUNK_SIZE,c.z);}
  for(const [key,chunk]of w.chunks){
   const c=C.unpackKey(key);
   const guard=array=>new Proxy(array,{get(target,key){
    if(typeof key==='string'&&/^\d+$/.test(key)){
     const i=Number(key),x=c.x*C.CHUNK_SIZE+i%C.CHUNK_SIZE,y=c.y*C.CHUNK_SIZE+Math.floor(i/C.CHUNK_SIZE);
     assert.ok(C.isExplored(w,x,y,c.z),`planner read hidden tile ${x},${y},${c.z}`);
    }return Reflect.get(target,key,target);
   }});
   chunk.type=guard(chunk.type);chunk.rich=guard(chunk.rich);
  }
  const original=w.chunks;
  w.chunks=new Proxy(original,{get(target,key){
   if(key==='get')return k=>{assert.ok(target.has(k),'planner requested an unobserved chunk');return target.get(k);};
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});w.hotKey=-1;w.hotChunk=null;
  const mind=C.newMind();assert.ok(C.nextIntent(s,mind));
  for(const r of C.RESOURCES)s.inv[r]=1e6;s.time+=61;
  assert.ok(C.nextIntent(s,mind));
 }
});


test('a changed-source evaluation cannot start another worker',async()=>{
 const result=await bench({seeds:[91388],hours:1,jobs:1,canStart:()=>false});
 assert.equal(result.runs.length,0);
});
