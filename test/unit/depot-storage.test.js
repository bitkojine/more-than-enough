import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
const values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
const normal=await import('../../src/game/storage.js');
globalThis.location={search:'?depots'};
const experimental=await import('../../src/game/storage.js?depot-storage-test');
delete globalThis.location;

test('prototype saves and per-seed archive never replace the ordinary world',()=>{
 values.clear();const original=C.serialize(C.createState(77));values.set('more-than-enough-save',original);
 const a=experimental.loadGame().state;assert.equal(a.logisticsModel,C.DEPOT_MODEL);
 assert.equal(experimental.saveGame(a),null);
 const raw=values.get('mte.depot-v1.save');assert.equal(values.get('more-than-enough-save'),original);
 assert.equal(values.get('mte.depot-v1.world.'+a.seed),raw);
 assert.equal(experimental.loadGame().state.seed,a.seed);
 const next=C.createState(88);next.logisticsModel=C.DEPOT_MODEL;assert.equal(experimental.saveGame(next),null);
 assert.equal(values.get('mte.depot-v1.world.'+a.seed),raw,'previous experimental world stays archived');
 assert.equal(normal.loadGame().state.seed,77);
 assert.ok(normal.saveGame(next)?.error,'a normal save slot rejects experimental state');
 assert.equal(values.get('more-than-enough-save'),original);
});
test('cross-slot adoption is rejected and a future capability is preserved to one side',()=>{
 values.clear();assert.equal(experimental.adopt(C.serialize(C.createState(4))),null);
 const d=JSON.parse(C.serialize(C.createState(5)));d.logisticsModel='future-depot';const raw=JSON.stringify(d);
 values.set('mte.depot-v1.save',raw);const loaded=experimental.loadGame();
 assert.equal(loaded.state.logisticsModel,C.DEPOT_MODEL);assert.equal(values.get('mte.depot-v1.aside'),raw);
});
