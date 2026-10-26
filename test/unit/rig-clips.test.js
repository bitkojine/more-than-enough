// Clipping is an illegal state (Watch, 2026-10-25): no two solid parts of
// Mica, Wiki or the gear they carry may pass through each other, and no model
// may pass through itself. The sweep poses the real rig every way the game
// can (test/support/rig-poses.js); RIG_SWEEP=full walks every step.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../src/vendor/three/three.module.js';
import {createRigModel,coatRadius} from '../../src/game/render/rig-model.js';
import {findClips,trianglesCross} from '../../src/game/render/rig-clips.js';
import {rigPoses} from '../support/rig-poses.js';
const rig=createRigModel();

test('the detector sees two crossing triangles and ignores two apart',()=>{
 const flat=[0,0,0,1,0,0,0,1,0],through=[.2,.2,-1,.2,.2,1,.6,.2,0],beside=[2,2,-1,2,2,1,2.4,2,0];
 assert.ok(trianglesCross(flat,through));
 assert.equal(trianglesCross(flat,beside),null);
});

test('the detector catches a lantern hung through the coat',()=>{
 rig.pose({lantern:true});
 assert.deepEqual(findClips(rig),[]);
 const lantern=rig.scene.getObjectByName('lantern'),home=lantern.position.clone();
 // Its glass sits 0.12 below its ring: centre the glass on the coat's side.
 const y=.7;lantern.position.copy(lantern.parent.worldToLocal(new T.Vector3(coatRadius((y-.48)/.55),y+.12,0)));
 rig.scene.updateMatrixWorld(true);
 assert.ok(findClips(rig).some(c=>[c.a,c.b].includes('lantern')&&[c.a,c.b].includes('coat')));
 lantern.position.copy(home);rig.scene.updateMatrixWorld(true);
 assert.deepEqual(findClips(rig),[]);
});

test('only joints and grips may touch, and every seam stays small',()=>{
 const names=new Set(rig.solids().map(s=>s.name));
 for(const pose of [{},{pickaxe:6,basket:5,lantern:true,wiki:{},cargo:'sealed'},{pickaxe:6,action:'swing',progress:.5},{basket:5,action:'pick',progress:.5},{lantern:true,action:'collect',work:'lantern',progress:.5}]){
  rig.pose(pose);
  for(const name of rig.solids().map(s=>s.name))names.add(name);
  for(const c of rig.contacts()){
   if(c.at)assert.ok(c.r<=.30,`the ${c.a}/${c.b} seam is a joint, not a licence to clip (r=${c.r})`);
   else assert.ok(WHOLE.has(c.a+'/'+c.b),`${c.a}/${c.b} may only touch where they are joined or held`);
  }
 }
 for(const c of rig.contacts())for(const n of [c.a,c.b])assert.ok(names.has(n),'contacts name real solids: '+n);
});
// Pairs that may meet anywhere: a hand and its arm, the collar where it is
// sewn on, Wiki's fibre feet on the hood, and a hand holding its gear.
const WHOLE=new Set(['leftArm/leftHand','rightArm/rightHand','collar/coat','collar/head','wikiFeet/head','rightHand/pickaxe','leftHand/basket','leftHand/cargo','rightHand/cargo','leftHand/lantern']);

test('no pose makes Mica, Wiki or their gear clip',()=>{
 const bad=[];
 for(const pose of rigPoses({full:process.env.RIG_SWEEP==='full'})){
  rig.pose(pose);const clips=findClips(rig);
  if(clips.length)bad.push(JSON.stringify(pose)+'\n    '+clips.map(c=>`${c.a}/${c.b}${c.self?' (self)':''} ×${c.crossings} at ${c.at}`).join('\n    '));
 }
 assert.equal(bad.length,0,`${bad.length} poses clip:\n  `+bad.slice(0,12).join('\n  '));
});
