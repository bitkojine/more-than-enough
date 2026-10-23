import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
const values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
const storage=await import('../../src/game/storage.js');
test('main game loads earlier worlds unchanged and archives them before another is saved',()=>{
 values.clear();const original=C.serialize(C.createState(77));values.set('more-than-enough-save',original);
 const old=storage.loadGame().state;assert.equal(old.seed,77);assert.equal(old.cultivation,undefined);assert.equal(storage.saveGame(old),null);
 const archive=values.get('mte.solo.world.77');assert.ok(archive);
 const next=C.createState(88,{cultivation:true});assert.equal(storage.saveGame(next),null);
 assert.equal(values.get('mte.solo.world.77'),archive);assert.ok(values.get('mte.solo.world.88'));
 assert.equal(storage.loadGame().state.seed,88);
});
test('future capabilities are retained aside and a fresh normal world uses cultivation',()=>{
 values.clear();const d=JSON.parse(C.serialize(C.createState(5)));d.logisticsModel='future-depot';const raw=JSON.stringify(d);values.set('more-than-enough-save',raw);
 const loaded=storage.loadGame();assert.ok(loaded.state.cultivation);assert.equal(values.get('more-than-enough-save-aside'),raw);
 assert.equal(storage.adopt(C.serialize(loaded.state)).seed,loaded.state.seed);
});
