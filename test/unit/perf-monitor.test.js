import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPerfMonitor} from '../../src/game/perf-monitor.js';
function feed(m,ms,n,target=60,phases={terrain:1}){let alerts=[];for(let i=0;i<n;i++){const a=m.sample(ms,phases,target,{layer:-4});if(a)alerts.push(a);}return alerts;}
test('intentional phone and calm pacing is healthy',()=>{for(const target of [10,30,60]){const m=createPerfMonitor();assert.equal(feed(m,1000/target,200,target).length,0);assert.ok(Math.abs(m.snapshot().fps-target)<.01);}});
test('sustained slow terrain opens; acknowledgment suppresses same cause until worse',()=>{const m=createPerfMonitor();assert.ok(feed(m,40,120,60,{terrain:25}).length);m.acknowledge();assert.equal(feed(m,40,120,60,{terrain:25}).length,0);assert.ok(feed(m,100,60,60,{terrain:85}).length);m.acknowledge();assert.ok(feed(m,100,80,60,{lighting:85}).some(a=>a.cause==='lighting'));});
test('minor costs are retained without opening warnings',()=>{const m=createPerfMonitor();assert.equal(feed(m,1000/60,180,60,{terrain:3}).length,0);assert.equal(m.snapshot().latest.cause,'terrain');assert.equal(m.snapshot().latest.warning,false);});
test('unmeasured frame delay is not attributed to a cheap renderer',()=>{const m=createPerfMonitor();const alerts=feed(m,60,80,60,{terrain:1});assert.ok(alerts.some(a=>a.cause==='unattributed'));});
test('visible hitch is captured, suspension and pace changes settle again',()=>{const m=createPerfMonitor();feed(m,1000/60,100);assert.ok(m.sample(300,{terrain:200},60));m.reset();assert.equal(m.sample(10000,{terrain:1},60),null);assert.equal(feed(m,100,5,10).length,0);});
test('storage and report sizes remain bounded on long sessions',()=>{const m=createPerfMonitor();feed(m,40,10000,60,{terrain:25});const s=m.snapshot();assert.equal(s.count,600);assert.ok(s.history.length<=60);assert.ok(s.incidents.length<=20);assert.equal(s.latest.context.layer,-4);});


test('a cheap renderer never becomes the claimed cause of a slow frame',()=>{
 const m=createPerfMonitor();const alerts=feed(m,50,120,30,{terrain:15,actors:5});
 assert.ok(alerts.length);assert.equal(m.snapshot().latest.cause,'unattributed');
 assert.equal(m.snapshot().latest.overTargetMs,50-1000/30);
 assert.equal(m.snapshot().pacing.available,false,'old reports have no invented scheduling measurements');
});

test('the reported iPhone CPU costs expose a cadence shortfall, not a terrain bottleneck',()=>{
 const m=createPerfMonitor();feed(m,36.3,180,30,{terrain:3.73,actors:2,simulation:.125,presentation:.3,other:.345});
 assert.equal(m.snapshot().latest.cause,'cadence');assert.equal(m.snapshot().latest.warning,false);
 assert.equal(m.snapshot().latest.evidence,'interval-over-target');
 assert.ok(Math.abs(m.snapshot().cpuMs-6.5)<1e-9);
});

test('measured late timers are retained separately from spare frame budget',()=>{
 const m=createPerfMonitor();const timing={callbackWorkMs:7,outsideLoopMs:31,capAllowanceMs:1000/30-7,overTargetMs:38-1000/30,timerLateMs:4,timerLateWorstMs:4,timerCallbacks:1,rafCallbacks:1,rafAgeMs:.2};
 for(let i=0;i<180;i++)m.sample(38,{terrain:4,actors:2},30,{},timing);
 const s=m.snapshot();assert.equal(s.latest.cause,'scheduler');assert.equal(s.latest.evidence,'late-timer');
 assert.equal(s.pacing.timerLateMs,4);assert.equal(s.pacing.outsideLoopMs,31);
 assert.ok(Math.abs(s.pacing.capAllowanceMs-(1000/30-7))<1e-9);
 assert.ok(s.pacing.overTargetMs<5,'normal waiting is not an unexplained 31 ms delay');
 m.reset();assert.equal(m.snapshot().pacing.available,false);
});
