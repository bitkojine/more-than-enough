/* Mobile-sized browser test of the shipped one-thumb expedition interface. */
'use strict';
var cp=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
var ROOT=path.resolve(__dirname,'..'),PORT=8200+Math.floor(Math.random()*500),CDP_PORT=9400+Math.floor(Math.random()*500);
var CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if(process.platform==='darwin'&&process.env.CODEX_SANDBOX==='seatbelt'){console.error('Browser E2E needs an unsandboxed run; Chrome can abort during macOS app registration inside the sandbox.');process.exit(2);}
function sleep(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
async function main(){
  var server=cp.spawn('python3',['-m','http.server',String(PORT),'--bind','127.0.0.1'],{cwd:ROOT,stdio:'ignore'});
  var profile=fs.mkdtempSync(path.join(os.tmpdir(),'deeper-chrome-'));
  var chrome=cp.spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking','--mute-audio','--remote-debugging-port='+CDP_PORT,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
  var socket;
  function cleanup(){try{if(socket)socket.close();}catch(_){}try{process.kill(-chrome.pid,'SIGKILL');}catch(_){}try{chrome.kill('SIGKILL');}catch(_){}try{server.kill('SIGKILL');}catch(_){}try{fs.rmSync(profile,{recursive:true,force:true});}catch(_){}}
  process.on('exit',cleanup);
  try{
    var version;
    for(var i=0;i<60;i++){try{var response=await fetch('http://127.0.0.1:'+CDP_PORT+'/json/version');if(response.ok){version=await response.json();break;}}catch(_){}await sleep(250);}
    if(!version)throw new Error('Chrome did not expose its DevTools endpoint.');
    socket=new WebSocket(version.webSocketDebuggerUrl);await new Promise(function(resolve,reject){socket.onopen=resolve;socket.onerror=reject;});
    var id=0,pending=new Map(),pageErrors=[];socket.onmessage=function(event){var msg=JSON.parse(event.data);if(msg.method==='Runtime.exceptionThrown')pageErrors.push(msg.params.exceptionDetails.text);if(msg.id&&pending.has(msg.id)){var p=pending.get(msg.id);pending.delete(msg.id);msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result);}};
    function send(method,params,sessionId){var n=++id;socket.send(JSON.stringify({id:n,method:method,params:params||{},sessionId:sessionId}));return new Promise(function(resolve,reject){pending.set(n,{resolve:resolve,reject:reject});});}
    var target=await send('Target.createTarget',{url:'about:blank'}),attached=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true}),sid=attached.sessionId;
    async function cdp(method,params){return send(method,params,sid);}
    await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    async function evaluate(expression){var result=await cdp('Runtime.evaluate',{expression:expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;}
    var failures=0,checks=0;function check(ok,label){checks++;if(!ok){failures++;console.error('FAIL '+label);}else console.log('ok '+label);}
    await cdp('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'});
    for(i=0;i<60&&!await evaluate('!!window.DEEPER_GAME');i++)await sleep(150);
    if(!await evaluate('!!window.DEEPER_GAME'))throw new Error('Game did not boot.');
    await evaluate('localStorage.clear()');await cdp('Page.reload');await sleep(500);
    check(await evaluate('!document.getElementById("tutorial").hidden'),'first-dive tutorial appears');
    check(await evaluate('(function(){return ["#joystick span","#stats","#game"].every(function(s){var e=document.querySelector(s),c=getComputedStyle(e);return c.userSelect==="none"&&c.webkitUserSelect==="none";});})()'),'joystick label and map surfaces cannot be selected as text');
    async function point(selector){return evaluate('(function(){var r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');}
    async function mouse(type,x,y,pressed){var event={type:type,x:x,y:y};if(type==='mouseMoved'){event.button='none';event.buttons=pressed?1:0;}else{event.button='left';event.clickCount=1;}return cdp('Input.dispatchMouseEvent',event);}
    async function tap(selector){var p=await point(selector);await mouse('mousePressed',p.x,p.y);await mouse('mouseReleased',p.x,p.y);await sleep(180);}
    await tap('#tutorialDone');
    check(await evaluate('document.getElementById("tutorial").hidden'),'tutorial dismisses with its single-thumb action');
    var joy=await point('#joystick'),before=await evaluate('JSON.stringify(DEEPER_GAME.summary())');
    await mouse('mousePressed',joy.x,joy.y);await mouse('mouseMoved',joy.x+32,joy.y,{button:'left'});await sleep(500);await mouse('mouseReleased',joy.x+32,joy.y);
    var after=await evaluate('JSON.stringify(DEEPER_GAME.summary())');check(JSON.parse(after).x!==JSON.parse(before).x,'thumb joystick moves through the airlock');
    var targetPoint=await evaluate('(function(){var g=DEEPER_GAME,s=g.getState(),c=g.core,z=Math.max(31,Math.min(48,innerWidth/9));for(var y=1;y<9;y++)for(var x=-5;x<=5;x++){var p=c.planDrill(s,x,y),sx=innerWidth/2+(x+.5-s.run.x)*z,sy=innerHeight*.51+(y+.5-s.run.y)*z;if(p&&p.length&&p.length<7&&sx>24&&sx<260&&sy>180&&sy<680&&p.every(function(t){return t.kind!==c.TILE.HARD&&t.kind!==c.TILE.GAS;})){return {x:sx,y:sy,n:p.length};}}return null;})()');
    var dugBefore=(await evaluate('DEEPER_GAME.summary().dug'));
    if(targetPoint){await mouse('mousePressed',targetPoint.x,targetPoint.y);await sleep((targetPoint.n+.5)*260);await mouse('mouseReleased',targetPoint.x,targetPoint.y);await sleep(180);}
    check(!!targetPoint&&await evaluate('DEEPER_GAME.summary().dug')>dugBefore,'holding a tile drills a visible connected route');
    await tap('#charge');check((await evaluate('document.getElementById("toast").textContent')).indexOf('No charges')>=0,'charge control explains when no charge is packed');
    await tap('#beacon');check((await evaluate('document.getElementById("toast").textContent')).indexOf('empty')>=0,'beacon explains that fuel is required');
    await evaluate('var s=DEEPER_GAME.getState();s.run.cargo.fuel=1;s.run.cargo.scrap=20;');await tap('#beacon');
    check(await evaluate('!document.getElementById("hub").hidden&&DEEPER_GAME.getState().run.status==="extracted"'),'fuel beacon extracts to the surface station');
    await tap('[data-upgrade="hull"]');check(await evaluate('DEEPER_GAME.getState().hub.upgrades.hull===1'),'surface station sells permanent hull upgrades');
    await evaluate('var s=DEEPER_GAME.getState();s.hub.bank.scrap=20;s.hub.bank.copper=2;');await tap('#craft');
    check(await evaluate('DEEPER_GAME.getState().hub.charges===1'),'surface workshop crafts a charge');
    await tap('#dive');check(await evaluate('DEEPER_GAME.getState().run.status==="diving"&&DEEPER_GAME.getState().run.charges===1'),'new dive loads its packed charge');
    var charge=await point('#charge'),map=await evaluate('({x:innerWidth*.5,y:innerHeight*.52})');await mouse('mousePressed',charge.x,charge.y);await mouse('mouseMoved',map.x,map.y,{button:'left'});await mouse('mouseReleased',map.x,map.y);await sleep(150);
    check(await evaluate('DEEPER_GAME.getState().run.charges===0'),'drag and release aims and detonates a charge');
    await evaluate('localStorage.setItem("deeper-save-v1",DEEPER_GAME.core.serialize(DEEPER_GAME.getState()))');await cdp('Page.reload');await sleep(400);
    check(await evaluate('DEEPER_GAME.getState().run.status==="diving"'),'dive state persists after reload');
    check(pageErrors.length===0,'no JavaScript runtime exceptions');
    console.log((failures?'FAILED '+failures:'PASSED')+' — '+checks+' browser checks');process.exit(failures?1:0);
  }catch(error){console.error(error.stack||error);process.exitCode=1;}finally{cleanup();}
}
main();
