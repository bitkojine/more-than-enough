import {checkLightControls} from './light-controls.browser.js';
/* Funded UI fixture for chapter locks; the separate fresh-world trace proves
 * the real journey. Both owned items and direct core calls are checked here. */
export async function checkProgression({evalJS,waitFor,ok,eq,cdp,session,shot,navigate,tap,rect}) {
  await evalJS(`(async()=>{
    window.requestAnimationFrame=()=>0;await new Promise(r=>setTimeout(r,100));
    const s=MTE_GAME.getState(),C=MTE_GAME.core;
    for(const r of C.RESOURCES)s.inv[r]=500;
    s.player={x:.5,y:.5,z:-2};s.tools={basket:6,pickaxe:2,boots:2,overclock:0};s.flare=42.25;
    for(let y=-4;y<=4;y++)for(let x=-4;x<=6;x++){C.tileAt(s.world,x,y,-2);s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.TUNNEL;C.markExplored(s.world,x,y,-2);}
    const c=s.cultivation,base={z:-2,temperature:18,quality:100,buffer:0};
    c.facilities=[{...base,kind:'machine',id:1,x:0,y:0,health:100,sections:3},{...base,kind:'cooler',id:2,x:0,y:1},{...base,kind:'chamber',id:3,x:2,y:0,health:100,buffer:2},{...base,kind:'vault',id:4,x:3,y:0,buffer:12},{...base,kind:'conduit',id:5,x:3,y:1,from:3,to:4}];
    c.nextId=6;c.gear={lantern:false,carrier:false};c.lantern=false;c.completed=false;c.restored=true;c.heart={where:'installed',health:100};
    s.extractors=[{key:'garden',res:'mycelium',x:2,y:0,z:0,buffer:9}];MTE_GAME.hud.update(s);
  })()`);
  const owned=await evalJS('JSON.stringify({tools:MTE_GAME.getState().tools,buffer:MTE_GAME.getState().extractors[0].buffer,vault:MTE_GAME.getState().cultivation.facilities[3].buffer,flare:MTE_GAME.getState().flare})');
  for(const [width,height] of [[320,568],[1366,768]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000},session);
    await evalJS('document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
    ok(await evalJS('!!document.querySelector("#sheetBody [data-locked$=basket]:disabled")&&!!document.querySelector("#sheetBody [data-locked$=flare]:disabled")'),'optional equipment remains visible behind locks at '+width);
    ok(await evalJS('!!document.querySelector("#sheetBody [data-id=carrier]:not(:disabled)")&&!!document.querySelector("#sheetBody [data-id=lantern]:not(:disabled)")'),'minimum visibility and protection equipment remain craftable');
    await evalJS('document.querySelector("#sheetBody [data-locked$=basket]").click()');
    eq(await evalJS('MTE_GAME.getState().tools.basket'),6,'a disabled future purchase preserves earned gear');
    await shot('focused-equipment-'+width+'.png');
    await evalJS('document.getElementById("btnClose").click();document.getElementById("btnBuild").click()');
    ok(await evalJS('!!document.querySelector("#sheetBody [data-locked$=crystalVault]:disabled")&&!!document.querySelector("#sheetBody [data-locked$=sealedConduit]:disabled")'),'optional storage stays visible but locked');
    ok(await evalJS('!!document.querySelector("#sheetBody [data-id=chamber]:not(:disabled)")&&!!document.querySelector("#sheetBody [data-id=cooler]:not(:disabled)")&&!!document.querySelector("#sheetBody [data-id=shelter]:not(:disabled)")'),'required production, cooling and recovery remain available');
    ok(await evalJS('document.documentElement.scrollWidth<=innerWidth'),'locked menus fit the viewport');
    await shot('focused-settlement-'+width+'.png');
    await evalJS('document.getElementById("btnClose").click()');
    await new Promise(r=>setTimeout(r,250));
    if(width===320){
      await cdp.send('Network.enable',{},session);
      await cdp.send('Network.setBlockedURLs',{urls:['*statement.js*']},session);
      await evalJS('document.querySelector("#resources .chip.ledger").click()');
      ok(await waitFor('!!document.querySelector("#sheetBody pre")',2000),'a failed Earnings download shows a recoverable explanation');
      ok(await evalJS('MTE_GAME.playtest.faults().some(f=>f.where.includes("earnings/load")&&f.where.includes("statement.js")&&f.context.version)'), 'failed panel download records the asset and game context');
      await cdp.send('Network.setBlockedURLs',{urls:[]},session);
      await evalJS('document.getElementById("btnClose").click()');
    }
    const before=await evalJS('MTE_GAME.core.serialize(MTE_GAME.getState())');
    await evalJS('document.querySelector("#resources .chip[data-res=crystal]").click()');
    ok(await waitFor('document.querySelectorAll("#sheetBody .colHead").length===4&&!!document.querySelector("#sheetBody details.mushroomCollection:not([open])")',2000),'Earnings retains four resource sections and a collapsed collection at '+width);
    ok(await evalJS('!document.querySelector("#sheetBody [data-unit],#sheetBody .units")&&document.querySelector("#col-crystal .headRate").textContent.includes("/s")'),'Earnings only shows per-second rates');
    ok(await evalJS('!document.querySelector("#sheetBody [data-goto]")'),'unfinished worlds have no unavailable investment links');
    ok(await evalJS('document.querySelector("#sheetBody").textContent.includes("18")&&document.querySelector("#sheetBody").textContent.includes("12")'),'Earnings includes chamber conditions and locked vault stock');
    ok(await evalJS('MTE_GAME.core.serialize(MTE_GAME.getState())')===before,'opening Earnings changes no saved gameplay');
    ok(await waitFor('Array.from(document.querySelectorAll("#sheetBody .row")).every(e=>e.getBoundingClientRect().right<=innerWidth+1)&&document.documentElement.scrollWidth<=innerWidth',1500),'Earnings rows fit phone and desktop after the opening animation');
    await shot('focused-earnings-'+width+'.png');
    await evalJS('document.getElementById("btnClose").click()');
  }
  eq(await evalJS('MTE_GAME.core.useFlare(MTE_GAME.getState())'),'locked','core blocks the flare shortcut too');
  eq(await evalJS('MTE_GAME.core.cultivationCommand(MTE_GAME.getState(),{type:"build",kind:"vault",x:0,y:0})'),'locked','core blocks bypassing a disabled construction row');
  eq(await evalJS('JSON.stringify({tools:MTE_GAME.getState().tools,buffer:MTE_GAME.getState().extractors[0].buffer,vault:MTE_GAME.getState().cultivation.facilities[3].buffer,flare:MTE_GAME.getState().flare})'),owned,'inspection and rejected actions preserve earned contents');
  await evalJS('MTE_GAME.openCard(0,0)');
  ok(await evalJS('!!document.querySelector("#buildingCard [data-type=activate]")'),'restored machine exposes real activation');
  await evalJS('document.querySelector("#buildingCard [data-type=activate]").click()');
  ok(await evalJS('MTE_GAME.getState().cultivation.completed&&!MTE_GAME.core.contentLocked(MTE_GAME.getState(),"vault")'),'activation through the building card unlocks the chapter');
  await evalJS('document.getElementById("btnBuild").click()');
  ok(await evalJS('!!document.querySelector("#sheetBody [data-id=vault]:not(:disabled)")&&!document.querySelector("#sheetBody [data-locked]")'),'optional construction becomes usable after activation');
  await shot('unlocked-settlement.png');
  await evalJS('MTE_GAME.save()');
  const lang=await evalJS('document.documentElement.lang');
  await navigate('?lang='+lang+'&playtestReplay');
  ok(await evalJS('MTE_GAME.getState().cultivation.completed&&MTE_GAME.getState().tools.basket===6&&MTE_GAME.getState().extractors[0].buffer===9'),'actual reload retains completion, earned gear and saved buffers');
  await checkLightControls({evalJS,waitFor,ok,cdp,session,tap,rect,shot});
}
