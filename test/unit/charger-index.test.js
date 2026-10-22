import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
function reference(s,time){
 const p=s.player;if(p.z!==0)return null;
 const r=Math.ceil(C.CHARGE_RANGE),px=Math.floor(p.x),py=Math.floor(p.y);
 let best=null,distance=C.CHARGE_RANGE**2;
 for(let y=py-r;y<=py+r;y++)for(let x=px-r;x<=px+r;x++){
  const kind=s.world.props.get(C.packKey(x,y,0));if(!kind||!C.charging(kind,time))continue;
  const d=(x+.5-p.x)**2+(y+.5-p.y)**2;if(d<=distance){distance=d;best={x,y,kind};}
 }return best;
}
test('charger candidates preserve range, ties, daylight and all Map mutation cases',()=>{
 const s=C.createState(19381);s.player={x:.5,y:.5,z:0};
 const props=s.world.props;
 props.set(C.packKey(-1,0,0),'solar');props.set(C.packKey(1,0,0),'wheel');
 for(let i=0;i<150;i++){
  s.player.x=(i%20)/10-.5;s.player.y=Math.floor(i/20)/10-.5;
  const time=i*C.DAY_LENGTH/37;
  if(i===15)props.set(C.packKey(1,0,0),'solar');
  if(i===30)props.delete(C.packKey(-1,0,0));
  if(i===50)props.clear();
  if(i===51)props.set(C.packKey(0,0,0),'wheel');
  if(i===75)s.world.props=new Map(props);
  if(i===80)s.world.props.set(C.packKey(0,0,0),'solar');
  assert.deepEqual(C.chargerNear(s,time),reference(s,time));
 }
});
test('stationary battery observations do not repeatedly search the charger neighborhood',()=>{
 const s=C.createState(19381);s.player={x:.5,y:.5,z:0};
 s.world.props.set(C.packKey(100,100,0),'solar');
 const cold={};C.chargerNear(s,0,cold);assert.ok(cold.lookups>0);
 const warm={};for(let i=0;i<1000;i++)C.chargerNear(s,i,warm);
 assert.equal(warm.lookups||0,0);assert.equal(warm.candidates||0,0);
});
