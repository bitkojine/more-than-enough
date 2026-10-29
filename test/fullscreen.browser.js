/* Actual gesture-based API checks; emulated viewport sizes and orientations
 * do not claim hardware Safari coverage. WebKit/fallbacks have unit coverage. */
export async function checkFullscreen({ evalJS, waitFor, ok, eq, cdp, session, tap, rect, shot }) {
  await evalJS('window.requestAnimationFrame=()=>0;new Promise(r=>setTimeout(r,100))');
  ok(await evalJS('!!document.fullscreenEnabled'),'browser host permits actual fullscreen');
  const saved = await evalJS('JSON.stringify(MTE_GAME.core.serialize(MTE_GAME.getState()))');
  await evalJS('document.getElementById("btnSettings").click()');
  // The first tap must target the settled sheet, not its opening animation.
  await evalJS('document.getElementById("sheet").getAnimations().filter(a=>a.transitionProperty==="transform").forEach(a=>a.finish())');
  for (const [width,height] of [[320,568],[768,1024],[1366,768]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1000},session);
    await evalJS('document.getElementById("btnFullscreen").scrollIntoView({block:"center"})');
    const button=await rect('#btnFullscreen');await tap(button.x,button.y);
    const entered=await waitFor('document.fullscreenElement===document.documentElement',3000);
    ok(entered,'Settings enters actual whole-client fullscreen at '+width+'×'+height);
    if(!entered)throw new Error('Fullscreen entry failed: '+JSON.stringify(await evalJS('({mode:MTE_GAME.fullscreen.mode,error:String(MTE_GAME.fullscreen.error||""),hint:document.getElementById("fullscreenHint").textContent,focused:document.hasFocus(),enabled:document.fullscreenEnabled})')));
    eq(await evalJS('document.getElementById("btnFullscreen").getAttribute("aria-pressed")'),'true','fullscreen button reflects actual entry');
    const portrait = height >= width, narrow = Math.min(width,height), wide = Math.max(width,height);
    for(const [type,angle] of [['portraitPrimary',0],['landscapePrimary',90],['portraitSecondary',180],['landscapeSecondary',270]]) {
      const vertical=type.startsWith('portrait');
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:vertical?narrow:wide,height:vertical?wide:narrow,deviceScaleFactor:1,mobile:width<1000,screenOrientation:{type,angle}},session);
      ok(await waitFor('(()=>{const r=document.getElementById("game").getBoundingClientRect();return r.width===innerWidth&&r.height===innerHeight&&document.fullscreenElement===document.documentElement;})()',2000),'fullscreen canvas fills '+type+' for '+width+'×'+height);
      ok(await evalJS('screen.orientation.angle==='+angle),'orientation remains unrestricted at '+angle+' degrees');
    }
    await evalJS('document.getElementById("btnFullscreen").scrollIntoView({block:"center"})');
    const leave=await rect('#btnFullscreen');await tap(leave.x,leave.y);
    ok(await waitFor('!document.fullscreenElement',3000),'Settings exits actual fullscreen');
    eq(await evalJS('document.getElementById("btnFullscreen").getAttribute("aria-pressed")'),'false','fullscreen button reflects actual exit');
    if(portrait)await shot('fullscreen-settings-'+width+'x'+height+'.png');
  }
  await evalJS('document.getElementById("btnFullscreen").scrollIntoView({block:"center"})');
  const button=await rect('#btnFullscreen');await tap(button.x,button.y);
  ok(await waitFor('!!document.fullscreenElement',3000),'fullscreen can be entered again');
  await evalJS('document.exitFullscreen()');
  ok(await waitFor('document.getElementById("btnFullscreen").getAttribute("aria-pressed")==="false"',2000),'external fullscreen exit updates Settings');
  await evalJS('window.fullscreenEnabledDescriptor=Object.getOwnPropertyDescriptor(document,"fullscreenEnabled");Object.defineProperty(document,"fullscreenEnabled",{configurable:true,value:false});MTE_GAME.fullscreen.sync()');
  for(const [width,height] of [[320,568],[568,320]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true},session);
    await evalJS('document.getElementById("btnFullscreen").scrollIntoView({block:"center"})');
    const help=await rect('#btnFullscreen');await tap(help.x,help.y);
    ok(await evalJS('!document.fullscreenElement&&!document.getElementById("fullscreenHint").hidden&&document.getElementById("btnFullscreen").getAttribute("aria-expanded")==="true"'),'unsupported fullscreen opens real Settings help at '+width+'×'+height);
    ok(await evalJS('document.documentElement.scrollWidth<=innerWidth&&document.getElementById("fullscreenHint").scrollWidth<=document.getElementById("fullscreenHint").clientWidth'),'fullscreen help wraps on a small screen');
    await shot('fullscreen-help-'+width+'x'+height+'.png');
    await tap(help.x,help.y);
  }
  await evalJS('if(window.fullscreenEnabledDescriptor)Object.defineProperty(document,"fullscreenEnabled",window.fullscreenEnabledDescriptor);else delete document.fullscreenEnabled;delete window.fullscreenEnabledDescriptor;MTE_GAME.fullscreen.sync()');
  ok(await evalJS('JSON.stringify(MTE_GAME.core.serialize(MTE_GAME.getState()))')===saved,'fullscreen, rotation and fallback help preserve the saved world exactly');
}
