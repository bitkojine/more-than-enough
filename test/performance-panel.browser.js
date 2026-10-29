/* Bounded diagnostics fixtures; injected timings never alter game rules. */
export async function checkPerformancePanel({evalJS,ok,cdp,session,shot}) {
  for(const lang of ['en','lt']){
    await cdp.send('Page.navigate',{url:await evalJS(`location.origin+location.pathname+'?lang=${lang}'`)},session);
    for(let i=0;i<100;i++){if(await evalJS('!!window.MTE_GAME'))break;await new Promise(r=>setTimeout(r,100));}
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'F3',code:'F3',windowsVirtualKeyCode:114},session);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F3',code:'F3',windowsVirtualKeyCode:114},session);
    for(let i=0;i<100;i++){if(await evalJS('!!document.querySelector(".perfPill")'))break;await new Promise(r=>setTimeout(r,100));}
    ok(await evalJS('MTE_GAME.perfVisible()&&!document.getElementById("perf").hidden&&!!document.querySelector(".perfPill")'),lang+': F3 lazy-loads the actual diagnostics tool');
    for(let i=0;i<50;i++){if(await evalJS('MTE_GAME.perf().count>0'))break;await new Promise(r=>setTimeout(r,100));}
    ok(await evalJS('MTE_GAME.perf().count>0'),lang+': actual game loop records phase samples');
    ok(await evalJS('(()=>{document.dispatchEvent(new Event("visibilitychange"));return MTE_GAME.perf().count===0;})()'),lang+': tab visibility changes discard suspended timing gaps');
    await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'F3',code:'F3',windowsVirtualKeyCode:114},session);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'F3',code:'F3',windowsVirtualKeyCode:114},session);
    ok(await evalJS('!MTE_GAME.perfVisible()&&document.getElementById("perf").hidden'),lang+': F3 disables automatic warnings');
    await evalJS(`(async()=>{
      const {createPerf}=await import('./src/game/perf.js');
      const root=document.getElementById('perf'),details=document.getElementById('performanceDetails');
      window.__perfFixture=createPerf({perf:root,performanceDetails:details,perfState:document.getElementById('perfState'),perfBtn:document.getElementById('btnPerf')},document.querySelector('canvas'),{state:()=> 'running',trace:()=>({wakes:0,last:''})},{level:0});
      __perfFixture.toggle(true);window.__perfFeed=(ms,n,target,costs)=>{for(let i=0;i<n;i++)__perfFixture.frame(ms,1,Object.values(costs).reduce((a,b)=>a+b,0),100,{target,phases:costs,context:{seed:123,layer:-4,daylight:0}});__perfFixture.tick(1);};
    })()`);
    await evalJS('__perfFeed(1000/30,100,30,{terrain:1})');
    ok(await evalJS('document.querySelector(".perfCard").hidden'),lang+': intentional 30 FPS does not auto-open');
    await evalJS('__perfFeed(50,100,30,{terrain:38})');
    ok(await evalJS('!document.querySelector(".perfCard").hidden&&document.getElementById("perf").dataset.grade==="bad"'),lang+': actual slow terrain opens warning');
    await evalJS('__perfFixture.collapse();__perfFeed(50,100,30,{terrain:38})');
    ok(await evalJS('document.querySelector(".perfCard").hidden'),lang+': collapse prevents repeat warning');
    await evalJS('__perfFeed(80,100,30,{lighting:65})');
    ok(await evalJS('!document.querySelector(".perfCard").hidden'),lang+': new expensive cause reopens');
    for(const [w,h]of [[320,568],[568,320],[1366,768]]){
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<600},session);
      await evalJS('document.getElementById("btnMine").hidden=false;document.getElementById("btnPerfect").hidden=false;MTE_GAME.hudLayout.tick();__perfFixture.expand();__perfFixture.tick(1)');
      await new Promise(r=>setTimeout(r,150));
      ok(await evalJS('(()=>{const r=document.querySelector(".perfCard").getBoundingClientRect();const visible=document.elementFromPoint(r.left+r.width/2,r.top+10);return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.querySelector(".perfCard").contains(visible);})()'),`${lang}: warning fits ${w}×${h}`);
      ok(await evalJS('(()=>{document.getElementById("btnMine").hidden=false;document.getElementById("btnPerfect").hidden=false;MTE_GAME.hudLayout.tick();const a=document.querySelector(".perfCard").getBoundingClientRect(),overlap=b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;return ["btnBuild","btnUpgrade","btnAction","btnMine","btnPerfect"].map(id=>document.getElementById(id)).filter(e=>!e.hidden).map(e=>e.getBoundingClientRect()).filter(r=>r.height>0).every(b=>!overlap(b));})()'),`${lang}: warning leaves essential controls clear at ${w}×${h}`);
      ok(await evalJS('(()=>{const p=document.querySelector(".perfPill");return p.getBoundingClientRect().height<=50&&p.scrollWidth<=p.clientWidth;})()'),`${lang}: compact pill stays readable at ${w}×${h}`);
      await shot(`performance-${lang}-${w}.png`);
    }
    await evalJS('document.querySelector(".perfActions button").click();__perfFixture.details();');
    await new Promise(r=>setTimeout(r,400));
    ok(await evalJS('document.querySelectorAll(".perfPhase").length===8&&document.querySelectorAll(".perfIncident").length>0'),lang+': live sheet has phase timings and retained observations');
    ok(await evalJS('!document.getElementById("performanceDetails").textContent.includes("perf.")'),lang+': labels resolve');
    await evalJS('window.__perfReport=null;Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>{window.__perfReport=JSON.parse(text)}}});document.querySelector(".perfCopy").click()');
    ok(await evalJS('__perfReport&&__perfReport.version&&__perfReport.context.layer===-4&&__perfReport.incidents.length>0&&__perfReport.history.length>0'),lang+': copied report includes timings, context and history');
    ok(await evalJS('(()=>{const row=document.querySelector(".perfPhase");document.getElementById("btnClose").click();__perfFixture.tick(1);return row===document.querySelector(".perfPhase");})()'),lang+': closing details stops rebuilding hidden timing rows');
    const before=await evalJS('MTE_GAME.core.serialize(MTE_GAME.getState())');
    ok(await evalJS('(()=>{const s=MTE_GAME.getState(),before=MTE_GAME.core.serialize(s);__perfFeed(50,100,30,{terrain:38});__perfFixture.snapshot();return before===MTE_GAME.core.serialize(s);})()'),lang+': observing diagnostics preserves the exact world save');
    await evalJS('__perfFixture.toggle(false);__perfFeed(100,100,30,{terrain:90})');
    ok(await evalJS('document.getElementById("perf").hidden'),lang+': disabling hides diagnostics');
    // No gameplay commands or grants are used by the diagnostics fixture.
    ok(typeof before==='string',lang+': world remains serializable');
  }
}
