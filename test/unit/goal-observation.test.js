import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import {economyForState} from '../../src/core/economy-context.js';
import {productionFixture} from '../support/production-fixture.js';

test('passive stone income still reaches its milestone on the observing check',()=>{
 const s=C.createState(91363);s.unlocks.logistics=true;s.abundanceLv=1;
 assert.ok(C.startEventEconomy(s));C.step(s,.25,{visualEvents:false});
 assert.equal(s.stats.stone,0,'production has not been observed yet');
 assert.ok(C.advanceGoals(s).some(g=>g.id==='stone'));
 assert.ok(s.stats.stone>0);
});

test('purchase-only pending milestones do not settle production on every goal deadline',()=>{
 const s=productionFixture();C.earn(s,'stone',1,'hand');C.advanceGoals(s);
 assert.ok(s.goalsDone.includes('stone'));
 C.step(s,1/60,{visualEvents:false}); // haul legacy fixture buffers before activation
 assert.ok(C.startEventEconomy(s));const economy=economyForState(s);
 const before=economy.work.observations;
 for(let i=0;i<100;i++){C.step(s,.25,{visualEvents:false});C.advanceGoals(s);}
 assert.equal(economy.work.observations,before);
 C.settleEconomy(s);assert.ok(s.inv.stone>0);
});
