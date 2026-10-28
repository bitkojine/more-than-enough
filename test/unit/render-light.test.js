import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import {faceRect,lightVisibility,lightObject} from '../../src/game/render/lighting.js';

test('face boundaries stay on device pixels across fractional cameras and DPRs',()=>{
 for(const scale of [1,1.5,2])for(const offset of [0,.125,.375,.75]){
  const ctx={getTransform:()=>({a:scale})};
  const a=faceRect(ctx,offset,offset,64,32),b=faceRect(ctx,64+offset,32+offset,64,32);
  assert.equal(a.x+a.width,b.x);assert.equal(a.y+a.height,b.y);
  for(const n of Object.values(a))assert.ok(Math.abs(n*scale-Math.round(n*scale))<1e-9);
 }
});

test('readability does not illuminate or discover unseen tiles',()=>{
 const s=C.createState(71),cam={z:-2};s.player={x:.5,y:.5,z:-2};
 const before=C.serialize(s);
 assert.equal(lightVisibility(cam,s,.5,.5),0);
 assert.equal(C.serialize(s),before);
 C.markExplored(s.world,0,0,-2);s.world.props.clear();s.flare=0;
 if(s.cultivation)s.cultivation.lantern=false;
 assert.ok(lightVisibility(cam,s,.5,.5)>=.35);
});

test('dark offscreen object patches allocate nothing and do not invoke their draw',()=>{
 const s=C.createState(71),cam={z:-2,tilePx:64,width:400,height:400,project:()=>({x:-10000,y:-10000})};
 let drawn=false;
 assert.equal(lightObject({},cam,s,0,0,()=>{drawn=true;}),null);
 assert.equal(drawn,false);
});
