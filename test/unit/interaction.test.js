import {unlockOptional} from './helpers.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import {cleanAct} from '../../src/net/protocol.js';
import {createController} from '../../src/game/controller.js';
function site(){
 const s=unlockOptional(C.createState(12345,{cultivation:true}));
 for(let y=-5;y<=5;y++)for(let x=-5;x<=8;x++){C.tileAt(s.world,x,y,0);s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.GRASS;C.markExplored(s.world,x,y,0);}
 s.player={x:.5,y:.5,z:0};return s;
}
function type(s,x,y,t){C.tileAt(s.world,x,y,0);s.world.hotChunk.type[C.chunkIndex(x,y)]=t;}
function host(s){
 const noop=()=>{},proxy=new Proxy({},{get:()=>noop}),acts=[];
 const c=createController({game:{state:s,saveSoon:noop,saveNow:noop},cam:{unproject:(x,y)=>({x,y})},fx:proxy,audio:proxy,hud:proxy,look:{color:()=>''},actor:{act:(a,d)=>acts.push({a,d})}});
 return {c,acts,tick(dir={x:0,y:0}){c.steer(1/60,dir);C.step(s,1/60);c.tick(1/60,false);}};
}
test('personal world interactions require contact: no diagonals, gaps, walls or other layers',()=>{
 const s=site();assert.ok(C.atInteraction(s,1,0));assert.ok(C.atInteraction(s,0,0));
 assert.equal(C.atInteraction(s,1,1),false);assert.equal(C.atInteraction(s,2,0),false);assert.equal(C.atInteraction(s,0,0,-1),false);
 type(s,0,0,C.T.ROCK);assert.equal(C.atInteraction(s,1,0),false,'cannot work while standing inside a wall');
});
test('one map selection approaches, faces and harvests once through the shared controller',()=>{
 const s=site(),{c,acts,tick}=host(s);type(s,4,0,C.T.STONE);C.setRichness(s.world,4,0,0,5);
 c.tap(4.5,.5);assert.ok(c.walking);assert.equal(s.inv.stone,0,'no remote payment');
 let n=0;while(c.walking&&n++<600)tick();assert.ok(n<600);assert.equal(s.inv.stone,1);
 assert.ok(C.atInteraction(s,4,0));assert.ok(c.facing.x>0);assert.equal(acts.filter(a=>a.a==='pick').length,1);
});
test('steering, a replacement order and a world change cancel pending world actions',()=>{
 for(const cancel of ['steer','order','world']){
  const s=site(),{c,tick}=host(s);let calls=0;
  assert.equal(c.approach(4,0,()=>++calls),'walking');
  if(cancel==='steer')tick({x:0,y:1});else if(cancel==='order')c.walk(-3,0);else s.player.z=-1;
  for(let i=0;i<300;i++)tick();assert.equal(calls,0,cancel);
 }
});
test('unreachable objects refuse the approach and never execute its action',()=>{
 const s=site(),{c,tick}=host(s);let calls=0;
 for(const [x,y] of [[3,0],[5,0],[4,-1],[4,1]])type(s,x,y,C.T.ROCK);
 assert.equal(c.approach(4,0,()=>++calls),false);for(let i=0;i<30;i++)tick();assert.equal(calls,0);
});
test('harvesting, building, colony and ladder commands reject distance without mutation',()=>{
 const s=site();for(const r of C.RESOURCES)s.inv[r]=300;s.tools.pickaxe=3;
 type(s,2,0,C.T.STONE);C.setRichness(s.world,2,0,0,5);
 const inv={...s.inv};assert.equal(C.harvestAt(s,2,0),null);assert.equal(C.place(s,'quarry',{x:2,y:0}).ok,false);
 assert.equal(C.cultivationCommand(s,{type:'build',kind:'shelter',x:2,y:0}),'reach');
 type(s,2,0,C.T.CAVE);assert.equal(C.descendAt(s,2,0),false);assert.equal(s.player.z,0);assert.deepEqual(s.inv,inv);
});
test('selected collection empties one contacted building and leaves neighbors intact',()=>{
 const s=site();s.extractors=[{key:'garden',res:'mycelium',x:1,y:0,z:0,buffer:4},{key:'quarry',res:'stone',x:0,y:1,z:0,buffer:7},{key:'quarry',res:'stone',x:1,y:1,z:0,buffer:9}];
 const got=C.collect(s,{x:0,y:1});assert.equal(got.sources.length,1);assert.deepEqual(s.extractors.map(e=>e.buffer),[4,0,9]);
});
test('personal crafting works away from buildings; infrastructure keeps producing remotely',()=>{
 const s=site();for(const r of C.RESOURCES)s.inv[r]=300;
 assert.equal(C.cultivationCommand(s,{type:'craft',kind:'carrier'}),'ok');
 s.extractors=[{key:'garden',res:'mycelium',x:100,y:100,z:0,buffer:0}];C.step(s,.25);assert.ok(s.extractors[0].buffer>0);
});
test('a distant ladder tap approaches before changing layers; one tap completes both steps',()=>{
 const s=site(),{c,tick}=host(s);type(s,4,0,C.T.CAVE);
 c.tap(4.5,.5);assert.equal(s.player.z,0);assert.ok(c.walking);
 let n=0;while(c.walking&&n++<600)tick();assert.ok(n<600);assert.ok(s.player.z<0);
 assert.equal(Math.floor(s.player.x),4);assert.equal(Math.floor(s.player.y),0);
});
test('every targeted cultivation action rejects remote coordinates before spending or changing a building',()=>{
 const s=site();for(const r of C.RESOURCES)s.inv[r]=100;
 const before=C.serialize(s);
 for(const type of ['shade','starter','heart','plant','tend','collect','store','reinforce','repair','activate']){
  assert.equal(C.cultivationCommand(s,{type,x:4,y:0}),'reach',type);
  assert.equal(C.serialize(s),before,type+' leaves the world intact');
 }
});
test('a queued building action runs on arrival and reports its actual result then',()=>{
 const s=site(),{c,tick}=host(s),results=[];
 s.cultivation.facilities.push({kind:'shelter',id:1,x:4,y:0,z:0});s.cultivation.heart={where:'carried',health:100};
 assert.equal(c.cultivation({type:'heart',x:4,y:0},r=>results.push(r)),'walking');
 assert.equal(s.cultivation.heart.where,'carried');assert.deepEqual(results,[]);
 let n=0;while(c.walking&&n++<600)tick();assert.ok(n<600);
 assert.equal(s.cultivation.heart.where,1);assert.deepEqual(results,['ok']);assert.ok(c.facing.x>0);
});
test('targeted shared collection replays the selected building and retains the old record shape for older rooms',()=>{
 const s=site();s.shared='room';s.me='me';s.acts=[];s.roomCollectAt=true;
 s.extractors=[{key:'garden',res:'mycelium',x:1,y:0,z:0,buffer:4,owner:'me'},{key:'quarry',res:'stone',x:0,y:1,z:0,buffer:7,owner:'me'}];
 const copy=C.deserialize(C.serialize(s));copy.shared='room';copy.me='me';
 const got=C.collect(s,{x:0,y:1}),act=C.takeActs(s).at(-1);
 assert.equal(got.sources[0].res,'stone');assert.equal(act.length,7);assert.deepEqual(act.slice(5),[0,1]);assert.deepEqual(cleanAct(act),act);assert.equal(cleanAct([...act,9]),null);
 assert.ok(C.replayAct(copy,act));assert.deepEqual(copy.extractors.map(e=>e.buffer),s.extractors.map(e=>e.buffer));
 s.roomCollectAt=false;assert.ok(C.collect(s));assert.equal(C.takeActs(s).at(-1).length,5);
});

test('an older room cannot turn one contacted collection into a remote group pickup',()=>{
 const s=site();s.shared='old';s.me='me';s.extractors=[{key:'garden',res:'mycelium',x:1,y:0,z:0,buffer:4,owner:'me'},{key:'quarry',res:'stone',x:1,y:1,z:0,buffer:7,owner:'me'}];
 assert.equal(C.collect(s,{x:1,y:0}),null);assert.deepEqual(s.extractors.map(e=>e.buffer),[4,7]);
 s.roomCollectAt=true;assert.ok(C.collect(s,{x:1,y:0}));assert.deepEqual(s.extractors.map(e=>e.buffer),[0,7]);
});
test('controller collection targets the selected neighbor even when another is equally close',()=>{
 const s=site(),{c}=host(s);s.extractors=[{key:'garden',res:'mycelium',x:1,y:0,z:0,buffer:4},{key:'quarry',res:'stone',x:0,y:1,z:0,buffer:7}];
 assert.ok(c.perform({type:'harvestAt',x:0,y:1},false));assert.deepEqual(s.extractors.map(e=>e.buffer),[4,0]);assert.equal(s.inv.stone,7);
});
