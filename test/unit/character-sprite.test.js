import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterSprite} from '../../src/game/render/character-sprite.js';
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
test('mining uses authored grips and custom characters retain their own silhouette',()=>{
 assert.equal(choose({equipment:gear,actor:{act:'swing',t:.01}}).actionFrame,0);
 assert.equal(choose({equipment:gear,actor:{act:'swing',t:.2}}).actionFrame,1);
 const custom={overrides:id=>id==='character.wanderer'};
 assert.deepEqual(choose({look:custom,equipment:gear}),{id:'character.wanderer',composed:false});
 assert.equal(choose({device:'phone'}).id,'character.legacyWanderer');
});
