import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
const building=(key,x,y,z=0,owner)=>({key,res:C.EXTRACTORS[key].res,x,y,z,buffer:0,...(owner?{owner}:{})});
function state(){const s=C.createState(12345);s.logisticsModel=C.DEPOT_MODEL;s.player={x:.5,y:.5,z:0};s.extractors=[building('quarry',0,0),building('quarry',9,0),building('depot',0,2)];return s;}

test('coverage has exact radius, ownership and layer; overlaps assign exactly once',()=>{
 const s=state(),[near,far,d]=s.extractors;
 assert.equal(C.depotFor(s,near),d);assert.equal(C.depotFor(s,far),null);
 s.extractors.push(building('mine',8,2),building('mine',8,3),building('mine',0,0,-1),building('mine',1,1,0,'other'));
 assert.equal(C.depotTargets(s,d).length,2);
 s.extractors.push(building('depot',0,1));assert.equal(C.depotFor(s,near),s.extractors.at(-1));
 assert.equal(C.depotGain(s,{x:0,y:0}),0);
});
test('covered output is paid once; uncovered output stays buffered for normal manual collection',()=>{
 const s=state(),economy=C.startEventEconomy(s);
 economy.advanceTicks(6000);economy.settle();
 assert.equal(s.inv.stone,34);assert.ok(Math.abs(s.extractors[1].buffer-34)<1e-10);
 assert.equal(C.autoCollected(s,s.extractors[0]),true);assert.equal(C.holdsOutput(s,s.extractors[1]),true);
 s.player={x:9.5,y:.5,z:0};assert.equal(C.collect(s).gained.stone,34);
 economy.advanceTicks(6000);economy.settle();
 assert.equal(s.inv.stone,102);assert.ok(Math.abs(s.extractors[1].buffer-34)<1e-10);
 assert.equal(s.sources.stone.buildings,102);
});
test('unserved buffers cap, extra depots do not duplicate resources, and cadence does not change money',()=>{
 const a=state(),b=state();a.extractors.push(building('depot',1,2));b.extractors.push(building('depot',1,2));
 const x=C.startEventEconomy(a),y=C.startEventEconomy(b);
 x.advanceTicks(60000);x.settle();
 for(let i=0;i<1000;i++){y.advanceTicks(60);y.settle();void b.extractors[1].buffer;}
 assert.deepEqual(a.inv,b.inv);assert.equal(a.inv.stone,340);
 assert.equal(a.extractors[1].buffer,C.extractorCapacity(a,'quarry'));
 assert.equal(C.serialize(a),C.serialize(b));
});
test('normal placement activates coverage and transfers old stock without grants or duplicate payouts',()=>{
 const s=state();s.extractors=s.extractors.slice(0,2);s.player={x:.5,y:.5,z:0};
 // Use actual legal ground around the spawn for the placement integration fixture.
 s.player=C.createState(12345).player;s.extractors[0].x=Math.floor(s.player.x);s.extractors[0].y=Math.floor(s.player.y);
 C.revealAround(s);const economy=C.startEventEconomy(s);economy.advanceTicks(6000);
 for(const [r,n] of Object.entries(C.extractorCost(s,'depot')))C.earn(s,r,n,'finds'); // fixture funding only
 economy.stop();const at=C.buildTarget(s,'depot');assert.ok(at);assert.ok(C.depotGain(s,at)>0);
 const before=s.inv.stone;assert.ok(C.place(s,'depot',at).ok);
 assert.equal(s.inv.stone,before-110+34);assert.ok(Math.abs(s.extractors[0].buffer)<1e-10);
 C.step(s,1/60);C.settleEconomy(s);assert.equal(s.sources.stone.buildings,34);
 assert.equal(C.buy(s,'logistics').ok,false);
 assert.equal(C.upgradeLevel(s,'logistics'),1);
});
test('saved capability, covered/uncovered buffers and collection survive repeated save/load',()=>{
 const s=state(),economy=C.startEventEconomy(s);economy.advanceTicks(6100);economy.settle();
 const saved=C.serialize(s),loaded=C.deserialize(saved);assert.equal(loaded.logisticsModel,C.DEPOT_MODEL);
 assert.equal(C.serialize(loaded),saved);assert.equal(loaded.unlocks.logistics,false);
 const e=C.startEventEconomy(loaded);e.advanceTicks(60);e.settle();
 assert.ok(loaded.inv.stone>=s.inv.stone);assert.ok(loaded.extractors[1].buffer>s.extractors[1].buffer);
 const unknown=JSON.parse(saved);unknown.logisticsModel='future';assert.equal(C.deserialize(JSON.stringify(unknown)),null);
});
test('legacy global Logistics and legacy saves keep their previous behavior',()=>{
 const s=state();delete s.logisticsModel;s.unlocks.logistics=true;
 const e=C.startEventEconomy(s);e.advanceTicks(6000);e.settle();assert.equal(s.inv.stone,68);
 assert.ok(!C.deserialize(C.serialize(s)).logisticsModel);
 assert.equal(C.place(C.createState(12345),'depot').ok,false);
});
test('forty-hour advance avoids per-tick or per-depot producer scans',()=>{
 const s=state(),economy=C.startEventEconomy(s),visits=economy.work.buildingVisits;
 economy.advanceTicks(40*3600*60);economy.settle();
 assert.equal(economy.work.buildingVisits,visits);
 assert.equal(s.inv.stone,Math.floor(.34*40*3600));assert.equal(s.extractors[1].buffer,45);
});
test('variable-step fallback and explicitly enabled away time preserve physical coverage',()=>{
 const s=state();C.startEventEconomy(s);C.step(s,.013,{visualEvents:false});
 assert.ok(s.extractors[1].buffer>0);
 const before=s.inv.stone;assert.equal(C.awayProduce(s,100),null);
 C.awayProduce(s,100,true);assert.ok(s.inv.stone>before);assert.ok(s.extractors[1].buffer>30);
});

test('rate changes and frequent saves do not alter covered earnings or waiting output',()=>{
 const a=state(),b=state();
 for(const s of [a,b])for(const r of C.RESOURCES)C.earn(s,r,1000,'finds');
 const ea=C.startEventEconomy(a),eb=C.startEventEconomy(b);
 for(let i=0;i<240;i++){
  ea.advanceTicks(17);eb.advanceTicks(17);
  if(i===120){assert.ok(C.buy(a,'stone').ok);assert.ok(C.buy(b,'stone').ok);}
  if(i%3===0)C.serialize(b);
 }
 ea.settle();eb.settle();assert.deepEqual(a.inv,b.inv);assert.equal(C.serialize(a),C.serialize(b));
 const saved=C.serialize(a),r=C.deserialize(saved);assert.equal(C.serialize(r),saved);
 assert.ok(r.extractors[1].buffer>20,'unserved producer receives its upgraded production');
});

test('the real AUTO handler can acquire the physical depot without buying an abstract unlock',async()=>{
 const {createAutoplaySession}=await import('../../src/game/autoplay-session.js');
 const {master}=await import('./helpers.js');
 const a=createAutoplaySession(12345),s=a.state;s.logisticsModel=C.DEPOT_MODEL;master(s);s.unlocks.logistics=false;
 for(const r of C.RESOURCES)C.earn(s,r,100000,'finds');
 s.extractors.push(building('quarry',Math.floor(s.player.x),Math.floor(s.player.y)));
 a.press();let ticks=0;
 while(!C.extractorCount(s,'depot')&&ticks<120*60)ticks+=a.advanceChunk(1);
 a.release();assert.ok(C.extractorCount(s,'depot')>0);assert.equal(s.unlocks.logistics,false);
});

test('only an owned depot satisfies collection and Logistics progression',()=>{
 const s=C.createState(12345);s.logisticsModel=C.DEPOT_MODEL;
 s.extractors=[building('depot',0,0,0,'other')];
 assert.equal(C.hasDepot(s),false);assert.equal(C.upgradeLevel(s,'logistics'),0);
 const foreign=C.advanceGoals(s);assert.ok(!foreign.some(g=>['collect','logistics'].includes(g.id)));
 s.extractors.push(building('depot',1,0));
 assert.equal(C.hasDepot(s),true);assert.equal(C.upgradeLevel(s,'logistics'),1);
 assert.ok(C.advanceGoals(s).some(g=>g.id==='logistics'));
});
