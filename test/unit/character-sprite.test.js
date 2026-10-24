import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterSprite,characterFrame} from '../../src/game/render/character-sprite.js';
const look={overrides:()=>false};
const gear={basket:2,pickaxe:3,boots:2};
const choose=(extra={})=>characterSprite({look,...extra});
test('whole-figure poses show only owned equipment and actual cargo',()=>{
 assert.equal(choose().id,'character.wanderer');
 assert.equal(choose({actor:{act:'pick',t:.2}}).id,'character.bareForager');
 assert.equal(choose({actor:{act:'swing',t:.1}}).id,'character.wanderer');
 assert.equal(choose({equipment:gear}).id,'character.worker');
 assert.equal(choose({equipment:gear,actor:{act:'pick',t:.2}}).id,'character.forager');
 const cargo={gear:{carrier:false,lantern:true},starter:{health:100},lantern:false};
 assert.equal(choose({cargo}).id,'character.specimen');cargo.gear.carrier=true;
 assert.equal(choose({cargo}).id,'character.courier');cargo.starter=null;
 assert.equal(choose({cargo}).id,'character.wanderer');cargo.lantern=true;
 assert.equal(choose({cargo}).id,'character.lamplighter');
 assert.equal(choose({cargo,crystal:2}).id,'character.courier');
});
test('work plays all authored frames, including recovery, and custom characters retain their silhouette',()=>{
 const clip={pics:Array.from({length:8},(_,i)=>i),fps:24};
 for(const [act,duration]of [['swing',.3],['pick',.45]]){
  const frames=new Set();
  for(let i=0;i<60;i++){
   const actor={act,t:duration*i/60};const appearance=choose({equipment:gear,actor});
   frames.add(characterFrame(appearance,clip,actor));
  }
  assert.equal(frames.size,8,'all eight '+act+' drawings are actually sampled');
 }
 assert.equal(choose({equipment:gear,actor:{act:'swing',t:.29}}).id,'character.miner');
 const assembly=choose({equipment:gear,actor:{act:'build',t:.4}});assert.equal(assembly.id,'character.wanderer');assert.equal(assembly.actionProgress,null,'construction does not replay mining drawings');
 const custom={overrides:id=>id==='character.wanderer'};
 assert.deepEqual(choose({look:custom,equipment:gear}),{id:'character.wanderer',composed:false});
 assert.equal(choose({device:'phone'}).id,'character.legacyWanderer');
});

test('pose sampling stays grounded on boats and is independent of game time',()=>{
 const clip={pics:[0,1,2,3],fps:8},appearance={composed:true};
 for(const time of [0,10,1e8]){
  assert.equal(characterFrame(appearance,clip,{stride:.3,walking:true},{moving:true,time}),1);
  assert.equal(characterFrame(appearance,clip,{stride:.7,walking:true},{moving:true,water:true,time}),0);
  assert.equal(characterFrame(appearance,clip,{stride:.7,walking:false},{moving:true,time}),0);
 }
});

test('clock-based walking fallback follows the current walk cadence without a distance sample',()=>{
  const clip={pics:Array.from({length:16},()=>({})),fps:8};
  assert.equal(characterFrame({composed:true},clip,{}, {moving:true,time:1.25}),10);
});
