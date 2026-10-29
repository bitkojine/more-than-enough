import {test} from 'node:test';
import assert from 'node:assert/strict';
import {C} from './helpers.js';

// The Awards sheet finds each milestone reached, and the last one to show far
// off, in worldGoals. A crystal world's milestones are not in GOALS, so looking
// there made the sheet throw (and stop opening) at the first crystal-only one.
test('every world lists its own milestones, ending at the one that masters it',()=>{
 const worlds={crystal:C.createState(12345,{cultivation:true}),old:C.createState(12345),shared:{...C.createState(12345),shared:true}};
 for(const [kind,s] of Object.entries(worlds)){
  const goals=C.worldGoals(s);
  assert.equal(goals.length,C.goalsTotal(s),kind);
  assert.equal(goals.at(-1).id,kind==='shared'?'refined10':'master',kind);
  for(const g of goals)assert.ok(g.reached,`${kind}: ${g.id} says it is reached`);
 }
 assert.deepEqual(C.worldGoals(worlds.crystal).map(g=>g.id),C.CULTIVATION_GOALS.filter(g=>g.id!=='garden').map(g=>g.id));
});

test('every milestone a crystal world marks done is one its Awards can list',()=>{
 const s=C.createState(7,{cultivation:true});
 for(const g of C.CULTIVATION_GOALS)s.goalsDone.push(g.id);
 const goals=C.worldGoals(s);
 for(const id of s.goalsDone)assert.ok(goals.find(g=>g.id===id),id);
});
