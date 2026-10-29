import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import {unlockOptional} from './helpers.js';
const cmd=(s,type,kind,x,y)=>C.cultivationCommand(s,{type,kind,x,y});
function openSite(s,z=-2){for(let y=-8;y<=8;y++)for(let x=-8;x<=8;x++){const t=C.tileAt(s.world,x,y,z);if(!C.TILE_INFO[t].rise&&!C.TILE_INFO[t].descend){C.setRichness(s.world,x,y,z,0);C.markExplored(s.world,x,y,z);}}s.player={x:.5,y:.5,z};}
function fixture(){const s=C.createState(7,{cultivation:true});s.tools.pickaxe=3;for(const r of C.RESOURCES)C.earn(s,r,300,'hand');openSite(s);return s;}
function build(s,kind,x=0,y=0){s.player.x=x+.5;s.player.y=y+.5;assert.equal(cmd(s,'build',kind,x,y),'ok');return C.cultivationAt(s,x,y);}
function run(s,secs){for(let i=0;i<Math.round(secs*4);i++)C.step(s,.25,{visualEvents:false});}
test('main-rule terrain retains the existing endless generator but locates resources by depth',()=>{
 const s=C.createState(1,{cultivation:true});assert.ok(s.emptyStart);assert.equal(s.inv.ore,0);assert.equal(s.tools.pickaxe,0);
 for(let y=-40;y<=40;y+=2)for(let x=-40;x<=40;x+=2){assert.ok(![C.T.ORE,C.T.CRYSTAL].includes(C.tileAt(s.world,x,y,0)));assert.ok(![C.T.CRYSTAL_SEAM,C.T.GEODE].includes(C.tileAt(s.world,x,y,-1)));}
 const old=C.createState(1);assert.equal(old.world.cultivation,false);assert.equal(C.deserialize(C.serialize(old)).cultivation,undefined);
});
test('surface materials bootstrap existing crafted picks without metal or a new map',()=>{
 const s=C.createState(7,{cultivation:true});C.earn(s,'mycelium',8,'hand');C.earn(s,'stone',5,'hand');assert.ok(C.buy(s,'pickaxe').ok);assert.equal(s.tools.pickaxe,2);assert.equal(s.inv.ore,0);assert.equal(C.canBuy(s,'overclock'),false);
});
test('chambers protect from light automatically; heat injuries still need tending',()=>{
 const s=fixture(),b=build(s,'chamber');build(s,'cooler',0,2);s.player.x=.5;s.player.y=.5;s.cultivation.starter={health:100};
 assert.equal(cmd(s,'plant',null,0,0),'ok');run(s,10);assert.ok(b.buffer>2.9);assert.equal(b.health,100);
 assert.equal(cmd(s,'craft','lantern',0,0),'ok');cmd(s,'lantern',null,0,0);run(s,2);assert.ok(C.cultivationLight(s,b));assert.equal(b.health,100);assert.ok(!b.needsTend);
 b.temperature=30;run(s,1);assert.ok(b.health<100);assert.ok(b.needsTend);run(s,12);const health=b.health;run(s,2);assert.equal(b.health,health);
 assert.equal(cmd(s,'tend',null,0,0),'ok','protected tending works with a nearby lantern');run(s,4);assert.ok(b.health>health);
});
test('heat kills colonies and degraded harvested crystal still reinforces physical storage',()=>{
 const s=fixture(),b=build(s,'chamber');s.cultivation.starter={health:100};cmd(s,'plant',null,0,0);run(s,30);assert.equal(b.health,0);
 s.cultivation.quality=10;assert.equal(cmd(s,'reinforce',null,0,0),'locked');unlockOptional(s);assert.equal(cmd(s,'reinforce',null,0,0),'ok');assert.ok(b.reinforced);
});
test('wild colonies renew after taking a starter; sealed handling protects carried material',()=>{
 const s=fixture();let found;
 for(let y=20;y<100&&!found;y++)for(let x=20;x<100&&!found;x++)if(C.tileAt(s.world,x,y,-2)===C.T.GEODE)found={x,y};
 assert.ok(found);C.setRichness(s.world,found.x+1,found.y,-2,0);s.player={x:found.x+1.5,y:found.y+.5,z:-2};C.markExplored(s.world,found.x,found.y,-2);
 assert.equal(C.takeStarter(s,found.x,found.y),'ok');s.cultivation.starter=null;assert.equal(C.takeStarter(s,found.x,found.y),'regrow');run(s,46);assert.equal(C.takeStarter(s,found.x,found.y),'ok');
 assert.equal(cmd(s,'craft','carrier',found.x,found.y),'ok');cmd(s,'craft','lantern',found.x,found.y);cmd(s,'lantern',null,found.x,found.y);const q=s.cultivation.quality;run(s,2);assert.equal(s.cultivation.starter.health,100);assert.equal(s.cultivation.quality,q);
});
test('sealed transfer preserves actual output; saves retain routes, quality, injury without shutter state',()=>{
 const s=unlockOptional(fixture()),room=build(s,'chamber',0,0),vault=build(s,'vault',2,0);build(s,'conduit',1,0);room.buffer=10;run(s,5);assert.ok(vault.buffer>3);assert.ok(Math.abs(room.buffer+vault.buffer-10)<1e-8);
 s.cultivation.quality=31;room.needsTend=true;const raw=C.serialize(s),loaded=C.deserialize(raw);assert.ok(loaded);assert.deepEqual(loaded.cultivation,s.cultivation);assert.equal(loaded.world.cultivation,true);
});
test('one original-world cultivation loop reaches the first machine section through canonical commands',()=>{
 // Deliberately funded integration layout, not a fresh AUTO-win claim.
 const s=fixture(),room=build(s,'chamber',0,0);build(s,'cooler',0,2);s.player={x:.5,y:.5,z:-2};s.cultivation.starter={health:100};cmd(s,'plant',null,0,0);s.inv.crystal=0;run(s,21);assert.equal(cmd(s,'collect',null,0,0),'ok');assert.ok(s.inv.crystal>=6);
 const machine=s.cultivation.facilities.find(b=>b.kind==='machine');assert.ok(machine);build(s,'cooler',machine.x,machine.y+1);s.player={x:machine.x+.5,y:machine.y+.5,z:-2};assert.equal(cmd(s,'repair',null,machine.x,machine.y),'discovery');assert.ok(s.cultivation.restored);assert.ok(C.deserialize(C.serialize(s)).cultivation.restored);
});
test('crystal commands cannot reach through fog, build above ground or bypass quality',()=>{
 const s=C.createState(9,{cultivation:true});assert.equal(cmd(s,'build','chamber',999,999),'unseen');assert.equal(cmd(s,'build','chamber',Math.floor(s.player.x),Math.floor(s.player.y)),'deep');assert.equal(C.cultivationCommand(s,{type:'repair',x:NaN,y:0}),'unseen');
});

test('the indexed economy preserves crystal recipe payments across ticks and reload',()=>{
 const s=fixture();C.step(s,1/60,{visualEvents:false});const before=s.inv.ore;
 assert.equal(cmd(s,'craft','carrier',0,0),'ok');assert.equal(s.inv.ore,before-12);run(s,1);assert.equal(s.inv.ore,before-12);assert.equal(C.deserialize(C.serialize(s)).inv.ore,before-12);
});

test('facilities protect stock but unprotected collected cargo still suffers light damage',()=>{
 const s=unlockOptional(fixture()),b=build(s,'chamber');build(s,'cooler',0,2);const vault=build(s,'vault',2,0);s.player={x:.5,y:.5,z:-2};
 b.health=100;b.buffer=8;s.inv.crystal=0;s.cultivation.quality=100;cmd(s,'craft','lantern',0,0);cmd(s,'lantern',null,0,0);
 assert.equal(cmd(s,'collect',null,0,0),'ok','no carrier or opening requirement');assert.equal(s.inv.crystal,8);run(s,1);assert.ok(s.cultivation.quality<100);assert.equal(b.health,100);
 s.player.x=2.5;assert.equal(cmd(s,'store',null,2,0),'ok');assert.equal(vault.buffer,8);const q=vault.quality;run(s,1);assert.equal(vault.quality,q,'stored stock is protected from light');
 assert.equal(cmd(s,'collect',null,2,0),'ok');assert.equal(vault.buffer,0);
});

test('old open and closed facilities load without shutter state or loss of progress',()=>{
 for(const closed of [false,true])for(const kind of ['chamber','vault','machine']){
  const s=fixture(),b=build(s,'chamber');b.kind=kind;b.closed=closed;b.health=82;b.buffer=12;b.quality=76;b.needsTend=true;
  if(kind==='machine'){b.sections=3;s.cultivation.restored=true;s.cultivation.completed=true;s.cultivation.heart={where:'installed',health:91};}
  const loaded=C.deserialize(C.serialize(s));assert.ok(loaded);const room=C.cultivationAt(loaded,b.x,b.y,b.z);
  assert.ok(!Object.hasOwn(room,'closed'));assert.equal(room.health,82);assert.equal(room.buffer,12);assert.equal(room.quality,76);assert.equal(room.needsTend,true);assert.deepEqual(loaded.inv,s.inv);
  if(kind==='machine'){assert.ok(C.canEmbark(loaded));assert.equal(room.sections,3);assert.deepEqual(loaded.cultivation.heart,s.cultivation.heart);}
  assert.ok(['invalid','locked'].includes(cmd(loaded,'shutter',null,b.x,b.y)),'retired commands cannot change a building');
 }
});

test('covering a placed light is a physical paid hood, then toggles without another charge',()=>{
 const s=unlockOptional(fixture()),at=C.packKey(0,0,-2);s.world.props.set(at,'glowcap');assert.ok(C.cultivationLight(s,{x:0,y:0,z:-2}));const before=s.inv.mycelium;
 assert.equal(cmd(s,'shade',null,0,0),'ok');assert.equal(s.inv.mycelium,before-1);assert.equal(C.cultivationLight(s,{x:0,y:0,z:-2}),false);cmd(s,'shade',null,0,0);assert.ok(C.cultivationLight(s,{x:0,y:0,z:-2}));assert.equal(s.inv.mycelium,before-1);
});
test('environmental state is independent of browser-style observation cadence',()=>{
 const a=fixture();const room=build(a,'chamber');build(a,'cooler',0,2);room.health=80;room.needsTend=false;
 const b=C.deserialize(C.serialize(a));for(let i=0;i<600;i++)C.step(a,.1,{visualEvents:false});for(let i=0;i<3600;i++)C.step(b,1/60,{visualEvents:false});
 assert.equal(a.cultivation.clock,b.cultivation.clock);assert.deepEqual(a.cultivation.facilities,b.cultivation.facilities);
});

test('repeated sealed transfers preserve bounded quality and readable saves',()=>{
 const s=unlockOptional(fixture()),room=build(s,'chamber'),vault=build(s,'vault',2,0);build(s,'conduit',1,0);build(s,'cooler',0,2);
 room.health=100;room.needsTend=false;cmd(s,'craft','carrier');
 for(let i=0;i<1000;i++){C.step(s,.25,{visualEvents:false});if(vault.buffer>=1){s.player.x=2.5;s.player.y=.5;assert.equal(cmd(s,'collect',null,2,0),'ok');}assert.ok(s.cultivation.quality<=100);}
 assert.ok(C.deserialize(C.serialize(s)));
 const old=JSON.parse(C.serialize(s));old.cultivation.quality=100.00000000000024;old.cultivation.facilities[0].quality=100.00000000000024;
 assert.equal(C.deserialize(JSON.stringify(old)).cultivation.quality,100);
 old.cultivation.quality=100.01;assert.equal(C.deserialize(JSON.stringify(old)).cultivation.quality,100,"out of range is mended, not refused");
});

test('machine activation requires all physical repairs, cooling and viable crystal',()=>{
 const s=fixture();C.step(s,.25,{visualEvents:false});const b=s.cultivation.facilities.find(b=>b.kind==='machine');assert.ok(b);
 s.player={x:b.x+.5,y:b.y+.5,z:b.z};const at={x:b.x,y:b.y};
 assert.equal(C.cultivationCommand(s,{type:'activate',...at}),'sections');
 build(s,'cooler',b.x,b.y+1);s.player={x:b.x+.5,y:b.y+.5,z:b.z};
 for(const [i,recipe] of C.MACHINE_REPAIRS.entries()){
  if(i===1){assert.equal(cmd(s,'repair',null,b.x,b.y),'heart','the second section needs the stolen heart');s.cultivation.heart={where:'carried',health:C.HEART_MIN-1};assert.equal(cmd(s,'repair',null,b.x,b.y),'cracked');s.cultivation.heart.health=90;}
  const before={...s.inv};assert.equal(cmd(s,'repair',null,b.x,b.y),'discovery');for(const [r,n]of Object.entries(recipe))assert.equal(s.inv[r],before[r]-n);assert.equal(C.canEmbark(s),false);}
 b.quality=10;assert.equal(cmd(s,'activate',null,b.x,b.y),'quality');b.quality=100;b.temperature=30;assert.equal(cmd(s,'activate',null,b.x,b.y),'cooling');b.temperature=18;
 assert.equal(cmd(s,'activate',null,b.x,b.y),'activated');assert.ok(C.canEmbark(s));C.advanceGoals(s);assert.ok(s.goalsDone.includes('master'));
 const loaded=C.deserialize(C.serialize(s));assert.ok(C.canEmbark(loaded));assert.equal(loaded.cultivation.completedAt,s.cultivation.completedAt);
 b.health=0;assert.ok(C.canEmbark(s),'completion is a permanent record even if infrastructure later fails');
 const next=C.embark(loaded,1234);assert.ok(next.ok);assert.ok(next.state.cultivation);assert.equal(C.canEmbark(next.state),false);assert.ok(Object.values(next.state.inv).every(n=>n===0));assert.ok(Object.values(next.state.tools).every(n=>n===0));
});

test('earlier first-section saves retain their repair, and damaged final sections can be rebuilt',()=>{
 const s=fixture();C.step(s,.25,{visualEvents:false});const b=s.cultivation.facilities.find(b=>b.kind==='machine');s.cultivation.restored=true;b.health=100;delete b.sections;s.goalsDone=['master'];
 const loaded=C.deserialize(C.serialize(s)),machine=loaded.cultivation.facilities.find(b=>b.kind==='machine');assert.equal(machine.sections,1);assert.equal(C.canEmbark(loaded),false);assert.ok(!loaded.goalsDone.includes('master'));assert.ok(loaded.goalsDone.includes('cultivationRepair'));
 b.sections=3;b.health=0;build(s,'cooler',b.x,b.y+1);s.player={x:b.x+.5,y:b.y+.5,z:b.z};assert.equal(cmd(s,'repair',null,b.x,b.y),'discovery');assert.equal(b.sections,3);assert.equal(b.health,100);assert.ok(C.deserialize(C.serialize(s)));
});
