import {test}from'node:test';import assert from'node:assert/strict';
import {legTarget,rigPose,LEG_LENGTH}from'../../src/game/render/rig-motion.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('rig walk closes continuously at contact and toe-off, including foot rotation',()=>{
 for(const phase of [0,.5,1]){
  const before=legTarget(phase-1e-9),after=legTarget(phase+1e-9);
  for(const k of ['y','z','pitch'])close(before[k],after[k]);
 }
});
test('IK keeps both bones their authored length across the complete gait',()=>{
 for(const blend of [0,.2,.5,1])for(let i=0;i<=1000;i++){
  const p=rigPose({phase:i/1000,walking:true,blend});
  for(const leg of [p.left,p.right]){
   close(Math.hypot(leg.knee.y-p.hipY,leg.knee.z),LEG_LENGTH);
   close(Math.hypot(leg.foot.y-leg.knee.y,leg.foot.z-leg.knee.z),LEG_LENGTH);
   const pitch=leg.foot.pitch,minY=leg.foot.y-.086*Math.cos(pitch)-Math.max(.211*Math.sin(pitch),-.109*Math.sin(pitch));
   assert.ok(minY>=-1e-7,'shoe sole must not penetrate the ground');
  }
 }
});
test('opposite legs exchange contact and passing roles without changing proportions',()=>{
 for(let i=0;i<100;i++){
  const a=rigPose({phase:i/100,walking:true}),b=rigPose({phase:i/100+.5,walking:true});
  close(a.left.foot.y,b.right.foot.y);close(a.left.foot.z,b.right.foot.z);
  close(a.leftArm,b.rightArm);
 }
 const p=rigPose({phase:.25,walking:true});assert.ok(p.right.foot.y>p.left.foot.y+.05);
});
test('idle plants both feet and never depends on simulation or display clocks',()=>{
 const a=rigPose({phase:0}),b=rigPose({phase:.7});assert.deepEqual(a,b);
 close(a.left.foot.y,.09);close(a.right.foot.y,.09);close(a.left.foot.z,0);close(a.right.foot.z,0);
});
