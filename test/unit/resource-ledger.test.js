import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { createResourceLedger } from '../../src/core/resource-ledger.js';
test('batched streams preserve ordered accounting while publishing balances only once',()=>{
 const a=C.createState(71), b=C.createState(71);let writes=0;
 a.inv=new Proxy(a.inv,{set(target,key,value){writes++;target[key]=value;return true;}});
 const batch=createResourceLedger(a), scalar=createResourceLedger(b);
 const updates=[{name:'z',source:'buildings',totals:{stone:1e16}},{name:'a',source:'buildings',totals:{stone:1,mycelium:3}},{name:'engine',source:'engine',totals:{ore:2}}];
 batch.setStreams(updates);for(const u of updates)scalar.setStream(u.name,u.source,u.totals);
 assert.deepEqual(a.inv,b.inv);assert.deepEqual(a.sources,b.sources);assert.deepEqual(a.stats,b.stats);
 assert.equal(writes,C.RESOURCES.length);
 writes=0;batch.credit('hand','mycelium',5);assert.equal(writes,1);
 writes=0;assert.equal(batch.pay({mycelium:1}),true);assert.equal(writes,1);
});
test('a rejected batched settlement cannot partly alter streams or balances',()=>{
 const s=C.createState(71), ledger=createResourceLedger(s);
 ledger.setStream('production','buildings',{stone:10});const before=C.serialize(s);
 assert.throws(()=>ledger.setStreams([{name:'production',source:'buildings',totals:{stone:100}},{name:'engine',source:'engine',totals:{ore:-1}}]));
 assert.equal(C.serialize(s),before);
 assert.doesNotThrow(()=>ledger.setStream('production','buildings',{stone:11}));
});
