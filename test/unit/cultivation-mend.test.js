import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

// A crystal world with one of every part, saved.
function world(){
 const s=C.createState(7,{cultivation:true}),c=s.cultivation;
 const add=(kind,x,more={})=>{const b={kind,id:c.nextId++,x,y:0,z:-2,temperature:18,health:100,quality:90,buffer:3,...more};c.facilities.push(b);return b;};
 const room=add('chamber',0),vault=add('vault',4);add('conduit',2,{from:room.id,to:vault.id});add('cooler',6);add('machine',8,{sections:1});
 const shelter=add('shelter',10,{z:0});c.heart={where:shelter.id,health:70};c.wild.a={x:20,y:5,z:-3,health:80,regrow:0};c.starter={health:60};
 s.inv.crystal=5;s.stats.playedMs=3600e3;return s;
}
const load=(s,spoil)=>{const d=JSON.parse(C.serialize(s));spoil(d.cultivation,d);return C.deserialize(JSON.stringify(d));};

test('one bad field in a crystal world mends it, never sets the whole save aside',()=>{
 const spoils={
  'quality too high':c=>{c.quality=500;},
  'clock not a number':c=>{c.clock='soon';},
  'phase past a step':c=>{c.phase=9;},
  'next id behind the ids':c=>{c.nextId=1;},
  'two parts with one id':c=>{c.facilities[3].id=c.facilities[0].id;},
  'a part with no position':c=>{c.facilities[3].x=null;},
  'two parts on one cell':c=>{c.facilities[3].x=c.facilities[0].x;},
  'an unknown kind':c=>{c.facilities.push({kind:'tower',id:99,x:1,y:1,z:-2});},
  'a conduit to nothing':c=>{c.facilities[2].to=12345;},
  'buffer over full':c=>{c.facilities[0].buffer=1e9;},
  'machine sections too many':c=>{c.facilities[4].sections=17;},
  'sections on a cooler':c=>{c.facilities[3].sections=1;},
  'heart in a pocket':c=>{c.heart={where:'pocket',health:50};},
  'heart health too high':c=>{c.heart.health=120;},
  'heart in a lost shelter':c=>{c.facilities.pop();},
  'won without a whole machine':c=>{c.completed=true;},
  'wild crystal in the sky':c=>{c.wild.a.z=4;},
  'starter health negative':c=>{c.starter.health=-3;},
  'facilities not a list':c=>{c.facilities={};},
  'gear missing':c=>{delete c.gear;},
  'heartLost a fraction':c=>{c.heartLost=2.5;}
 };
 for(const [name,spoil] of Object.entries(spoils)){
  const s=load(world(),spoil);
  assert.ok(s,name+': the save loads');assert.ok(C.validCultivation(s.cultivation),name+': mended whole');
  assert.equal(s.inv.crystal,5,name+': the rest of the world stays');assert.equal(s.stats.playedMs,3600e3,name);
 }
 const kept=load(world(),c=>{c.facilities[3].x=null;}).cultivation;
 assert.equal(kept.facilities.length,5,'only the part that can\'t be placed goes');
 assert.ok(load(world(),c=>{c.completed=true;}).cultivation.facilities.find(b=>b.kind==='machine').sections===C.MACHINE_REPAIRS.length,'a world saved as won keeps its win');
});

test('a sound crystal save loads unchanged; another model is set aside, not mended',()=>{
 const s=world();assert.deepEqual(C.deserialize(C.serialize(s)).cultivation,s.cultivation);
 assert.equal(load(world(),c=>{c.model='living-crystal-9';}),null);
});

test('random damage to a crystal save never stops it loading',()=>{
 let seed=12345;const rnd=()=>(seed=(seed*1103515245+12345)%2**31)/2**31;
 const junk=[null,undefined,-1,0,1e12,NaN,'x',true,[],{},2.5,-600];
 const spoil=o=>{const keys=Object.keys(o);if(!keys.length)return;const k=keys[Math.floor(rnd()*keys.length)];
  if(o[k]&&typeof o[k]==='object'&&rnd()<.6)spoil(o[k]);else o[k]=junk[Math.floor(rnd()*junk.length)];};
 let loaded=0;for(let i=0;i<200;i++){
  let last;const s=load(world(),c=>{last=c;for(let n=1+Math.floor(rnd()*3);n--;)spoil(c);});
  if(s===null){assert.notEqual(last.model,C.CULTIVATION_MODEL,"round "+i+" set aside");continue;} // only a changed model is set aside
  loaded++;
  assert.ok(C.validCultivation(s.cultivation),'round '+i);
 }
 assert.ok(loaded>150,loaded+' of 200 loaded');
});
