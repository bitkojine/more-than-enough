import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import {describeLook,describeWorld} from '../../src/game/tooltips.js';
test('inspection rejects hidden cells without generating chunks or exposing buildings',()=>{
 const s=C.createState(72631),before=s.world.chunks.size;
 assert.equal(describeWorld(s,90000,90000,-8),null);assert.equal(s.world.chunks.size,before);
});
test('inspection shares localized catalog identities and reads physical facilities without changing progress',()=>{
 const s=C.createState(72631),x=Math.floor(s.player.x),y=Math.floor(s.player.y),z=s.player.z;
 assert.ok(C.isExplored(s.world,x,y,z));
 const before=C.serialize(s);
 assert.equal(describeWorld(s,x,y,z).name,C.TILE_NAME[C.tileAt(s.world,x,y,z)]);
 assert.equal(C.serialize(s),before);
 for(const r of C.RESOURCES){const info=describeLook(C.resourceLook(r));assert.equal(info.name,C.RESOURCE_LABEL[r]);assert.ok(info.description.length>30);}
 assert.equal(describeLook('missing'),null);
});
