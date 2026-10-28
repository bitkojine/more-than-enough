/* Bounded combined-state regression fixtures; presentation, not a fair-play run. */
export async function checkHudLayout({evalJS,ok,eq,cdp,session,shot,tap,rect}) {
  await evalJS(`(async()=>{
    window.requestAnimationFrame=()=>0;await new Promise(r=>setTimeout(r,100));
    MTE_GAME.wiki.setMode('quiet');
    const css=document.createElement('style');css.textContent='*,*::before,*::after{animation:none!important;transition:none!important}';document.head.append(css);
    const s=MTE_GAME.getState();s.player.z=-12;s.underground.deepest=-12;s.battery=.23;
    s.cultivation.gear.lantern=true;s.cultivation.lantern=false;s.flare=60;
    const C=MTE_GAME.core,px=Math.floor(s.player.x),py=Math.floor(s.player.y);C.tileAt(s.world,px,py,s.player.z);s.world.hotChunk.type[C.chunkIndex(px,py)]=C.T.TUNNEL;C.revealAround(s);MTE_GAME.hud.update(s);document.getElementById('btnMine').hidden=false;
    const {t}=await import('/src/i18n/i18n.js');document.getElementById('lanternLabel').textContent=t('button.lantern.off');document.getElementById('flareLabel').textContent='1:00';
    document.getElementById('btnLantern').hidden=false;document.getElementById('btnFlare').hidden=false;
    MTE_GAME.messages.setOpen(true);MTE_GAME.messages.add({text:'A message retained in the log'});
    document.getElementById('perf').hidden=false;document.getElementById('perf').textContent='FPS 30 / 30\\nrender 7.8 ms\\nsimulation 0.4 ms\\nquality 1×';
    const {renderChips}=await import('/src/game/players.js');document.getElementById('friends').hidden=false;
    renderChips(document.getElementById('friends'),Array.from({length:99},(_,i)=>({id:String(i),name:'Mica '+i,st:'online',color:'#a5d79c'})),{tap(){},more(){}});
  })()`);
  for(const [width,height] of [[320,568],[390,844],[568,320],[667,375],[932,430],[1366,768]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000},session);
    await evalJS('MTE_GAME.hudLayout.invalidate();MTE_GAME.hudLayout.tick();MTE_GAME.messages.tick()');
    const state=await evalJS(`(()=>{const shown=e=>!e.hidden&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none';const ids=['topbar','hudSecondary','btnBuild','btnUpgrade','btnAction','btnMine','log','logPill'];const r=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]).filter(([,e])=>shown(e)).map(([id,e])=>[id,e.getBoundingClientRect().toJSON()]));const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;const collisions=[];for(const [a,b] of [['hudSecondary','log'],['hudSecondary','logPill'],['hudSecondary','btnMine'],['topbar','btnMine'],['log','btnMine'],['logPill','btnMine']])if(r[a]&&r[b]&&overlap(r[a],r[b]))collisions.push(a+'/'+b);return{collisions,offscreen:Object.entries(r).filter(([,b])=>b.x<0||b.y<0||b.right>innerWidth+1||b.bottom>innerHeight+1).map(([id])=>id),level:MTE_GAME.hudLayout.level};})()`);
    eq(state.collisions.length,0,'combined HUD groups clear each other at '+width+'×'+height+' '+state.collisions);
    eq(state.offscreen.length,0,'combined HUD groups stay on screen at '+width+'×'+height+' '+state.offscreen);
    const gearButton=await rect('#btnUpgrade');await tap(gearButton.x,gearButton.y);
    await evalJS('MTE_GAME.hudLayout.tick()');
    ok(await evalJS('!document.getElementById("equipmentTray").hidden&&document.getElementById("btnUpgrade").getAttribute("aria-expanded")==="true"'),'Equipment opens compact first at '+width+'×'+height);
    const tray=await evalJS(`(()=>{const t=document.getElementById('equipmentTray').getBoundingClientRect(),a=document.getElementById('btnMine').getBoundingClientRect(),top=document.getElementById('topbar').getBoundingClientRect();return t.top>=top.bottom&&t.bottom<=innerHeight&&t.left>=0&&t.right<=innerWidth&&(t.right<=a.left||t.left>=a.right||t.bottom<=a.top||t.top>=a.bottom);})()`);
    ok(tray,'Equipment tray clears navigation and immediate action at '+width+'×'+height);
    await shot('hud-groups-'+width+'x'+height+'.png');
    await evalJS('document.getElementById("btnEquipmentClose").click();MTE_GAME.hudLayout.tick()');
  }
  eq(await evalJS('(()=>{MTE_GAME.hudLayout.tick();const n=MTE_GAME.hudLayout.measurements;for(let i=0;i<100;i++)MTE_GAME.hudLayout.tick();return MTE_GAME.hudLayout.measurements-n;})()'),0,'settled layout performs no additional measurements across 100 ticks');
  await evalJS('document.getElementById("btnUpgrade").click();MTE_GAME.hudLayout.tick()');
  const before=await evalJS('MTE_GAME.getState().cultivation.lantern');
  await evalJS('document.getElementById("btnLantern").click()');
  eq(await evalJS('MTE_GAME.getState().cultivation.lantern'),!before,'tray lantern uses the canonical action');
  await evalJS('document.getElementById("btnEquipmentCraft").click()');
  ok(await evalJS('document.getElementById("sheet").dataset.tab==="upgrades"&&!!document.querySelector("#sheetBody [data-id=pickaxe]")&&!document.querySelector("#sheetBody [data-kind=build]")'),'Equipment crafting contains gear, not construction');
  await evalJS('for(const r of MTE_GAME.core.RESOURCES)MTE_GAME.getState().inv[r]=10000;document.querySelector(".tab[data-tab=upgrades]").click()');
  const toolBefore=await evalJS('MTE_GAME.getState().tools.pickaxe');
  await evalJS('document.querySelector("#sheetBody button[data-id=pickaxe]").click()');
  ok(await evalJS('MTE_GAME.getState().tools.pickaxe')>toolBefore,'Equipment crafting buys real gear through the normal controller');
  const siteX=await evalJS('document.documentElement.lang==="lt"?8:0');
  const fixture=await evalJS(`(()=>{document.getElementById('btnClose').click();const s=MTE_GAME.getState(),C=MTE_GAME.core;MTE_GAME.setPlayer(${siteX}+.5,.5);for(let y=-1;y<=5;y++)for(let x=${siteX}-1;x<=${siteX}+4;x++){C.tileAt(s.world,x,y,s.player.z);s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.TUNNEL;}C.revealAround(s);const built=C.cultivationCommand(s,{type:'build',kind:'vault',x:${siteX},y:1});MTE_GAME.setPlayer(${siteX}+.5,4.5);C.revealAround(s);document.getElementById('btnBuild').click();return built;})()`);
  eq(fixture,'ok','site fixture uses canonical construction');
  ok(await evalJS('document.getElementById("sheet").dataset.tab==="build"&&!!document.querySelector("#sheetBody [data-action=build]")&&!!document.querySelector("#sheetBody [data-action=reinforce]")&&!document.querySelector("#sheetBody [data-id=pickaxe]")'),'Settlement combines construction and site improvements, excluding gear');
  await shot('settlement-menu.png');
  const stock=await evalJS('JSON.stringify(MTE_GAME.getState().inv)');
  await evalJS(`[...document.querySelectorAll("#sheetBody button")].find(b=>b.dataset.action==="reinforce"&&b.dataset.x==="${siteX}"&&b.dataset.y==="1").click()`);
  ok(await evalJS('!document.getElementById("sheet").classList.contains("open")'),'a site improvement returns to play for the approach');
  eq(await evalJS('JSON.stringify(MTE_GAME.getState().inv)'),stock,'a distant improvement spends nothing before contact');
  await evalJS('MTE_GAME.playtest.ticks(600)');
  ok(await evalJS(`MTE_GAME.core.cultivationAt(MTE_GAME.getState(),${siteX},1).reinforced&&MTE_GAME.core.atInteraction(MTE_GAME.getState(),${siteX},1)`),'Mica walks to the selected site and reinforces it');
  ok(await evalJS(`(()=>{const before=${stock},s=MTE_GAME.getState(),cost=MTE_GAME.core.CULTIVATION_RECIPES.reinforce;return Object.keys(cost).every(r=>Math.abs(before[r]-s.inv[r]-cost[r])<1e-6);})()`),'site improvement pays the canonical cost once');
  await evalJS('MTE_GAME.hudLayout.tick()');
}
