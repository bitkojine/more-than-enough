import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

function room(z=-2){
 const s=C.createState(8124,{cultivation:true});s.time=C.DAY_LENGTH/2;s.player={x:1000.5,y:1000.5,z};
 // Isolated authored fixture, with real terrain maps and mutation notifications.
 for(let dz=0;dz>=-3;dz--)for(let y=995;y<=1009;y++)for(let x=995;x<=1009;x++){
  if(dz===0)continue;
  const cx=C.chunkCoord(x),cy=C.chunkCoord(y),key=C.packKey(cx,cy,dz);
  if(!s.world.chunks.has(key))s.world.chunks.set(key,{type:new Uint8Array(256).fill(C.T.BEDROCK),rich:new Uint8Array(256).fill(1)});
 }
 s.world.hotKey=-1;s.world.hotChunk=null;
 return s;
}
function floor(s,x,y,z=-2){const c=s.world.chunks.get(C.packKey(C.chunkCoord(x),C.chunkCoord(y),z));c.type[C.chunkIndex(x,y)]=C.T.SOIL;C.setRichness(s.world,x,y,z,0);}
const light=(s,x,y,z=-2,work=null)=>C.illuminationAt(s,x,y,z,work);

test('a lamp follows passages, turns corners, and does not pass through rock',()=>{
 const s=room();for(let x=1000;x<=1004;x++)floor(s,x,1000);for(let y=1001;y<=1004;y++)floor(s,1004,y);
 s.world.props.set(C.packKey(1000,1000,-2),'lamp');
 assert.equal(light(s,1000,1000).block,9);assert.equal(light(s,1004,1000).block,5);assert.equal(light(s,1004,1004).block,1);
 floor(s,1000,1003);assert.equal(light(s,1000,1003).block,0,'sealed pocket is dark despite proximity');
});
test('strongest source wins; removing it restores the remaining path',()=>{
 const s=room();for(let x=1000;x<=1008;x++)floor(s,x,1000);
 const a=C.packKey(1000,1000,-2),b=C.packKey(1008,1000,-2);s.world.props.set(a,'lamp');s.world.props.set(b,'lamp');
 assert.equal(light(s,1004,1000).block,5);s.world.props.delete(a);assert.equal(light(s,1004,1000).block,5);
 s.world.props.delete(b);assert.equal(light(s,1004,1000).block,0);
});
test('opening and reclosing a wall updates both light increases and decreases',()=>{
 const s=room();floor(s,1000,1000);floor(s,1002,1000);s.world.props.set(C.packKey(1000,1000,-2),'lamp');
 assert.equal(light(s,1002,1000).block,0);floor(s,1001,1000);assert.equal(light(s,1002,1000).block,7);
 C.setRichness(s.world,1001,1000,-2,1);assert.equal(light(s,1002,1000).block,0);
});
test('clear stacked openings carry direct sky to depth; closing the upper connection removes it',()=>{
 const s=room();s.time=0;for(const z of [-1,-2,-3])floor(s,1000,1000,z);
 for(const z of [0,-1,-2])s.world.holes.add(C.packKey(1000,1000,z));
 assert.equal(light(s,1000,1000,-3).sky,15);assert.equal(light(s,1000,1000,-3).level,15);
 s.world.holes.delete(C.packKey(1000,1000,0));assert.equal(light(s,1000,1000,-3).sky,0);
});
test('deep openings do not invent light, but an upper lamp propagates through them',()=>{
 const s=room();floor(s,1000,1000,-1);floor(s,1000,1000,-2);s.world.holes.add(C.packKey(1000,1000,-1));
 assert.deepEqual(light(s,1000,1000),{sky:0,block:0,level:0});
 s.world.props.set(C.packKey(1000,1000,-1),'lamp');assert.equal(light(s,1000,1000).block,8);
});
test('day/night reuse sky connectivity; unchanged queries and distant edits do no propagation',()=>{
 const s=room();floor(s,1000,1000,-1);s.world.holes.add(C.packKey(1000,1000,0));const first={};
 assert.equal(light(s,1000,1000,-1,first).sky,15);assert.ok(first.terrain>0);
 s.time=0;const quiet={};assert.equal(light(s,1000,1000,-1,quiet).level,15);assert.deepEqual(quiet,{});
 s.world.mods.set(C.packKey(90000,90000,-2),0);const distant={};light(s,1000,1000,-1,distant);assert.deepEqual(distant,{});
 s.time=120;assert.equal(light(s,1000,1000,-1).level,0);
});
test('carried source moves between cells, not frames, and leaves no stale glow',()=>{
 const s=room();for(let x=1000;x<=1008;x++)floor(s,x,1000);s.cultivation.lantern=true;
 assert.equal(light(s,1000,1000).block,4);const quiet={};s.player.x+=.1;light(s,1000,1000,-2,quiet);assert.deepEqual(quiet,{});
 s.player.x=1008.5;assert.equal(light(s,1000,1000).block,0);assert.equal(light(s,1008,1000).block,4);
 s.cultivation.lantern=false;assert.equal(light(s,1008,1000).block,0);
});
test('source hood and chunk boundaries use the same authoritative field',()=>{
 const s=room();for(let x=1005;x<=1009;x++)floor(s,x,1000);const key=C.packKey(1005,1000,-2);s.world.props.set(key,'lamp');
 assert.equal(light(s,1009,1000).block,5);
 s.cultivation.shaded={[key]:true};assert.equal(light(s,1009,1000).block,0);
 s.cultivation.shaded[key]=false;C.invalidateIllumination(s,1005,1000,-2);assert.equal(light(s,1009,1000).block,5);
});

test('built facilities block physical light automatically; exposed cargo still needs a carrier',()=>{
 const s=room();for(let x=1000;x<=1008;x++)floor(s,x,1000);s.world.props.set(C.packKey(1000,1000,-2),'lamp');
 const b={kind:'chamber',id:s.cultivation.nextId++,x:1008,y:1000,z:-2,health:100,temperature:12,quality:100,buffer:0};
 s.cultivation.facilities.push(b,{kind:'cooler',id:s.cultivation.nextId++,x:1008,y:1001,z:-2,temperature:12,quality:100,buffer:0});
 assert.equal(light(s,b.x,b.y).level,1);C.stepCultivation(s,.25);assert.equal(b.health,100);
 s.cultivation.starter={health:100};C.stepCultivation(s,.25);assert.ok(s.cultivation.starter.health<100);
 s.cultivation.heart={where:'carried',health:100};s.cultivation.gear.carrier=true;s.cultivation.starter={health:100};C.stepCultivation(s,.25);
 assert.equal(s.cultivation.heart.health,100);assert.equal(s.cultivation.starter.health,100);
});
test('a switched-off lantern conserves its battery and never emits physical light',()=>{
 const s=room();floor(s,1000,1000);const battery=s.battery;C.step(s,.25,{visualEvents:false});assert.equal(s.battery,battery);
 assert.equal(light(s,1000,1000).level,0);s.cultivation.lantern=true;C.step(s,.25,{visualEvents:false});assert.ok(s.battery<battery);
});
test('light fields are derived; save and reload reproduce light without serializing caches',()=>{
 const s=C.createState(19381,{cultivation:true});s.cultivation.lantern=true;s.time=120;
 const before=C.serialize(s),p=s.player,first=C.illuminationAt(s,p.x,p.y,p.z);assert.equal(C.serialize(s),before);
 const copy=C.deserialize(before);assert.deepEqual(C.illuminationAt(copy,p.x,p.y,p.z),first);assert.equal(C.serialize(copy),before);
});

test('faint light still damages wild colonies more slowly than bright light',()=>{
 const s=room();for(let x=1000;x<=1008;x++)floor(s,x,1000);s.world.props.set(C.packKey(1000,1000,-2),'lamp');
 const wild=x=>({x,y:1000,z:-2,health:100,regrow:0});const bright=wild(1000),faint=wild(1008);
 s.cultivation.wild={bright,faint};C.stepCultivation(s,.25);
 assert.ok(faint.health<100);assert.ok(bright.health<faint.health);
 assert.ok(Math.abs((100-bright.health)/(100-faint.health)-9)<1e-9);
});
test('harvesting a still-solid seam does not invalidate unchanged light geometry',()=>{
 const s=room();floor(s,1000,1000);light(s,1000,1000);
 s.world.mods.set(C.packKey(1001,1000,-2),4);const quiet={};light(s,1000,1000,-2,quiet);assert.deepEqual(quiet,{});
});

test('lighting neither discovers remote terrain nor changes remembered exploration',()=>{
 const s=room();floor(s,1000,1000,-1);floor(s,1000,1000,-2);s.world.holes.add(C.packKey(1000,1000,-1));s.world.props.set(C.packKey(1000,1000,-1),'lamp');
 const explored=[...s.world.explored].map(([k,v])=>[k,[...v]]),revealed=s.world.revealed;
 assert.equal(C.isExplored(s.world,1000,1000,-2),false);assert.ok(light(s,1000,1000).level>0);
 assert.deepEqual([...s.world.explored].map(([k,v])=>[k,[...v]]),explored);assert.equal(s.world.revealed,revealed);
});
test('a manually lit lantern remains a physical source in daylight, and source levels are bounded',()=>{
 const s=C.createState(8124,{cultivation:true});s.cultivation.lantern=true;s.time=0;
 const p=s.player,l=C.illuminationAt(s,p.x,p.y,p.z);assert.equal(l.block,C.LANTERN_LEVEL);assert.equal(l.sky,C.LIGHT_MAX);assert.equal(l.level,C.LIGHT_MAX);
});
