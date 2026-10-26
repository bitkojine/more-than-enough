/* How characters move (src/game/render/motion.js): every act a player can
 * send has an animation, and each one ends where it started. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTS } from '../../src/net/protocol.js';
import { ACT_TIME, pose, createActor } from '../../src/game/render/motion.js';

const rest = { act: null, t: 0, idle: 0 };

test('motion: every act that crosses the wire has an animation, and only those', () => {
  assert.deepEqual(Object.keys(ACT_TIME).sort(), [...ACTS].sort());
});

test('motion: acts move them and settle back where they stood', () => {
  const still = pose(rest);
  for (const act of ACTS) {
    const mid = pose({ act, t: ACT_TIME[act] * 0.5, idle: 0 });
    assert.ok(mid.dx || mid.dy || mid.rot !== still.rot || mid.tool, act + ' shows');
    const end = pose({ act, t: ACT_TIME[act], idle: 0 });
    assert.ok(Math.abs(end.dy - still.dy) < 0.02 && Math.abs(end.rot - still.rot) < 0.05, act + ' ends at rest');
    assert.ok(!('scale' in mid), 'poses never resize anyone');
  }
});

test('motion: a friend\'s act plays once per new count, never on first sight', () => {
  const a = createActor();
  a.heard('swing', 4);
  assert.equal(a.view(false).act, null, 'an act from before we met is old news');
  a.heard('swing', 5);
  assert.equal(a.view(false).act, 'swing');
  const mine = createActor();
  mine.act('pick');
  assert.deepEqual(mine.sent, { a: 'pick', n: 1 });
  mine.act('dance');
  assert.deepEqual(mine.sent, { a: 'pick', n: 1 }, 'unknown acts are ignored');
});

test('locomotion follows travelled distance at 30, 60 and 144 FPS', () => {
  for (const fps of [30,60,144]) {
    let time=0; const a=createActor({clock:()=>time});
    a.view(false,{x:0,y:0,z:0});
    let v;
    for(let i=1;i<=fps;i++) { time=i/fps;v=a.view(true,{x:.9*i/fps,y:0,z:0}); }
    assert.ok(Math.abs(v.stride-.375)<1e-10,'same distance, same stride at '+fps);
    const blocked=a.view(true,{x:.9,y:0,z:0});
    assert.equal(blocked.walking,false,'holding movement against a wall is not walking');
    assert.equal(blocked.stride,v.stride,'drawing without displacement cannot advance steps');
    assert.equal(a.view(false,{x:.9,y:0,z:0}).stride,0,'stopping plants the idle feet');
  }
});

test('locomotion ignores layer transitions, teleports and suspended frames',()=>{
  let time=0;const a=createActor({clock:()=>time});
  a.view(false,{x:0,y:0,z:0});time=.1;
  assert.ok(a.view(true,{x:.3,y:0,z:0}).stride>0);
  time=.2;assert.equal(a.view(true,{x:100,y:0,z:0}).stride,0);
  time=.3;assert.equal(a.view(true,{x:100.3,y:0,z:-1}).stride,0);
  time=100;const v=a.view(true,{x:100.6,y:0,z:-1});
  assert.equal(v.stride,0);assert.equal(v.walking,false);assert.equal(v.clock,100);
});


test('rig locomotion holds between simulation samples and settles without inventing travel',()=>{
  let time=0;const a=createActor({clock:()=>time});a.view(false,{x:0,y:0,z:0});
  time=.1;const moved=a.view(true,{x:.3,y:0,z:0});assert.ok(moved.walkBlend>0);
  time=.11;const same=a.view(true,{x:.3,y:0,z:0});assert.equal(same.walking,false);
  assert.equal(same.rigStride,moved.rigStride);assert.ok(same.walkBlend>=moved.walkBlend,'no idle flash between ticks');
  let stopped;for(let i=1;i<=40;i++){time=.11+i/60;stopped=a.view(false,{x:.3,y:0,z:0});}
  assert.equal(stopped.walkBlend,0);assert.equal(stopped.rigStride,moved.rigStride);
  time+=.01;const jumped=a.view(true,{x:100,y:0,z:0});assert.equal(jumped.walkBlend,0);
});

test('rapid work receipts finish their stroke and retain its captured facing',()=>{
 let time=0;const a=createActor({clock:()=>time});a.act('swing',{facing:{x:1,y:0}});time=.2;a.act('swing',{facing:{x:0,y:1}});
 const before=a.view(false);assert.equal(before.t,.2);assert.deepEqual(before.facing,{x:1,y:0});
 time=ACT_TIME.swing+.01;const next=a.view(false);assert.ok(Math.abs(next.t-.01)<1e-8);assert.deepEqual(next.facing,{x:0,y:1});
 time=10;assert.equal(a.view(false).act,null,'no old visual backlog after time away');
 a.act('swing');time+=.1;a.act('up');assert.equal(a.view(false).act,'up','a different action can interrupt promptly');assert.equal(a.view(false).t,0);
});

test('Gather held: strokes run on into each other, the first eases in and the last eases out',()=>{
 let time=0;const a=createActor({clock:()=>time}),work={work:null};
 a.act('pick',work);assert.equal(a.view(false).flow,null,'a single stroke eases in and out');
 time=.25;a.act('pick',work);assert.deepEqual(a.view(false).flow,{joined:false,onward:true});
 time=ACT_TIME.pick+.05;a.act('pick',work);assert.deepEqual(a.view(false).flow,{joined:true,onward:true});
 time=ACT_TIME.pick*2+.05;assert.deepEqual(a.view(false).flow,{joined:true,onward:false},'let go: the last stroke puts the tool away');
 time=10;a.act('pick',{work:'plant'});time=10.2;a.act('pick',{work:null});
 assert.equal(a.view(false).flow,null,'planting then foraging is two different jobs');
});
