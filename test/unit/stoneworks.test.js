import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';

const building = (key,x,y,z=0,owner) => ({key,res:C.EXTRACTORS[key].res,x,y,z,buffer:0,...(owner?{owner}:{})});
function fixture() {
  const s=C.createState(12345);
  s.unlocks.logistics=true;
  s.extractors=[building('quarry',0,0),building('stoneworks',2,0)];
  return s;
}
test('Stoneworks is a physical support, not an extra producer or blueprint',()=>{
 const s=fixture(),q=s.extractors[0],base=C.extractorRate(s,'quarry');
 assert.equal(C.extractorRate(s,'stoneworks'),0);
 assert.equal(C.extractorRate(s,'quarry',q),2*base);
 assert.equal(C.extractorCapacity(s,'quarry',q),2*C.extractorCapacity(s,'quarry'));
 assert.ok(C.SUPPORT_BUILDINGS.includes('stoneworks'));assert.ok(!C.CONVERTERS.includes('stoneworks'));
 assert.ok(!C.UPGRADES.stoneworks);
 s.extractors.push(building('stoneworks',0,1));
 assert.equal(C.extractorRate(s,'quarry',q),2*base,'overlap does not stack');
 assert.equal(C.supportGain(s,{x:0,y:2}),0,'already supported output is not sold twice');
 assert.equal(C.productionRates(s).stone,2*base);
 assert.equal(C.incomeStatement(s).stone.rate,2*base);
});
test('support uses Euclidean distance, the same layer and the same owner',()=>{
 const s=fixture();s.extractors.push(building('quarry',2,2),building('quarry',0,0,-1),building('quarry',1,0,0,'other'),building('mine',1,1));
 assert.equal(C.supportTargets(s,s.extractors[1]).length,2,'two quarries are exactly on radius 2');
 s.extractors=[building('quarry',0,0),building('stoneworks',2,1)];
 assert.equal(C.supportMult(s,s.extractors[0]),1,'diagonal beyond radius is excluded');
 s.extractors=[building('quarry',0,0),building('stoneworks',1,0,0,'other')];
 assert.equal(C.supportMult(s,s.extractors[0]),1,'another player cannot alter this economy');
});
test('scalar ticks and batched event-time production agree, then survive a save',()=>{
 const a=fixture(),b=C.deserialize(C.serialize(a));
 const economy=C.startEventEconomy(b);
 for(let i=0;i<600;i++)C.step(a,1/60,{visualEvents:false});
 economy.advanceTicks(600);economy.settle();
 assert.equal(a.inv.stone,b.inv.stone);assert.equal(b.inv.stone,6);
 const saved=C.serialize(b),loaded=C.deserialize(saved);
 assert.equal(C.serialize(loaded),saved);
 assert.equal(C.productionRates(loaded).stone,C.productionRates(b).stone);
 assert.equal(loaded.extractors[1].key,'stoneworks');
});
test('a legal placement settles old output before starting the new support rate',()=>{
 const s=fixture();s.extractors.pop();s.extractors[0].x=Math.floor(s.player.x);s.extractors[0].y=Math.floor(s.player.y);C.revealAround(s);
 const at=C.buildTarget(s,'stoneworks');assert.ok(at);assert.ok(C.supportGain(s,at)>0);
 Object.assign(s.inv,C.extractorCost(s,'stoneworks'));
 const economy=C.startEventEconomy(s);economy.advanceTicks(600);
 assert.equal(C.place(s,'stoneworks',at).ok,true);
 assert.equal(s.sources.stone.buildings,3,'first ten seconds used the unboosted quarry');
 economy.advanceTicks(600);economy.settle();
 assert.equal(s.sources.stone.buildings,10,'next ten seconds used boosted output and retained the fractional buffer');
 assert.equal(C.extractorCount(s,'stoneworks'),1);
 assert.equal(C.place(s,'stoneworks',at).ok,false,'normal occupancy rules apply');
});
test('forty-hour production observations do not revisit or search the layout',()=>{
 const s=fixture(),economy=C.startEventEconomy(s);
 const visits=economy.work.buildingVisits;
 for(let i=0;i<100;i++){economy.advanceTicks(86400);C.productionRates(s);economy.settle();}
 assert.equal(economy.work.buildingVisits,visits);
 assert.equal(s.inv.stone,Math.floor(.68*144000));
});

test('investment and UI quotes include existing workshop service at a new quarry site',()=>{
 const s=fixture();
 assert.equal(C.placementGain(s,'quarry',{x:2,y:1}),.68);
 assert.equal(C.placementGain(s,'quarry',{x:20,y:20}),.34);
 assert.equal(C.placementGain(s,'quarry',{x:2,y:1,z:-1}),.34);
 assert.equal(C.placementGain(s,'stoneworks',{x:0,y:1}),0,'no marginal gain from overlapping service');
 s.extractors.pop();s.extractors[0].x=Math.floor(s.player.x);s.extractors[0].y=Math.floor(s.player.y);
 C.revealAround(s);
 const quote=C.bestBuys(s).find(b=>b.id==='stoneworks');
 assert.ok(quote);assert.equal(quote.gain.stone,.34);assert.ok(Number.isFinite(quote.payback));
});
