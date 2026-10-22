import {test} from 'node:test';
import assert from 'node:assert/strict';
import {check, rulesFingerprint} from '../../scripts/perfect-bench.mjs';
const baseline = {rulesHash:'rules-a',median:100};
const result = (time, rulesHash='rules-a') => ({rulesHash,summary:{embark:time},runs:[{seed:1,embark:time,behaviour:{refused:0,shortTrips:0}}]});

test('faster completion passes; unchanged-rule strategy slowdowns fail',()=>{
 assert.deepEqual(check(result(60),baseline),[]);
 assert.ok(check(result(110),baseline).some(p=>p.includes('slower')));
});
test('intentional rules changes report time without applying an obsolete balance target',()=>{
 assert.deepEqual(check(result(150,'rules-b'),baseline),[]);
 assert.deepEqual(check(result(150),{median:100}),[]);
 const invalid=result(null,'rules-b');invalid.runs[0].behaviour.refused=1;
 assert.equal(check(invalid,baseline).length,2,'completion and refusals remain mandatory across balance changes');
 const trips=result(150,'rules-b');trips.runs[0].behaviour.shortTrips=1;
 assert.equal(check(trips,baseline).length,1,'layer-loop behavior cannot be waived by a balance change');
});
test('canonical rule fingerprints are deterministic',()=>{
 assert.match(rulesFingerprint(),/^[a-f0-9]{64}$/);
 assert.equal(rulesFingerprint(),rulesFingerprint());
});
