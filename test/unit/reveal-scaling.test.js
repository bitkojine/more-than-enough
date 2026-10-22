import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
function reference(s, radius) {
  const p=s.player, r=Math.ceil(radius);
  for(let y=Math.floor(p.y)-r;y<=Math.floor(p.y)+r;y++) for(let x=Math.floor(p.x)-r;x<=Math.floor(p.x)+r;x++) {
    if(C.tileDist2(p,x,y,p.z)>radius*radius)continue;
    C.markExplored(s.world,x,y,p.z);
    if(p.z===0){const t=C.tileAt(s.world,x,y,0);if(t===C.T.ORE)s.discovered.ore=true;if(t===C.T.CRYSTAL)s.discovered.crystal=true;}
  }
}
function equal(a,b) {
  assert.deepEqual([...a.world.explored], [...b.world.explored]);
  assert.deepEqual(a.discovered,b.discovered);
  assert.equal(a.world.revealed,b.world.revealed);
}
test('edge-only reveal matches full circles through motion, resizing, layer changes and fog replacement',()=>{
  const a=C.createState(19381), b=C.createState(19381);
  for(let i=0;i<160;i++) {
    const p={x:Math.sin(i/19)*21-0.5,y:i/7-12.5,z:i<80?0:-1};
    a.player={...p};b.player={...p};
    const radius=[0,1,1.5,3,7,12,2,5.25][Math.floor(i/10)%8];
    if(i===50||i===130){a.world.explored.clear();b.world.explored.clear();a.world.revealed=b.world.revealed=0;}
    if(i===40){a.discovered={ore:false,crystal:false};b.discovered={ore:false,crystal:false};}
    C.revealAround(a,radius);reference(b,radius);equal(a,b);
  }
});
test('small moves examine edge tiles instead of the full sight area',()=>{
  const s=C.createState(19381);s.player={x:0.5,y:0.5,z:0};
  C.revealAround(s,64);
  let tiles=0,rows=0;
  for(let i=1;i<=30;i++){
    s.player.x+=0.001;const work={};C.revealAround(s,64,work);tiles+=work.tiles||0;rows+=work.rows||0;
  }
  assert.ok(tiles<256,`${tiles} edge tiles, versus about 386,000 repeated disk visits`);
  assert.equal(rows,30*129);
  const work={};C.revealAround(s,64,work);assert.equal(work.tiles||0,0);
});
