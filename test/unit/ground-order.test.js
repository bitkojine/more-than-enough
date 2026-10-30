import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import {drawTerrain,drawStand,onGround,sceneryVisible} from '../../src/game/render/terrain.js';

function fixture(){
 const s=C.createState(91385);s.world.holes.clear();s.world.props.clear();
 for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){C.markExplored(s.world,x,y,-1);C.tileAt(s.world,x,y,-1);}
 for(const chunk of s.world.chunks.values())chunk.type.fill(C.T.TUNNEL);
 return s;
}
function camera(ctx){return {ctx,z:-1,width:400,height:400,tilePx:64,depthPx:60,risePx:24,project:(x,y,h=-1)=>({x:180+x*64,y:180+y*60-(h+1)*24}),visibleTiles:()=>({x0:0,y0:0,x1:1,y1:1})};}

test('all floor pixels precede standing objects, including across row boundaries',()=>{
 const events=[],ctx={fillRect(){events.push('floor');}},cam=camera(ctx),s=fixture();
 drawTerrain(ctx,cam,s,{color:()=> '#407040',pick:()=>null},{built:new Set(),yard:{piles:new Map(),covered:new Set()},shake:()=>0},y=>events.push('object'+y));
 assert.ok(events.includes('floor'));assert.ok(events.includes('object0'));
 assert.ok(events.lastIndexOf('floor')<events.indexOf('object0'));
});

test('flat floors do not create clipping state; raised terrain restores it if drawing throws',()=>{
 let saves=0,restores=0,clips=0;
 const ctx={save(){saves++;},restore(){restores++;},beginPath(){},rect(){},clip(){clips++;}},cam=camera(ctx),s=fixture();
 assert.equal(onGround(ctx,cam,s,.5,.98,()=>42),42);
 assert.equal(saves,0,'equal-height floors do not mask overhanging feet');
 C.tileAt(s.world,0,1,-1);s.world.hotChunk.type[C.chunkIndex(0,1)]=C.T.SOIL;
 const failure=new Error('broken drawing');
 assert.throws(()=>onGround(ctx,cam,s,.5,.98,()=>{throw failure;}),e=>e===failure);
 assert.equal(saves,1);assert.equal(restores,1);assert.ok(clips>0,'foreground wall still masks the drawing');
});


test('scenery culling keeps overhangs, shadows and antialiasing at every edge',()=>{
 const cam={width:100,height:100,tilePx:20,depthPx:10},pic={units:1,aspect:2};
 assert.equal(sceneryVisible(cam,pic,50,150,20),false);
 assert.equal(sceneryVisible(cam,pic,50,140,20),true,'tall art reaches above its offscreen foot');
 assert.equal(sceneryVisible(cam,pic,-12,50,20),true,'antialiasing margin at left edge');
 assert.equal(sceneryVisible(cam,pic,-13,50,20),false);
 assert.equal(sceneryVisible(cam,pic,113,50,20),false);
 assert.equal(sceneryVisible(cam,pic,113,50,20,15),true,'wide shadow enters from right');
 assert.equal(sceneryVisible(cam,pic,50,-4,20),false);
 assert.equal(sceneryVisible(cam,pic,50,-4,20,15),true,'shadow below an offscreen foot remains');
 assert.equal(sceneryVisible(cam,pic,50,143,20),false);
});


test('offscreen scenery skips drawing but a visible mushroom overhang keeps its row',()=>{
 const s=C.createState(33),z=0,x=0,y=0;
 C.tileAt(s.world,x,y,z);s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.FOREST;
 s.world.hotChunk.rich[C.chunkIndex(x,y)]=30;C.markExplored(s.world,x,y,z);
 let px=-100,draws=0;
 const cam={z,width:100,height:100,tilePx:20,depthPx:20,risePx:0,project:()=>({x:px-10,y:38})};
 const ctx={beginPath(){},ellipse(){},fill(){}},ground={built:new Set(),yard:{piles:new Map(),covered:new Set()},shake:()=>0,clip:true};
 const look={pick:(id,slot)=>({units:slot==='image'?4:1,aspect:1}),stand(){draws++;}};
 assert.equal(drawStand(ctx,cam,s,look,ground,x,y,z),false);
 assert.equal(draws,0,'wholly invisible art never reaches drawing');
 px=-30;
 assert.equal(drawStand(ctx,cam,s,look,ground,x,y,z),true);
 assert.equal(draws,2,'a mushroom extending past its invisible tree remains visible');
});
