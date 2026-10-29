import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
const cmd=(s,type,kind,x,y)=>C.cultivationCommand(s,{type,kind,x,y});
// The crystal clock alone, so a test can choose the time of day.
function run(s,secs){for(let i=0;i<Math.round(secs*4);i++)C.stepCultivation(s,.25);}
// Stands you at the hiding place with its ground seen and a carrier made.
function atHidingPlace(seed=7){
 const s=C.createState(seed,{cultivation:true}),h=C.hidingPlace(s.world.seed);
 for(let y=h.y-3;y<=h.y+3;y++)for(let x=h.x-3;x<=h.x+3;x++)C.markExplored(s.world,x,y,0);
 for(const r of C.RESOURCES)C.earn(s,r,300,'hand');s.player={x:h.x+.5,y:h.y+1.5,z:0};return {s,h};
}

test('the hiding place is open grass far from home, fixed by the seed',()=>{
 for(const seed of [1,7,99,12345,4000000000]){
  const a=C.hidingPlace(seed),b=C.hidingPlace(seed),s=C.createState(seed,{cultivation:true});
  assert.deepEqual(a,b);const d=Math.hypot(a.x,a.y);assert.ok(d>C.HEART_DISTANCE-80&&d<C.HEART_DISTANCE+80,`${seed}: ${d} m`);
  assert.equal(C.tileAt(s.world,a.x,a.y,0),C.T.GRASS);
 }
});

test('new worlds start with the heart at the hiding place; older saves keep their progress',()=>{
 const s=C.createState(7,{cultivation:true});assert.deepEqual(s.cultivation.heart,{where:'station',health:100});
 const old=JSON.parse(JSON.stringify(s.cultivation));delete old.heart;C.recoverCultivationRounding(old);assert.equal(old.heart.where,'station');
 const done=JSON.parse(JSON.stringify(s.cultivation));delete done.heart;done.facilities.push({kind:'machine',sections:2,id:done.nextId++,x:0,y:0,z:-2,temperature:18,health:100,quality:100,buffer:0});
 C.recoverCultivationRounding(done);assert.equal(done.heart.where,'installed','a machine past its second section already has its heart');assert.ok(C.validCultivation(done));
 const bad=JSON.parse(JSON.stringify(s.cultivation));bad.heart={where:'pocket',health:50};assert.equal(C.validCultivation(bad),false);
 bad.heart={where:'carried',health:120};assert.equal(C.validCultivation(bad),false);
});

test('taking the heart needs a sealed carrier, which protects it from sunlight',()=>{
 const {s,h}=atHidingPlace();
 assert.equal(cmd(s,'heart',null,h.x,h.y),'equipment');assert.equal(cmd(s,'craft','carrier'),'ok');
 assert.equal(cmd(s,'heart',null,h.x,h.y),'lifted');assert.equal(s.cultivation.heart.where,'carried');assert.equal(cmd(s,'heart',null,h.x,h.y),'gone');
 s.time=0;run(s,10);assert.equal(s.cultivation.heart.health,100,'the sealed carrier blocks sunlight');
 s.cultivation.gear.carrier=false;run(s,10);const noon=100-s.cultivation.heart.health;assert.ok(Math.abs(noon-C.HEART_SUN*10)<.05,'unprotected full sun: '+noon);
 s.time=C.DAY_LENGTH/2;const before=s.cultivation.heart.health;run(s,10);assert.equal(s.cultivation.heart.health,before,'nothing at night');
 assert.ok(C.deserialize(C.serialize(s)).cultivation.heart.where==='carried');
});

test('a shelter keeps the heart safe and mends it; a heart cracked through returns to the hiding place',()=>{
 const {s,h}=atHidingPlace();cmd(s,'craft','carrier');cmd(s,'heart',null,h.x,h.y);
 const at={x:h.x+1,y:h.y+1};assert.equal(cmd(s,'build','shelter',h.x,h.y),'occupied');assert.equal(cmd(s,'build','shelter',at.x,at.y),'ok');
 const shelter=C.cultivationAt(s,at.x,at.y,0);assert.equal(shelter.kind,'shelter');
 s.cultivation.heart.health=60;s.time=0;assert.equal(cmd(s,'heart',null,at.x,at.y),'ok');assert.equal(s.cultivation.heart.where,shelter.id);
 run(s,20);assert.ok(Math.abs(s.cultivation.heart.health-(60+C.HEART_MEND*20))<.05,'mends in the shelter, even at noon');
 assert.ok(C.deserialize(C.serialize(s)),'a resting heart saves');
 assert.equal(cmd(s,'heart',null,at.x,at.y),'lifted');s.cultivation.heart.health=.5;s.cultivation.gear.carrier=false;run(s,10);
 assert.deepEqual(s.cultivation.heart,{where:'station',health:100});assert.equal(s.cultivation.heartLost,1);
});

test('the second machine section seats the heart',()=>{
 const s=C.createState(7,{cultivation:true});s.tools.pickaxe=3;for(const r of C.RESOURCES)C.earn(s,r,300,'hand');
 for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++){const t=C.tileAt(s.world,x,y,-2);if(!C.TILE_INFO[t].rise&&!C.TILE_INFO[t].descend){C.setRichness(s.world,x,y,-2,0);C.markExplored(s.world,x,y,-2);}}
 s.player={x:.5,y:.5,z:-2};C.step(s,.25,{visualEvents:false});const b=s.cultivation.facilities.find(b=>b.kind==='machine');
 s.player={x:b.x+.5,y:b.y+1.5,z:-2};assert.equal(cmd(s,'build','cooler',b.x,b.y+1),'ok');s.player={x:b.x+.5,y:b.y+.5,z:-2};
 assert.equal(cmd(s,'repair',null,b.x,b.y),'discovery');assert.equal(C.machineClue(s),1);
 assert.equal(cmd(s,'repair',null,b.x,b.y),'heart');C.advanceGoals(s);assert.ok(s.goalsDone.includes('cultivationRepair'));assert.ok(!s.goalsDone.includes('cultivationHeart'));
 s.cultivation.heart={where:'carried',health:80};assert.equal(cmd(s,'repair',null,b.x,b.y),'discovery');
 assert.equal(s.cultivation.heart.where,'installed');assert.equal(b.sections,2);C.advanceGoals(s);assert.ok(s.goalsDone.includes('cultivationHeart'));
});
