import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playCultivation} from '../../scripts/cultivation-playtest.mjs';
import * as C from '../../src/core/index.js';

// The wall budget only stops a hung run: the game-time budget is the check,
// so a slow or busy machine can't fail it.
const run=playCultivation(11,{wallSeconds:300});

test('empty-handed cultivation world reaches activation through shipped movement and actions',()=>{
 assert.equal(run.result,'won',run.error);assert.ok(run.seconds>0);assert.ok(run.actions>100);
 assert.ok(Object.values(run.stages[0].inv).every(n=>n===0));assert.ok(run.trace.every(e=>!e.intent||e.result));
 const before=C.deserialize(run.activationSave),after=C.deserialize(run.save);assert.ok(before);assert.equal(C.canEmbark(before),false);assert.ok(C.canEmbark(after));
 assert.equal(C.nextGoal(after),null,'a completed world does not still ask the player to discover metal');
 assert.equal(after.cultivation.facilities.find(b=>b.kind==='machine').sections,3);assert.ok(after.extractors.some(b=>b.key==='garden'));assert.ok(after.extractors.some(b=>b.key==='quarry'));
});

// Every number a played world holds as a fraction (timers, charges, piles,
// health) saves and loads to the same save at the edges of its rounding.
// The long property sweep found one such slip only after a deploy (v0.171.1:
// a flare almost burnt out); this finds that kind in a second, before one.
test('a played world saves the same after loading, whatever fractions it holds',()=>{
 const lit=C.deserialize(run.activationSave);lit.inv.ore=(lit.inv.ore||0)+C.FLARE_COST.ore;assert.ok(C.useFlare(lit));C.burnFlare(lit,7.3);
 const old=C.createState(4242);for(let i=0;i<4000;i++)C.step(old,0.25);
 const states=[lit,C.deserialize(run.save),old];
 const leaves=(o,path=[],out=[])=>{for(const [k,v] of Object.entries(o)){
  if(!path.length&&['world','acts','edits'].includes(k))continue;
  if(typeof v==='number')out.push([o,k,[...path,k].join('.')]);
  else if(v&&typeof v==='object'&&!(v instanceof Map)&&!(v instanceof Set))leaves(v,[...path,k],out);
 }return out;};
 let tried=0;const slips=[];
 for(const s of states)for(const [o,k,path] of leaves(s)){
  const keep=o[k];if(Number.isInteger(keep))continue;tried++;
  for(const v of [0.004,0.0049,0.005,0.00004,keep+0.004]){o[k]=v;const a=C.serialize(s);if(C.serialize(C.deserialize(a))!==a)slips.push(path+'='+v);}
  o[k]=keep;
 }
 assert.ok(tried>=40,`only ${tried} fractions were tried: the states no longer reach what they did`);
 assert.ok(states[0].flare>0&&!Number.isInteger(states[0].flare),'the flare is burning, part way');
 assert.deepEqual(slips,[],'these values save differently after a load');
});
