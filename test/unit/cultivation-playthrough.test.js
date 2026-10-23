import {test} from 'node:test';
import assert from 'node:assert/strict';
import {playCultivation} from '../../scripts/cultivation-playtest.mjs';
import * as C from '../../src/core/index.js';

test('empty-handed cultivation world reaches activation through shipped movement and actions',()=>{
 const run=playCultivation(271102971);assert.equal(run.result,'won',run.error);assert.ok(run.seconds>0);assert.ok(run.actions>100);
 assert.ok(Object.values(run.stages[0].inv).every(n=>n===0));assert.ok(run.trace.every(e=>!e.intent||e.result));
 const before=C.deserialize(run.activationSave),after=C.deserialize(run.save);assert.ok(before);assert.equal(C.canEmbark(before),false);assert.ok(C.canEmbark(after));
 assert.equal(C.nextGoal(after),null,'a completed world does not still ask the player to discover metal');
 assert.equal(after.cultivation.facilities.find(b=>b.kind==='machine').sections,3);assert.ok(after.extractors.some(b=>b.key==='garden'));assert.ok(after.extractors.some(b=>b.key==='quarry'));
});
