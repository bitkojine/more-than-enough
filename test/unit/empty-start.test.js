import {test} from 'node:test';
import assert from 'node:assert/strict';
import {C,findNear,standOn,master} from './helpers.js';
import {createAutoplaySession} from '../../src/game/autoplay-session.js';
import {cleanPos} from '../../src/net/protocol.js';

test('new worlds have no owned tools and can bootstrap a real pick from surface materials',()=>{
 const s=C.createState(12345);
 assert.deepEqual(s.tools,{basket:0,pickaxe:0,boots:0,overclock:0});
 assert.equal(C.buy(s,'pickaxe').ok,false);
 for(const [res,amount] of Object.entries(C.upgradeCost(s,'pickaxe'))){
  while(s.inv[res]<amount){
   const p=findNear(s,(st,x,y)=>C.TILE_INFO[C.tileAt(st.world,x,y,0)].res===res&&C.canHarvest({...st,player:{x:x+.5,y:y+.5,z:0}},x,y));
   assert.ok(p,'a hand-gatherable material exists');standOn(s,p);assert.ok(C.harvestAt(s,p.x,p.y));
  }
 }
 assert.equal(C.buy(s,'pickaxe').ok,true);assert.equal(s.tools.pickaxe,2);
 const ore=findNear(s,(st,x,y)=>C.tileAt(st.world,x,y,0)===C.T.ORE);standOn(s,ore);
 assert.ok(C.canHarvest(s,ore.x,ore.y),'first crafted pick opens ore');
 assert.equal(s.tools.basket,0,'crafting a pick does not grant other equipment');
});

test('basket crafting improves hand gathering and both first recipes need no ore or workbench',()=>{
 const s=C.createState(777),before=C.gatherYield(s,'mycelium');
 for(const id of ['basket','pickaxe'])assert.ok(Object.keys(C.upgradeCost(s,id)).every(r=>['mycelium','stone'].includes(r)));
 Object.assign(s.inv,C.upgradeCost(s,'basket'));assert.ok(C.buy(s,'basket').ok);
 assert.ok(C.gatherYield(s,'mycelium')>before);assert.equal(s.tools.pickaxe,0);
});

test('bare hands cannot mine ore, excavate rock or receive an automatic water capability',()=>{
 const s=C.createState(12345);
 const ore=findNear(s,(st,x,y)=>C.tileAt(st.world,x,y,0)===C.T.ORE);standOn(s,ore);
 assert.equal(C.harvestAt(s,ore.x,ore.y),null);assert.equal(C.canWade(s),false);
 s.player.z=-1;const rock=findNear(s,(st,x,y)=>C.TILE_INFO[C.tileAt(st.world,x,y,-1)].solid);
 standOn(s,rock);assert.equal(C.harvestAt(s,rock.x,rock.y),null);
});

test('new empty-handed saves round trip and legacy saves keep their owned equipment',()=>{
 const s=C.createState(99),saved=C.serialize(s),r=C.deserialize(saved);
 assert.equal(C.serialize(r),saved);assert.equal(r.tools.pickaxe,0);
 const old=JSON.parse(saved);delete old.emptyStart;old.tools={basket:1,pickaxe:3,boots:1,overclock:2};
 const legacy=C.deserialize(JSON.stringify(old));assert.deepEqual(legacy.tools,old.tools);assert.equal(legacy.emptyStart,false);
 const again=C.deserialize(C.serialize(legacy));assert.deepEqual(again.tools,old.tools);
 delete old.tools;assert.equal(C.deserialize(JSON.stringify(old)).tools.basket,1,'missing old tool data retains old defaults');
});

test('every subsequent world starts with no perks, equipment, inventory or automatic logistics',()=>{
 const s=master(C.createState(777));s.insight=90;s.perks={legacy:3,memory:1,heirloom:1,cartographer:1,nomad:3};
 s.mushroomsEver=['morel'];s.stats.stone=1e12;const before=C.serialize(s);
 const next=C.embark(s,99).state;assert.equal(C.serialize(s),before,'the previous world is untouched');
 assert.ok(Object.values(next.tools).every(n=>n===0));assert.ok(Object.values(next.perks).every(n=>n===0));
 assert.ok(Object.values(next.inv).every(n=>n===0));assert.equal(next.unlocks.logistics,false);assert.equal(next.insight,0);
 assert.deepEqual(next.mushroomsEver,['morel']);assert.equal(next.totalEver,1e12);
});

test('the shipped AUTO crafts its first equipment through the canonical purchase rules',()=>{
 const a=createAutoplaySession(12345);a.press();a.advanceTicks(180*60);a.release();
 assert.ok(a.state.tools.pickaxe>=2);assert.ok(a.state.tools.basket>=2);assert.ok(a.state.stats.gathers>0);
});

test('equipment visibility bits are optional and bounded for older clients',()=>{
 const pos={x:0,y:0,z:0};assert.equal(cleanPos(pos).gear,undefined);
 assert.equal(cleanPos({...pos,gear:0}).gear,0);assert.equal(cleanPos({...pos,gear:3}).gear,3);
 assert.equal(cleanPos({...pos,gear:99}).gear,undefined);
});

test('gathering poses show only equipment actually owned by the character',async()=>{
 const {pose}=await import('../../src/game/render/motion.js');
 const empty=C.createState(12345).tools;
 assert.equal(pose({act:'swing',t:.1,idle:0},{equipment:empty}).tool,null);
 assert.equal(pose({act:'pick',t:.1,idle:0},{equipment:empty}).tool,null);
 assert.equal(pose({act:'swing',t:.1,idle:0},{equipment:{...empty,pickaxe:2}}).tool.kind,'pickaxe');
 assert.equal(pose({act:'pick',t:.1,idle:0},{equipment:{...empty,basket:2}}).tool.kind,'basket');
});
