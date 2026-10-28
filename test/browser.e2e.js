/* End-to-end test: launches a static server + headless Chrome, then drives the
 * real game through the DevTools Protocol (touch input, keyboard, DOM clicks),
 * verifying gameplay and persistence through the shipped code paths. */
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// MTE_SITE=<dir> tests a staged site (scripts/stage-site.sh: the bundled game
// players get) instead of the source.
var ROOT = path.resolve(process.env.MTE_SITE || path.join(import.meta.dirname, '..'));
var PORT = 8200 + Math.floor(Math.random() * 400);
var CDP_PORT = 9400 + Math.floor(Math.random() * 400);
var SHOT_DIR = process.env.MTE_SHOT_DIR || path.join(os.tmpdir(), 'mte-shots');
var CHROME = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : 'google-chrome');

if (process.platform === 'darwin' && process.env.CODEX_SANDBOX === 'seatbelt') {
  console.error('Browser E2E needs to run outside the macOS Codex sandbox. Chrome aborts during macOS app registration inside the sandbox; rerun this command in Terminal or approve unsandboxed execution.');
  process.exit(2);
}

var CDP_TIMEOUT_MS = 15000;  // any single DevTools call
var STALL_MS = 60000;        // no output at all for this long means the run is stuck

var failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL: ' + msg); } else { console.log('  ok: ' + msg); } }

/* Fail loud: a run that hangs must say where. Every line we print is progress;
 * the watchdog names the section and the last line if progress stops. */
var section = '(starting)', lastLine = '', lastProgress = Date.now();
var print = console.log;
console.log = function () {
  var line = Array.prototype.join.call(arguments, ' ');
  if (/^\n?== /.test(line)) section = line.trim();
  lastLine = line.trim();
  lastProgress = Date.now();
  print.apply(console, arguments);
};
function die(code, why) {
  console.error('\nE2E ' + why + '\n  section: ' + section + '\n  last output: ' + (lastLine || '(none)'));
  process.exit(code);
}
setInterval(function () {
  if (Date.now() - lastProgress > STALL_MS) die(3, 'STALLED: no progress for ' + STALL_MS / 1000 + 's');
}, 1000).unref();
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ------------------------------------------------------------ CDP client */

function CDP(url) {
  this.ws = new WebSocket(url);
  this.id = 0;
  this.pending = new Map();
  this.handlers = [];
  var self = this;
  this.ws.onmessage = function (m) { self._on(m); };
}
CDP.prototype.ready = function () {
  var self = this;
  return new Promise(function (res, rej) {
    self.ws.onopen = function () { res(); };
    self.ws.onerror = function (e) { rej(new Error('ws error')); };
  });
};
CDP.prototype._on = function (m) {
  var msg = JSON.parse(m.data);
  if (msg.id && this.pending.has(msg.id)) {
    var p = this.pending.get(msg.id);
    this.pending.delete(msg.id);
    if (msg.error) p.rej(new Error('CDP ' + JSON.stringify(msg.error)));
    else p.res(msg.result);
  } else {
    this.handlers.forEach(function (h) { h(msg); });
  }
};
CDP.prototype.send = function (method, params, sessionId) {
  var id = ++this.id;
  var payload = { id: id, method: method, params: params || {} };
  if (sessionId) payload.sessionId = sessionId;
  this.ws.send(JSON.stringify(payload));
  var self = this;
  return new Promise(function (res, rej) {
    var timer = setTimeout(function () {
      self.pending.delete(id);
      rej(new Error('Chrome did not answer ' + method + ' within ' + CDP_TIMEOUT_MS / 1000 + 's (page hung or browser starved)'));
    }, CDP_TIMEOUT_MS);
    self.pending.set(id, {
      res: function (v) { clearTimeout(timer); res(v); },
      rej: function (e) { clearTimeout(timer); rej(e); }
    });
  });
};
CDP.prototype.on = function (fn) { this.handlers.push(fn); };
CDP.prototype.close = function () { try { this.ws.close(); } catch (e) { } };

/* --------------------------------------------------------------- helpers */

async function httpJson(url) {
  var r = await fetch(url);
  return r.json();
}

var pageErrors = [];

async function asciiArt(evalJS) {
  var expr = "(function(){var c=document.getElementById('game');var g=c.getContext('2d');" +
    "var W=70,H=36;var img=g.getImageData(0,0,c.width,c.height);" +
    "var chars=' .:-=+*#%@';var out=[];" +
    "for(var j=0;j<H;j++){var row='';for(var i=0;i<W;i++){" +
    "var x=Math.floor(i/W*c.width),y=Math.floor(j/H*c.height);var o=(y*c.width+x)*4;" +
    "var l=(img.data[o]*0.3+img.data[o+1]*0.59+img.data[o+2]*0.11)/255;" +
    "row+=chars[Math.min(9,Math.floor(l*10))];}out.push(row);}return out.join('\\n');})()";
  return await evalJS(expr);
}

async function main() {
  if(process.env.MTE_GEODE_ONLY==='1'&&!process.env.MTE_PLAYTHROUGH_RUN)throw Error('MTE_GEODE_ONLY requires a recorded MTE_PLAYTHROUGH_RUN');
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  // Clear any stale headless browsers we launched previously; they eat the CPU
  // and starve this run's frames. ([m] keeps pkill from matching its own shell.)
  try { cp.execSync('pkill -f "[m]te-chrome-" >/dev/null 2>&1 || true'); } catch (e) { }

  // static server
  var server = cp.spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(700);

  // headless chrome
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mte-chrome-'));
  var chrome = cp.spawn(CHROME, [
    '--headless=new', ...(process.env.MTE_LAYER_ONLY==='1'||process.env.MTE_WORK_ONLY==='1'||process.env.MTE_RIG_ONLY==='1'||process.env.MTE_WEBGL==='1'||process.env.MTE_PICKAXE_ONLY==='1'||process.env.MTE_RESOURCE_ONLY==='1'?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:['--disable-gpu']), '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--mute-audio',
    // Sound only after a gesture, as on real phones and desktops (headless
    // Chrome would otherwise let any page play at once).
    '--autoplay-policy=user-gesture-required',
    // English unless a test picks Lithuanian (the game follows the browser).
    '--lang=en-US',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
  var chromeStderr = '';
  chrome.stderr.on('data', function (chunk) {
    chromeStderr = (chromeStderr + chunk.toString()).slice(-4000);
  });

  function cleanup() {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch (e) { }
    try { chrome.kill('SIGKILL'); } catch (e) { }
    try { cp.execSync('pkill -f ' + JSON.stringify(profile) + ' >/dev/null 2>&1 || true'); } catch (e) { }
    try { process.kill(-server.pid, 'SIGKILL'); } catch (e) { }
    try { server.kill('SIGKILL'); } catch (e) { }
  }
  process.on('exit', cleanup);
  // Killed or interrupted: still take Chrome down with us, and say so.
  ['SIGINT', 'SIGTERM', 'SIGHUP'].forEach(function (sig) {
    process.on(sig, function () { die(130, 'INTERRUPTED by ' + sig); });
  });

  var version = null;
  for (var i = 0; i < 60; i++) {
    if (chrome.exitCode !== null || chrome.signalCode) {
      var details = chromeStderr.trim();
      console.error('Chrome exited before its DevTools endpoint was ready (' + (chrome.signalCode || 'exit ' + chrome.exitCode) + ').' + (details ? '\n' + details : ''));
      process.exit(2);
    }
    try { version = await httpJson('http://127.0.0.1:' + CDP_PORT + '/json/version'); break; } catch (e) { await sleep(250); }
  }
  if (!version) {
    console.error('Chrome did not expose its DevTools endpoint within 15 seconds.' + (chromeStderr.trim() ? '\n' + chromeStderr.trim() : ''));
    process.exit(2);
  }

  var cdp = new CDP(version.webSocketDebuggerUrl);
  await cdp.ready();
  cdp.on(function (msg) {
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(JSON.stringify(msg.params.exceptionDetails.exception || msg.params.exceptionDetails.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(msg.params.args.map(function (a) { return a.value ?? a.description; }).join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      pageErrors.push('[log] ' + msg.params.entry.text);
    }
  });

  var target = await cdp.send('Target.createTarget', { url: 'about:blank' });
  var attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  var session = attached.sessionId;
  await cdp.send('Runtime.enable', {}, session);
  await cdp.send('Log.enable', {}, session);
  await cdp.send('Page.enable', {}, session);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 3, mobile: true
  }, session);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, session);
  // Keep the page treated as the focused, front tab: a backgrounded headless
  // tab stops producing frames, which freezes the game and hangs touch input.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, session);
  await cdp.send('Page.bringToFront', {}, session);

  var evalJS = async function (expr) {
    var r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, session);
    if (r.exceptionDetails) throw new Error('eval threw: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text) + '\n  expr: ' + expr);
    return r.result.value;
  };

  async function waitFor(expr, timeout) {
    var end = Date.now() + (timeout || 8000);
    while (Date.now() < end) {
      try { if (await evalJS(expr)) return true; } catch (e) { }
      await sleep(150);
    }
    return false;
  }

  async function navigate(url) {
    await cdp.send('Page.navigate', { url: url }, session);
    var loaded = await waitFor('!!window.MTE_GAME', 8000);
    if (!loaded) throw new Error('game did not boot at ' + url + '; runtime errors: ' + pageErrors.join(' | ') + '; page: ' + await evalJS('document.body.innerText.slice(0, 1000)'));
    // AUTO is hidden unless turned on in Nerds; the first boot checks that,
    // then every boot turns it on so the older-world AUTO checks can press it.
    if (!autoChecked) { autoChecked = true; ok(await evalJS('document.getElementById("btnPerfect").hidden'), 'AUTO is hidden by default'); }
    await evalJS('MTE_GAME.setAuto(true)');
    await sleep(400);
  }
  var autoChecked = false;

  async function navigate2(url) {
    await cdp.send('Page.navigate', { url: url }, session);
    await sleep(600);
  }

  async function touch(type, points) {
    await cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: points }, session);
  }
  async function tap(x, y) {
    // CDP messages are sent in order. Queue the release before waiting for
    // renderer acknowledgement: a slow software frame must not turn the
    // harness's quick tap into a >320 ms hold.
    await Promise.all([
      touch('touchStart', [{ x: x, y: y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]),
      touch('touchEnd', [])
    ]);
  }
  async function hold(x, y, ms) {
    await touch('touchStart', [{ x: x, y: y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    await sleep(ms);
    await touch('touchEnd', []);
  }
  async function drag(x0, y0, x1, y1, steps, stepMs) {
    await touch('touchStart', [{ x: x0, y: y0, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    for (var s = 1; s <= steps; s++) {
      var x = x0 + (x1 - x0) * s / steps, y = y0 + (y1 - y0) * s / steps;
      await touch('touchMove', [{ x: x, y: y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
      await sleep(stepMs || 40);
    }
    await touch('touchEnd', []);
  }
  function key(type, k, code, vk) {
    return cdp.send('Input.dispatchKeyEvent', { type: type, key: k, code: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, session);
  }
  async function shot(name) {
    var r = await cdp.send('Page.captureScreenshot', { format: 'png' }, session);
    var out = path.join(SHOT_DIR, name);
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return out;
  }
  function rect(sel) {
    return evalJS('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');if(!e)return null;var r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height};})()');
  }
  function stateSummary() {
    return evalJS('(function(){var s=MTE_GAME.getState();return JSON.stringify({x:+s.player.x.toFixed(2),y:+s.player.y.toFixed(2),inv:s.inv,tools:s.tools,unlocks:s.unlocks,ext:s.extractors.length,goal:s.goalIndex,buf:s.extractors.map(function(e){return e.buffer;})});})()');
  }

  // Sound: watch the game's output meter for a while and return the loudest
  // sample heard (0 = silence). Chrome runs with --mute-audio, which silences
  // the speakers but not the audio graph, so this measures real output.
  function startListening() {
    return evalJS('(function(){window.__peak=0;clearInterval(window.__listen);window.__listen=setInterval(function(){window.__peak=Math.max(window.__peak,MTE_GAME.audio.level());},8);})()');
  }
  async function heard(ms) {
    await sleep(ms);
    return evalJS('(function(){clearInterval(window.__listen);return window.__peak;})()');
  }
  async function loudness(call) {
    await startListening();
    await evalJS(call);
    return heard(400);
  }

  var results = {};

  /* ------------------------------------------------------------- boot */
  if(process.env.MTE_NO_WEBGL==='1')await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:"const originalGetContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:originalGetContext.call(this,type,...args)}"},session);
  let playthrough=null,replayInit=null;
  if(process.env.MTE_PLAYTHROUGH_RUN){
    playthrough=JSON.parse(fs.readFileSync(process.env.MTE_PLAYTHROUGH_RUN,'utf8'));
    if(playthrough.result!=='won'||!playthrough.initialSave||!Array.isArray(playthrough.trace))throw Error('A fresh current-world playthrough trace is required');
    // Refuse stale rules or a changed strategy, even if its old ending still loads.
    const fingerprint=createHash('sha256'),sourceRoot=path.resolve(import.meta.dirname,'..');
    for(const name of fs.readdirSync(path.join(sourceRoot,'src/core')).filter(f=>f.endsWith('.js')).sort())fingerprint.update(name).update(fs.readFileSync(path.join(sourceRoot,'src/core',name)));
    for(const name of ['src/game/controller.js','src/engine/simulation.js','src/engine/clock.js','scripts/cultivation-playtest.mjs'])fingerprint.update(name.startsWith('scripts/')?'./'+name.slice(8):'../'+name).update(fs.readFileSync(path.join(sourceRoot,name)));
    if(fingerprint.digest('hex')!==playthrough.sourceHash)throw Error('Playthrough source fingerprint changed; record a new run');
    replayInit=await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear();localStorage.setItem("more-than-enough-save",'+JSON.stringify(playthrough.initialSave)+');'},session);
  }
  console.log('\n== Boot & render ==');
  await navigate('http://127.0.0.1:' + PORT + '/index.html'+(playthrough?'?playtestReplay':''));
  if(!playthrough)await evalJS('localStorage.clear()');
  if(playthrough){
    await cdp.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:replayInit.identifier},session);
    console.log('\n== Complete current-world controller replay ==');
    ok(await evalJS('!!MTE_GAME.playtest'),'only the local replay host pauses wall-clock ticking');
    ok(await evalJS('(async()=>!!await MTE_GAME.look.rigReady)()'),'actual 3D character renderer is ready');
    const initial=await evalJS('({seed:MTE_GAME.getState().seed,time:MTE_GAME.getState().time,inv:MTE_GAME.getState().inv,tools:MTE_GAME.getState().tools})');
    eq(initial.seed,playthrough.seed,'starts the same reserved seed');eq(initial.time,0,'no unrecorded wall-clock ticks');ok(Object.values(initial.inv).every(n=>n===0)&&Object.values(initial.tools).every(n=>n===0),'replay begins empty-handed');
    const starterIndex=playthrough.trace.findIndex(e=>e.cultivation?.type==='starter'),starter=starterIndex>=0?playthrough.trace[starterIndex].cultivation:null;
    const recordedTrace=process.env.MTE_GEODE_ONLY==='1'?playthrough.trace.slice(0,starterIndex):playthrough.trace;
    if(process.env.MTE_GEODE_ONLY==='1'&&!starter)throw Error('Trace has no Geode interaction');
    await evalJS('window.__playthrough={trace:'+JSON.stringify(recordedTrace)+',at:0,left:0,ticks:0,actions:0,frames:0}');
    let replay;
    const replayStarted=Date.now();
    do{
      replay=await evalJS(`(async()=>{const p=__playthrough,h=MTE_GAME.playtest;let budget=2000;
       while(p.at<p.trace.length&&budget>0){const e=p.trace[p.at];if(e.ticks){if(!p.left)p.left=e.ticks;const n=Math.min(budget,p.left);h.ticks(n);p.ticks+=n;p.left-=n;budget-=n;if(!p.left)p.at++;}
        else{const result=e.intent?h.perform(e.intent):h.cultivation(e.cultivation);if(JSON.stringify(result)!==JSON.stringify(e.result))throw Error('Replay command mismatch at '+p.at+': '+JSON.stringify(e));p.actions++;p.at++;}}
       MTE_GAME.bench(1);p.frames++;await new Promise(requestAnimationFrame);
       if(h.faults().length)throw Error('Caught client fault: '+JSON.stringify(h.faults().map(f=>({head:f.head,where:f.where}))));
       return {at:p.at,total:p.trace.length,ticks:p.ticks,actions:p.actions,frames:p.frames,won:MTE_GAME.core.canEmbark(MTE_GAME.getState())};})()`);
      if(replay.frames%10===0||replay.at===replay.total)console.log('  replay '+replay.at+'/'+replay.total+' entries, '+(replay.ticks/60).toFixed(1)+' game seconds, '+replay.frames+' rendered frames');
      if(Date.now()-replayStarted>90000)throw Error('Full browser replay exceeded its wall budget');
    }while(replay.at<replay.total);
    if(process.env.MTE_GEODE_ONLY==='1'){
      console.log('\n== Actual Geode click ==');
      ok(await evalJS('typeof MTE_CRASH==="function"&&Array.isArray(window.MTE_RESOURCE_ERRORS)'), 'the CSP permits the real bootstrap error handler');
      const point=await evalJS('(()=>{const s=MTE_GAME.getState(),x='+starter.x+',y='+starter.y+',h=s.player.z+MTE_GAME.core.tileHeight(s.world,x,y,s.player.z);return MTE_GAME.project(x+.5,y+.5,h)})()');
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:point.x,y:point.y},session);
      await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:point.x,y:point.y},session);await sleep(500);
      const card=await evalJS('(()=>{const card=document.getElementById("buildingCard"),img=card?.querySelector("img");return {open:card&&!card.hidden,src:img?.getAttribute("src"),resolved:img?.src,loaded:!!img?.naturalWidth,crash:!document.getElementById("crash").hidden,report:document.querySelector("#crash pre").textContent,faults:MTE_GAME.playtest.faults()}})()');
      console.log('  Geode click result '+JSON.stringify(card));
      ok(card.open,'actual map click opens the wild-colony card');ok(!!card.src&&card.loaded,'Geode card has a real loaded picture');ok(!card.crash,'clicking the Geode does not show the fatal crash screen');eq(card.faults.length,0,'Geode click records no runtime faults');
      fs.writeFileSync(path.join(SHOT_DIR,'geode-click-result.json'),JSON.stringify(card,null,2));await shot('geode-click.png');
      await evalJS('(()=>{const img=document.createElement("img");img.id="__brokenGeodePicture";img.dataset.help="tile.geode";img.dataset.pictureSlot="top";img.src="/__test_missing_geode.svg";document.getElementById("buildingCard").append(img)})()');
      ok(await waitFor('MTE_GAME.playtest.faults().some(f=>f.where==="resource IMG")',3000),'a real failed picture download enters the structured fault reporter');
      const resource=await evalJS('MTE_GAME.playtest.faults().find(f=>f.where==="resource IMG")');
      if(!resource)console.log('  resource diagnostic '+JSON.stringify(await evalJS('({faults:MTE_GAME.playtest.faults(),pending:(window.MTE_RESOURCE_ERRORS||[]).map(e=>({where:e.where,message:e.error.message})),image:document.getElementById("__brokenGeodePicture")?.outerHTML,crash:document.getElementById("crash").hidden})')));
      ok(resource&&['tile.geode','slot: top','__test_missing_geode.svg','buildingCard','entry module:'].every(s=>resource.head.includes(s)),'resource report identifies picture, slot, element, failed URL and build source');
      ok(resource?.context.world?.includes(String(playthrough.seed))&&resource?.context.at&&resource?.crumbs.some(c=>c.text.includes('map tap')),'resource report retains world seed, player position and the map click');
      ok(await evalJS('document.getElementById("crash").hidden&&MTE_GAME.bench(1)>0'),'a failed optional picture keeps the world rendering');
      const missingSlot=await evalJS('(async()=>{const {iconHtml}=await import("./src/game/look/look.js");const html=iconHtml(MTE_GAME.look,"tile.geode","ico","image");return {html,faults:MTE_GAME.playtest.faults().filter(f=>f.head.includes("PictureUnavailableError"))}})()');
      ok(missingSlot.html.startsWith('<span ')&&!missingSlot.html.includes('src=')&&missingSlot.faults.length===1,'invalid slot requests create a safe placeholder and a named fault, never an empty image');
      fs.writeFileSync(path.join(SHOT_DIR,'resource-fault.json'),JSON.stringify(resource||null,null,2));
      if(resource){const report=await evalJS('(async()=>{const {report}=await import("./src/game/faults.js");return report(MTE_GAME.playtest.faults().find(f=>f.where==="resource IMG"))})()');fs.writeFileSync(path.join(SHOT_DIR,'resource-report.txt'),report);}console.log((failures?'GEODE BROWSER FAILURES':'GEODE BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
    }
    ok(replay.won,'complete journey reaches machine activation through real client commands');eq(replay.actions,playthrough.actions,'every recorded player command replayed');eq(replay.ticks,playthrough.ticks,'every simulation tick replayed');
    const finalSave=await evalJS('MTE_GAME.core.serialize(MTE_GAME.getState())');fs.writeFileSync(path.join(SHOT_DIR,'replayed-save.json'),finalSave);
    // Only the browser's last-saved wall timestamp differs; every gameplay
    // field, explored tile, balance, condition and completion flag must match.
    const gameplaySave=raw=>{const parsed=JSON.parse(raw);delete parsed.seen;return JSON.stringify(parsed);};
    eq(createHash('sha256').update(gameplaySave(finalSave)).digest('hex'),createHash('sha256').update(gameplaySave(playthrough.save)).digest('hex'),'browser and headless gameplay saves match exactly (excluding last-saved wall timestamp)');
    ok(await evalJS('MTE_GAME.core.canEmbark(MTE_GAME.core.deserialize(MTE_GAME.core.serialize(MTE_GAME.getState())))'),'win survives serialization and reload');
    eq(await evalJS('MTE_GAME.playtest.faults().length'),0,'no swallowed renderer or UI faults');eq(pageErrors.length,0,'no uncaught browser errors');await evalJS('MTE_GAME.save()');await shot('full-current-world-win.png');
    await navigate('http://127.0.0.1:'+PORT+'/?playtestReplay');
    ok(await evalJS('MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'actual client reload preserves completion');
    eq(await evalJS('MTE_GAME.getState().seed'),playthrough.seed,'reload keeps the completed world');
    eq(await evalJS('MTE_GAME.playtest.faults().length'),0,'reload has no recorded faults');
    await navigate('http://127.0.0.1:'+PORT+'/');eq(await evalJS('MTE_GAME.playtest'),null,'ordinary play has no replay controls');
    fs.writeFileSync(path.join(SHOT_DIR,'replay-result.json'),JSON.stringify({...replay,wallMs:Date.now()-replayStarted,seed:playthrough.seed,sourceHash:playthrough.sourceHash,failures,pageErrors},null,2));
    console.log((failures?'PLAYTHROUGH BROWSER FAILURES':'PLAYTHROUGH BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_NO_WEBGL==='1'){
    eq(await evalJS('(async()=>await MTE_GAME.look.rigReady===null)()'),true,'unavailable WebGL selects the static fallback');
    ok(await evalJS('MTE_GAME.bench(2)>0'),'the original world renderer keeps drawing');
    eq(pageErrors.length,0,'fallback has no runtime errors');await shot('no-webgl-fallback.png');
    console.log((failures?'FALLBACK BROWSER FAILURES':'FALLBACK BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_HUD_ONLY==='1'){
    await navigate('http://127.0.0.1:'+PORT+'/?playtestReplay');
    const {checkHudLayout}=await import('./hud-layout.browser.js');
    await checkHudLayout({evalJS,ok,eq,cdp,session,shot,tap,rect});
    await navigate('http://127.0.0.1:'+PORT+'/?lang=lt&playtestReplay');
    await checkHudLayout({evalJS,ok,eq,cdp,session,shot:name=>shot('lt-'+name),tap,rect});
    eq(pageErrors.length,0,'semantic HUD has no browser exceptions');
    console.log((failures?'HUD BROWSER FAILURES':'HUD BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_ZOOM_ONLY==='1'){
   for(const [width,height] of [[320,568],[568,320],[390,844],[1366,768]]){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<900},session);
    ok(await evalJS('(()=>{const z=document.getElementById("zoomControls"),r=document.getElementById("resources").getBoundingClientRect(),b=z.getBoundingClientRect(),buttons=[...z.children].map(e=>e.getBoundingClientRect());return b.top>=r.bottom&&b.left>=r.left-1&&b.right<=r.right+1&&buttons.every(e=>Math.abs(e.top-buttons[0].top)<1&&e.width>=40&&e.height>=40);})()'),'horizontal zoom beneath resources at '+width+'×'+height);
   }
   const before=await evalJS('MTE_GAME.zoom()');let b=await rect('#btnZoomIn');await tap(b.x,b.y);
   ok(await waitFor('MTE_GAME.zoom()>'+before,2000),'relocated zoom-in responds to touch');
   b=await rect('#zoomLevel');await tap(b.x,b.y);ok(await waitFor('Math.abs(MTE_GAME.zoom()-1)<.01',2000),'relocated reset returns to 1×');
   b=await rect('#btnMap');await tap(b.x,b.y);ok(await waitFor('MTE_GAME.mapOn()',2000),'relocated map button opens the world map');
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},session);
   await shot('horizontal-zoom-phone.png');eq(pageErrors.length,0,'relocated controls have no browser exceptions');
   console.log((failures?'ZOOM BROWSER FAILURES':'ZOOM BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_MESSAGES_ONLY==='1'){
   console.log('\n== Message reminders and collapsed previews ==');
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},session);
   await evalJS(`(()=>{MTE_GAME.wiki.setMode('quiet');MTE_GAME.messages.setOpen(false);const s=MTE_GAME.getState(),C=MTE_GAME.core;s.world.props.clear();s.world.holes.clear();s.tools.boots=0;for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){C.tileAt(s.world,x,y,0);s.world.hotChunk.type[C.chunkIndex(x,y)]=x===1?C.T.WATER:C.T.SOIL;}MTE_GAME.setPlayer(.8,.5);})()`);
   await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68},session);
   await sleep(800);
   await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68},session);
   ok(await evalJS('MTE_GAME.messages.lines.some(l=>/Boots/.test(l))'),'holding movement against water produces a gear warning');
   ok(await evalJS('!document.querySelector("#logLines .times")'),'held movement does not inflate repeat counts');
   await evalJS('MTE_GAME.messages.setOpen(true);MTE_GAME.messages.setOpen(false);MTE_GAME.hud.toast("A new message for the bubble")');
   ok(await waitFor('!document.getElementById("logBubble").hidden',1000),'a collapsed log previews new text');
   ok(await evalJS('document.getElementById("log").hidden'),'the full log remains collapsed');
   ok(await evalJS('getComputedStyle(document.getElementById("logBubble")).pointerEvents==="none"'),'bubble passes world input through');
   await sleep(200);
   ok(await evalJS('(()=>{const b=document.getElementById("logBubble").getBoundingClientRect(),p=document.getElementById("logPill").getBoundingClientRect();return b.bottom<p.top&&b.left>=0&&b.right<=innerWidth&&b.top>=0;})()'),'phone bubble fits above Messages');
   await shot('message-bubble-phone.png');
   await evalJS('MTE_GAME.hud.toast("Another message queued behind it")');
   ok(await evalJS('document.getElementById("logBubble").textContent.includes("A new message")'),'a different message waits its turn');
   ok(await waitFor('document.getElementById("logBubble").className==="settling"',7000),'preview animates toward Messages after reading time');
   ok(await waitFor('document.getElementById("logBubble").textContent.includes("Another message")',1500),'next queued preview follows the settling animation');
   await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},session);
   eq(await evalJS('getComputedStyle(document.getElementById("logBubble")).animationName'),'none','reduced motion disables bubble movement');
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false},session);
   ok(await evalJS('(()=>{const b=document.getElementById("logBubble").getBoundingClientRect(),p=document.getElementById("logPill").getBoundingClientRect();return b.bottom<p.top&&b.top>=0&&b.right<=innerWidth;})()'),'desktop bubble fits above Messages');
   await shot('message-bubble-desktop.png');
   await evalJS('MTE_GAME.messages.setOpen(true)');
   ok(await evalJS('document.getElementById("logBubble").hidden&&MTE_GAME.messages.lines.some(l=>l.includes("Another message"))'),'opening clears previews and retains all log text');
   eq(pageErrors.length,0,'message feedback has no browser exceptions');
   console.log((failures?'MESSAGE BROWSER FAILURES':'MESSAGE BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_RENDER_PERF_ONLY==='1'){
   console.log('\n== Bounded render performance across layers and day phases ==');
   const {runRenderPerformance}=await import('./render-performance.js');
   await runRenderPerformance({evalJS,ok,cdp,session,shotDir:SHOT_DIR});
   eq(pageErrors.length,0,'performance fixtures have no browser exceptions');
   console.log((failures?'RENDER PERFORMANCE FAILURES':'RENDER PERFORMANCE PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_ILLUMINATION_ONLY==='1'){
   console.log('\n== Canonical light: terrain, holes, crystal, and renderer ==');
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false},session);
   await evalJS(`(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core;MTE_GAME.wiki.setMode('quiet');s.world.props.clear();s.world.holes.clear();s.cultivation.facilities=[];s.cultivation.lantern=false;s.flare=0;s.time=120;
    // Isolated authored visual fixture, not a fair-play win evaluation.
    for(const z of [-1,-2])for(let y=-16;y<32;y++)for(let x=-16;x<32;x++){C.tileAt(s.world,x,y,z);const i=C.chunkIndex(x,y);s.world.hotChunk.type[i]=C.T.SOIL;s.world.hotChunk.rich[i]=1;}
    for(let y=-7;y<=7;y++)for(let x=-9;x<=9;x++)C.markExplored(s.world,x,y,-2);
    window.__lightFloor=(x,y,z=-2)=>C.setRichness(s.world,x,y,z,0);
    for(let x=-6;x<=0;x++)__lightFloor(x,0);for(let y=0;y<=4;y++)__lightFloor(0,y);
    for(let y=0;y<=2;y++)for(let x=3;x<=5;x++)__lightFloor(x,y);
    s.world.props.set(C.packKey(-6,0,-2),'lamp');s.player={x:.5,y:3.5,z:-2};MTE_GAME.setPlayer(.5,3.5);MTE_GAME.setZoom(1.25);})()`);await sleep(1800);
   eq(await evalJS('MTE_GAME.core.illuminationAt(MTE_GAME.getState(),0,1,-2).block'),2,'light bends around the open corridor corner');
   eq(await evalJS('MTE_GAME.core.illuminationAt(MTE_GAME.getState(),3,1,-2).block'),0,'sealed pocket is dark behind rock');
   ok(await evalJS('(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core,w={};C.illuminationAt(s,0,1,-2);C.illuminationAt(s,0,1,-2,w);return Object.keys(w).length===0})()'),'unchanged browser queries do no propagation');
   await shot('light-corridor-and-sealed-pocket.png');
   const pixels=await evalJS(`(async()=>{const {shadeFace}=await import('./src/game/render/lighting.js'),s=MTE_GAME.getState(),c=document.createElement('canvas');c.width=300;c.height=240;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,300,240);
    const cam={width:300,height:240,z:-2};for(let y=-2;y<=6;y++)for(let x=-7;x<=6;x++)shadeFace(g,cam,s,x,y,{x:(x+7)*20,y:(y+2)*20,width:20,height:20});
    const pixel=(x,y)=>g.getImageData((x+7)*20+10,(y+2)*20+10,1,1).data[0];return {lit:pixel(-5,0),dark:pixel(4,1)};})()`);
   ok(pixels.lit>pixels.dark+80,'actual lighting canvas shows lit passage brighter than the sealed pocket');
   await evalJS('(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core;s.world.props.clear();__lightFloor(-3,0,-1);s.world.holes.add(C.packKey(-3,0,-1));})()');
   eq(await evalJS('MTE_GAME.core.illuminationAt(MTE_GAME.getState(),-3,0,-2).level'),0,'open deep hole creates no light from a dark room above');
   await evalJS('(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core;s.world.props.set(C.packKey(-3,0,-1),"lamp");})()');
   eq(await evalJS('MTE_GAME.core.illuminationAt(MTE_GAME.getState(),-3,0,-2).block'),8,'upper lamp illuminates through the opening');
   await sleep(200);await shot('light-from-upper-lamp.png');
   await evalJS('(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core;s.world.props.clear();s.world.holes.add(C.packKey(-3,0,0));s.time=0;})()');
   eq(await evalJS('MTE_GAME.core.illuminationAt(MTE_GAME.getState(),-3,0,-2).sky'),15,'continuous sky column reaches the deeper layer');
   await sleep(200);await shot('light-stacked-skylight-noon.png');
   await evalJS('MTE_GAME.getState().time=120');
   eq(await evalJS('MTE_GAME.core.illuminationAt(MTE_GAME.getState(),-3,0,-2).level'),0,'night removes the physical sky contribution');
   await sleep(200);await shot('light-stacked-skylight-night.png');
   ok(await evalJS('(()=>{const s=MTE_GAME.getState(),before=MTE_GAME.core.serialize(s);for(let i=0;i<10;i++)MTE_GAME.bench(1);return before===MTE_GAME.core.serialize(s)})()'),'rendering physical light preserves the gameplay save');
   ok(await evalJS('(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core;s.cultivation.gear.carrier=true;s.cultivation.heart={where:"carried",health:100};s.time=0;return C.heartLight(s,{x:0,y:0,z:0})===0})()'),'sealed carrier protects the heart');
   eq(await evalJS('JSON.parse(localStorage.getItem("mte.faults")||"[]").length'),0,'lighting records no caught client faults');eq(pageErrors.length,0,'lighting has no browser exceptions');
   console.log('\n== Face lighting, equal-light seams, whole objects, and camera phases ==');
   const renderChecks=await evalJS(`(async()=>{
    const C=MTE_GAME.core,s=C.deserialize(C.serialize(MTE_GAME.getState())),{drawTerrain,onGround}=await import('./src/game/render/terrain.js'),L=await import('./src/game/render/lighting.js'),{createCamera}=await import('./src/game/camera.js');
    s.world.props.clear();s.world.holes.clear();s.world.mods.clear();s.cultivation.lantern=false;s.flare=0;s.player={x:100,y:100,z:-2};
    for(let y=-16;y<16;y++)for(let x=-16;x<16;x++){C.tileAt(s.world,x,y,-2);const i=C.chunkIndex(x,y);s.world.hotChunk.type[i]=C.T.SOIL;s.world.hotChunk.rich[i]=1;C.markExplored(s.world,x,y,-2);}
    for(let y=1;y<=3;y++)for(let x=-3;x<=3;x++)C.setRichness(s.world,x,y,-2,0);
    s.world.props.set(C.packKey(0,1,-2),'lamp');
    const c=document.createElement('canvas');c.width=641;c.height=393;const g=c.getContext('2d'),cam=createCamera(c);Object.assign(cam,{width:641,height:393,baseTilePx:96,x:.5,y:1.5,z:-2});cam.setZoom(1);
    const ground={yard:{piles:new Map(),covered:new Set()},built:new Set(),shake:()=>0},pixel=(x,y)=>Array.from(g.getImageData(Math.round(x),Math.round(y),1,1).data),phases=[];
    for(const phase of [0,.125,.375,.75]){cam.x=.5+phase/96;cam.y=1.5+phase/96;g.clearRect(0,0,c.width,c.height);drawTerrain(g,cam,s,MTE_GAME.look,ground);const p=cam.project(0,0,-1);phases.push({lit:pixel(p.x+48,p.y+10)[0],dark:pixel(p.x+48,p.y-10)[0],face:pixel(p.x+48,p.y+cam.depthPx+15)[0]});}
    const raised=c.toDataURL();
    // Constant white artwork makes even a one-pixel bright seam measurable.
    s.world.props.clear();for(let x=-10;x<=11;x++)C.setRichness(s.world,x,0,-2,0);s.world.props.set(C.packKey(-8,0,-2),'lamp');s.world.props.set(C.packKey(9,0,-2),'lamp');
    const seamPhases=[];for(const offset of [0,.125,.375,.75]){g.clearRect(0,0,c.width,c.height);const flat={...cam,tilePx:64,depthPx:64,project:(x,y)=>({x:(x+4)*64+offset,y:(y+1)*64+offset})};for(let x=-4;x<=5;x++){const p=flat.project(x,0),bounds=L.faceRect(g,p.x,p.y,65,65);g.fillStyle='#fff';g.fillRect(bounds.x,bounds.y,bounds.width,bounds.height);L.shadeFace(g,flat,s,x,0,bounds);}const interior=pixel(288,96)[0],edge=[];for(let x=317;x<=326;x++)edge.push(pixel(x,96)[0]);seamPhases.push({offset,interior,edge});}
    const seam=c.toDataURL();
    // One dim source tile, but a tall object crosses several unlit screen rows.
    const p=cam.project(.5,.5,-2),top=p.y-80,save=C.serialize(s);g.fillStyle='#294963';g.fillRect(0,0,c.width,c.height);
    const untouched=pixel(p.x+60,top+30),anchor=L.lightObject(g,cam,s,.5,.5,ctx=>{ctx.fillStyle='#fff';ctx.fillRect(p.x-10,top,20,80);return 42;});
    const objectPixels=[pixel(p.x,top+15)[0],pixel(p.x,top+40)[0],pixel(p.x,top+65)[0]],backgroundPreserved=JSON.stringify(untouched)===JSON.stringify(pixel(p.x+60,top+30));
    const dprObjects=[];for(const scale of [.75,1,1.5,2]){const c2=document.createElement('canvas');c2.width=Math.ceil(cam.width*scale);c2.height=Math.ceil(cam.height*scale);const g2=c2.getContext('2d');g2.setTransform(scale,0,0,scale,0,0);L.lightObject(g2,cam,s,.5,.5,ctx=>{ctx.fillStyle='#fff';ctx.fillRect(p.x-10,top,20,80);});dprObjects.push([15,40,65].map(d=>g2.getImageData(Math.round(p.x*scale),Math.round((top+d)*scale),1,1).data[0]));}
    // Foreground clipping must survive the temporary object surface.
    const savedAfterRender=save===C.serialize(s);C.setRichness(s.world,0,1,-2,1);g.fillStyle='#00ff00';g.fillRect(0,0,c.width,c.height);onGround(g,cam,s,.5,.98,ctx=>{ctx.fillStyle='#fff';ctx.fillRect(p.x-10,top,20,cam.height);},{lit:true});
    const wall=cam.project(0,1,-1),clipped=pixel(wall.x+48,wall.y+cam.depthPx/2)[1]===255;C.setRichness(s.world,0,1,-2,0);C.setRichness(s.world,0,0,-2,1);const contactLook={color:()=> '#ffffff',pick:()=>null};s.world.props.set(C.packKey(0,1,-2),'lamp');g.clearRect(0,0,c.width,c.height);drawTerrain(g,cam,s,contactLook,ground);const floor=cam.project(0,1,-2),contact=[2,6,14,25].map(d=>pixel(floor.x+48,floor.y+d)[0]);
    return {phases,seamPhases,objectPixels,dprObjects,backgroundPreserved,anchor,savePreserved:savedAfterRender,clipped,contact,raised,seam};})()`);
   ok(renderChecks.phases.every(p=>p.lit>50&&p.dark<20&&p.face>25),'raised top and south face use their own light at fractional camera positions on an odd viewport');
   ok(renderChecks.seamPhases.every(p=>Math.max(...p.edge)<=p.interior+2),'equal dim tiles have no bright shared stripe across camera phases');
   ok(Math.max(...renderChecks.objectPixels)-Math.min(...renderChecks.objectPixels)<=1,'tall dim object keeps one brightness across unrelated screen rows');
   ok(renderChecks.dprObjects.every(values=>values.every(n=>Math.abs(n-136)<=1)),'whole-object tint stays aligned at fractional and retina pixel densities');
   ok(renderChecks.backgroundPreserved&&renderChecks.anchor===42,'object tint leaves background and returned anchors intact');
   const spriteCache=await evalJS(`(async()=>{const L=await import('./src/game/render/lighting.js'),C=MTE_GAME.core,s=C.createState(581),cam={z:-2},source=document.createElement('canvas');source.width=16;source.height=16;const g=source.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,8,16);g.globalAlpha=.5;g.fillRect(8,0,8,16);
    const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const ctx=canvas.getContext('2d'),pic={img:source,aspect:1,units:1,cache:new Map()},before=MTE_GAME.look.lightingWork();
    for(let i=0;i<100;i++){ctx.clearRect(0,0,32,32);L.spriteLight(ctx,cam,s,100+i,100,c=>MTE_GAME.look.draw(c,pic,0,0,16,16));}
    const after=MTE_GAME.look.lightingWork(),dark=Array.from(ctx.getImageData(3,8,1,1).data),translucent=Array.from(ctx.getImageData(12,8,1,1).data);let unwound=false;
    try{L.spriteLight(ctx,cam,s,100,100,()=>{throw Error('fixture');});}catch{unwound=!L.hasSpriteLight(ctx);}
    const ink=L.spriteLight(ctx,cam,s,100,100,c=>L.litInk(c,'#ffffff'));return {dark,ink,alpha:translucent[3],builds:after.tintBuilds-before.tintBuilds,hits:after.tintHits-before.tintHits,unwound};})()`);
   ok(spriteCache.builds===1&&spriteCache.hits===99,'one shaded bitmap serves a hundred independent static objects');
   ok(spriteCache.dark[0]>=15&&spriteCache.dark[0]<=18&&spriteCache.alpha===128,'static sprite tint preserves darkness and partial transparency');
   ok(spriteCache.unwound,'sprite-light scope is restored when drawing throws');
   ok(spriteCache.ink==='rgb('+spriteCache.dark.slice(0,3).join(',')+')','physical vector details share the bitmap tint');

   ok(renderChecks.contact[0]<renderChecks.contact[1]&&Math.abs(renderChecks.contact[2]-renderChecks.contact[3])<=2,'contact shadow fades out before the old rectangular strip');
   ok(renderChecks.savePreserved,'face and object rendering preserve the gameplay save');
   ok(renderChecks.clipped,'higher foreground rock still clips the lit object');
   for(const name of ['raised','seam'])fs.writeFileSync(path.join(SHOT_DIR,'fixed-'+name+'.png'),Buffer.from(renderChecks[name].split(',')[1],'base64'));
   delete renderChecks.raised;delete renderChecks.seam;fs.writeFileSync(path.join(SHOT_DIR,'render-checks.json'),JSON.stringify(renderChecks,null,2));

   console.log((failures?'LIGHT BROWSER FAILURES':'LIGHT BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_INTERACTION_ONLY==='1'){
   console.log('\n== Approach before world actions ==');
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false},session);await sleep(200);
   // Funded, flat input fixture; not a fair-play seed or win evaluation.
   await evalJS(`(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core;MTE_GAME.wiki.setMode('quiet');s.player={x:.5,y:.5,z:0};s.tools.pickaxe=2;for(const r of C.RESOURCES)C.earn(s,r,100,'hand');
    for(let y=-5;y<=5;y++)for(let x=-5;x<=8;x++){C.tileAt(s.world,x,y,0);s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.GRASS;C.markExplored(s.world,x,y,0);}
    C.tileAt(s.world,4,0,0);s.world.hotChunk.type[C.chunkIndex(4,0)]=C.T.STONE;C.setRichness(s.world,4,0,0,20);MTE_GAME.setPlayer(.5,.5);MTE_GAME.setZoom(1.5);})()`);await sleep(500);
   async function worldTap(x,y){const p=await evalJS('MTE_GAME.project('+x+'+.5,'+y+'+.5,MTE_GAME.getState().player.z)');await tap(p.x,p.y);}
   const before=await evalJS('MTE_GAME.getState().inv.stone');await worldTap(4,0);
   eq(await evalJS('MTE_GAME.getState().inv.stone'),before,'distant gathering pays nothing before approach');
   ok(await waitFor('MTE_GAME.getState().inv.stone>'+before,5000),'one world tap approaches and gathers');
   ok(await evalJS('MTE_GAME.core.atInteraction(MTE_GAME.getState(),4,0)'),'gathering finishes in physical contact');
   await evalJS('MTE_GAME.setPlayer(.5,.5);MTE_GAME.startPlacing({kind:"shelter"})');await sleep(500);await worldTap(4,2);
   const costBefore=await evalJS('({...MTE_GAME.getState().inv})');const go=await rect('#placeCard [data-do=go]');await tap(go.x,go.y);
   eq(await evalJS('MTE_GAME.getState().inv.stone'),costBefore.stone,'distant construction does not spend before approach');
   ok(await waitFor('!!MTE_GAME.core.cultivationAt(MTE_GAME.getState(),4,2)',5000),'one placement confirmation walks over and builds');
   ok(await evalJS('MTE_GAME.core.atInteraction(MTE_GAME.getState(),4,2)&&document.getElementById("placeCard").hidden&&document.getElementById("buildingCard").hidden'),'construction finishes beside the site and returns directly to play');
   await evalJS('MTE_GAME.setPlayer(.5,.5)');await sleep(500);await worldTap(4,2);
   ok(await evalJS('document.getElementById("buildingCard").hidden'),'a distant building card stays closed during approach');
   ok(await waitFor('!document.getElementById("buildingCard").hidden',5000),'selecting a distant building opens its card on arrival');
   await evalJS('document.getElementById("btnClose").click();MTE_GAME.setPlayer(.5,.5);MTE_GAME.getState().extractors.push({key:"garden",res:"mycelium",x:4,y:-2,z:0,buffer:5})');await sleep(500);
   const goodsBefore=await evalJS('MTE_GAME.getState().inv.mycelium');await worldTap(4,-2);
   eq(await evalJS('MTE_GAME.getState().inv.mycelium'),goodsBefore,'a distant producer yields nothing before approach');
   ok(await waitFor('MTE_GAME.getState().inv.mycelium>'+goodsBefore,5000),'one distant producer selection approaches and collects it');
   ok(await evalJS('MTE_GAME.core.atInteraction(MTE_GAME.getState(),4,-2)&&!document.getElementById("buildingCard").hidden'),'producer card opens beside the collected building');
   await evalJS('document.getElementById("btnClose").click();MTE_GAME.setPlayer(.5,.5);const s=MTE_GAME.getState(),C=MTE_GAME.core;s.extractors=[];C.tileAt(s.world,4,-2,0);s.world.hotChunk.type[C.chunkIndex(4,-2)]=C.T.CAVE');await sleep(500);await worldTap(4,-2);
   eq(await evalJS('MTE_GAME.getState().player.z'),0,'ladder/cave selection does not change layer at a distance');
   ok(await waitFor('MTE_GAME.getState().player.z<0',5000),'one selection approaches and uses the way between layers');
   eq(await evalJS('JSON.parse(localStorage.getItem("mte.faults")||"[]").length'),0,'approach interactions record no client faults');eq(pageErrors.length,0,'approach interactions have no browser exceptions');
   console.log((failures?'INTERACTION BROWSER FAILURES':'INTERACTION BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_CHARACTER_INPUT_ONLY==='1'){
   console.log('\n== Characters do not intercept world gestures ==');
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false},session);
   ok(await evalJS('(async()=>!!await MTE_GAME.look.rigReady)()'),'real Mica and Wiki rig is ready');
   // Isolated input fixture: a flat, clear neighborhood avoids random terrain
   // blocking movement. This is not a gameplay/win evaluation.
   await evalJS(`(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core,p=s.player;for(let y=Math.floor(p.y)-5;y<=p.y+5;y++)for(let x=Math.floor(p.x)-5;x<=p.x+5;x++){C.tileAt(s.world,x,y,p.z);s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.GRASS;C.markExplored(s.world,x,y,p.z);}MTE_GAME.setZoom(2);})()`);await sleep(800);
   await evalJS(`(async()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core;MTE_GAME.wiki.setMode('quiet');s.tools.pickaxe=1;MTE_GAME.setZoom(2);
    const base={...s.player};window.__characterBase=base;
    const {drawPlayer}=await import('./src/game/render/sprites.js'),c=document.createElement('canvas');c.width=1024;c.height=768;
    const u=MTE_GAME.tilePx(),cam={tilePx:u,depthPx:u*Math.cos(MTE_GAME.pitch()),z:base.z,project:MTE_GAME.project};
    const at=drawPlayer(c.getContext('2d'),cam,s,MTE_GAME.look,{facing:{x:0,y:1},moving:false,actor:{act:null,t:0,clock:performance.now()/1000,rigStride:0,walkBlend:0},wiki:MTE_GAME.wiki.pose()});
    const foot=MTE_GAME.project(base.x,base.y,base.z),points={Mica:{x:foot.x,y:foot.y-u*.45},Wiki:{x:at.wiki.x,y:at.wiki.y+at.wiki.r*.6}};
    for(const p of Object.values(points)){const w=MTE_GAME.unproject(p.x,p.y),x=Math.floor(w.x),y=Math.floor(w.y);C.markExplored(s.world,x,y,base.z);C.tileAt(s.world,x,y,base.z);s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.STONE;C.setRichness(s.world,x,y,base.z,50);p.tile={x,y};}
    window.__characterPoints=points;})()`);await sleep(500);
   for(const name of ['Mica','Wiki']){
    const p=await evalJS('__characterPoints.'+name);
    await evalJS('MTE_GAME.wiki.setMode("off");MTE_GAME.wiki.setMode("quiet")');
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y},session);await sleep(500);
    const hover=await evalJS('({line:MTE_GAME.wiki.line,hidden:document.getElementById("inspectTooltip").hidden,text:document.getElementById("inspectTooltip").textContent,mode:MTE_GAME.wiki.mode})');
    ok((!hover.line||hover.line.kind==='wiki.hello')&&hover.hidden,name+' hover has no character response (automatic greeting allowed)');
    for(const method of ['mouse','touch']){
     await sleep(400);const before=await evalJS('MTE_GAME.getState().inv.stone');
     if(method==='mouse'){await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:p.x,y:p.y},session);await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:p.x,y:p.y},session);}else await tap(p.x,p.y);
     ok(await waitFor('MTE_GAME.getState().inv.stone>'+before,1500),method+' quick gesture through '+name+' gathers the underlying resource');
    }
    for(const method of ['mouse','touch']){
     if(method==='mouse')await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:p.x,y:p.y},session);else await touch('touchStart',[{x:p.x,y:p.y,id:1}]);
     await sleep(650);ok(await evalJS('MTE_GAME.wiki.line?.kind==="tile.stone"&&!MTE_GAME.wiki.focus?.mica'),method+' long gesture through '+name+' inspects only world contents');
     if(method==='mouse')await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:p.x,y:p.y},session);else await touch('touchEnd',[]);
    }
    for(const method of ['mouse','touch']){
     await evalJS('MTE_GAME.setPlayer(__characterBase.x,__characterBase.y)');await sleep(300);
     const before=await evalJS('({...MTE_GAME.getState().player})');
     if(method==='mouse'){await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:p.x,y:p.y},session);await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:p.x+50,y:p.y},session);}else{await touch('touchStart',[{x:p.x,y:p.y,id:1}]);await touch('touchMove',[{x:p.x+50,y:p.y,id:1}]);}
     await sleep(450);const after=await evalJS('({...MTE_GAME.getState().player})');
     if(method==='mouse')await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:p.x+50,y:p.y},session);else await touch('touchEnd',[]);
     ok(Math.hypot(after.x-before.x,after.y-before.y)>.05,method+' drag starting on '+name+' steers normally');
    }
    await evalJS('MTE_GAME.setPlayer(__characterBase.x,__characterBase.y)');
    // Quiet mode still lets a world answer linger; switch off/on to clear it.
    await evalJS('MTE_GAME.wiki.setMode("off");MTE_GAME.wiki.setMode("quiet")');await sleep(300);
   }
   await evalJS('MTE_GAME.wiki.setMode("off")');const p=await evalJS('__characterPoints.Mica');await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y},session);await sleep(600);
   ok(await evalJS('!document.getElementById("inspectTooltip").hidden&&document.getElementById("inspectTooltip").textContent.includes(MTE_GAME.core.TILE_NAME[MTE_GAME.core.T.STONE])'),'world hover information passes through Mica when tooltips are enabled');
   ok(await evalJS('!document.getElementById("wikiChalk")&&!("asking" in MTE_GAME.wiki)&&!("place" in MTE_GAME.wiki)'),'character drag overlay, ask mode and hit-anchor API are removed');
   eq(await evalJS('JSON.parse(localStorage.getItem("mte.faults")||"[]").length'),0,'character gesture checks record no client faults');eq(pageErrors.length,0,'character gesture checks have no browser exceptions');
   console.log((failures?'CHARACTER INPUT FAILURES':'CHARACTER INPUT PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_HELP_ONLY==='1'){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:375,height:667,deviceScaleFactor:1,mobile:false},session);
   await sleep(150);
   eq(await evalJS("document.querySelector('.chip .ic').getBoundingClientRect().width"),28,'phone resource icons remain 28px');
   const chip=await evalJS("(()=>{const r=document.querySelector('.chip[data-res]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:chip.x,y:chip.y},session);await waitFor("!document.getElementById('inspectTooltip').hidden",2000);
   ok(await evalJS("!document.getElementById('inspectTooltip').hidden&&document.getElementById('inspectTooltip').textContent.includes(MTE_GAME.core.RESOURCE_LABEL.mycelium)"),'hover explains the resource');
   ok(await evalJS("getComputedStyle(document.getElementById('inspectTooltip')).pointerEvents==='none'"),'tooltip cannot intercept game input');
   await shot('hud-resource-tooltip.png');
   await evalJS("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
   ok(await evalJS("document.getElementById('inspectTooltip').hidden"),'Escape dismisses inspection');
   await evalJS("document.getElementById('btnSettings').focus()");await sleep(60);
   ok(await evalJS("!document.getElementById('inspectTooltip').hidden&&document.getElementById('btnSettings').getAttribute('aria-describedby').includes('inspectTooltip')"),'keyboard focus exposes accessible control information');
   await evalJS("document.getElementById('btnSettings').blur()");
   ok(await evalJS("!document.getElementById('btnSettings').hasAttribute('aria-describedby')"),'focus exit restores accessible description');
   await evalJS("(()=>{const a=document.querySelector('.chip[data-res]');a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:100,clientY:40}));})()");await sleep(650);
   ok(await evalJS("!document.getElementById('inspectTooltip').hidden"),'passive touch hold opens resource inspection');
   ok(await evalJS("(()=>{const a=document.querySelector('.chip[data-res]');a.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));return !a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));})()"),'inspection hold consumes its click');
   await evalJS("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false},session);await sleep(100);
   eq(await evalJS("document.querySelector('.chip .ic').getBoundingClientRect().width"),32,'desktop resource icons remain 32px');
   const cell=await evalJS("(()=>{const s=MTE_GAME.getState(),x=Math.floor(s.player.x),y=Math.floor(s.player.y);return MTE_GAME.project(x+.5,y+.5,s.player.z);})()");
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cell.x,y:cell.y},session);await waitFor("!document.getElementById('inspectTooltip').hidden",2000);
   ok(await evalJS("!document.getElementById('inspectTooltip').hidden"),'explored world terrain is inspectable');
   const micaPoint=await evalJS("(()=>{const s=MTE_GAME.getState(),p=s.player,h=p.z+MTE_GAME.core.tileHeight(s.world,Math.floor(p.x),Math.floor(p.y),p.z),v=MTE_GAME.project(p.x,p.y,h);return {x:v.x,y:v.y-MTE_GAME.tilePx()*.4};})()");
   await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:micaPoint.x,y:micaPoint.y},session);await sleep(500);
   ok(await evalJS("document.getElementById('inspectTooltip').hidden||!document.getElementById('inspectTooltip').textContent.includes(MTE_GAME.core.LOOK['character.wanderer'].does)"),'Mica has no character hover tooltip');
   eq(pageErrors.length,0,'inspection has no browser exceptions');
   console.log((failures?'HELP BROWSER FAILURES':'HELP BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_RESOURCE_ONLY==='1'){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false},session);
   const result=await evalJS(`(async()=>{
    const T=await import('./src/vendor/three/three.module.js'),{createResourceModel,resourceCamera,resourceSVG,createResourcePile,resourcePileSVG,RESOURCE_MODEL_KEYS}=await import('./src/game/render/resource-models.js');
    const c=document.createElement('canvas');c.width=1440;c.height=1100;c.id='__resourceReview';c.style='position:fixed;inset:0;z-index:99999;width:1440px;height:1100px';document.body.append(c);const g=c.getContext('2d');g.fillStyle='#b69b6a';g.fillRect(0,0,1440,1100);g.font='22px system-ui';g.fillStyle='#1d1712';g.fillText('Shared 3D resource models → flat vector game art',25,30);
    const renderer=new T.WebGLRenderer({alpha:true,antialias:true});renderer.setSize(256,256,false);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
    const scene=new T.Scene(),camera=resourceCamera(),stats=[],svgPixels=[];const image=async(svg,x,y,w,h)=>{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();g.drawImage(img,x,y,w,h);const probe=document.createElement('canvas');probe.width=probe.height=32;const pg=probe.getContext('2d');pg.drawImage(img,0,0,32,32);const pixels=pg.getImageData(0,0,32,32).data;let n=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>128)n++;svgPixels.push(n);};
    for(let i=0;i<4;i++){
     const key=RESOURCE_MODEL_KEYS[i],x=180+i*360,asset=createResourceModel(key);scene.add(asset.root);renderer.render(scene,camera);g.drawImage(renderer.domElement,x-128,70,256,256);
     const bounds=new T.Box3().setFromObject(asset.root);stats.push({key,depth:bounds.max.z-bounds.min.z,meshes:asset.root.children.length});scene.remove(asset.root);
     g.fillStyle='#1d1712';g.font='19px system-ui';g.fillText(key==='ore'?'Metal (ore)':key,x-100,55);g.fillText('3D source',x-55,330);
     const icon=createResourceModel(key,{form:'icon'}),svg=resourceSVG(icon,{view:'icon'});icon.dispose();await image(svg,x-96,370,192,192);await image(svg,x-16,580,32,32);g.fillText('Vector finish / 32px icon',x-110,645);asset.dispose();
     const worldId=['pile.mycelium','tile.stone','tile.ore','tile.crystal'][i],pic=i===0?MTE_GAME.look.tier(worldId,0):MTE_GAME.look.pick(worldId,'stand');MTE_GAME.look.stand(g,pic,x,960,170);g.fillText('Actual world asset',x-85,1005);
    }
    // Resource art must be legible as opaque shapes, including nested SVG uses.
    const pile=createResourcePile('mycelium',3),p=resourcePileSVG(pile,{width:196,height:179});await image(p,0,0,1,1);pile.dispose();renderer.dispose();return {stats,svgPixels};
   })()`);
   eq(result.stats.length,4,'four resource source models load');ok(result.stats.every(s=>s.depth>.1&&s.meshes>0),'all four are actual volumetric geometry');
   ok(result.svgPixels.every(n=>n>40),'finished vector resources contain readable opaque shapes at 32px');
   await shot('resource-models-review.png');
   const beforeIcons=process.env.MTE_ICON_BEFORE_DIR?['mycelium','stone','ore','crystal'].map(k=>'data:image/svg+xml;base64,'+fs.readFileSync(path.join(process.env.MTE_ICON_BEFORE_DIR,k+'.svg')).toString('base64')):null;
   await evalJS(`(async()=>{const before=${JSON.stringify(beforeIcons)},keys=['mycelium','stone','ore','crystal'],c=document.getElementById('__resourceReview'),g=c.getContext('2d');g.fillStyle='#eee6d4';g.fillRect(0,0,1440,1100);g.font='22px system-ui';g.fillStyle='#1d1712';g.fillText('Resource icon readability — actual display sizes',25,35);
    const old=[];if(before)for(const src of before){const img=new Image();img.src=src;await img.decode();old.push(img);}
    for(let i=0;i<4;i++){const x=180+i*360;g.fillStyle='#1d1712';g.font='20px system-ui';g.fillText(keys[i],x-60,80);g.font='16px system-ui';g.fillText(before?'Before          Now':'Current',x-90,110);}
    for(let r=0;r<4;r++){const size=[24,32,48,128][r],y=200+r*240,bg=r%2?'#24312b':'#b69b6a';g.fillStyle=bg;g.fillRect(0,y-55,1440,190);g.fillStyle=r%2?'#eee6d4':'#1d1712';g.font='16px system-ui';g.fillText(size+'px'+(r===3?' · enlargement for diagnosis':''),20,y-25);
     for(let i=0;i<4;i++){const x=180+i*360;if(before)g.drawImage(old[i],x-80-size/2,y,size,size);MTE_GAME.look.draw(g,MTE_GAME.look.pick('resource.'+keys[i],'icon'),x+(before?65:0)-size/2,y,size,size);}}
   })()`);
   await shot('icon-readability.png');
   const pileCheck=await evalJS(`(async()=>{const {createResourcePile,resourcePileSVG,RESOURCE_MODEL_KEYS}=await import('./src/game/render/resource-models.js');const c=document.getElementById('__resourceReview'),g=c.getContext('2d');g.fillStyle='#b69b6a';g.fillRect(0,0,1440,1100);g.fillStyle='#1d1712';g.font='20px system-ui';g.fillText('Same models: representative stockpile magnitudes',25,30);let drawn=0;
    for(let r=0;r<4;r++)for(let j=0;j<4;j++){const key=RESOURCE_MODEL_KEYS[r],tier=[0,1,2,3][j],asset=createResourcePile(key,tier),img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(resourcePileSVG(asset,{width:180,height:150}));await img.decode();g.drawImage(img,55+j*350,70+r*250,180,150);g.fillStyle='#1d1712';g.fillText(key+' · tier '+tier,55+j*350,240+r*250);asset.dispose();drawn++;}return drawn;})()`);
   eq(pileCheck,16,'all resource families render nested stockpile symbols');await shot('resource-stockpile-review.png');
   await evalJS("document.getElementById('__resourceReview').remove();MTE_GAME.setZoom(1.8)");await sleep(300);await shot('resources-in-world.png');eq(pageErrors.length,0,'resource models and vector sprites have no browser exceptions');console.log((failures?'RESOURCE BROWSER FAILURES':'RESOURCE BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_PICKAXE_ONLY==='1'){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1150,deviceScaleFactor:1,mobile:false},session);
    const result=await evalJS(`(async()=>{
     const rig=await MTE_GAME.look.rigReady;if(!rig)throw Error(MTE_GAME.look.rigError||'No rig');
     const {renderPickaxeIcons}=await import('./src/game/render/pickaxe-model.js');const icons=renderPickaxeIcons();
     const c=document.createElement('canvas');c.width=1440;c.height=1150;c.id='__pickReview';c.style='position:fixed;inset:0;z-index:99999;width:1440px;height:1150px';document.body.append(c);const g=c.getContext('2d');g.fillStyle='#293232';g.fillRect(0,0,1440,1150);g.font='20px system-ui';g.fillStyle='#eee7d5';g.fillText('Same model: held pickaxes and baked tier icons',30,30);
     const tiers=[];let maxToolDrawCalls=0;for(let i=0;i<6;i++){const x=120+i*240;g.fillStyle='#eee7d5';g.fillText('Tier '+(i+1),x-40,70);rig.draw(g,x,340,220,{pickaxe:i+1,facing:{x:1,y:1}});tiers.push(rig.inspect().pickaxe);maxToolDrawCalls=Math.max(maxToolDrawCalls,rig.stats.drawCalls);const img=new Image();img.src=icons[i];await img.decode();g.drawImage(img,x-70,370,140,140);}
     const v=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];const grips=[];
     for(let i=0;i<8;i++){const x=90+i*180;rig.draw(g,x,790,190,{pickaxe:4,facing:{x:v[i][0],y:v[i][1]},action:'swing',progress:.55});grips.push(rig.inspect().pickaxe);}
     const phases=[.12,.30,.48,.65,.85];for(let i=0;i<phases.length;i++)rig.draw(g,150+i*280,1130,200,{pickaxe:4,facing:{x:1,y:1},action:'swing',progress:phases[i]});
     rig.draw(g,-1000,-1000,100,{pickaxe:4,action:'pick'});const stowed=rig.inspect().pickaxe;maxToolDrawCalls=Math.max(maxToolDrawCalls,rig.stats.drawCalls);
     const {drawPlayer}=await import('./src/game/render/sprites.js'),state=MTE_GAME.getState(),before=JSON.stringify(state),cam={tilePx:160,depthPx:80,z:state.player.z,project:()=>({x:-1000,y:-1000})},view={facing:{x:1,y:0},moving:false,device:null,actor:{act:'swing',t:.15,clock:0,stride:0,rigStride:0,walkBlend:0}};
     drawPlayer(g,cam,{...state,tools:{...state.tools,pickaxe:4}},MTE_GAME.look,view);const integrated=rig.inspect().pickaxe;
     drawPlayer(g,cam,{...state,tools:{...state.tools,pickaxe:0}},MTE_GAME.look,view);
     return {maxToolDrawCalls,icons,tiers,grips,stowed,integrated,unchanged:before===JSON.stringify(state),empty:rig.inspect().pickaxe,stats:rig.stats};
    })()`);
    eq(result.icons.length,6,'all six icons are baked from the shared model');eq(new Set(result.icons).size,6,'every tier has a distinct rendered silhouette');
    ok(result.tiers.every((t,i)=>t.tier===i+1),'earned tiers select matching held models');
    ok(result.grips.every(t=>t.grip.every((n,i)=>Math.abs(n-t.socket[i])<1e-9)),'all eight swings keep the tool attached to its grip socket');
    ok(result.grips.every(t=>Math.hypot(...t.grip.map((n,i)=>n-t.hand[i]))<.04),'grip stays inside the palm rather than floating beside the character');
    eq(result.stowed.stowed,true,'hand gathering stows the pickaxe');eq(result.integrated?.tier,4,'the shipped player renderer selects actual earned equipment');eq(result.unchanged,true,'rendering never changes inventory or save state');eq(result.empty,null,'empty-handed character has no pickaxe');ok(result.maxToolDrawCalls<=64,'held tool remains within the draw-call budget');
    await shot('pickaxe-model-review.png');
    await evalJS(`(async()=>{const rig=await MTE_GAME.look.rigReady,c=document.getElementById('__pickReview'),g=c.getContext('2d');g.fillStyle='#293232';g.fillRect(0,0,1440,1150);g.font='20px system-ui';g.fillStyle='#eee7d5';g.fillText('Back holster: free hands while gathering, climbing and celebrating',30,35);
     const v=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
     for(let i=0;i<8;i++)rig.draw(g,180+i%4*360,480+Math.floor(i/4)*500,330,{pickaxe:4,facing:{x:v[i][0],y:v[i][1]},action:i<4?'pick':'up',progress:.5});})()`);
    await shot('pickaxe-stow-review.png');

    if(process.env.MTE_EXPORT_PICKAXE_ICONS==='1'){
     const paths=['icons/pickaxe.svg',...Array.from({length:5},(_,i)=>'cultivation/pickaxe-'+(i+2)+'.svg')];
     for(let i=0;i<6;i++)fs.writeFileSync(path.join(ROOT,'packs/default',paths[i]),'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><!-- Generated from src/game/render/pickaxe-model.js; do not hand-edit. --><image width="64" height="64" href="'+result.icons[i]+'"/></svg>\n');
     const source='src/game/render/pickaxe-model.js',sha=p=>createHash('sha256').update(fs.readFileSync(path.join(ROOT,p))).digest('hex');
     fs.writeFileSync(path.join(ROOT,'art/characters/pickaxe-model.json'),JSON.stringify({format:1,source,sourceSha256:sha(source),render:'192x192 transparent PNG inside 64x64 SVG; same flat model as held equipment',assets:paths.map((p,i)=>({tier:i+1,file:'packs/default/'+p,sha256:sha('packs/default/'+p)}))},null,2)+'\n');

    }
    eq(pageErrors.length,0,'pickaxe rendering has no browser exceptions');console.log((failures?'PICKAXE BROWSER FAILURES':'PICKAXE BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_LAYER_ONLY==='1'){
   console.log('\n== Ground/character compositing');
   await evalJS(`(async()=>{
    const [{createCamera},{render},{drawTerrain,onGround},{drawPlayer},{drawLighting}]=await Promise.all([import('./src/game/camera.js'),import('./src/game/render/renderer.js'),import('./src/game/render/terrain.js'),import('./src/game/render/sprites.js'),import('./src/game/render/overlay.js')]);
    const C=MTE_GAME.core,rig=await MTE_GAME.look.rigReady;if(!rig)throw Error('No character rig');
    const state=C.createState(91385);state.emptyStart=true;state.cultivation=null;state.extractors=[];state.world.props.clear();state.world.holes.clear();
    for(let y=-12;y<=12;y++)for(let x=-12;x<=12;x++){C.markExplored(state.world,x,y,0);C.tileAt(state.world,x,y,0);}
    for(const chunk of state.world.chunks.values())chunk.type.fill(C.T.GRASS);
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;canvas.id='__layerReview';document.body.append(canvas);
    const cam=createCamera(canvas);cam.width=800;cam.height=600;cam.baseTilePx=64;
    const reference=document.createElement('canvas');reference.width=800;reference.height=600;
    const look={...MTE_GAME.look,rig: MTE_GAME.look.rig,pick:(id,slot,...args)=>['stand','cut'].includes(slot)&&id.startsWith('tile.')?null:MTE_GAME.look.pick(id,slot,...args)};
    const yard={piles:new Map(),covered:new Set(),merging:()=>[]},fx={particles:[],floats:[],flyers:[],shake:()=>0};
    const view={facing:{x:0,y:1},moving:true,actor:{act:null,t:0,clock:0,rigStride:0,walkBlend:1},yard,sign:0,joy:{active:false},friends:[],graves:[],buildTargets:[],trailTargets:[]};
    window.__layers={C,state,canvas,reference,cam,look,yard,fx,view,render,drawTerrain,drawPlayer,drawLighting,onGround};
   })()`);
   for(const zoom of [.75,2,3])for(const dir of [-1,1]){
    const result=await evalJS(`(()=>{const a=__layers,{state,canvas,reference,cam,look,yard,fx,view}=a;cam.setZoom(${zoom});view.facing={x:0,y:${dir}};let mismatch=0,samples=0;
     for(const [i,y] of [.86,.94,.985,.999,1.001,1.015,1.06,1.14].entries()){
      state.player.x=.5;state.player.y=y;view.actor.rigStride=i/8;view.actor.clock=i/60;
      a.render(cam,state,fx,view,look);
      const full=cam.ctx.getImageData(0,0,800,600).data,ctx=reference.getContext('2d'),rc={...cam,ctx};ctx.clearRect(0,0,800,600);ctx.fillStyle=look.color('color.backdrop');ctx.fillRect(0,0,800,600);
      a.drawTerrain(ctx,rc,state,look,{built:new Set(),yard,shake:()=>0},()=>{});
      a.drawPlayer(ctx,rc,state,look,view);ctx.globalAlpha=.35;a.drawPlayer(ctx,rc,state,look,{...view,shadow:false});ctx.globalAlpha=1;
      a.drawLighting(ctx,rc,state,look,[],null);
      const expected=ctx.getImageData(0,0,800,600).data,u=cam.tilePx,p=cam.project(state.player.x,state.player.y,0);
      for(let py=Math.floor(p.y-u*.25);py<=Math.ceil(p.y+u*.25);py++)for(let px=Math.floor(p.x-u*.6);px<=Math.ceil(p.x+u*.6);px++){
       const k=(py*800+px)*4;if(Math.max(...[0,1,2].map(c=>Math.abs(full[k+c]-expected[k+c])))>1)mismatch++;samples++;
      }
     }return {mismatch,samples};})()`);
    eq(result.mismatch,0,'complete feet and single shadow across row crossings, '+(dir<0?'north':'south')+', zoom '+zoom);
   }
   const picture=await evalJS("__layers.canvas.toDataURL('image/png').split(',')[1]");fs.writeFileSync(path.join(SHOT_DIR,'ground-layering.png'),Buffer.from(picture,'base64'));
   const wallImage=await evalJS(`(()=>{const a=__layers,{C,state,cam,look,view,yard,fx,reference}=a;cam.setZoom(2);state.player={x:.5,y:.985,z:0};view.facing={x:0,y:1};view.actor.rigStride=.2;
    C.tileAt(state.world,0,1,0);state.world.hotChunk.type[C.chunkIndex(0,1)]=C.T.WALL;
    a.render(cam,state,fx,view,look);const full=cam.ctx.getImageData(0,0,800,600).data,g=reference.getContext('2d'),rc={...cam,ctx:g};g.clearRect(0,0,800,600);g.fillStyle=look.color('color.backdrop');g.fillRect(0,0,800,600);
    a.drawTerrain(g,rc,state,look,{built:new Set(),yard,shake:()=>0},()=>{});g.globalAlpha=.35;a.drawPlayer(g,rc,state,look,{...view,shadow:false});g.globalAlpha=1;a.drawLighting(g,rc,state,look,[]);
    const ghost=g.getImageData(0,0,800,600).data;g.clearRect(0,0,800,600);a.drawPlayer(g,rc,state,look,{...view,shadow:false});const sprite=g.getImageData(0,0,800,600).data,q=cam.project(0,1,.5);let pixels=0,mismatch=0;
    for(let y=Math.ceil(q.y+2);y<Math.min(600,q.y+cam.depthPx);y++)for(let x=Math.ceil(q.x+2);x<q.x+cam.tilePx-2;x++){const k=(y*800+x)*4;if(sprite[k+3]<254)continue;pixels++;if([0,1,2].some(c=>Math.abs(full[k+c]-ghost[k+c])>1))mismatch++;}
    C.tileAt(state.world,0,1,0);state.world.hotChunk.type[C.chunkIndex(0,1)]=C.T.GRASS;return {pixels,mismatch};})()`);
   ok(wallImage.pixels>10&&wallImage.mismatch===0,'real foreground wall hides the body, leaving only the faint visibility pass');
   const masks=await evalJS(`(()=>{const a=__layers,{C,state,cam,canvas}=a,g=cam.ctx;cam.setZoom(2);state.player={x:.5,y:.96,z:0};cam.follow(state.player);
    const set=(x,y,z,type)=>{C.markExplored(state.world,x,y,z);C.tileAt(state.world,x,y,z);state.world.hotChunk.type[C.chunkIndex(x,y)]=type;};
    set(0,1,0,C.T.WALL);const q=cam.project(0,1,.5);g.fillStyle='#00ff00';g.fillRect(0,0,800,600);a.onGround(g,cam,state,.5,.96,()=>{g.fillStyle='#ff0000';g.fillRect(0,0,800,600);});
    const at=(x,y)=>Array.from(g.getImageData(Math.floor(x),Math.floor(y),1,1).data).slice(0,3).join(',');
    const raised=at(q.x+20,q.y+5)==='0,255,0',above=at(q.x+20,q.y-5)==='255,0,0';
    set(0,2,0,C.T.ROCK);const back=cam.project(0,2,C.tileHeight(state.world,0,2,0));g.fillStyle='#00ff00';g.fillRect(0,0,800,600);a.onGround(g,cam,state,.5,.96,()=>{g.fillStyle='#ff0000';g.fillRect(0,0,800,600);});const overlap=back.y+2<q.y+cam.depthPx&&at(q.x+20,back.y+2)==='0,255,0';set(0,2,0,C.T.GRASS);
    set(0,1,0,C.T.GRASS);g.fillStyle='#00ff00';g.fillRect(0,0,800,600);a.onGround(g,cam,state,.5,.96,()=>{g.fillStyle='#ff0000';g.fillRect(0,0,800,600);});const floor=at(400,305)==='255,0,0';
    cam.z=-1;set(0,0,-1,C.T.TUNNEL);state.world.explored.clear();C.markExplored(state.world,0,0,-1);const wall=cam.project(0,1,0);g.fillStyle='#00ff00';g.fillRect(0,0,800,600);a.onGround(g,cam,state,.5,.96,()=>{g.fillStyle='#ff0000';g.fillRect(0,0,800,600);});
    const unknown=at(wall.x+20,wall.y+5)==='0,255,0';return {raised,above,overlap,floor,unknown};})()`);
   ok(masks.raised&&masks.above,'higher foreground block hides only the overlapping part');ok(masks.overlap,'overlapping foreground masks leave no see-through hole');ok(masks.floor,'equal-height ground does not occlude the figure');ok(masks.unknown,'unexplored underground rock remains an opaque wall');
   eq(pageErrors.length,0,'layering fixtures have no browser exceptions');console.log((failures?'LAYER BROWSER FAILURES':'LAYER BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_WORK_ONLY==='1'){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:1800,height:1500,deviceScaleFactor:1,mobile:false},session);
   const work=await evalJS(`(async()=>{
    const rig=await MTE_GAME.look.rigReady;if(!rig)throw Error(MTE_GAME.look.rigError||'Rig unavailable');
    const c=document.createElement('canvas');c.id='__workReview';c.width=1800;c.height=1500;c.style='position:fixed;inset:0;z-index:99999;width:1800px;height:1500px';document.body.append(c);const g=c.getContext('2d');g.fillStyle='#b69b6a';g.fillRect(0,0,c.width,c.height);g.fillStyle='#1d1712';g.font='22px system-ui';g.fillText('Mica — actual equipment, constrained grips and complete work cycles',25,35);
    const cases=[['Mining',{action:'swing',pickaxe:4}],['Basket gathering',{action:'pick',basket:3,pickaxe:4}],['Bare-hand gathering',{action:'pick'}],['Manual construction',{action:'build',pickaxe:4,basket:3}],['Lantern control',{action:'collect',work:'lantern',lantern:true,lanternOn:true}]];
    for(let row=0;row<cases.length;row++)for(let col=0;col<6;col++){const progress=[0,.18,.32,.56,.72,.92][col],x=150+col*300,y=300+row*295;g.fillStyle='#1d1712';g.font='16px system-ui';g.fillText(cases[row][0]+' · '+progress,x-135,y-225);rig.draw(g,x,y,270,{...cases[row][1],progress,facing:{x:1,y:1}});}
    const grips=[];for(let i=0;i<8;i++){const angle=i*Math.PI/4;for(const progress of [.22,.32,.56,.72]){rig.draw(g,-1000,-1000,160,{pickaxe:4,action:'swing',progress,facing:{x:Math.cos(angle),y:Math.sin(angle)}});const p=rig.inspect();grips.push({right:Math.hypot(...p.pickaxe.grip.map((n,j)=>n-p.rightHand[j])),stats:rig.stats});}}
    rig.draw(g,-1000,-1000,160,{action:'build',progress:.5,pickaxe:4});const build=rig.inspect();rig.draw(g,-1000,-1000,160,{action:'pick',progress:.5,basket:5,pickaxe:6,lantern:true});const basket=rig.inspect(),maxStats=rig.stats;
    const basketContacts=[];for(const progress of [0,.18,.32,.56,.72,.92]){rig.draw(g,-1000,-1000,160,{action:'pick',progress,basket:3});const p=rig.inspect();basketContacts.push(Math.hypot(...p.basket.grip.map((n,j)=>n-p.leftHand[j])));}
    rig.draw(g,-1000,-1000,160,{action:'collect',work:'lantern',progress:.5,lantern:true});const lp=rig.inspect(),lanternContact=Math.hypot(...lp.lanternPosition.map((n,j)=>n-lp.leftHand[j]));
    rig.draw(g,-1000,-1000,160,{});const empty=rig.inspect();rig.draw(g,-1000,-1000,160,{action:'swing',progress:.06,pickaxe:4});const first=rig.inspect();rig.draw(g,-1000,-1000,160,{action:'collect',progress:.8,basket:3});rig.draw(g,-1000,-1000,160,{action:'swing',progress:.06,pickaxe:4});const repeated=rig.inspect();
    const orderError=Math.max(...first.pickaxe.grip.map((n,j)=>Math.abs(n-repeated.pickaxe.grip[j])),...first.leftHand.map((n,j)=>Math.abs(n-repeated.leftHand[j])));
    return {grips,build,basket,empty,maxStats,basketContacts,lanternContact,orderError};
   })()`);
   ok(work.grips.every(p=>p.right<.04),'mining keeps the driving grip inside the right palm throughout each stroke');
   ok(work.grips.every(p=>p.stats.drawCalls<=64&&p.stats.triangles<50000)&&work.maxStats.drawCalls<=64&&work.maxStats.triangles<50000,'working equipment fits existing GPU budgets');
   ok(work.build.pickaxe.stowed,'construction frees both hands instead of hammering with a pickaxe');
   ok(work.basket.basket?.held&&work.basket.pickaxe.stowed,'gathering holds the earned basket and stows the pickaxe');
   ok(work.basketContacts.every(d=>d<.04),'basket stays in the palm throughout reaching and recovery');
   ok(work.lanternContact<.2,'lantern gesture reaches the actual owned lantern, hand on its ring from outside');
   ok(work.orderError<1e-8,'work poses do not inherit joint rotations from the preceding action');
   ok(!work.empty.pickaxe&&!work.empty.basket&&!work.empty.lantern,'empty-handed worlds receive no visual equipment');
   await shot('tool-actions-review.png');
   if(process.env.MTE_RECORD_WORK==='1'){
    for(const [key,opts]of Object.entries({mining:{action:'swing',pickaxe:4,basket:3},foraging:{action:'pick',pickaxe:4,basket:3},building:{action:'build',pickaxe:4,basket:3},lantern:{action:'collect',work:'lantern',lantern:true,lanternOn:true}})){
     const frames=await evalJS(`(async()=>{const rig=await MTE_GAME.look.rigReady,c=document.getElementById('__workReview');c.width=960;c.height=600;const g=c.getContext('2d'),frames=[],opts=${JSON.stringify(opts)};
      for(let i=0;i<40;i++){g.fillStyle='#b69b6a';g.fillRect(0,0,960,600);g.fillStyle='#1d1712';g.font='22px system-ui';g.fillText('${key} — front, side and actual game scale',25,35);rig.draw(g,220,530,430,{...opts,progress:i/39,facing:{x:0,y:1}});rig.draw(g,610,530,430,{...opts,progress:i/39,facing:{x:1,y:0}});rig.draw(g,850,530,64,{...opts,progress:i/39,facing:{x:1,y:1}});frames.push(c.toDataURL().split(',')[1]);}return frames;})()`);
     const dir=path.join(SHOT_DIR,'work-frames',key);fs.mkdirSync(dir,{recursive:true});frames.forEach((f,i)=>fs.writeFileSync(path.join(dir,String(i).padStart(3,'0')+'.png'),Buffer.from(f,'base64')));console.log('  captured '+key+' motion review');
    }
   }
   await evalJS("document.getElementById('__workReview').remove()");
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:640,height:480,deviceScaleFactor:1,mobile:false},session);await sleep(150);
   await key('keyDown',' ','Space',32);const live=[];
   for(let i=0;i<70;i++){await sleep(80);live.push(await evalJS("(()=>{const s=MTE_GAME.getState(),p=MTE_GAME.look.rig.inspect().work;return {action:p.action,phase:p.progress,total:MTE_GAME.core.RESOURCES.reduce((n,r)=>n+s.inv[r],0)};})()"));}
   await key('keyUp',' ','Space',32);
   ok(live.at(-1).total>0,'normal held Gather earns resources in a fresh world without test grants');
   ok(live.some((s,i)=>s.action==='pick'&&s.phase>.72&&live.slice(i+1).some(n=>n.total>s.total)),'real repeated gathering completes recovery while further actions still succeed');
   await shot('work-in-live-game.png');
   eq(pageErrors.length,0,'work animations have no browser exceptions');console.log((failures?'WORK BROWSER FAILURES':'WORK BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_RIG_ONLY==='1'){
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1150,deviceScaleFactor:1,mobile:false},session);
    const review=await evalJS(`(async()=>{
      const rig=await MTE_GAME.look.rigReady;if(!rig)throw Error(MTE_GAME.look.rigError||'Rig unavailable');
      const {drawPlayer}=await import('./src/game/render/sprites.js');
      const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=1150;canvas.id='__rigReview';canvas.style='position:fixed;inset:0;z-index:99999;width:1440px;height:1150px';document.body.append(canvas);
      const g=canvas.getContext('2d'),look=MTE_GAME.look,base=MTE_GAME.getState();
      g.fillStyle='#293232';g.fillRect(0,0,1440,1150);g.font='20px system-ui';g.fillStyle='#eee7d5';g.fillText('Actual game renderer — articulated 3D wanderer',35,35);
      const dirs=['N','NE','E','SE','S','SW','W','NW'],v=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
      for(let i=0;i<12;i++){
        const row=Math.floor(i/4),col=i%4,x=180+col*360,y=345+row*365;
        const direction=i<8?v[i]:[1,0],phase=i<8?0:(i-8)/4;
        g.fillStyle='#eee7d5';g.fillText(i<8?dirs[i]+' · standing':['Contact A','Passing A','Contact B','Passing B'][i-8],x-100,y-275);
        g.strokeStyle='#8c998b';g.beginPath();g.moveTo(x-130,y);g.lineTo(x+130,y);g.stroke();
        drawPlayer(g,{tilePx:250,depthPx:125,z:base.player.z,project:()=>({x,y})},{...base,emptyStart:true,tools:{basket:0,pickaxe:0,boots:0,overclock:0},cultivation:null},look,{facing:{x:direction[0],y:direction[1]},moving:i>=8,sign:0,device:null,actor:{act:null,t:0,idle:0,clock:0,stride:phase,walking:i>=8}});
      }
      const pixels=g.getImageData(0,0,1440,1150).data;
      const probe=document.createElement('canvas');probe.width=256;probe.height=256;const pg=probe.getContext('2d');rig.draw(pg,128,240,160,{facing:{x:1,y:0},phase:.25,walking:true});const alpha=pg.getImageData(0,0,256,256).data;let opaque=0;const orange=new Map();let orangePixels=0;
      for(let i=0;i<alpha.length;i+=4){if(alpha[i+3]>128)opaque++;if(alpha[i+3]===255&&alpha[i]>100&&alpha[i]>alpha[i+1]*1.5&&alpha[i+1]>alpha[i+2]*1.4){const rgb=alpha[i]+','+alpha[i+1]+','+alpha[i+2];orange.set(rgb,(orange.get(rgb)||0)+1);orangePixels++;}}
      const flatPixels=[...orange.values()].sort((a,b)=>b-a).slice(0,1).reduce((a,b)=>a+b,0);
      const paintedFacing=[];
      for(const [dx,dy] of v){pg.clearRect(0,0,256,256);rig.draw(pg,128,240,160,{facing:{x:dx,y:dy},phase:.25,walking:true});const data=pg.getImageData(0,0,256,256).data;let paint=0;for(let i=0;i<data.length;i+=4)if(data[i]===200&&data[i+1]===116&&data[i+2]===58&&data[i+3]===255)paint++;paintedFacing.push(paint);}
      // Leave the tested passing pose facing east for the joint assertion.
      rig.draw(pg,128,240,160,{facing:{x:1,y:0},phase:.25,walking:true});
      return {paintedFacing,stats:rig.stats,pixels:opaque>1000,flatPalette:orangePixels>500&&flatPixels/orangePixels>.80,pose:rig.inspect()};
    })()`);
    ok(review.flatPalette,'cloth is predominantly one flat painted fill');ok(review.paintedFacing.every(n=>n>500),'world-palette orange stays unchanged across all eight headings');ok(review.stats.bones>=21,'character includes four articulated cloak panels');ok(review.stats.renders>=12,'all orientations and both gait halves render');ok(review.pixels,'WebGL output contains an opaque character silhouette');ok(review.stats.drawCalls<=64,'rig stays within the draw-call budget');ok(review.stats.triangles<50000,'rig stays within the geometry budget');ok(review.pose.rightFoot[1]>review.pose.leftFoot[1]+.05,'rendered bone hierarchy lifts the opposite foot at passing');eq(review.stats.lost,false,'WebGL context remains healthy');
    // Heat: Mica seen through a wall in front is the picture already rendered
    // this frame, never a second 3D render.
    const once=await evalJS(`(()=>{const rig=MTE_GAME.look.rig,z=MTE_GAME.zoom();MTE_GAME.setZoom(1);MTE_GAME.bench(1);const r=rig.stats.renders,u=rig.stats.reused;MTE_GAME.bench(4);MTE_GAME.setZoom(z);return {renders:rig.stats.renders-r,reused:rig.stats.reused-u};})()`);
    eq(once.renders,4,'Mica is rendered in 3D once per frame');ok(once.reused>=4,'the faint figure behind walls reuses that render');
    // Wiki rides the same rig: drawn on the hood in its own teal, above Mica's
    // head, turning toward what it looks at and folding its cap.
    const wikiReview=await evalJS(`(async()=>{
      const rig=await MTE_GAME.look.rigReady,c=document.createElement('canvas');c.width=256;c.height=320;const g=c.getContext('2d');
      const at=rig.draw(g,128,300,160,{facing:{x:0,y:1},time:1,wiki:{look:{x:1,y:0}}}),open=rig.inspect().wiki,d=g.getImageData(0,0,256,320).data;let teal=0;
      for(let i=0;i<d.length;i+=4)if(d[i]===127&&d[i+1]===230&&d[i+2]===196&&d[i+3]===255)teal++;
      g.clearRect(0,0,256,320);rig.draw(g,128,300,160,{facing:{x:0,y:1},time:1,wiki:{fold:1}});const shut=rig.inspect().wiki;
      rig.draw(g,128,300,160,{facing:{x:0,y:1},time:1});const hidden=rig.inspect().wiki;
      return {teal,open,shut,hidden,above:at.wiki&&at.wiki.y<at.top,game:!!MTE_GAME.wiki&&MTE_GAME.wiki.mode};
    })()`);
    ok(wikiReview.teal>150,'Wiki is drawn on the hood in its flat teal ('+wikiReview.teal+' px)');ok(wikiReview.above,'Wiki sits above Mica\'s head');
    ok(Math.abs(wikiReview.open.turn)>1,'Wiki turns toward what it looks at');ok(wikiReview.shut.fold>.3&&wikiReview.open.fold===0,'Wiki folds its cap shut');
    eq(wikiReview.hidden,null,'without Wiki the rig draws Mica alone');eq(wikiReview.game,'chatty','the game starts with a chatty Wiki');
    const headings=await evalJS(`(async()=>{
      const rig=await MTE_GAME.look.rigReady,c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),yaws=[],differences=[];let samePixels=true;
      for(let i=0;i<8;i++){
       let first=null;for(const offset of [-.30,.30]){
        const angle=i*Math.PI/4+offset;g.clearRect(0,0,256,256);
        rig.draw(g,128,240,160,{facing:{x:Math.cos(angle),y:Math.sin(angle)},phase:.2,walking:true});yaws.push(rig.inspect().yaw);
        const data=g.getImageData(0,0,256,256).data;if(first){let count=0,max=0;for(let j=0;j<data.length;j++)if(first[j]!==data[j]){count++;max=Math.max(max,Math.abs(first[j]-data[j]));}differences.push({heading:i,count,max});// GPU readback may round a handful of edge channels by one byte.
        samePixels&&=max<=1&&count<=32;}else first=data;
       }
      }
      const last=rig.inspect().yaw;rig.draw(g,128,240,160,{facing:{x:0,y:0}});
      return {yaws,samePixels,differences,retained:rig.inspect().yaw===last};
    })()`);
    ok(new Set(headings.yaws).size===8&&headings.yaws.every((y,i)=>Math.abs(y/(Math.PI/4)-Math.round(y/(Math.PI/4)))<1e-9&&y===headings.yaws[i-i%2]),'free movement vectors render exactly eight snapped headings');
    ok(headings.samePixels,'different movement angles within a sector render the same facing'+(headings.samePixels?'':JSON.stringify(headings.differences)));
    ok(headings.retained,'zero facing retains the last displayed direction');
    const cadence=await evalJS(`(async()=>{const {createActor}=await import('./src/game/render/motion.js');return [30,60,144].map(fps=>{let time=0;const a=createActor({clock:()=>time});a.view(false,{x:0,y:0,z:0});let v;for(let i=1;i<=fps;i++){time=i/fps;v=a.view(true,{x:3.7*i/fps,y:0,z:0});}return {fps,phase:v.rigStride};});})()`);
    for(const sample of cadence)ok(Math.abs(sample.phase-(3.7/2.4%1))<1e-9,'faster walk phase matches base-speed travel at '+sample.fps+' FPS');
    const contour=await evalJS(`(async()=>{
     const rig=await MTE_GAME.look.rigReady,c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),poses=[];
     for(let i=0;i<8;i++){const a=i*Math.PI/4;poses.push({facing:{x:Math.cos(a),y:Math.sin(a)}});}
     for(const phase of [0,.25,.5,.75])poses.push({facing:{x:1,y:0},walking:true,phase});
     for(const cargo of ['specimen','sealed'])for(const x of [-1,1])poses.push({facing:{x,y:1},cargo,pickaxe:2});
     for(const action of ['pick','swing','build','cheer'])poses.push({facing:{x:0,y:1},action,progress:.4,pickaxe:2});poses.push({facing:{x:1,y:1},action:'pick',progress:.5,basket:5,lantern:true});
     const results=[];for(const pose of poses){g.clearRect(0,0,256,256);rig.draw(g,128,240,160,pose);const p=g.getImageData(0,0,256,256).data;let edges=0,gaps=0;
      for(let y=1;y<255;y++)for(let x=1;x<255;x++){const i=(y*256+x)*4;if(p[i+3]<128)continue;if(![-4,4,-1024,1024].some(d=>p[i+d+3]<128))continue;edges++;if(p[i]>38||p[i+1]>32||p[i+2]>27)gaps++;}
      results.push({edges,gaps});
     }return results;
    })()`);
    ok(contour.every(p=>p.edges>100),'outline coverage samples the whole rendered figure across headings, gait, work and cargo');
    ok(contour.every(p=>p.gaps===0),'every sampled silhouette edge is ink, including gloves and soles'+(contour.some(p=>p.gaps)?JSON.stringify(contour):''));
    if(process.env.MTE_OUTLINE_ONLY==='1'){console.log((failures?'OUTLINE BROWSER FAILURES':'OUTLINE BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);}
    await shot('rigged-character-review.png');
    const mica=await evalJS(`(async()=>{
      const rig=await MTE_GAME.look.rigReady,c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');
      rig.draw(g,128,240,160,{time:0});const normal=rig.inspect();rig.draw(g,128,240,160,{time:3.1});const blink=rig.inspect().blink;
      const cargo=[];for(const kind of ['specimen','sealed'])for(let i=0;i<8;i++){const angle=i*Math.PI/4;rig.draw(g,128,240,160,{facing:{x:Math.cos(angle),y:Math.sin(angle)},cargo:kind,pickaxe:2});cargo.push({kind,pose:rig.inspect(),stats:rig.stats});}
      rig.draw(g,128,240,160,{});const empty=rig.inspect();
      return {blink,normal,cargo,empty};
    })()`);
    ok(mica.blink<.1,'Mica blinks using the supplied presentation time');
    ok(mica.cargo.every(v=>v.pose.cargo===v.kind&&v.pose.pickaxe.stowed),'both cargo forms keep a held pickaxe safely stowed in all headings');
    ok(mica.cargo.every(v=>v.stats.drawCalls<=64&&v.stats.triangles<50000),'carrying models stay within the existing render budgets');
    ok(!mica.empty.cargo&&!mica.empty.pickaxe,'empty-handed render adds no cargo or equipment');
    const details=await evalJS(`(async()=>{
     const rig=await MTE_GAME.look.rigReady,c=document.getElementById('__rigReview'),g=c.getContext('2d');g.fillStyle='#b69b6a';g.fillRect(0,0,c.width,c.height);g.fillStyle='#1d1712';g.font='22px system-ui';g.fillText('Mica — attention, recovery and careful carrying',30,35);
     const variants=[['Settled',{}],['Curious',{time:4.1}],['Blink',{time:3.1}],['Repair recovery',{action:'build',progress:.87}],['Exposed crystal',{cargo:'specimen'}],['Sealed carrier',{cargo:'sealed'}]];
     for(let i=0;i<6;i++){const x=245+i%3*475,y=475+Math.floor(i/3)*525;g.fillStyle='#1d1712';g.fillText(variants[i][0],x-120,y-390);rig.draw(g,x,y,350,{facing:{x:0,y:1},...variants[i][1]});rig.draw(g,x+145,y,64,{facing:{x:0,y:1},...variants[i][1]});}
     return true;
    })()`);
    await shot('mica-personality-review.png');

    const secondary=await evalJS(`(async()=>{
      const rig=await MTE_GAME.look.rigReady,canvas=document.getElementById('__rigReview'),g=canvas.getContext('2d');
      const poses=[];for(const phase of [.15,.55]){rig.draw(g,180,345,250,{phase,walking:true,facing:{x:1,y:0}});poses.push(rig.inspect());}
      g.fillStyle='#293232';g.fillRect(0,0,1440,1150);g.font='20px system-ui';g.fillStyle='#eee7d5';g.fillText('Actual rig — anticipation, contact and recovery',35,35);
      const actions=['pick','collect','swing','build'];
      for(let i=0;i<12;i++){const row=Math.floor(i/4),col=i%4,x=180+col*360,y=345+row*365,action=actions[col],progress=[.22,.55,.82][row];
       g.fillStyle='#eee7d5';g.fillText(action+' · '+progress,x-100,y-275);rig.draw(g,x,y,250,{action,progress,facing:{x:1,y:1}});}
      return poses;
    })()`);
    ok(secondary[0].cloak.some((a,i)=>Math.abs(a-secondary[1].cloak[i])>.02),'actual skinned cloak follows through between steps');
    ok(secondary[0].spine.some((a,i)=>Math.abs(a-secondary[1].spine[i])>.02),'actual torso shifts weight between steps');
    ok(secondary[0].head.some((a,i)=>Math.abs(a-secondary[1].head[i])>.01),'actual hood counterbalances the torso');
    await shot('rig-action-review.png');
    await evalJS(`(async()=>{const rig=await MTE_GAME.look.rigReady,g=document.getElementById('__rigReview').getContext('2d');g.fillStyle='#293232';g.fillRect(0,0,1440,1150);g.font='20px system-ui';
     for(let i=0;i<12;i++){const row=Math.floor(i/4),col=i%4,x=180+col*360,y=345+row*365,action=['cheer','up','down',null][col],progress=[.22,.55,.82][row];g.fillStyle='#eee7d5';g.fillText((action||'idle')+' · '+progress,x-100,y-275);rig.draw(g,x,y,250,{action,progress,time:progress*3,facing:{x:1,y:1}});}})()`);
    await shot('rig-climb-idle-review.png');


    if(process.env.MTE_RECORD_MOTION==='1'){
      const frames=await evalJS(`(async()=>{
        const rig=await MTE_GAME.look.rigReady,canvas=document.createElement('canvas');canvas.width=720;canvas.height=480;const g=canvas.getContext('2d'),frames=[];
        for(let i=0;i<40;i++){
          g.fillStyle='#293232';g.fillRect(0,0,720,480);g.fillStyle='#eee7d5';g.font='16px system-ui';g.fillText('Same 3D rig · original game scale / close view',25,30);
          for(const [x,y,u]of [[180,330,64],[490,390,280]]){g.strokeStyle='#899789';g.beginPath();g.moveTo(x-130,y);g.lineTo(x+130,y);g.stroke();rig.draw(g,x,y,u,{facing:{x:1,y:0},phase:i/40,walking:true});}
          frames.push(canvas.toDataURL('image/png').split(',')[1]);
        }return frames;
      })()`);
      fs.mkdirSync(path.join(SHOT_DIR,'motion-frames'),{recursive:true});frames.forEach((f,i)=>fs.writeFileSync(path.join(SHOT_DIR,'motion-frames',String(i).padStart(3,'0')+'.png'),Buffer.from(f,'base64')));
      eq(frames.length,40,'captured continuous joint motion across a complete loop');
    }
    await evalJS("document.getElementById('__rigReview').remove();MTE_GAME.setZoom(1.8)");await sleep(300);await shot('rig-in-world.png');
    eq(pageErrors.length,0,'no rig renderer exceptions');console.log((failures?'RIG BROWSER FAILURES':'RIG BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_ART_ONLY==='1'){
    console.log('\n== Win-path art: original renderer and sheets ==');
    await evalJS(`(()=>{const c=MTE_GAME.core,s=MTE_GAME.getState();
      // Funded visual fixture; never a fresh-world gameplay evaluation.
      for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++){c.setRichness(s.world,x,y,-2,0);c.markExplored(s.world,x,y,-2);}
      s.player={x:.5,y:2.5,z:-2};s.tools.pickaxe=3;s.tools.basket=2;s.tools.boots=2;
      s.cultivation.facilities=[{kind:'chamber',x:-2,y:0,id:1,health:100,buffer:5,closed:true},{kind:'cooler',x:-1,y:-1,id:2,buffer:0},{kind:'vault',x:1,y:0,id:3,buffer:5,closed:true},{kind:'conduit',x:0,y:0,id:4,buffer:0,from:1,to:3},{kind:'machine',x:2,y:1,id:5,health:0,buffer:0,closed:true,sections:0}].map(b=>({...b,z:-2,temperature:18,quality:100}));s.cultivation.nextId=6;s.cultivation.gear.carrier=true;s.cultivation.gear.lantern=true;
      MTE_GAME.setPlayer(.5,2.5);MTE_GAME.setZoom(1.6);MTE_GAME.hud.newWorld();})()`);
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false},session);
    await sleep(300);await shot('fresh-win-path-world.png');
    ok(await evalJS('new Set(Object.values(MTE_GAME.core.CULTIVATION_LOOK)).size===7'),'every cultivation object has its own catalog identity');
    ok(await evalJS('new Set([0,1,2,3,4].map(i=>MTE_GAME.look.level(MTE_GAME.core.CULTIVATION_LOOK.machine,i).url)).size===5'),'machine has five distinct physical restoration pictures');
    for(var phase=0;phase<=4;phase++){
      await evalJS('(()=>{const s=MTE_GAME.getState(),b=s.cultivation.facilities.find(b=>b.kind==="machine");b.sections=Math.min(3,'+phase+');b.health='+ (phase?100:0)+';s.cultivation.completed='+ (phase===4)+';})()');
      await sleep(60);await shot('machine-stage-'+phase+'.png');
    }
    await evalJS('document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');await sleep(150);
    ok(await evalJS('[...document.querySelectorAll("#sheetBody img")].every(i=>i.complete&&i.naturalWidth>0)'),'equipment art loads in Upgrade');
    await shot('fresh-equipment.png');
    await evalJS('document.getElementById("btnClose").click();document.getElementById("btnBuild").click()');await sleep(150);
    ok(await evalJS('[...document.querySelectorAll("#sheetBody img")].every(i=>i.complete&&i.naturalWidth>0)'),'all new facility art loads in Build');
    await shot('fresh-facilities.png');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true},session);
    await sleep(150);ok(await evalJS('document.documentElement.scrollWidth<=innerWidth'),'fresh art fits phone Build sheet');await shot('fresh-facilities-phone.png');
    eq(pageErrors.length,0,'no renderer or picture-loading errors');
    console.log((failures?'ART BROWSER FAILURES':'ART BROWSER PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_CULTIVATION_RUN){
    if(process.env.MTE_WEBGL==='1')ok(await evalJS('(async()=>!!await MTE_GAME.look.rigReady)()'),'3D character is available during the restoration win regression');
    const run=JSON.parse(fs.readFileSync(process.env.MTE_CULTIVATION_RUN,'utf8'));
    if(run.result!=='won'||!run.activationSave)throw Error('A completed canonical playtest checkpoint is required');
    await evalJS('localStorage.setItem("more-than-enough-save",'+JSON.stringify(run.activationSave)+')');
    await navigate('http://127.0.0.1:'+PORT+'/?lang=en');
    console.log('\n== Fresh playthrough checkpoint: actual activation and next world ==');
    eq(await evalJS('MTE_GAME.getState().seed'),run.seed,'resumes the world played from empty hands');
    ok(await evalJS('!MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'repairs alone have not won');
    ok(await evalJS('(()=>{const m=MTE_GAME.getState().cultivation.facilities.find(b=>b.kind==="machine");return MTE_GAME.openCard(m.x,m.y)})()'),'the machine beside you opens its card');
    ok(await evalJS('document.getElementById("buildingCard").textContent.includes("3/3")'),'machine shows all three physical repairs');
    ok(await evalJS('!!document.querySelector("#buildingCard [data-type=activate]")'),'the machine\'s card offers activation');
    await evalJS('document.querySelector("#buildingCard [data-type=activate]").click()');
    ok(await waitFor('MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'real activation button wins the world');
    ok(await evalJS('MTE_GAME.getState().goalsDone.includes("master")'),'completion milestone is recorded immediately');
    ok(await evalJS('MTE_GAME.core.nextGoal(MTE_GAME.getState())===null'),'completion has no stale mining objective');
    await evalJS('MTE_GAME.save();MTE_GAME.openCard(-99,-99)');
    await shot('cultivation-world-complete.png');
    await navigate('http://127.0.0.1:'+PORT+'/?lang=lt&playtestReplay');
    ok(await evalJS('MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'win survives normal browser reload');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true},session);
    await evalJS('(()=>{const m=MTE_GAME.getState().cultivation.facilities.find(b=>b.kind==="machine");MTE_GAME.openCard(m.x,m.y)})()');await sleep(200);
    ok(await evalJS('!document.querySelector("#buildingCard [data-type=activate]")'),'completed machine cannot be activated twice');
    await evalJS('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');
    await evalJS('document.getElementById("btnBuild").click()');await sleep(200);
    ok(await evalJS('document.documentElement.scrollWidth<=innerWidth'),'completed Lithuanian sheet fits a phone');
    await shot('cultivation-win-phone-lt.png');
    await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
    ok(await evalJS('!document.querySelector("[data-kind=embark]").disabled'),'Beyond offers an empty-handed next world');
    await evalJS('document.querySelector("[data-kind=embark]").click()');
    ok(await waitFor('!document.getElementById("ask").hidden'),'next world asks for confirmation');
    await evalJS('document.querySelector("#ask button.primary").click()');
    ok(await waitFor('MTE_GAME.getState().seed!=='+run.seed),'confirmed next world opens');
    ok(await evalJS('Object.values(MTE_GAME.getState().tools).every(n=>n===0)&&Object.values(MTE_GAME.getState().inv).every(n=>n===0)'),'next world starts empty-handed');
    ok(await evalJS('!!MTE_GAME.getState().cultivation&&!MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'next world keeps new rules and earns its own victory');
    ok(await evalJS('MTE_GAME.core.canEmbark(MTE_GAME.core.deserialize(localStorage.getItem("mte.solo.world.'+run.seed+'")))'),'completed world remains in its archive');
    // No world is ever lost: the one left is on Worlds, and Play goes back to it as it was.
    await evalJS('document.getElementById("btnSettings").click()');await sleep(200);
    ok(await evalJS('!document.getElementById("btnWorlds").hidden'),'Settings offers Worlds once there are two worlds');
    await evalJS('document.getElementById("btnWorlds").click()');await sleep(200);
    eq(await evalJS('document.querySelectorAll("#worldsPanel .world").length'),2,'Worlds lists the new world and the one left');
    await shot('worlds-after-embark-lt.png');
    await evalJS('document.querySelector("#worldsPanel .world:not(.here) button").click()');
    ok(await waitFor('MTE_GAME.getState().seed==='+run.seed),'Play goes back to the world left by Embark');
    ok(await evalJS('MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'the world comes back as it was left, complete');
    eq(pageErrors.length,0,'no browser runtime errors');
    console.log((failures?'CULTIVATION WIN FAILURES':'CULTIVATION WIN PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  if(process.env.MTE_CULTIVATION_ONLY!=='1'&&process.env.MTE_DEPOT_ONLY!=='1'){
    const core=await import('../src/core/index.js');const raw=core.serialize(core.createState((Date.now()>>>0)||1));
    await evalJS('localStorage.setItem("more-than-enough-save",'+JSON.stringify(raw)+')');
  }
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  ok(await evalJS('!!window.MTE_GAME'), 'game booted');
  if(process.env.MTE_CULTIVATION_ONLY==='1'){
    console.log('\n== Cultivation in the original client ==');
    ok(await evalJS('!!MTE_GAME.getState().cultivation'),'normal game starts with cultivation rules');
    ok(await evalJS('document.getElementById("game") instanceof HTMLCanvasElement && !!MTE_GAME.look'),'original canvas and texture-pack renderer retained');
    ok(await evalJS('MTE_GAME.getState().tools.pickaxe===0&&MTE_GAME.getState().inv.ore===0'),'empty-handed opening retained');
    await shot('cultivation-surface.png');
    await evalJS('document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
    ok(await evalJS('!!document.querySelector("[data-kind=cultivation][data-id=carrier]")'),'equipment added to original Upgrade sheet');
    ok(await evalJS('!document.querySelector("[data-kind=resup]")'),'new world has no abstract refinement purchases');
    await evalJS('document.getElementById("btnClose").click()');
    // Funded UI fixture only: tests controls and renderer, not fair fresh play.
    await evalJS(`(()=>{const c=MTE_GAME.core,s=MTE_GAME.getState();for(const r of c.RESOURCES)c.earn(s,r,300,'hand');s.world.props.clear();s.world.holes.clear();for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++){c.tileAt(s.world,x,y,-2);const i=c.chunkIndex(x,y);s.world.hotChunk.type[i]=c.T.SOIL;s.world.hotChunk.rich[i]=30;c.setRichness(s.world,x,y,-2,0);c.markExplored(s.world,x,y,-2);}s.player={x:.5,y:.5,z:-2};MTE_GAME.setPlayer(.5,.5);})()`);
    await sleep(1800); // settle the real layer-transition picture before tapping
    await evalJS('document.getElementById("btnBuild").click()');
    await evalJS('document.querySelector("[data-kind=cultivation][data-id=chamber]").click()');
    ok(await evalJS('!document.getElementById("sheet").classList.contains("open")&&!document.getElementById("placeCard").hidden'),'Place closes the sheet and shows the placement card');
    await evalJS('document.querySelector("#placeCard [data-do=go]").click()');
    const chamberBuilt=await waitFor('MTE_GAME.getState().cultivation.facilities.some(b=>b.kind==="chamber")',6000);
    ok(chamberBuilt,'real Build control constructs chamber after any required approach');
    if(!chamberBuilt)throw new Error('Chamber placement did not complete after approach: '+await stateSummary());
    ok(await evalJS('document.getElementById("placeCard").hidden&&document.getElementById("buildingCard").hidden&&!document.body.classList.contains("placing")'),'placement returns to play without opening the information/Move card');
    ok(await evalJS('MTE_GAME.getState().inv.ore===292'),'construction spends ordinary metal inventory: '+await evalJS('MTE_GAME.getState().inv.ore'));
    ok(await evalJS('!document.querySelector("#sheetBody [data-action=shutter]")'),'Build only places things: no shutters in it');
    await sleep(500);
    const chamberPoint=await evalJS('(()=>{const s=MTE_GAME.getState(),b=s.cultivation.facilities.find(b=>b.kind==="chamber");return MTE_GAME.project(b.x+.5,b.y+.5,b.z+MTE_GAME.core.tileHeight(s.world,b.x,b.y,b.z))})()');
    await evalJS(`(()=>{window.__chamberEvents=[];for(const type of ['pointerdown','pointerup','pointercancel'])window.addEventListener(type,e=>__chamberEvents.push({type,target:e.target.id,x:e.clientX,y:e.clientY,now:performance.now()}),true);})()`);
    await tap(chamberPoint.x,chamberPoint.y);
    const chamberCardOpen=await waitFor('!document.getElementById("buildingCard").hidden',2000);
    ok(chamberCardOpen,'selecting the chamber later opens its information/Move card');
    if(!chamberCardOpen){await shot('chamber-tap-failure.png');console.log('Chamber tap diagnostic '+JSON.stringify(await evalJS('(()=>{const s=MTE_GAME.getState(),b=s.cultivation.facilities.find(b=>b.kind==="chamber"),p=MTE_GAME.project(b.x+.5,b.y+.5,b.z);return {player:s.player,building:b,point:p,picked:MTE_GAME.unproject(p.x,p.y),element:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,300),body:document.body.className,events:window.__chamberEvents,sheet:document.getElementById("sheet").className,faults:JSON.parse(localStorage.getItem("mte.faults")||"[]")}})()')));throw Error('Chamber card failed to open; see diagnostic and screenshot');}
    await evalJS('document.querySelector("#buildingCard [data-type=shutter]").click()');
    ok(await evalJS('MTE_GAME.core.cultivationAt(MTE_GAME.getState(),0,0).closed===false'),'the card controls real shutters');
    ok(await evalJS('document.getElementById("buildingCard").textContent.includes("Temperature")'),'the card shows exact temperature');
    await evalJS('MTE_GAME.getState().cultivation.gear.lantern=true');
    ok(await waitFor('!document.getElementById("btnLantern").hidden',3000),'crafted lantern control becomes visible');
    await evalJS('document.getElementById("btnLantern").click()');
    ok(await waitFor('MTE_GAME.getState().cultivation.lantern===true&&document.getElementById("btnLantern").classList.contains("on")',3000),'the lantern button above Gather lights the lantern');
    await evalJS('document.getElementById("btnLantern").click()');
    await evalJS('MTE_GAME.save()');var seed=await evalJS('MTE_GAME.getState().seed');
    await evalJS('document.getElementById("btnClose").click()');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false},session);
    await sleep(300);await shot('cultivation-existing-art.png');
    await navigate('http://127.0.0.1:'+PORT+'/?lang=lt&playtestReplay');
    eq(await evalJS('MTE_GAME.getState().seed'),seed,'same original world resumes');
    ok(await evalJS('MTE_GAME.core.cultivationAt(MTE_GAME.getState(),0,0).closed===false'),'shutters survive ordinary save/reload');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true},session);
    await evalJS('document.getElementById("btnBuild").click()');await sleep(250);await shot('cultivation-phone-lt.png');
    ok(await evalJS('document.documentElement.scrollWidth<=innerWidth'),'Lithuanian phone fits');
    if(pageErrors.length)console.log(pageErrors.join(' | '));
    eq(pageErrors.length,0,'no original-client runtime errors');
    console.log((failures?'CULTIVATION BROWSER FAILURES':'CULTIVATION BROWSER TESTS PASSED')+' — '+checks+' checks');process.exit(failures?1:0);
  }
  ok(await evalJS('MTE_GAME.getState().emptyStart && Object.values(MTE_GAME.getState().tools).every(n=>n===0)'), 'fresh browser world starts without tools');
  // A bounded integration fixture, deliberately separate from fresh-world
  // AUTO evaluations. Checks the live browser host after Logistics unlocks.
  if (process.env.MTE_DEPOT_ONLY === '1') {
    console.log('\n== Physical Logistics: normal saves and real placement ==');
    await evalJS('MTE_GAME.save()');
    ok(await evalJS('![...document.querySelectorAll("a")].some(a=>a.getAttribute("href")=="?depots")'),'Nerds has no separate collection entry point');
    var normalSeed=await evalJS('MTE_GAME.getState().seed');
    await navigate('http://127.0.0.1:' + PORT + '/index.html?depots');
    ok(await evalJS('MTE_GAME.core.usesDepots(MTE_GAME.getState())'),'normal world has local collection rules');
    ok(await evalJS('!MTE_GAME.together.available'),'local collection cannot connect to unsupported multiplayer');
    ok(await evalJS('Object.values(MTE_GAME.getState().tools).every(n=>n===0)&&Object.values(MTE_GAME.getState().inv).every(n=>n===0)'),'normal world starts empty-handed without grants');
    await evalJS(`(function(){var c=MTE_GAME.core,s=MTE_GAME.getState();
      c.step(s,1/120,{visualEvents:false});
      var x=Math.floor(s.player.x),y=Math.floor(s.player.y);
      // Deliberate bounded UI fixture; never a fair fresh-world evaluation.
      s.extractors.push({key:'quarry',res:'stone',x,y,z:0,buffer:10},{key:'quarry',res:'stone',x:x+25,y,z:0,buffer:20});
      c.earn(s,'stone',110,'finds');c.earn(s,'ore',28,'finds');c.startEventEconomy(s);
      document.getElementById('btnBuild').click();})()`);
    await sleep(250);
    ok(await evalJS('!document.querySelector("button[data-id=depot]").disabled'),'actual depot Place button uses the material recipe');
    ok(await evalJS('document.querySelector("button[data-id=depot]").closest(".row").textContent.includes("1 additional")'),'placement preview identifies one new recipient');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false},session);
    await evalJS('document.querySelector("button[data-id=depot]").scrollIntoView({block:"center"})');
    await shot('depot-preview.png');
    await evalJS('document.querySelector("button[data-id=depot]").click()');
    await evalJS('document.querySelector("#placeCard [data-do=go]").click()');
    eq(await evalJS('MTE_GAME.core.extractorCount(MTE_GAME.getState(),"depot")'),1,'real button constructs a depot');
    ok(await evalJS('MTE_GAME.getState().inv.stone<20&&MTE_GAME.getState().inv.ore===0'),'placement spends its full recipe');
    ok(await evalJS('(function(){var c=MTE_GAME.core,s=MTE_GAME.getState();return !!c.depotFor(s,s.extractors[0])&&!c.depotFor(s,s.extractors[1]);})()'),'coverage includes nearby producer and excludes distant producer');
    ok(await waitFor('MTE_GAME.getState().sources.stone.buildings>10',5000),'covered producer delivers new output');
    ok(await evalJS('MTE_GAME.getState().extractors[1].buffer>20'),'unserved producer retains its output');
    await evalJS('document.getElementById("btnClose").click();MTE_GAME.hud.newWorld()');
    await sleep(150);await shot('depot-built.png');
    await evalJS('document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
    ok(await evalJS('!document.querySelector("button[data-kind=unlock][data-id=logistics]")'),'physical collection replaces the abstract Logistics purchase');
    await evalJS('document.getElementById("btnClose").click();MTE_GAME.save()');
    var depotSeed=await evalJS('MTE_GAME.getState().seed');
    ok(await evalJS('!!localStorage.getItem("mte.solo.world."+MTE_GAME.getState().seed)'),'normal world has a retained per-seed archive');
    eq(await evalJS('JSON.parse(localStorage.getItem("more-than-enough-save")).seed'),normalSeed,'collection uses the normal save slot');
    await navigate('http://127.0.0.1:' + PORT + '/index.html?depots');
    eq(await evalJS('MTE_GAME.getState().seed'),depotSeed,'old bookmark resumes the same normal world');
    ok(await evalJS('MTE_GAME.core.usesDepots(MTE_GAME.getState())&&MTE_GAME.core.extractorCount(MTE_GAME.getState(),"depot")===1'),'save reload preserves rule marker and depot');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true},session);
    await navigate('http://127.0.0.1:' + PORT + '/index.html?depots&lang=lt');
    await evalJS('document.getElementById("btnBuild").click()');
    await sleep(200);
    await evalJS('document.querySelector("button[data-id=depot]").scrollIntoView({block:"center"})');
    ok(await evalJS('document.documentElement.lang==="lt"'),'collection labels load in Lithuanian');
    ok(await evalJS('(function(){var r=document.querySelector("button[data-id=depot]").closest(".row").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})()'),'depot row fits a 320px phone');
    ok(await evalJS('(function(){var r=document.querySelector("button[data-id=depot]").getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth;})()'),'phone placement control remains reachable');
    await shot('depot-phone-lt.png');
    await navigate('http://127.0.0.1:' + PORT + '/index.html');
    eq(await evalJS('MTE_GAME.getState().seed'),normalSeed,'returning opens the original ordinary world');
    ok(await evalJS('MTE_GAME.core.usesDepots(MTE_GAME.getState())'),'normal world keeps the same collection rules');
    eq(pageErrors.length,0,'no browser runtime errors');
    console.log((failures?'DEPOT BROWSER FAILURES':'DEPOT BROWSER TESTS PASSED')+' — '+checks+' checks');
    process.exit(failures?1:0);
  }
  if (process.env.MTE_STONEWORKS_ONLY === '1') {
    console.log('\n== Stoneworks: real placement, production, links and persistence ==');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }, session);
    await evalJS(`(function(){var c=MTE_GAME.core,s=MTE_GAME.getState();
      // A constructed UI fixture, never a fresh-seed evaluation.
      var q={key:'quarry',res:'stone',x:Math.floor(s.player.x),y:Math.floor(s.player.y),z:0,buffer:0};
      s.extractors.push(q);s.unlocks.logistics=true;MTE_GAME.hud.newWorld();
      for(var r in c.EXTRACTORS.stoneworks.baseCost)c.earn(s,r,c.EXTRACTORS.stoneworks.baseCost[r],'finds');
      window.__stoneBefore=s.inv.stone;document.getElementById('btnBuild').click();})()`);
    await sleep(300);
    ok(await evalJS('!document.querySelector("button[data-id=stoneworks]").disabled'), 'physical support can be placed with normal funds');
    ok(await evalJS('document.querySelector("button[data-id=stoneworks]").closest(".row").textContent.includes("Does not stack")'), 'support role and non-stacking rule are explained');
    ok(await evalJS('MTE_GAME.core.supportGain(MTE_GAME.getState(),MTE_GAME.core.buildTarget(MTE_GAME.getState(),"stoneworks"))>0'), 'local preview benefits the nearby quarry');
    await evalJS('document.querySelector("button[data-id=stoneworks]").scrollIntoView({block:"center"})');
    await sleep(200);
    await shot('stoneworks-preview.png');
    await evalJS('document.querySelector("button[data-id=stoneworks]").click()');
    await shot('stoneworks-placing.png');
    await evalJS('document.querySelector("#placeCard [data-do=go]").click()');
    eq(await evalJS('MTE_GAME.core.extractorCount(MTE_GAME.getState(),"stoneworks")'),1,'real Place button builds one Stoneworks');
    ok(await evalJS('MTE_GAME.getState().inv.stone < window.__stoneBefore/2'), 'normal placement spends the stone investment');
    ok(await evalJS('(function(){var c=MTE_GAME.core,s=MTE_GAME.getState(),q=s.extractors.find(e=>e.key==="quarry");return c.supportingBuilding(s,q)?.key==="stoneworks" && c.extractorRate(s,q.key,q)===2*c.extractorRate(s,q.key);})()'), 'placed support links to the quarry and doubles its rate');
    await evalJS('document.getElementById("btnClose").click();MTE_GAME.hud.newWorld()');
    await sleep(200);
    await shot('stoneworks-built.png');
    await evalJS('MTE_GAME.save()');
    await navigate('http://127.0.0.1:' + PORT + '/index.html');
    ok(await evalJS('MTE_GAME.core.extractorCount(MTE_GAME.getState(),"stoneworks")===1 && MTE_GAME.core.productionRates(MTE_GAME.getState()).stone===.68'), 'save reload preserves physical support and production');
    await evalJS('MTE_GAME.news.render()');
    ok(await evalJS('document.getElementById("newsPanel").querySelectorAll("section").length > 100'), 'historical release notes load from the deferred bundle');
    eq(pageErrors.length,0,'no browser errors');
    console.log((failures ? 'STONEWORKS BROWSER FAILURES' : 'STONEWORKS BROWSER TESTS PASSED') + ' — ' + checks + ' checks');
    process.exit(failures ? 1 : 0);
  }
  if (process.env.MTE_OPENING_ONLY === '1') {
    console.log('\n== Empty-handed opening: real crafting controls ==');
    await evalJS('document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
    await sleep(200);
    ok(await evalJS('document.querySelector("button[data-id=pickaxe]").disabled'), 'first pick cannot be crafted for free');
    ok(await evalJS('document.querySelector("button[data-id=pickaxe]").closest(".row").textContent.includes("Not crafted")'), 'uncrafted equipment is identified');
    await evalJS('document.getElementById("btnClose").click();MTE_GAME.addRes("mycelium",42);MTE_GAME.addRes("stone",5);document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
    await sleep(200);
    await evalJS('document.querySelector("button[data-kind=tool][data-id=pickaxe]").click()');
    eq(await evalJS('MTE_GAME.getState().tools.pickaxe'), 2, 'paid first pick is crafted through the real button');
    await evalJS('document.querySelector("button[data-kind=tool][data-id=basket]").click()');
    eq(await evalJS('MTE_GAME.getState().tools.basket'), 2, 'paid first basket is crafted through the real button');
    eq(await evalJS('MTE_GAME.getState().inv.stone'), 0, 'the pick consumed its stone cost');
    ok(await evalJS('MTE_GAME.getState().tools.boots===0 && MTE_GAME.getState().tools.overclock===0'), 'other equipment remains uncrafted');
    await evalJS('document.getElementById("btnClose").click();MTE_GAME.save()');
    await navigate('http://127.0.0.1:' + PORT + '/index.html');
    ok(await evalJS('MTE_GAME.getState().emptyStart && MTE_GAME.getState().tools.pickaxe===2 && MTE_GAME.getState().tools.basket===2 && MTE_GAME.getState().tools.boots===0'), 'reload preserves owned and uncrafted equipment');
    eq(pageErrors.length, 0, 'no browser errors');
    console.log((failures ? 'OPENING BROWSER FAILURES' : 'OPENING BROWSER TESTS PASSED') + ' — ' + checks + ' checks');
    process.exit(failures ? 1 : 0);
  }
  if (process.env.MTE_ENGINE_ONLY === '1') {
    console.log('\n== Event economy: bounded browser fixture ==');
    await evalJS(`(async function(){
      window.__economyForState = (await import('./src/core/economy-context.js')).economyForState;
      var c=MTE_GAME.core,s=MTE_GAME.getState();
      for(var r of c.RESOURCES)c.earn(s,r,1000000,'hand');
      s.unlocks.logistics=true;
      if(!c.place(s,'garden').ok)throw new Error('fixture building placement failed');
    })()`);
    ok(await waitFor('!!__economyForState(MTE_GAME.getState())'), 'browser shared loop activates event production');
    var engineBefore = await evalJS('JSON.stringify({time:MTE_GAME.getState().time,income:MTE_GAME.getState().sources.mycelium.buildings,visits:__economyForState(MTE_GAME.getState()).work.buildingVisits})');
    await sleep(2200);
    var engineAfter = JSON.parse(await evalJS('JSON.stringify({time:MTE_GAME.getState().time,income:MTE_GAME.getState().sources.mycelium.buildings,visits:__economyForState(MTE_GAME.getState()).work.buildingVisits})'));
    engineBefore = JSON.parse(engineBefore);
    ok(engineAfter.time > engineBefore.time + 1, 'live browser simulation advances');
    ok(engineAfter.income > engineBefore.income, 'presentation observes earned production');
    eq(engineAfter.visits, engineBefore.visits, 'ordinary browser ticks do not materialize every building');
    ok(await evalJS(`(function(){var c=MTE_GAME.core,s=MTE_GAME.getState();
      c.earn(s,'stone',17,'finds');var n=s.inv.stone;c.settleEconomy(s);return s.inv.stone===n;})()`), 'manual earnings survive later balance observations');
    await evalJS('MTE_GAME.save()');
    await navigate('http://127.0.0.1:' + PORT + '/index.html');
    ok(await evalJS('MTE_GAME.getState().unlocks.logistics && MTE_GAME.getState().extractors.length===1'), 'save reload preserves Logistics and its building');
    ok(pageErrors.length === 0, 'no browser runtime errors with event economy');
    console.log((failures ? 'ENGINE BROWSER FAILURES' : 'ENGINE BROWSER TESTS PASSED') + ' — ' + checks + ' checks');
    process.exit(failures ? 1 : 0);
  }
  if (process.env.MTE_LAB_ONLY === '1') {
    console.log('\n== Super-speed AUTO: live client, archive and full fresh win ==');
    var normalSave = await evalJS('localStorage.getItem("more-than-enough-save")');
    ok(await evalJS('document.getElementById("btnAutoplayLab").getAttribute("href") === "?autoplay"'), 'Nerds has a developer viewer link');
    await navigate2('http://127.0.0.1:' + PORT + '/index.html?autoplay');
    ok(await waitFor('!!window.MTE_LAB'), 'developer viewer boots');
    normalSave = await evalJS('localStorage.getItem("more-than-enough-save")');
    await sleep(200);
    if(pageErrors.length) throw new Error(pageErrors.join(' | '));
    ok(await waitFor('MTE_LAB.getState().stats.playedMs > 10000'), 'maximum speed advances the real simulation');
    await evalJS('document.getElementById("labPause").click()');
    var labPaused = await evalJS('MTE_LAB.getState().stats.playedMs');
    await sleep(500);
    eq(await evalJS('MTE_LAB.getState().stats.playedMs'), labPaused, 'pause stops simulation time');
    await evalJS('document.getElementById("labSpeed").value="1";document.getElementById("labSpeed").dispatchEvent(new Event("change"));document.getElementById("labPause").click()');
    var labSlow = await evalJS('MTE_LAB.getState().stats.playedMs');
    await sleep(1100);
    var labDelta = await evalJS('MTE_LAB.getState().stats.playedMs') - labSlow;
    ok(labDelta > 600 && labDelta < 1800, '1x uses normal game seconds (' + labDelta + ' ms)');
    await evalJS('document.getElementById("labPause").click()');
    var oldLabSeed = await evalJS('MTE_LAB.getState().seed');
    await evalJS('document.getElementById("labSpeed").value="max";document.getElementById("labFresh").click()');
    ok(await waitFor('MTE_LAB.getState().seed !== ' + oldLabSeed), 'new run reserves a different seed');
    ok(await waitFor('document.getElementById("labHistory").options.length >= 2'), 'previous world retained in archive');
    for (var lap = 0; lap < 24 && !await evalJS('MTE_LAB.won'); lap++) {
      await sleep(4000);
      console.log('  live AUTO viewer: ' + await evalJS('(MTE_LAB.getState().stats.playedMs/3600000).toFixed(2)') + ' game hours');
      if (pageErrors.length) break;
    }
    ok(await evalJS('MTE_LAB.won'), 'fresh world reaches Embark through held AUTO only');
    ok(await evalJS('MTE_LAB.paused'), 'viewer stops at first win');
    eq(await evalJS('MTE_LAB.refused'), 0, 'no refused AUTO actions');
    ok(await evalJS('localStorage.getItem("more-than-enough-save")') === normalSave, 'normal player save is untouched');
    ok(await evalJS('MTE_LAB.getState().shared === undefined || !MTE_LAB.getState().shared'), 'viewer remains single-player');
    ok(await evalJS('getComputedStyle(document.getElementById("controls")).display === "none"'), 'manual game controls hidden in spectator');
    ok(await evalJS('getComputedStyle(document.getElementById("autoplayLab")).backgroundColor !== "rgba(0, 0, 0, 0)"'), 'spectator controls have an opaque panel');
    for (var viewport of [{width:360,height:740},{width:740,height:360}]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {...viewport,deviceScaleFactor:1,mobile:true}, session);
      await sleep(200);
      ok(await evalJS('document.getElementById("autoplayLab").getBoundingClientRect().right <= innerWidth && document.getElementById("autoplayLab").getBoundingClientRect().bottom <= innerHeight'), 'controls fit ' + viewport.width + 'x' + viewport.height);
    }
    await shot('autoplay-lab-win');
    ok(pageErrors.length === 0, 'no viewer runtime errors');
    console.log((failures ? 'LAB BROWSER FAILURES' : 'LAB BROWSER TESTS PASSED') + ' — ' + checks + ' checks');
    process.exit(failures ? 1 : 0);
  }
  // UI interruption audit, separate from AUTO-only full-game evaluation.
  if (process.env.MTE_FAIR_ONLY === '1') {
    console.log('\n== Fair controls: blocked pointer presses and held AUTO pause ==');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }, session);
    await sleep(300);
    await evalJS('document.getElementById("btnSettings").click()');
    ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'settings blocks AUTO');
    var fairAuto = await rect('#btnPerfect'), fairHand = await rect('#btnAction');
    ok(await evalJS('document.elementFromPoint('+fairAuto.x+','+fairAuto.y+').closest("#btnPerfect")!==null'), 'wide-screen AUTO remains physically reachable beside the sheet');
    var fairBefore = JSON.parse(await stateSummary());
    await hold(fairAuto.x, fairAuto.y, 800);
    await hold(fairHand.x, fairHand.y, 800);
    var fairBlocked = JSON.parse(await stateSummary());
    eq(JSON.stringify(fairBlocked.inv), JSON.stringify(fairBefore.inv), 'blocked pointer presses grant no resources');
    ok(await evalJS('!document.getElementById("btnPerfect").classList.contains("on")'), 'blocked AUTO press does not latch');
    await evalJS('document.getElementById("btnClose").click()');
    await touch('touchStart', [{ x: fairAuto.x, y: fairAuto.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    await sleep(3500);
    var fairActive = JSON.parse(await stateSummary());
    ok(await evalJS('MTE_GAME.getState().stats.gathers>0') || fairActive.x !== fairBefore.x || fairActive.y !== fairBefore.y, 'held AUTO acts or walks while unblocked');
    await evalJS('document.getElementById("btnSettings").click()');
    await sleep(150);
    function fairActivity() { return evalJS('(function(){var s=MTE_GAME.getState();return JSON.stringify({player:s.player,gathers:s.stats.gathers,built:s.stats.built,tools:s.tools,unlocks:s.unlocks,resUp:s.resUp,abundance:s.abundanceLv});})()'); }
    var fairPaused = await fairActivity();
    await sleep(700);
    eq(await fairActivity(), fairPaused, 'opening settings pauses AUTO movement and actions');
    await evalJS('document.getElementById("btnClose").click()');
    await sleep(1000);
    ok(await fairActivity() !== fairPaused, 'closing settings resumes the still-held AUTO input');
    await touch('touchEnd', []);
    await sleep(150);
    var fairReleased = await fairActivity();
    await sleep(700);
    eq(await fairActivity(), fairReleased, 'release stops AUTO again');
    ok(pageErrors.length===0, 'no browser runtime errors during control audit');
    console.log((failures ? 'FAIR CONTROL BROWSER FAILURES' : 'FAIR CONTROL BROWSER TESTS PASSED') + ' — ' + checks + ' checks');
    process.exit(failures ? 1 : 0);
  }
  // Dedicated smoke for the full-game headless AUTO evaluations. Unlike the
  // general interaction tests below, this fresh world gets no state edits,
  // teleporting, resource grants, manual gathering, purchases or other input.
  if (process.env.MTE_AUTO_ONLY === '1') {
    console.log('\n== Fresh world: hold AUTO and nothing else ==');
    var autoBefore = JSON.parse(await evalJS('JSON.stringify({player:MTE_GAME.getState().player,stats:MTE_GAME.getState().stats})'));
    ok(autoBefore.stats.gathers === 0 && autoBefore.stats.built === 0, 'fresh world has no previous player actions');
    var autoButton = await rect('#btnPerfect');
    await hold(autoButton.x, autoButton.y, 20000);
    var autoAfter = JSON.parse(await evalJS('JSON.stringify({player:MTE_GAME.getState().player,stats:MTE_GAME.getState().stats})'));
    ok(autoAfter.stats.gathers > 0, 'holding only the actual AUTO button gathers from a fresh spawn');
    ok(autoAfter.player.x !== autoBefore.player.x || autoAfter.player.y !== autoBefore.player.y, 'AUTO walks without manual steering');
    await sleep(1200);
    var autoReleased = JSON.parse(await evalJS('JSON.stringify({player:MTE_GAME.getState().player,stats:MTE_GAME.getState().stats})'));
    eq(autoReleased.stats.gathers, autoAfter.stats.gathers, 'releasing AUTO stops gathering');
    eq(JSON.stringify(autoReleased.player), JSON.stringify(autoAfter.player), 'releasing AUTO stops walking');
    ok(pageErrors.length === 0, 'no browser runtime errors during AUTO-only play');
    console.log((failures ? 'AUTO BROWSER FAILURES' : 'AUTO BROWSER TESTS PASSED') + ' — ' + checks + ' checks');
    process.exit(failures ? 1 : 0);
  }
  // Movement and timing checks assume the game runs in real time. If the
  // machine is starved, say so here rather than as odd failures later.
  var pace = JSON.parse(await evalJS('new Promise(function(done){var t0=MTE_GAME.getState().time,n=0,w0=performance.now();' +
    '(function f(){n++;if(performance.now()-w0<1000)requestAnimationFrame(f);else done(JSON.stringify({fps:n,sim:MTE_GAME.getState().time-t0}));})();})'));
  ok(pace.fps >= 20 && pace.sim >= 0.8, 'the game runs in real time (' + pace.fps + ' fps, ' + pace.sim.toFixed(2) + 's of game time per second)' +
    (pace.fps < 20 ? ' — FRAMES ARE STARVED: close other headless browsers or heavy apps; timing checks below will fail' : ''));
  // Branding: a favicon, a home-screen icon and a manifest, all of which load.
  var icons = JSON.parse(await evalJS('(async function(){var links=[...document.querySelectorAll("link[rel~=icon],link[rel=apple-touch-icon]")].map(function(l){return l.href;});' +
    'var m=await fetch(document.querySelector("link[rel=manifest]").href).then(function(r){return r.json();});' +
    'var all=links.concat(m.icons.map(function(i){return new URL(i.src,document.querySelector("link[rel=manifest]").href).href;}));' +
    'var bad=[];for(var u of all){var r=await fetch(u);if(!r.ok)bad.push(u);}return JSON.stringify({n:all.length,bad:bad,name:m.name,maskable:m.icons.some(function(i){return i.purpose==="maskable";})});})()'));
  ok(icons.n >= 6 && icons.bad.length === 0 && icons.name === 'Mica and Wiki' && icons.maskable, 'favicon, home-screen icon and manifest icons all load (' + JSON.stringify(icons) + ')');
  // No hand-holding: nothing to read on screen, no tutorial, no prompts.
  ok(await evalJS('!document.getElementById("tutorial") && !document.getElementById("trailHint") && !document.getElementById("goal")'), 'the game ships no tutorial, hint or goal banner');
  // A new player's first read is what to do: the next milestone.
  ok(await evalJS('!document.getElementById("log").hidden && MTE_GAME.messages.lines.some(function(l){return /^(goal|milestone): ./.test(l);})'),
    'a new world names the next milestone in the message log (' + await evalJS('JSON.stringify(MTE_GAME.messages.lines)') + ')');
  ok(await evalJS('document.getElementById("depth").hidden'), 'the depth marker stays hidden on the surface');
  ok(await evalJS('!MTE_GAME.messages.lines.some(function(l){return /^game:/.test(l);})'), 'a fresh world shows no notice');
  var chips = await evalJS('document.querySelectorAll("#resources .chip[data-res]").length');
  eq(chips, 4, 'four resource chips visible');
  // Tapping a counter opens the earnings statement at it, every kind of mushroom included.
  var stoneChip = await rect('.chip[data-res=stone]');
  await tap(stoneChip.x, stoneChip.y);
  ok(await waitFor('document.getElementById("sheet").classList.contains("open") && document.getElementById("sheetTitle").textContent === "Earnings"', 1500), 'tapping a resource counter opens the earnings statement');
  ok(await evalJS('!!document.getElementById("col-stone") && document.querySelectorAll("#sheetBody .colHead").length === 4 && !!document.querySelector("#sheetBody .units") && document.querySelectorAll("#sheetBody .card").length === MTE_GAME.core.MUSHROOM_KEYS.length'), 'the statement has a section per resource, the unit switch and a card per kind of mushroom');
  await evalJS('document.querySelector("#sheetBody .unit[data-unit=h]").click()');
  ok(await waitFor('document.querySelector("#sheetBody .unit[data-unit=h]").classList.contains("on")', 1000), 'the statement switches to per hour');
  await evalJS('document.querySelector("#sheetBody .unit[data-unit=s]").click()');
  await evalJS('document.getElementById("btnClose").click()');
  eq(await evalJS('document.querySelectorAll("#thumbDock .btn").length'), 7, 'Gather, Perfect, lantern, flare, build, upgrade and mine share the thumb dock');
  // Sound: the context exists from load, and the first gesture of any kind
  // gets it running (it used to wait for certain controls).
  ok(await evalJS('MTE_GAME.audioState()') !== 'none', 'the audio context exists before any gesture');
  await drag(80, 600, 140, 600, 4, 30);
  ok(await waitFor('MTE_GAME.audioState() === "running"', 1500), 'a drag on the map is enough to start the sound (state: ' + await evalJS('MTE_GAME.audioState()') + ')');
  // The soundtrack plays from the start; with it, the place has a name.
  ok(await waitFor('MTE_GAME.audio.track() !== null', 3000), 'music starts with the sound (' + await evalJS('MTE_GAME.audio.track()') + ')');
  await startListening();
  ok(await heard(1500) > 0.004, 'and the music is heard');
  ok(await evalJS('!["on", "off", ""].includes(document.getElementById("musicState").textContent)'), 'Settings shows the track playing by its name (' + await evalJS('document.getElementById("musicState").textContent') + ')');
  // The effects are checked on their own: music off, and give it time to fade.
  await evalJS('document.getElementById("btnMusic").click()');
  ok(await waitFor('MTE_GAME.audio.track() === null', 1500), 'the Music setting stops the music');
  await sleep(4000);
  // Every sound must actually come out of the speakers, not just be "on".
  var SOUNDS = ['gather("mycelium",1,1)', 'gather("stone",1,1)', 'gather("ore",1,1)', 'gather("crystal",1,1)', 'dig()', 'collect()', 'upgrade()', 'build()', 'fanfare()'];
  for (var si = 0; si < SOUNDS.length; si++) {
    var peak = await loudness('MTE_GAME.audio.' + SOUNDS[si]);
    ok(peak > 0.004, 'the ' + SOUNDS[si].replace(/\(.*/, '') + ' sound is heard' + (SOUNDS[si].indexOf('gather') === 0 ? ' (' + SOUNDS[si].split('"')[1] + ')' : '') + ' (peak ' + peak.toFixed(3) + ')');
  }
  await sleep(800); // let the last notes ring out
  await startListening();
  ok(await heard(300) < 0.002, 'and between sounds it is quiet');
  await evalJS('MTE_GAME.audio.muted = true');
  ok(await loudness('MTE_GAME.audio.collect()') < 0.005, 'muted, nothing is heard');
  await evalJS('MTE_GAME.audio.muted = false');
  await evalJS('document.getElementById("btnMusic").click()');
  ok(await waitFor('MTE_GAME.audio.track() !== null', 1500), 'and turns it back on');
  var zoomIn = await rect('#btnZoomIn');
  await tap(zoomIn.x, zoomIn.y);
  eq(Math.round(await evalJS('MTE_GAME.zoom()') * 100), 125, 'thumb zoom-in control changes map zoom');
  eq(await evalJS('document.getElementById("zoomText").textContent'), '1.25×', 'zoom level is shown beside the thumb controls, as a magnification');
  var zoomOut = await rect('#btnZoomOut');
  await tap(zoomOut.x, zoomOut.y);
  eq(await evalJS('MTE_GAME.zoom()'), 1, 'thumb zoom-out control restores default zoom');
  await tap(zoomIn.x, zoomIn.y); await tap(zoomIn.x, zoomIn.y);
  var zoomReadout = await rect('#zoomLevel');
  await tap(zoomReadout.x, zoomReadout.y);
  eq(await evalJS('MTE_GAME.zoom()'), 1, 'tapping the zoom readout goes back to 1x');
  // Home ground is kept for the stockpile: no way down there, and nowhere can
  // you dig one: the way into the mine is a cave mouth you find.
  await evalJS('MTE_GAME.setPlayer(0.5,0.5)');
  await sleep(150);
  ok(await evalJS('document.getElementById("btnMine").hidden'), 'no layer button on home ground');
  // This underground integration fixture needs a crafted pick. The separate
  // opening fixture verifies that the player starts without one.
  await evalJS('MTE_GAME.addRes("mycelium",8);MTE_GAME.addRes("stone",5);document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
  await sleep(150);
  await evalJS('document.querySelector("button[data-kind=tool][data-id=pickaxe]").click();document.getElementById("btnClose").click()');
  eq(await evalJS('MTE_GAME.getState().tools.pickaxe'), 2, 'craft a pick before the underground digging fixture');
  var entry = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player;var t=c.nearestTile(p.x,p.y,60,function(x,y){return c.tileAt(s.world,x,y,0)===c.T.CAVE;});MTE_GAME.setPlayer(t.x+4.5,t.y+0.5);c.revealAround(s);return JSON.stringify({x:t.x,y:t.y});})()'));
  await sleep(300);
  ok(await evalJS('document.getElementById("btnMine").hidden'), 'out of reach of a cave mouth there is no layer button: no digging down');
  await evalJS('MTE_GAME.setPlayer(' + (entry.x + 0.5) + ',' + (entry.y + 0.5) + ')');
  await sleep(300);
  eq(await evalJS('document.getElementById("mineLabel").textContent'), 'CLIMB DOWN', 'in a cave mouth, the layer button climbs down');
  ok(!(await evalJS('document.getElementById("btnMine").hidden')), 'and the button shows');
  console.log('  screenshot: ' + await shot('02b-cave-mouth.png'));
  var mineBtn = await rect('#btnMine');
  await tap(mineBtn.x, mineBtn.y);
  ok(await waitFor('MTE_GAME.getState().player.z === -1', 1500), 'mine button drops down the cave mouth at once');
  ok(await evalJS('MTE_GAME.getState().world.holes.size === 0'), 'going down digs nothing');
  ok(await waitFor('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;return c.isExplored(s.world,' + (entry.x + 1) + ',' + entry.y + ',-1)&&!c.isExplored(s.world,' + (entry.x + 8) + ',' + entry.y + ',-1);})()', 1000), 'underground, only the rock close by is revealed');
  eq(await evalJS('document.getElementById("depth").hidden ? "" : document.getElementById("depth").textContent'), 'Layer1', 'the depth marker says layer 1');
  eq(await evalJS('[].map.call(document.querySelectorAll("#depthGauge i"),function(i){return i.className||"-";}).join(" ")'), 'forest here deeper', 'the depth gauge shows the forest, you a layer under it, and deeper still');
  eq(await evalJS('document.getElementById("place").hidden ? "" : document.getElementById("place").textContent'), 'UndergroundLayer 1', 'arriving names the layer');
  eq(await evalJS('document.getElementById("mineLabel").textContent'), 'CLIMB UP', 'at the foot of the ladder you came down, the layer button climbs up');
  eq(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player,n=0;c.caveTiles(s.seed,Math.floor(p.x),Math.floor(p.y)).forEach(function(t){if(c.TILE_INFO[c.tileAt(s.world,t.x,t.y,-1)].walk)n++;});return n>=8;})()'), true, 'arriving opens a small cave around you, never just the tile you stand on');
  // To the cave's edge, beside a wall of plain soil or stone, to dig it.
  var toWall = '(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player,d=[[1,0],[-1,0],[0,1],[0,-1]];var t=c.nearestTile(p.x,p.y,20,function(x,y){if(!c.TILE_INFO[c.tileAt(s.world,x,y,-1)].walk)return false;return d.some(function(v){var w=c.tileAt(s.world,x+v[0],y+v[1],-1);return w===c.T.SOIL||w===c.T.STONE_SEAM;});});MTE_GAME.setPlayer(t.x+0.5,t.y+0.5);return true;})()';
  await evalJS(toWall);
  await sleep(120); // let the camera settle on the new layer
  var mineSpot = await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player,px=Math.floor(p.x),py=Math.floor(p.y);for(var i=0;i<4;i++){var x=px+[1,0,-1,0][i],y=py+[0,1,0,-1][i],t=c.tileAt(s.world,x,y,-1);if(t===c.T.SOIL||t===c.T.STONE_SEAM){return JSON.stringify({x:x,y:y,dx:x-px,dy:y-py,sx:innerWidth/2+(x+.5-p.x)*MTE_GAME.tilePx(),sy:innerHeight/2+(y+.5-p.y)*MTE_GAME.tilePx()});}}return null;})()');
  var ms = JSON.parse(mineSpot);
  await tap(ms.sx, ms.sy);
  eq(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;return c.tileAt(s.world,' + ms.x + ',' + ms.y + ',-1)===c.T.TUNNEL;})()'), true, 'tapping a nearby tile uses the same Gather action to dig');
  var minePos = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  await drag(195, 422, 195 + ms.dx * 80, 422 + ms.dy * 80, 5, 35);
  var minePosAfter = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  ok((minePosAfter.x - minePos.x) * ms.dx + (minePosAfter.y - minePos.y) * ms.dy > 0.05, 'same thumb joystick moves into the freshly dug underground tunnel');
  eq(minePosAfter.z, -1, 'digging an ordinary tile does not change layers');
  // Drill: holding the stick against a wall digs through it, no tapping.
  await evalJS(toWall);
  var wall = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player,px=Math.floor(p.x),py=Math.floor(p.y);MTE_GAME.setPlayer(px+0.5,py+0.5);var dirs=[[1,0],[-1,0],[0,1],[0,-1]];for(var i=0;i<4;i++){var x=px+dirs[i][0],y=py+dirs[i][1],t=c.tileAt(s.world,x,y,-1);if(t===c.T.SOIL||t===c.T.STONE_SEAM||t===c.T.ORE_SEAM){return JSON.stringify({x:x,y:y,dx:dirs[i][0],dy:dirs[i][1]});}}return "null";})()'));
  ok(!!wall, 'a diggable wall next to the wanderer');
  if (wall) {
    await touch('touchStart', [{ x: 195, y: 500, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    await touch('touchMove', [{ x: 195 + wall.dx * 70, y: 500 + wall.dy * 70, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    var drilled = await waitFor('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;return c.tileAt(s.world,' + wall.x + ',' + wall.y + ',-1)===c.T.TUNNEL;})()', 2000);
    await touch('touchEnd', []);
    ok(drilled, 'holding the stick against a wall drills through it');
  }
  // Glowcaps: the Build sheet places one where you stand, for mycelium.
  await evalJS('MTE_GAME.addRes("mycelium", 10); document.getElementById("btnBuild").click()');
  ok(await waitFor('!!document.querySelector("#sheetBody button[data-kind=prop][data-id=glowcap]:not([disabled])")', 1500), 'underground, the Build sheet offers a glowcap');
  await evalJS('document.querySelector("#sheetBody button[data-kind=prop][data-id=glowcap]").click()');
  eq(await evalJS('MTE_GAME.getState().world.props.size'), 1, 'placing a glowcap leaves it in the tunnel');
  ok(await evalJS('!!document.querySelector("#sheetBody button[data-kind=prop][data-id=solar][disabled]")'), 'a solar panel is offered, but not down here');
  await evalJS('document.getElementById("btnClose").click()');
  // The battery: hidden while full, then a pill on the left edge that turns
  // amber once the light starts to shrink.
  ok(await evalJS('document.getElementById("battery").hidden === (MTE_GAME.getState().battery >= 0.995)'), 'the battery shows once it is not full');
  await evalJS('MTE_GAME.getState().battery = 0.2');
  ok(await waitFor('(function(){var b=document.getElementById("battery");return !b.hidden && b.classList.contains("low") && /20/.test(b.textContent);})()', 1500), 'a low battery shows amber with its percent');
  await evalJS('MTE_GAME.getState().battery = 1');
  var shaftSpot = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player;var t=c.nearestTile(p.x,p.y,40,function(x,y){return c.tileAt(s.world,x,y,-1)===c.T.SHAFT;});c.setRichness(s.world,t.x+1,t.y,-1,0);MTE_GAME.setPlayer(t.x+1.5,t.y+0.5);return JSON.stringify({x:t.x,y:t.y,sx:innerWidth/2-MTE_GAME.tilePx(),sy:innerHeight/2});})()'));
  await sleep(120);
  var shaftOpen = '(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;return c.tileAt(s.world,' + shaftSpot.x + ',' + shaftSpot.y + ',-1)===c.T.SHAFT_OPEN;})()';
  await tap(shaftSpot.sx, shaftSpot.sy);
  eq(await evalJS('MTE_GAME.getState().player.z'), -1, 'uncovering the marked shaft does not descend automatically');
  ok(await evalJS(shaftOpen), 'the marked shaft opens after a separate dig');
  await sleep(200);
  eq(await evalJS('document.getElementById("mineLabel").textContent'), 'CLIMB DOWN', 'beside the open shaft, the layer button says it goes down');
  await tap(shaftSpot.sx, shaftSpot.sy);
  eq(await evalJS('MTE_GAME.getState().player.z'), -2, 'a deliberate second tap drops to the next layer');
  eq(await evalJS('(function(){var p=MTE_GAME.getState().player;return Math.floor(p.x)+","+Math.floor(p.y);})()'), shaftSpot.x + ',' + shaftSpot.y, 'the next layer is directly beneath the shaft');
  // Holding Gather with nothing to dig must not stall the rest of the frame:
  // the clock, effects and the 3-second autosave all keep running.
  await evalJS('localStorage.removeItem("more-than-enough-save")');
  var heldClock = await evalJS('MTE_GAME.getState().time');
  var holdBtn = await rect('#btnAction');
  await hold(holdBtn.x, holdBtn.y, 3600);
  ok(await evalJS('MTE_GAME.getState().time') > heldClock + 3, 'the game clock runs while Gather is held underground');
  ok(await evalJS('!!localStorage.getItem("more-than-enough-save")'), 'autosave keeps running while Gather is held with no target');
  mineBtn = await rect('#btnMine'); await tap(mineBtn.x, mineBtn.y);
  eq(await evalJS('MTE_GAME.getState().player.z'), -1, 'CLIMB UP climbs back through the shaft you came down');
  // A spot a few steps off with no way between layers in reach (the world is
  // random: another shaft or ladder can lie right beside the first).
  ok(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;for(var r=4;r<=12;r++)for(var dy=-r;dy<=r;dy++)for(var dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;MTE_GAME.setPlayer(' + entry.x + '+dx+.5,' + entry.y + '+dy+.5);if(!c.layerWay(s))return true;}return false;})()'), 'there is ground off the ladder with no way between layers in reach');
  await sleep(200);
  ok(await evalJS('document.getElementById("btnMine").hidden'), 'away from the ladder there is no layer button: no digging up');
  await evalJS('MTE_GAME.setPlayer(' + (entry.x + 0.5) + ',' + (entry.y + 0.5) + ')');
  await tap(mineBtn.x, mineBtn.y);
  eq(await evalJS('(function(){var p=MTE_GAME.getState().player;return Math.floor(p.x)+","+Math.floor(p.y)+","+p.z;})()'), entry.x + ',' + entry.y + ',0', 'CLIMB UP the first ladder comes out of the cave mouth you went down');
  await sleep(200);
  eq(await evalJS('document.getElementById("mineLabel").textContent'), 'CLIMB DOWN', 'standing in that cave mouth, the layer button climbs down');
  // Every piece of the HUD keeps its own place, the climb button included.
  var clash = await evalJS('(function(){var ids=["btnAwards","resources","btnSettings","depthMeter","zoomControls","btnBuild","btnUpgrade","btnMine","btnPerfect","btnAction"];var r=ids.map(function(id){var b=document.getElementById(id).getBoundingClientRect();return {id:id,l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width};}).filter(function(x){return x.w>0;});var out=[];for(var i=0;i<r.length;i++)for(var j=i+1;j<r.length;j++){var a=r[i],c=r[j];if(!(a.r<=c.l||c.r<=a.l||a.b<=c.t||c.b<=a.t))out.push(a.id+"/"+c.id);}return out.join(" ");})()');
  eq(clash, '', 'no two HUD pieces overlap');

  // canvas actually painted
  var painted = await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var set={};var n=0;for(var i=0;i<d.length;i+=40000){var k=d[i]+","+d[i+1]+","+d[i+2];if(!set[k]){set[k]=1;n++;}}return n;})()');
  ok(painted > 3, 'canvas renders distinct colors (' + painted + ')');
  var s0 = await shot('01-start.png');
  console.log('  screenshot: ' + s0);
  console.log(await asciiArt(evalJS));

  /* --------------------------------------------------------- movement */
  console.log('\n== Movement (keyboard) ==');
  // Teleport to an open stretch (three clear tiles to the right) so a rock or
  // water tile near the random spawn can't stop the walk early.
  await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;function ok(x,y){return c.walkable(s.world,x,y,0);}for(var r=0;r<80;r++){for(var dy=-r;dy<=r;dy++){for(var dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;if(ok(dx,dy)&&ok(dx+1,dy)&&ok(dx+2,dy)&&ok(dx+3,dy)&&ok(dx-1,dy)&&ok(dx,dy+1)&&ok(dx,dy-1)){MTE_GAME.setPlayer(dx+0.5,dy+0.5);return;}}}}})()');
  await sleep(150);
  var before = JSON.parse(await stateSummary());
  await key('keyDown', 'd', 'KeyD', 68);
  await sleep(700);
  await key('keyUp', 'd', 'KeyD', 68);
  await sleep(150);
  var after = JSON.parse(await stateSummary());
  ok(after.x > before.x + 0.5, 'player moved right with keyboard (' + before.x + ' -> ' + after.x + ')' +
    (after.x > before.x + 0.5 ? '' : ' — page: ' + await evalJS('JSON.stringify({visibility:document.visibilityState,focus:document.hasFocus(),time:MTE_GAME.getState().time})')));

  console.log('\n== Movement (touch joystick drag) ==');
  var b2 = JSON.parse(await stateSummary());
  // drag from a clear area of the canvas
  await drag(120, 420, 200, 360, 5, 60);
  await sleep(150);
  var a2 = JSON.parse(await stateSummary());
  ok(Math.abs(a2.x - b2.x) + Math.abs(a2.y - b2.y) > 0.3, 'player moved with touch joystick (' + b2.x + ',' + b2.y + ' -> ' + a2.x + ',' + a2.y + ')');
  // The Drag setting flips it: you walk away from the finger, pulling the map.
  await evalJS('document.getElementById("btnDrag").click()');
  eq(await evalJS('document.getElementById("dragMode").textContent'), 'pull the map', 'the Drag setting switches to pulling the map');
  var b3 = JSON.parse(await stateSummary());
  await drag(120, 420, 220, 420, 5, 60);
  await sleep(150);
  var a3 = JSON.parse(await stateSummary());
  ok(a3.x < b3.x - 0.2, 'pulling the map right walks you left (' + b3.x + ' -> ' + a3.x + ')');
  eq(await evalJS('JSON.parse(localStorage.getItem("more-than-enough-view")).invertDrag'), true, 'the Drag setting is remembered');
  await evalJS('document.getElementById("btnDrag").click()');
  eq(await evalJS('document.getElementById("dragMode").textContent'), 'walk that way', 'and switches back');
  await drag(90, 500, 135, 465, 5, 45);
  await sleep(150);
  var tapWalkStart = JSON.parse(await stateSummary());
  // Tap a walkable tile beyond reach, so the tap means "walk there", not "gather".
  var dest = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player,u=MTE_GAME.tilePx();var dirs=[[3,0],[-3,0],[0,3],[0,-3],[2,2],[-2,2],[2,-2],[-2,-2]];for(var i=0;i<dirs.length;i++){var x=Math.floor(p.x)+dirs[i][0],y=Math.floor(p.y)+dirs[i][1];if(c.walkable(s.world,x,y,0)&&!c.TILE_INFO[c.tileAt(s.world,x,y,0)].harvest)return JSON.stringify({sx:innerWidth/2+(x+.5-p.x)*u,sy:innerHeight/2+(y+.5-p.y)*u});}return JSON.stringify({sx:innerWidth/2+3*u,sy:innerHeight/2});})()'));
  await tap(dest.sx, dest.sy);
  await sleep(700);
  var tapWalkEnd = JSON.parse(await stateSummary());
  ok(Math.abs(tapWalkEnd.x - tapWalkStart.x) + Math.abs(tapWalkEnd.y - tapWalkStart.y) > 0.25, 'tapping a world destination starts walking');

  /* ------------------------------------------------------------ gather */
  console.log('\n== Gathering (touch the action button) ==');
  var spot = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&c.richness(s.world,x,y,0)>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!spot, 'found a rich forest tile to stand on (' + spot + ')');
  await evalJS('(function(){var p=' + JSON.stringify(spot) + '.split(",").map(Number),s=MTE_GAME.getState();MTE_GAME.core.setRichness(s.world,p[0],p[1],0,200);})()');
  await sleep(150);
  var act = await rect('#btnAction');
  ok(act && act.w > 60, 'action button is a comfortable tap target (' + (act && act.w) + 'px)');
  // Holding Perfect, the smaller button above, plays as it sees fit:
  // gathers, walks somewhere, builds or buys.
  var perf = await rect('#btnPerfect');
  ok(perf && perf.w >= 44 && perf.y < act.y, 'Perfect is a smaller button above Gather (' + (perf && perf.w) + 'px)');
  var p0 = JSON.parse(await stateSummary());
  await hold(perf.x, perf.y, 3600);
  var p1 = JSON.parse(await stateSummary());
  var played = JSON.stringify(p1.inv) !== JSON.stringify(p0.inv) || p1.ext !== p0.ext || p1.x !== p0.x || p1.y !== p0.y;
  ok(played, 'holding PERFECT played (' + JSON.stringify(p0) + ' -> ' + JSON.stringify(p1) + ')');
  ok(await evalJS('!!document.getElementById("perfectBadge").dataset.look'), 'the badge on Perfect shows what it is doing (' + await evalJS('document.getElementById("perfectBadge").dataset.look') + ')');
  // Back onto the forest tile (Perfect may have walked off), to Gather it,
  // with nothing built around it (a building's tile can't be gathered by hand).
  await evalJS('(function(){var p=' + JSON.stringify(spot) + '.split(",").map(Number),s=MTE_GAME.getState();s.extractors=s.extractors.filter(function(e){return Math.max(Math.abs(e.x-p[0]),Math.abs(e.y-p[1]))>3;});MTE_GAME.setPlayer(p[0]+0.5,p[1]+0.5);})()');
  await sleep(150);
  // A milestone reached (gathering, or ore spotted on the way) goes in the log, naming it.
  ok(await waitFor('(function(){var s=MTE_GAME.getState();return MTE_GAME.core.GOALS.some(function(g){return s.goalsDone.indexOf(g.id)>=0&&MTE_GAME.messages.lines.some(function(l){return l.indexOf("milestone: "+g.reached)===0;});});})()', 2000),
    'reaching a milestone puts a line naming it in the log (' + await evalJS('JSON.stringify(MTE_GAME.messages.lines)') + ')');
  var g0 = JSON.parse(await stateSummary());
  await startListening();
  await hold(act.x, act.y, 2200); // hold to auto-repeat gather
  ok(await heard(200) > 0.01, 'gathering in play is heard');
  var g1 = JSON.parse(await stateSummary());
  ok(g1.inv.mycelium > g0.inv.mycelium, 'holding GATHER collected mycelium (' + g0.inv.mycelium + ' -> ' + g1.inv.mycelium + ')');
  console.log('  screenshot: ' + await shot('02a-milestone.png'));
  ok(/of \d+/.test(await evalJS('document.querySelector("#logLines .msg.milestone .who").textContent')), 'the line says which milestone of how many');
  // A finger dragged down the log goes back through older lines (the page's
  // own scroll block once swallowed it), and a new line doesn't pull it back.
  await evalJS('(function(){for(var i=1;i<=10;i++)MTE_GAME.hud.toast("Older line "+i);})()');
  await sleep(300);
  var logBox = await rect('#logLines');
  var logBack = '(function(){var l=document.getElementById("logLines");return Math.round(l.scrollHeight-l.clientHeight-l.scrollTop);})()';
  await drag(logBox.x, logBox.y - logBox.h / 2 + 6, logBox.x, logBox.y + logBox.h / 2 + 140, 20, 16);
  await sleep(400);
  var scrolledBack = await evalJS(logBack);
  ok(scrolledBack > 40, 'dragging down the log scrolls back through older lines (' + scrolledBack + ' px)');
  await evalJS('MTE_GAME.hud.toast("A new line")');
  await sleep(200);
  ok(await evalJS(logBack) > 40, 'and a new line keeps the place being read');
  await evalJS('document.getElementById("logHide").click();document.getElementById("logPill").click()');
  await sleep(200);
  ok(await evalJS(logBack) <= 2, 'reopening the log shows the newest again');
  // Milestones count in any order: walking may have already found ore.
  ok(await waitFor('MTE_GAME.getState().goalIndex >= 1 && document.getElementById("awardCount").textContent === String(MTE_GAME.getState().goalIndex)', 1000), 'the trophy counter counts the milestone');
  ok(await evalJS('document.getElementById("btnAwards").classList.contains("new")'), 'and glows until the awards are looked at');
  ok(await evalJS('(function(){function r(e){return e.getBoundingClientRect();}var a=r(document.getElementById("btnAwards"));return [].slice.call(document.querySelectorAll("#resources .chip, #btnSettings")).every(function(e){var c=r(e);return a.right<=c.left||c.right<=a.left||a.bottom<=c.top||c.bottom<=a.top;});})()'), 'the trophy counter overlaps nothing');
  var awardsBtn = await rect('#btnAwards');
  await tap(awardsBtn.x, awardsBtn.y);
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open") && document.getElementById("sheetTitle").textContent === "Awards" && /mycelium/i.test(document.getElementById("sheetBody").textContent)'), 'tapping it lists the milestones reached');
  ok(await evalJS('!document.getElementById("btnAwards").classList.contains("new")'), 'and the glow stops once seen');
  console.log('  screenshot: ' + await shot('02b-awards.png'));
  await evalJS('document.getElementById("btnClose").click()');
  await sleep(250);
  // Every milestone this world has, crystal ones included, lists once reached
  // (the Awards used to stop opening at the first one the old list lacked).
  var awardsDone = await evalJS('JSON.stringify(MTE_GAME.getState().goalsDone)');
  await evalJS('(function(){var s=MTE_GAME.getState(),g=MTE_GAME.core.worldGoals(s);s.goalsDone=g.slice(0,-1).map(function(x){return x.id;});s.goalIndex=s.goalsDone.length;})()');
  await tap(awardsBtn.x, awardsBtn.y);
  await sleep(300);
  ok(await evalJS('(function(){var s=MTE_GAME.getState();return document.getElementById("sheet").classList.contains("open")&&document.querySelectorAll("#sheetBody .row").length===s.goalsDone.length+1;})()'), 'the Awards open with every milestone of this world reached');
  await evalJS('document.getElementById("btnClose").click()');
  await evalJS('(function(){var s=MTE_GAME.getState();s.goalsDone=' + awardsDone + ';s.goalIndex=s.goalsDone.length;})()');
  await sleep(250);
  var trailStartInv = g1.inv.mycelium;
  var trailStart = await rect('#btnAction');
  await touch('touchStart', [{ x: trailStart.x, y: trailStart.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
  for (var trailStep = 1; trailStep <= 8; trailStep++) {
    await touch('touchMove', [{ x: trailStart.x + (195 - trailStart.x) * trailStep / 8, y: trailStart.y + (422 - trailStart.y) * trailStep / 8, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    await sleep(20);
  }
  // Look for the glow around a point part way along the stroke.
  var probe = { x: Math.round(trailStart.x + (195 - trailStart.x) * 0.45), y: Math.round(trailStart.y + (422 - trailStart.y) * 0.45) };
  var trailGlow = await evalJS('(function(){var c=document.getElementById("game"),g=c.getContext("2d"),d=g.getImageData(0,0,c.width,c.height).data,s=c.width/window.innerWidth;for(var yy=' + (probe.y - 15) + ';yy<=' + (probe.y + 15) + ';yy+=2)for(var xx=' + (probe.x - 15) + ';xx<=' + (probe.x + 15) + ';xx+=2){var i=(Math.floor(yy*s)*c.width+Math.floor(xx*s))*4;if(d[i]<230&&d[i+1]>180&&d[i+2]<175)return true;}return false;})()');
  ok(trailGlow, 'live Trail stroke paints visibly on the map');
  await touch('touchEnd', []);
  await sleep(180);
  var trailEndInv = JSON.parse(await stateSummary()).inv.mycelium;
  ok(trailEndInv > trailStartInv + 1, 'releasing a Trail gathers its highlighted resource tiles (' + trailStartInv + ' -> ' + trailEndInv + ')');
  // A rich forest tile near by, and a tap where it is drawn (the world is
  // random: the nearest can be a way off, and the camera may still be moving).
  var richAt = await evalJS('(()=>{const s=MTE_GAME.getState(),c=MTE_GAME.core;const at=c.nearestTile(s.player.x,s.player.y,60,(x,y)=>c.tileAt(s.world,x,y,0)===c.T.FOREST&&c.richness(s.world,x,y,0)>=10);if(at)MTE_GAME.setPlayer(at.x+.5,at.y+.5);return at;})()');
  ok(!!richAt, 'a rich forest tile is near enough to try a tap on');
  await sleep(400);
  var tapAt = richAt ? await evalJS('(()=>{const s=MTE_GAME.getState(),p=MTE_GAME.project(' + (richAt && richAt.x + .5) + ',' + (richAt && richAt.y + .5) + ',MTE_GAME.core.tileHeight(s.world,' + (richAt && richAt.x) + ',' + (richAt && richAt.y) + ',0));return {x:Math.round(p.x),y:Math.round(p.y)};})()') : { x: 195, y: 422 };
  var tapGatherBefore = JSON.parse(await stateSummary()).inv.mycelium;
  await tap(tapAt.x, tapAt.y);
  await sleep(150);
  var tapGatherAfter = JSON.parse(await stateSummary()).inv.mycelium;
  ok(tapGatherAfter > tapGatherBefore, 'tapping a resource tile gathers it directly');
  // A finger held still on a thing asks Wiki: it answers, outlines it, and
  // Mica neither gathers nor walks.
  var heldFrom = JSON.parse(await stateSummary());
  await touch('touchStart', [{ x: 195, y: 422, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
  ok(await waitFor('!!MTE_GAME.wiki.line && !!MTE_GAME.wiki.focus', 3000), 'a long press asks Wiki about the thing and outlines it (' + await evalJS('JSON.stringify(MTE_GAME.wiki.line)') + ')');
  // Once faded in, and where it is drawn: on top of the tile's own height.
  await waitFor('(function(){var p=MTE_GAME.wiki.pose();return !!(p&&p.focus&&p.focus.alpha>=1);})()', 1000);
  await evalJS('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});})');
  var ringShown = await evalJS('(function(){var f=MTE_GAME.wiki.focus,me=MTE_GAME.getState().player,C=MTE_GAME.core;if(!f)return false;var c=document.getElementById("game"),g=c.getContext("2d"),s=c.width/window.innerWidth,p=MTE_GAME.project(f.x+.5,f.y+.5,f.z+C.tileHeight(MTE_GAME.getState().world,f.x,f.y,f.z)),n=0;var d=g.getImageData(Math.max(0,Math.floor((p.x-MTE_GAME.tilePx()*1.5)*s)),Math.max(0,Math.floor((p.y-MTE_GAME.tilePx()*2.5)*s)),Math.floor(MTE_GAME.tilePx()*3*s),Math.floor(MTE_GAME.tilePx()*3.5*s)).data;for(var i=0;i<d.length;i+=4)if(Math.abs(d[i]-127)<8&&Math.abs(d[i+1]-230)<8&&Math.abs(d[i+2]-196)<8)n++;return n>40;})()');
  ok(ringShown, 'the outline is drawn round it in Wiki teal');
  console.log('  screenshot: ' + await shot('02c-wiki-long-press.png'));
  await sleep(600);
  await touch('touchEnd', []);
  var heldTo = JSON.parse(await stateSummary());
  eq(heldTo.inv.mycelium, heldFrom.inv.mycelium, 'a long press gathers nothing');
  ok(heldTo.x === heldFrom.x && heldTo.y === heldFrom.y, 'a long press does not walk');
  ok(await evalJS('!!MTE_GAME.wiki.line'), 'the answer stays up after the finger lifts');
  // The mouse resting on a thing asks nothing; pressing and holding it does.
  var wasMode = await evalJS('MTE_GAME.wiki.mode');
  await evalJS('MTE_GAME.wiki.setMode("quiet")');
  await waitFor('!MTE_GAME.wiki.line', 8000);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 195, y: 422 }, session);
  await sleep(300);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 196, y: 423 }, session);
  await sleep(1600);
  ok(await evalJS('!MTE_GAME.wiki.line && !MTE_GAME.wiki.focus'), 'hovering the mouse over a thing neither answers nor outlines it');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 196, y: 423, button: 'left', buttons: 1, clickCount: 1 }, session);
  ok(await waitFor('!!MTE_GAME.wiki.line && !!MTE_GAME.wiki.focus', 3000), 'pressing and holding the mouse asks Wiki and outlines the thing');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 196, y: 423, button: 'left', buttons: 0, clickCount: 1 }, session);
  await evalJS('MTE_GAME.wiki.setMode(' + JSON.stringify(wasMode) + ')');
  // A resource out of reach: the tap walks there and gathers it on arrival.
  var far = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;for(var y=-60;y<60;y++)for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)!==1||c.richness(s.world,x,y,0)<3||c.extractorAt(s,x,y,0))continue;var ok=true;for(var k=1;k<=4;k++){var t=c.tileAt(s.world,x-k,y,0);if(!c.walkable(s.world,x-k,y,0)||c.TILE_INFO[t].harvest){ok=false;break;}}if(ok){MTE_GAME.setPlayer(x-2.5,y+0.5);c.revealAround(s);return JSON.stringify({x:x,y:y});}}return "null";})()'));
  ok(!!far, 'found a tree across open ground');
  if (far) {
    await sleep(200);
    var farAt = await evalJS('JSON.stringify(MTE_GAME.project(' + (far.x + 0.5) + ',' + (far.y + 0.5) + '))');
    farAt = JSON.parse(farAt);
    var farBefore = JSON.parse(await stateSummary());
    await tap(farAt.x, farAt.y);
    ok(await waitFor('MTE_GAME.getState().inv.mycelium > ' + farBefore.inv.mycelium, 3000), 'tapping a tree out of reach walks there and gathers it');
  }
  var s1 = await shot('02-gathered.png');
  console.log(await asciiArt(evalJS));
  var contrast = await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var n=0,sum=0,sum2=0;for(var i=0;i<d.length;i+=160){var l=(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11)/255;sum+=l;sum2+=l*l;n++;}var m=sum/n;return JSON.stringify({mean:+m.toFixed(3),std:+Math.sqrt(sum2/n-m*m).toFixed(3)});})()');
  console.log('  luminance ' + contrast);

  /* ------------------------------------- items float home to the stockpile */
  console.log('\n== Gathered items fly to the stockpile ==');
  var spotF = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&c.richness(s.world,x,y,0)>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!spotF, 'moved onto a fresh rich forest tile for the flyer test (' + spotF + ')');
  await sleep(150);
  // (A tap on the tile under you gathers it: Perfect might choose otherwise.)
  var underF = await evalJS('(function(){var p=MTE_GAME.getState().player;return JSON.stringify(MTE_GAME.project(Math.floor(p.x)+0.5,Math.floor(p.y)+0.5));})()');
  underF = JSON.parse(underF);
  await touch('touchStart', [{ x: underF.x, y: underF.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
  var sawFlyers = await waitFor('MTE_GAME.flyers().length > 0', 3000);
  ok(sawFlyers, 'gathering sends items flying');
  // They head for the yard (a pile of their resource, or home), not the player.
  ok(await evalJS('(function(){var s=MTE_GAME.getState(),h=MTE_GAME.core.home(s);return MTE_GAME.flyers().every(function(f){var toYard=Math.max(Math.abs(f.x1-h.x),Math.abs(f.y1-h.y))<=MTE_GAME.core.HOME_HALF+1,toPlayer=Math.hypot(f.x1-s.player.x,f.y1-s.player.y)<0.6;return toYard&&!toPlayer;});})()'),
    'they fly to the stockpile, not to the player (' + await evalJS('JSON.stringify(MTE_GAME.flyers().slice(0,2).map(function(f){return [+f.x1.toFixed(1),+f.y1.toFixed(1)];}))') + ')');
  await touch('touchEnd', []);
  ok(await evalJS('MTE_GAME.flyers().every(function(f){return Math.hypot(f.x1-f.x0,f.y1-f.y0)/f.dur<MTE_GAME.core.BASE_SPEED;})'),
    'they drift home slower than you walk, so you can follow them');
  // Gains from one tile ride on the bundle it launched for 2 s (FLYER_MERGE).
  ok(await evalJS('(function(){var last={};return MTE_GAME.flyers().slice().sort(function(a,b){return b.t-a.t;}).every(function(o){var k=o.tx+","+o.ty+","+o.res,ok=!(k in last)||last[k]-o.t>1.9;last[k]=o.t;return ok;});})()'),
    'each tile sends one bundle at a time, not a burst');

  /* --------------------------------- SPACE hold must gather at the cd rate */
  console.log('\n== Hold SPACE gathers at GATHER_CD (no key-repeat turbo) ==');
  var spotK = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&c.richness(s.world,x,y,0)>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!spotK, 'standing on a fresh rich forest tile for the SPACE test (' + spotK + ')');
  await sleep(150);
  var kg0 = await evalJS('MTE_GAME.getState().stats.gathers');
  await key('keyDown', ' ', 'Space', 32); // one physical press
  await sleep(60);
  var kg1 = await evalJS('MTE_GAME.getState().stats.gathers');
  eq(kg1, kg0 + 1, 'one SPACE press gathers exactly once (no double action)');
  var stormT0 = await evalJS('MTE_GAME.getState().time');
  for (var rep = 0; rep < 15; rep++) { // OS key-repeat storm
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, autoRepeat: true }, session);
  }
  await sleep(60);
  var kg2 = await evalJS('MTE_GAME.getState().stats.gathers');
  // Holding paces gathers at one per 0.25 s of game time, however many repeat
  // events arrive: allow exactly that (the storm takes longer on a busy machine).
  var stormSecs = await evalJS('MTE_GAME.getState().time') - stormT0;
  ok(kg2 - kg1 <= Math.ceil(stormSecs / 0.25) + 1, '15 repeat keydowns did not turbo-gather (gathers ' + kg1 + ' -> ' + kg2 + ' in ' + stormSecs.toFixed(2) + ' s)');
  await key('keyUp', ' ', 'Space', 32);
  await sleep(100);

  /* ----------------------------------------------------------- upgrade */
  console.log('\n== Upgrade (craft an Basket) ==');
  var upgradeControl = await rect('#btnUpgrade');
  await tap(upgradeControl.x, upgradeControl.y);
  var craftGearControl=await rect('#btnEquipmentCraft');await tap(craftGearControl.x,craftGearControl.y);
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'upgrade sheet opened');
  var axeCraft = await evalJS('(function(){var b=document.querySelector(".row button[data-id=basket]");return b?{disabled:b.disabled}:"missing";})()');
  // Prices say how much more you still need, not the total.
  var savedInv = await evalJS('JSON.stringify(MTE_GAME.getState().inv)');
  await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core.upgradeCost(s,"basket");for(var r in c)s.inv[r]=0;s.inv[Object.keys(c)[0]]=c[Object.keys(c)[0]]-3;})()');
  ok(await waitFor('(function(){var row=document.querySelector(".row button[data-id=basket]").closest(".row"),s=MTE_GAME.getState(),c=MTE_GAME.core.upgradeCost(s,"basket"),k=Object.keys(c);var need=[...row.querySelectorAll(".amt.need .n")].map(function(n){return n.textContent;});return need[0]==="3"&&need.length===k.length;})()', 2000),
    'a price shows how much more of each resource is needed (' + await evalJS('[...document.querySelector(".row button[data-id=basket]").closest(".row").querySelectorAll(".amt")].map(function(a){return a.className+":"+a.textContent;}).join(" ")') + ')');
  await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core.upgradeCost(s,"basket");for(var r in c)s.inv[r]=c[r];})()');
  ok(await waitFor('(function(){var row=document.querySelector(".row button[data-id=basket]").closest(".row");return row.querySelector(".price.ready")&&!row.querySelector(".amt.need");})()', 2000), 'once you have it all, the price shows what it costs');
  ok(await waitFor('!!document.querySelector(".row button[data-id=basket]").closest(".row").querySelector(".nm .newTag")', 2000), 'a row that just became affordable says NEW while the sheet is open');
  ok(!(await evalJS('document.getElementById("btnUpgrade").classList.contains("has")')), 'UPGRADE does not say NEW while its own sheet is open');
  ok(await evalJS('/gradient/.test(getComputedStyle(document.querySelector(".row button[data-id=basket]")).backgroundImage)'), 'a button you can press looks raised and solid');
  console.log('  screenshot: ' + await shot('02c-upgrades.png'));
  await evalJS('Object.assign(MTE_GAME.getState().inv,' + savedInv + ')');
  await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core.upgradeCost(s,"basket");for(var r in c)if(s.inv[r]<c[r])MTE_GAME.addRes(r,c[r]-s.inv[r]);})()');
  await sleep(150);
  var axeButton = await rect('.row button[data-id=basket]');
  await tap(axeButton.x, axeButton.y);
  await sleep(200);
  var u1 = JSON.parse(await stateSummary());
  eq(u1.tools.basket, 2, 'basket upgraded to level 2');
  // Tapping the world past the sheet closes it, and does nothing else.
  var beforeTapOut = JSON.parse(await stateSummary());
  await tap(195, 90);
  await sleep(300);
  ok(await evalJS('!document.getElementById("sheet").classList.contains("open")'), 'tapping the map past the sheet closes it');
  var afterTapOut = JSON.parse(await stateSummary());
  ok(afterTapOut.x === beforeTapOut.x && afterTapOut.y === beforeTapOut.y && afterTapOut.inv.mycelium === beforeTapOut.inv.mycelium, 'that tap only closes the sheet: no walking, no gathering');

  /* ------------------------------------------------------------ build */
  console.log('\n== Build extractor (touch Place) ==');
  // On the surface, whatever an earlier step left (a garden goes on forest).
  var spot2 = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&!s.extractors.some(function(e){return e.x===x&&e.y===y;})){s.player.z=0;MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  await evalJS('MTE_GAME.addRes("mycelium",80)');
  await sleep(150);
  var buildBtn = await rect('#btnBuild');
  await tap(buildBtn.x, buildBtn.y);
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'build sheet opened via touch tap');
  eq(await evalJS('document.querySelector("#tabs .tab.active").dataset.tab'), 'build', 'Build tab is highlighted when opened via the button');
  var placeReady = await evalJS('(function(){var b=document.querySelector(".row button[data-id=garden]");return b?!b.disabled:false;})()');
  ok(placeReady, 'Mushroom Garden can be placed on the current tile');
  var gardenButton = await rect('.row button[data-id=garden]');
  await tap(gardenButton.x, gardenButton.y);
  await sleep(250);
  ok(await evalJS('!document.getElementById("sheet").classList.contains("open")&&!document.getElementById("placeCard").hidden&&getComputedStyle(document.getElementById("thumbDock")).visibility==="hidden"'), 'Place closes the sheet, shows the placement card and moves the thumb buttons aside');
  var placeHere = await rect('#placeCard [data-do=go]');
  await tap(placeHere.x, placeHere.y);
  // Built at once beside you; a tile further off is walked to first.
  await waitFor('MTE_GAME.getState().extractors.length===1', 6000);
  var b3 = JSON.parse(await stateSummary());
  eq(b3.ext, 1, 'garden camp constructed' + (b3.ext ? '' : ' (card: ' + await evalJS('document.getElementById("placeCard").innerText.replace(/\\s+/g," ")') + ')'));
  ok(await evalJS('document.getElementById("placeCard").hidden&&!document.body.classList.contains("placing")'), 'the placement card goes once it stands');
  // Placement leaves play unobstructed; inspection/Move is an explicit choice.
  ok(await evalJS('document.getElementById("buildingCard").hidden'), 'the new garden does not automatically open its card');
  await evalJS('(()=>{const e=MTE_GAME.getState().extractors[0];MTE_GAME.openCard(e.x,e.y)})()');
  ok(await evalJS('!!document.querySelector("#buildingCard [data-type=move]")'), 'selecting the garden later offers Move');
  var moveTo = await evalJS('(function(){var c=MTE_GAME.core,s=MTE_GAME.getState(),e=s.extractors[0];for(var dy=-1;dy<=1;dy++)for(var dx=-1;dx<=1;dx++){if((dx||dy)&&c.extractorFits(s,"garden",e.x+dx,e.y+dy)&&c.inReach(s,e.x+dx,e.y+dy))return JSON.stringify({x:e.x+dx,y:e.y+dy});}return null;})()');
  if (moveTo) {
    moveTo = JSON.parse(moveTo);
    await evalJS('document.querySelector("#buildingCard [data-type=move]").click()');
    await sleep(500); // placing ignores map taps for a moment (placing.js SETTLE_MS)
    var moveAt = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.project(' + (moveTo.x + 0.5) + ',' + (moveTo.y + 0.5) + '))'));
    await tap(moveAt.x, moveAt.y);
    await sleep(150);
    var moveHere = await rect('#placeCard [data-do=go]');
    await tap(moveHere.x, moveHere.y);
    await sleep(250);
    ok(await waitFor('(function(){var e=MTE_GAME.getState().extractors[0];return e.x===' + moveTo.x + '&&e.y===' + moveTo.y + ';})()', 1500), 'Move puts the garden on the tapped tile, for free');
    await evalJS('var c=document.querySelector("#placeCard:not([hidden]) [data-do=cancel]");if(c)c.click()');
  }
  var camp = await evalJS('(function(){var e=MTE_GAME.getState().extractors[0];e.buffer=8;MTE_GAME.setPlayer(e.x+0.5,e.y+0.5);return e.x+","+e.y;})()');
  await sleep(400);
  ok(await evalJS('document.getElementById("actionLabel").textContent.indexOf("COLLECT") === 0'), 'Gather control changes to Collect near stored extractor goods (' + camp + ')');
  var doneButton = await rect('#btnClose');
  await tap(doneButton.x, doneButton.y);
  await sleep(250);
  var collectBefore = JSON.parse(await stateSummary()).inv.mycelium;
  var campAt = await evalJS('(function(){var e=MTE_GAME.getState().extractors[0];return JSON.stringify(MTE_GAME.project(e.x+0.5,e.y+0.5));})()');
  campAt = JSON.parse(campAt);
  await tap(campAt.x, campAt.y);
  await sleep(200);
  var collectAfter = JSON.parse(await stateSummary());
  ok(collectAfter.inv.mycelium > collectBefore, 'tapping the garden collects its stored goods (' + camp + ')');
  ok(collectAfter.buf[0] < 4, 'Collect drains the nearby buffer while production continues (' + collectAfter.buf[0].toFixed(2) + ' remains)');
  await sleep(200);

  console.log('\n== BUILD / UPGRADE buttons switch tabs ==');
  var upBtn = await rect('#btnUpgrade');
  await tap(upBtn.x, upBtn.y);
  var craftGear=await rect('#btnEquipmentCraft');await tap(craftGear.x,craftGear.y);
  await sleep(250);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'upgrade sheet opened via touch tap');
  eq(await evalJS('document.querySelector("#tabs .tab.active").dataset.tab'), 'upgrades', 'Upgrades tab is highlighted when opened via the button');
  // Settings live behind the gear, not under every list.
  ok(await evalJS('document.getElementById("btnMute").offsetParent === null'), 'settings are not shown with the game lists');
  var gear = await rect('#btnSettings');
  await tap(gear.x, gear.y);
  await sleep(250);
  eq(await evalJS('document.getElementById("sheetTitle").textContent'), 'Settings', 'the gear switches the sheet to Settings');
  ok(await evalJS('document.getElementById("sheetBody").hidden && getComputedStyle(document.getElementById("tabs")).display === "none"'), 'Settings shows no game list and no tabs');
  // The technical things wait one row further in, under Nerds.
  ok(await evalJS('document.getElementById("btnBackupSave").offsetParent === null && document.getElementById("version").offsetParent === null'), 'Settings keeps backups and the version out of sight');
  await evalJS('document.getElementById("btnNerds").click()');
  await sleep(100);
  eq(await evalJS('document.getElementById("sheetTitle").textContent'), 'Nerds', 'Nerds opens its own screen');
  ok(await evalJS('document.getElementById("sheetTitle").offsetParent !== null && getComputedStyle(document.getElementById("tabs")).display === "none"'), 'Nerds shows its title, not the game tabs');
  ok(await evalJS('document.getElementById("btnBackupSave").offsetParent !== null && document.getElementById("btnMute").offsetParent === null'), 'Nerds shows backups, not the everyday settings');
  ok(/v\d+\.\d+\.\d+/.test(await evalJS('document.getElementById("version").textContent')), 'the version is shown in Nerds');
  eq(await evalJS('document.getElementById("perfState").textContent'), 'off', 'the performance panel switch starts off');
  await evalJS('document.getElementById("btnPerf").click()');
  ok(await evalJS('!document.getElementById("perf").hidden && document.getElementById("perfState").textContent === "on"'), 'its switch opens the performance panel');
  await evalJS('document.getElementById("btnPerf").click()');
  eq(await evalJS('document.getElementById("perf").hidden'), true, 'and closes it');
  // Back, three ways: ‹, Escape and the phone's own Back, each one screen.
  ok(await evalJS('document.getElementById("btnBack").offsetParent !== null'), 'Nerds has a back button');
  await evalJS('document.getElementById("btnBack").click()');
  await sleep(100);
  eq(await evalJS('document.getElementById("sheetTitle").textContent'), 'Settings', '‹ goes back to Settings');
  ok(await evalJS('document.getElementById("btnBack").offsetParent === null'), 'Settings itself has no back button');
  await evalJS('document.getElementById("btnNerds").click()');
  await sleep(100);
  await key('keyDown', 'Escape', 'Escape', 27);
  await key('keyUp', 'Escape', 'Escape', 27);
  await sleep(100);
  eq(await evalJS('document.getElementById("sheetTitle").textContent + " " + document.getElementById("sheet").classList.contains("open")'), 'Settings true', 'Escape goes back to Settings');
  await evalJS('document.getElementById("btnNerds").click()');
  await sleep(150);
  await evalJS('history.back()');
  await sleep(300);
  eq(await evalJS('document.getElementById("sheetTitle").textContent + " " + document.getElementById("sheet").classList.contains("open")'), 'Settings true', "the phone's Back goes back to Settings");
  await evalJS('document.getElementById("btnNerds").click()');
  await sleep(100);
  await evalJS('document.getElementById("btnSettings").click()');
  await sleep(100);
  eq(await evalJS('document.getElementById("sheetTitle").textContent'), 'Settings', 'the gear goes back to Settings');
  var muteButton = await rect('#btnMute');
  await tap(muteButton.x, muteButton.y);
  eq(await evalJS('document.getElementById("muteState").textContent'), 'off', 'Sound control mutes with one tap');
  muteButton = await rect('#btnMute');
  await tap(muteButton.x, muteButton.y);
  eq(await evalJS('document.getElementById("muteState").textContent'), 'on', 'Sound control unmutes with one tap');
  eq(await evalJS('document.getElementById("wikiLink").getAttribute("href")'), 'wiki/', 'the sheet links to the wiki');
  eq(await evalJS('document.getElementById("wikiLink").target'), '_blank', 'the wiki opens outside the game');
  await evalJS('document.querySelector("#tabs .tab[data-tab=upgrades]").click()');
  var audioState = await evalJS('MTE_GAME.audioState()');
  console.log('  audio state after gestures: ' + audioState);
  ok(audioState !== 'none', 'audio context is created by early gestures (was: ' + audioState + ')');
  // Embarking is the end of a world: no sign of it while you're upgrading.
  ok(await evalJS('document.getElementById("tabBeyond").hidden'), 'the Beyond tab stays hidden while there are upgrades to buy');
  eq(await evalJS('document.querySelectorAll("#sheetBody button[data-family]").length'), 4, 'the progression map shows only the four world families');
  await sleep(200);
  await key('keyDown', 'b', 'KeyB', 66);
  await key('keyUp', 'b', 'KeyB', 66);
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'B key keeps the sheet open while switching tabs');
  eq(await evalJS('document.querySelector("#tabs .tab.active").dataset.tab'), 'build', 'B key switches an open sheet to the Build tab');
  await key('keyDown', 'b', 'KeyB', 66);
  await key('keyUp', 'b', 'KeyB', 66);
  await sleep(300);
  ok(!(await evalJS('document.getElementById("sheet").classList.contains("open")')), 'B key closes the sheet when Build is already active');

  console.log('\n== NEW on BUILD stays until you look ==');
  var newSaved = await evalJS('JSON.stringify({inv:MTE_GAME.getState().inv,x:MTE_GAME.getState().player.x,y:MTE_GAME.getState().player.y})');
  // One more garden than any seen yet (each next one is new), then its price.
  await evalJS('(function(){var s=MTE_GAME.getState();for(var r in s.inv)s.inv[r]=0;s.extractors.push({key:"garden",res:"mycelium",x:9999,y:9999,z:s.player.z,buffer:0});})()');
  await sleep(400);
  await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core.extractorCost(s,"garden");for(var r in c)if(s.inv[r]<c[r])MTE_GAME.addRes(r,c[r]-s.inv[r]);})()');
  ok(await waitFor('document.getElementById("btnBuild").classList.contains("has")', 2000), 'BUILD says NEW once a building becomes affordable');
  ok(await evalJS('getComputedStyle(document.querySelector("#btnBuild .newTag")).display !== "none" && document.querySelector("#btnBuild .newTag").textContent === "NEW"'), 'the tag reads NEW');
  await evalJS('(function(){var s=MTE_GAME.getState();MTE_GAME.setPlayer(s.player.x+60,s.player.y+60);for(var r in s.inv)s.inv[r]=0;})()');
  await sleep(600);
  ok(await evalJS('document.getElementById("btnBuild").classList.contains("has")'), 'walking away and spending do not take NEW away');
  var buildBtn = await rect('#btnBuild');
  await tap(buildBtn.x, buildBtn.y);
  await sleep(300);
  ok(await evalJS('!!document.querySelector(".row button[data-id=garden]").closest(".row").querySelector(".nm .newTag")'), 'the new row says NEW in the sheet');
  await key('keyDown', 'Escape', 'Escape', 27);
  await key('keyUp', 'Escape', 'Escape', 27);
  await sleep(600);
  ok(!(await evalJS('document.getElementById("btnBuild").classList.contains("has")')), 'once looked at, BUILD no longer says NEW');
  await evalJS('(function(){var v=' + newSaved + ',s=MTE_GAME.getState();s.extractors.pop();Object.assign(s.inv,v.inv);MTE_GAME.setPlayer(v.x,v.y);})()');

  console.log('\n== Automation produces over time ==');
  await sleep(2500);
  var prod = JSON.parse(await stateSummary());
  ok(prod.buf[0] > 0.3, 'garden camp is producing (buffer ' + prod.buf[0] + ')');

  /* ------------------------------------------------------ persistence */
  console.log('\n== Persistence across reload ==');
  await evalJS('MTE_GAME.addRes("ore",42); MTE_GAME.save();');
  var pre = JSON.parse(await stateSummary());
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  var post = JSON.parse(await stateSummary());
  eq(post.tools.basket, pre.tools.basket, 'basket level survives reload');
  eq(post.ext, pre.ext, 'extractor survives reload');
  eq(Math.floor(post.inv.ore), Math.floor(pre.inv.ore), 'ore inventory survives reload');
  eq(post.seed === undefined ? undefined : post.seed, undefined, 'seed key shape ok'); // no-op guard
  ok(Math.abs(post.x - pre.x) < 0.05 && Math.abs(post.y - pre.y) < 0.05, 'player position survives reload');

  console.log('\n== Two tabs, one save ==');
  // Another tab saves a world further along. This tab must not overwrite it
  // on its next save: it pauses and asks which world to keep.
  var KEY = '"more-than-enough-save"';
  await evalJS('MTE_GAME.save()');
  // A tab in a shared world never writes this save: another tab saving it
  // (say the one that went back to playing alone) must not stop it to ask.
  var ownRaw = await evalJS('localStorage.getItem(' + KEY + ')');
  await evalJS('MTE_GAME.getState().shared = "e2e-shared"');
  await evalJS('(function(){var d=JSON.parse(localStorage.getItem(' + KEY + '));d.time+=60;localStorage.setItem(' + KEY + ',JSON.stringify(d));dispatchEvent(new StorageEvent("storage",{key:' + KEY + ',newValue:localStorage.getItem(' + KEY + ')}));})()');
  ok(await evalJS('document.getElementById("fork").hidden'), 'a tab in a shared world is not asked about the solo save');
  await evalJS('MTE_GAME.getState().shared = null; localStorage.setItem(' + KEY + ',' + JSON.stringify(ownRaw) + ')');
  await evalJS('(function(){var d=JSON.parse(localStorage.getItem(' + KEY + '));d.time+=7200;d.stats.mycelium+=500000;d.inv.mycelium=777777;localStorage.setItem(' + KEY + ',JSON.stringify(d));})()');
  var otherRaw = await evalJS('localStorage.getItem(' + KEY + ')');
  await evalJS('MTE_GAME.save()');
  ok(await evalJS('!document.getElementById("fork").hidden'), 'saving after another tab did shows the choice instead');
  ok(await evalJS('localStorage.getItem(' + KEY + ')') === otherRaw, "the other tab's save is untouched");
  console.log('  screenshot: ' + await shot('03-two-tabs.png'));
  eq(await evalJS('document.querySelector("#fork button.ahead").dataset.pick'), 'other', "the other tab's world is marked as further along");
  var pausedAt = await evalJS('MTE_GAME.getState().time');
  await sleep(300);
  eq(await evalJS('MTE_GAME.getState().time'), pausedAt, 'the game waits while you choose');
  await evalJS('dispatchEvent(new Event("pagehide"))');
  ok(await evalJS('localStorage.getItem(' + KEY + ')') === otherRaw, 'closing the tab while it asks saves nothing');
  // The other tab is still open and saves again while this one asks.
  await evalJS('(function(){var d=JSON.parse(localStorage.getItem(' + KEY + '));d.time+=60;d.inv.mycelium=888888;localStorage.setItem(' + KEY + ',JSON.stringify(d));})()');
  var pickOther = await rect('#fork button[data-pick=other]');
  await tap(pickOther.x, pickOther.y);
  ok(await evalJS('document.getElementById("fork").hidden'), 'picking a world closes the choice');
  eq(await evalJS('Math.floor(MTE_GAME.getState().inv.mycelium)'), 888888, "picking the other tab's world plays its newest save here");
  await evalJS('MTE_GAME.save()');
  ok(await evalJS('document.getElementById("fork").hidden'), 'one tap is enough: the next save does not ask again');
  // And the other way: an older save appears; keeping this tab's overwrites it.
  await evalJS('(function(){var d=JSON.parse(localStorage.getItem(' + KEY + '));d.time=1;d.inv.mycelium=5;localStorage.setItem(' + KEY + ',JSON.stringify(d));})()');
  await evalJS('MTE_GAME.save()');
  eq(await evalJS('document.querySelector("#fork button.ahead").dataset.pick'), 'mine', "this tab's world is marked when it's further along");
  var pickMine = await rect('#fork button[data-pick=mine]');
  await tap(pickMine.x, pickMine.y);
  eq(await evalJS('JSON.parse(localStorage.getItem(' + KEY + ')).inv.mycelium'), 888888, "keeping this tab's world saves it over the older one");
  await evalJS('MTE_GAME.save()');
  ok(await evalJS('document.getElementById("fork").hidden'), 'after choosing, saving carries on as normal');

  var s3 = await shot('03-reloaded.png');
  console.log('  screenshot: ' + s3);

  /* --------------------------------------------------- exploration aid */
  console.log('\n== Endless world: resources to find + fog reveal ==');
  var exploreInfo = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;var ore=0,crystal=0,crystalNear=0;for(var y=-60;y<60;y++)for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===3)ore++;}for(var y=-240;y<240;y+=2)for(var x=-240;x<240;x+=2){if(c.tileAt(s.world,x,y,0)===4){crystal++;if(x*x+y*y<1600)crystalNear++;}}var px=Math.floor(s.player.x),py=Math.floor(s.player.y);return JSON.stringify({ore:ore,crystal:crystal,crystalNear:crystalNear,here:c.isExplored(s.world,px,py,0),far:c.isExplored(s.world,px+300,py+300,0),farTile:typeof c.tileAt(s.world,420000,-420000,0)});})()');
  var ri = JSON.parse(exploreInfo);
  console.log('  near origin: ore=' + ri.ore + ' crystal=' + ri.crystal + '  fog(here/far)=' + ri.here + '/' + ri.far);
  ok(ri.ore > 30, 'ore occurs near the origin');
  ok(ri.crystal > 3 && ri.crystalNear === 0, 'crystal is out there, but never close to home');
  ok(ri.here && !ri.far, 'fog is revealed around the player but not far away');
  ok(ri.farTile === 'number', 'terrain exists thousands of tiles from the origin');

  /* ------------------------------------------------------ regions + map */
  console.log('\n== Regions and the world map ==');
  var home = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.core.regionAt(MTE_GAME.getState().world.seed, 0, 0))'));
  eq(home.biome, 'meadow', 'every world starts in a meadow');
  var was = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  var next = JSON.parse(await evalJS('(function(){var c=MTE_GAME.core,s=MTE_GAME.getState(),x=0;s.player.z=0;while(c.regionAt(s.world.seed,x,0).key==="0,0")x++;x+=10;MTE_GAME.setPlayer(x+0.5,0.5);return JSON.stringify(c.regionAt(s.world.seed,x,0));})()'));
  await waitFor('document.querySelector("#place strong").textContent === ' + JSON.stringify(next.name), 30000);
  eq(await evalJS('document.querySelector("#place strong").textContent'), next.name, 'walking into a region shows its name (log: ' + await evalJS('MTE_GAME.messages.last') + ')');
  await evalJS('MTE_GAME.getState().player.z=' + was.z + ';MTE_GAME.setPlayer(' + was.x + ',' + was.y + ')');
  // The world map is the game zoomed out all the way: the map button glides
  // there, a drag pans it without moving you, and the button comes back.
  var zoomWas = await evalJS('MTE_GAME.zoom()');
  await evalJS('document.getElementById("btnMap").click()');
  ok(await waitFor('MTE_GAME.mapOn()', 3000), 'the map button zooms out to the world map');
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")') === false, 'with no sheet over the game');
  await sleep(600);
  ok(JSON.parse(await evalJS('JSON.stringify(MTE_GAME.mapNames())')).indexOf(home.name) >= 0, 'the map names the home region');
  var before = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  await drag(200, 400, 80, 400, 8);
  var after = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  ok(Math.abs(after.x - before.x) < 0.01 && Math.abs(after.y - before.y) < 0.01, 'a drag on the map pans it and leaves you where you are');
  ok(await evalJS('document.getElementById("btnMap").innerHTML.indexOf("circle") >= 0'), 'panned away, the map button brings the map back to you');
  console.log('  screenshot: ' + await shot('05b-world-map.png'));
  await evalJS('document.getElementById("btnMap").click()');
  await evalJS('document.getElementById("btnMap").click()');
  ok(await waitFor('!MTE_GAME.mapOn() && Math.abs(MTE_GAME.zoom() - ' + zoomWas + ') < 0.02', 4000), 'and then back to the zoom you had (' + await evalJS('MTE_GAME.zoom()') + ')');

  /* -------------------------------------------------- late-game UI */
  console.log('\n== Late-game UI (refinery chains, converters, Beyond) ==');
  await evalJS('MTE_GAME.addRes("mycelium",900000); MTE_GAME.addRes("stone",900000); MTE_GAME.addRes("ore",900000); MTE_GAME.addRes("crystal",90000);');
  await evalJS('document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
  await sleep(300);
  ok(await evalJS('["refining","abundance","unlocks"].every(function(f){var b=document.querySelector("#sheetBody button[data-family="+f+"]");return b&&b.getAttribute("aria-expanded")==="true";})'),
    'families with something to buy open by themselves');
  await evalJS('document.querySelector("#sheetBody button[data-family=unlocks]").click()');
  eq(await evalJS('document.querySelector("#sheetBody button[data-family=unlocks]").getAttribute("aria-expanded")'), 'false', 'and tapping one closes it');
  await evalJS('document.querySelector("#sheetBody button[data-family=unlocks]").click()');
  var resupRows = await evalJS('document.querySelectorAll("#sheetBody button[data-kind=resup]").length');
  eq(resupRows, 4, 'four refinery-chain rows rendered');
  ok(await evalJS('!!document.querySelector("#sheetBody button[data-id=abundance]")'), 'Abundance Engine row is levelable');
  var myceliumBefore = await evalJS('MTE_GAME.getState().resUp.mycelium');
  await evalJS('document.querySelector("#sheetBody button[data-kind=resup][data-id=mycelium]").click()');
  await sleep(200);
  eq(await evalJS('MTE_GAME.getState().resUp.mycelium'), myceliumBefore + 1, 'clicking Refine advances the mycelium chain');
  var abBefore = await evalJS('MTE_GAME.getState().abundanceLv');
  await evalJS('document.querySelector("#sheetBody button[data-id=abundance]").click()');
  await sleep(200);
  eq(await evalJS('MTE_GAME.getState().abundanceLv'), abBefore + 1, 'Abundance Engine levels up on click');
  await evalJS('document.getElementById("btnClose").click()');
  await sleep(200);

  await evalJS('document.getElementById("btnBuild").click()');
  await sleep(300);
  var foundryLocked = await evalJS('(function(){var b=document.querySelector("#sheetBody button[data-id=foundry]");return b?{disabled:b.disabled,text:b.textContent}:null;})()');
  ok(foundryLocked && foundryLocked.disabled, 'Foundry converter is locked until its blueprint is crafted');
  await evalJS('document.getElementById("btnClose").click()');
  await evalJS('document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
  await sleep(250);
  await evalJS('document.querySelector("#sheetBody button[data-kind=unlock][data-id=foundry]").click()');
  await sleep(200);
  ok(await evalJS('!!MTE_GAME.getState().unlocks.foundry'), 'Foundry blueprint unlocked from Upgrades');
  await evalJS('document.getElementById("btnClose").click()');
  await sleep(200);
  await evalJS('document.getElementById("btnBuild").click()');
  await sleep(250);
  var extBefore = await evalJS('MTE_GAME.getState().extractors.length');
  var canPlace = await evalJS('(function(){var b=document.querySelector("#sheetBody button[data-id=foundry]");return b?!b.disabled:false;})()');
  ok(canPlace, 'Foundry becomes place-able after unlock');
  await evalJS('document.querySelector("#sheetBody button[data-id=foundry]").click()');
  await evalJS('document.querySelector("#placeCard [data-do=go]").click()');
  await sleep(250);
  ok(await evalJS('MTE_GAME.getState().extractors.length') > extBefore, 'Foundry converter placed on open land');
  await evalJS('document.getElementById("btnClose").click()');
  await sleep(200);

  await evalJS('(function(){var s=MTE_GAME.getState();s.stats.mycelium=MTE_GAME.core.EMBARK_MIN_TOTAL;})()');
  await sleep(500);
  ok(await evalJS('document.getElementById("tabBeyond").hidden'), 'a huge haul alone does not reveal Beyond');
  // Master the world: every tool, refinery and unlock, Abundance to the embark level.
  await evalJS('(function(){var s=MTE_GAME.getState(),C=MTE_GAME.core;for(var k in s.tools)s.tools[k]=C.TOOLS[k].levels.length;for(k in s.resUp)s.resUp[k]=C.REFINERIES[k].levels.length;for(k in s.unlocks)s.unlocks[k]=true;s.abundanceLv=C.EMBARK_ABUNDANCE;})()');
  ok(await waitFor('!document.getElementById("tabBeyond").hidden', 1500), 'mastering the world reveals the Beyond tab');
  await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
  await sleep(250);
  eq(await evalJS('document.querySelectorAll("#sheetBody button[data-kind=perk]").length'), 0, 'new worlds do not offer legacy carry-over perks');
  await evalJS('MTE_GAME.getState().emptyStart=false;document.querySelector(".tab[data-tab=beyond]").click()');
  eq(await evalJS('document.querySelectorAll("#sheetBody button[data-kind=perk]").length'), 3, 'three active legacy perks offered in the Beyond tab');
  ok(await evalJS('(function(){var b=document.querySelector("#sheetBody button[data-kind=embark]");return b?!b.disabled:false;})()'), 'Embark is enabled in a mastered world with enough gathered');
  await evalJS('(function(){var s=MTE_GAME.getState();s.insight=5;})()');
  await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
  await sleep(200);
  var legacyBefore = await evalJS('MTE_GAME.getState().perks.legacy');
  await evalJS('document.querySelector("#sheetBody button[data-kind=perk][data-id=legacy]").click()');
  await sleep(150);
  eq(await evalJS('MTE_GAME.getState().perks.legacy'), legacyBefore + 1, 'buying Legacy raises the perk level');
  console.log('  screenshot: ' + await shot('04-beyond.png'));

  // Inject a leftover flyer so we can prove a fresh world doesn't drag the old
  // world's resource sprites across the screen.
  await evalJS('MTE_GAME.flyers().push({x:-999,y:-999,res:"mycelium",seed:0,delay:0.16,t:0,vx:0,vy:0})');
  ok(await evalJS('MTE_GAME.flyers().length') >= 1, 'a leftover flyer exists before embarking');
  var prestigeBefore = await evalJS('MTE_GAME.getState().prestiges');
  await evalJS('document.querySelector("#sheetBody button[data-kind=embark]").click()');
  await sleep(150);
  ok(await evalJS('!document.getElementById("ask").hidden && /empty-handed/.test(document.getElementById("ask").textContent)'), 'Embark asks first and explains the empty-handed start');
  await evalJS('document.querySelector("#ask .secondary").click()');
  await sleep(150);
  ok(await evalJS('document.getElementById("ask").hidden && MTE_GAME.getState().prestiges === ' + prestigeBefore), 'Cancel keeps the world');
  await evalJS('document.querySelector("#sheetBody button[data-kind=embark]").click()');
  await sleep(150);
  await evalJS('document.querySelector("#ask .primary").click()');
  await sleep(400);
  var afterEmbark = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState();return JSON.stringify({prestiges:s.prestiges,insight:s.insight,ext:s.extractors.length});})()'));
  eq(afterEmbark.prestiges, prestigeBefore + 1, 'embark increments the prestige count');
  eq(afterEmbark.ext, 0, 'embark resets extractors');
  eq(afterEmbark.insight, 0, 'new worlds carry no spendable Insight');
  ok(await evalJS('!MTE_GAME.core.canEmbark(MTE_GAME.getState())'), 'carried lifetime progress cannot enable immediate re-embark');
  eq(await evalJS('MTE_GAME.flyers().length'), 0, 'embarking clears leftover resource flyers');
  ok(await evalJS('!document.getElementById("tabBeyond").hidden'), 'after an Embark, Beyond stays for the perks');

  /* --------------------------- Logistics hauls from anywhere (v0.111.0) */
  console.log('\n== Logistics auto-collect works at any distance ==');
  await evalJS('(function(){var s=MTE_GAME.getState();s.unlocks.logistics=true;var ex={key:"garden",res:"mycelium",x:Math.floor(s.player.x),y:Math.floor(s.player.y),z:0,buffer:10};s.extractors.push(ex);MTE_GAME.setPlayer(ex.x+0.5,ex.y+0.5);})()');
  await sleep(300);
  var lg0 = JSON.parse(await stateSummary());
  ok(lg0.inv.mycelium >= 10, 'standing by the extractor auto-collects its buffer (' + lg0.inv.mycelium + ')');
  await evalJS('(function(){var s=MTE_GAME.getState();MTE_GAME.setPlayer(s.player.x+80,s.player.y+80);})()');
  await sleep(200);
  var lg1 = JSON.parse(await stateSummary());
  ok(await waitFor('MTE_GAME.getState().inv.mycelium > ' + lg1.inv.mycelium, 5000), 'far extractor still delivers its production');
  var lg2 = JSON.parse(await stateSummary());
  ok(lg2.inv.mycelium > lg1.inv.mycelium, 'walking far away keeps auto-collect running');
  ok(lg2.buf[0] < 1, 'the far buffer sends whole units to the packs');
  // Returning is no longer required, but parks the player for the night test.
  await evalJS('(function(){var s=MTE_GAME.getState();var e=s.extractors[0];MTE_GAME.setPlayer(e.x+0.5,e.y+0.5);})()');
  ok(await waitFor('MTE_GAME.getState().inv.mycelium > ' + lg2.inv.mycelium, 5000), 'production continues after returning');
  var lg3 = JSON.parse(await stateSummary());
  ok(lg3.inv.mycelium > lg2.inv.mycelium, 'auto-collect works nearby too');
  ok(lg3.buf[0] < 1.0, 'buffer drains again when nearby (' + lg3.buf[0] + ')');

  /* ------------------------------------------------ day/night + light */
  console.log('\n== Day/night cycle & flashlight ==');
  var di = JSON.parse(await evalJS('(function(){var c=MTE_GAME.core;return JSON.stringify({len:c.DAY_LENGTH,noon:c.daylight(0),mid:c.daylight(c.DAY_LENGTH/2)});})()'));
  ok(di.len > 0 && di.noon === 1 && Math.round(di.mid) === 0, 'daylight curve sane (cycle ' + di.len + 's, noon ' + di.noon + ', midnight ' + di.mid + ')');
  // This constructed visual fixture changes time directly. A variable-step
  // call settles and leaves the cumulative clock first, preserving balances.
  await evalJS('MTE_GAME.core.step(MTE_GAME.getState(), 1/120); MTE_GAME.getState().time = MTE_GAME.core.DAY_LENGTH / 2'); // force midnight
  await sleep(300);
  var nightShot = await shot('05-night.png');
  ok(!!nightShot, 'night render screenshot: ' + nightShot);
  // Averaged over a patch, so whatever picture stands at the very centre doesn't decide it.
  var lum = JSON.parse(await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var w=c.width,h=c.height;function lum(i,j){var t=0,n=0;for(var a=-4;a<=4;a++)for(var b=-4;b<=4;b++){var o=(Math.floor(h*(j+b*0.01))*w+Math.floor(w*(i+a*0.01)))*4;t+=(d[o]*0.3+d[o+1]*0.59+d[o+2]*0.11)/255;n++;}return t/n;}return JSON.stringify({center:+lum(0.5,0.5).toFixed(3),corner:+lum(0.05,0.05).toFixed(3)});})()'));
  console.log('  night luminance: center=' + lum.center + ' corner=' + lum.corner);
  ok(lum.center > lum.corner + 0.08, 'flashlight pools light around the player at night (center ' + lum.center + ' vs corner ' + lum.corner + ')');
  await evalJS('MTE_GAME.getState().time = 0'); // back to noon
  await sleep(300);
  var dayLum = JSON.parse(await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var w=c.width,h=c.height;function lum(i,j){var o=(Math.floor(h*j)*w+Math.floor(w*i))*4;return (d[o]*0.3+d[o+1]*0.59+d[o+2]*0.11)/255;}return JSON.stringify({center:+lum(0.5,0.5).toFixed(3),corner:+lum(0.05,0.05).toFixed(3)});})()'));
  console.log('  day luminance: center=' + dayLum.center + ' corner=' + dayLum.corner);
  ok(dayLum.center > lum.corner, 'daytime is brighter than the dark edges of night');

  /* ------------- a save it can't read: kept to one side, never a nuke */
  console.log('\n== A save it can\'t read is kept to one side ==');
  await evalJS('MTE_GAME.getState().inv.mycelium = 999999; MTE_GAME.save()');
  // The save of a world made by a much older game (a format no longer kept).
  await evalJS('localStorage.setItem("more-than-enough-save", JSON.stringify({ v: 1, seed: 5, inv: { mycelium: 999999 } }))');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  ok(await waitFor('MTE_GAME.messages.lines.some(function(l){return /kept safe to one side/.test(l);})', 3000), 'a note says the save is kept to one side');
  ok(await evalJS('!document.getElementById("nuke")'), 'there is no nuke screen any more');
  ok(await evalJS('MTE_GAME.getState().inv.mycelium') < 999999, 'a new world meanwhile');
  eq(await evalJS('JSON.parse(localStorage.getItem("more-than-enough-save-aside")).v'), 1, 'the old world\'s save is kept to one side, not written over');
  // A damaged save: the note says what happened.
  await evalJS('localStorage.setItem("more-than-enough-save", "{\\"v\\":1")');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  ok(await waitFor('MTE_GAME.messages.lines.some(function(l){return /^game: Your saved world couldn\'t be opened/.test(l);})', 3000), 'a damaged save says it could not be opened');
  // A format 10 world, set aside by v0.109.0 and played further, comes back.
  await evalJS('(() => { const s = JSON.parse(localStorage.getItem("more-than-enough-save")); s.v = 10; delete s.cultivation; delete s.logisticsModel; s.seed = 4242; s.stats.playedMs = 9e7; localStorage.setItem("more-than-enough-save-aside", JSON.stringify(s)); })()');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  await sleep(300);
  eq(await evalJS('MTE_GAME.getState().seed'), 4242, 'the world played further comes back from one side');

  /* ---------------------------------------------------- pinch to zoom */
  console.log('\n== Pinch to zoom with two fingers ==');
  await evalJS('MTE_GAME.setZoom(1)');
  await sleep(150);
  var tp0 = await evalJS('MTE_GAME.tilePx()');
  eq(Math.round(await evalJS('MTE_GAME.zoom()') * 100) / 100, 1, 'zoom starts at 1x (tile ' + Math.round(tp0) + 'px)');
  var prePinch = JSON.parse(await stateSummary());

  // Two fingers spread apart => zoom in (bigger tiles).
  await touch('touchStart', [
    { x: 195, y: 320, radiusX: 5, radiusY: 5, force: 1, id: 1 },
    { x: 255, y: 320, radiusX: 5, radiusY: 5, force: 1, id: 2 }
  ]);
  await sleep(60);
  await touch('touchMove', [
    { x: 110, y: 320, radiusX: 5, radiusY: 5, force: 1, id: 1 },
    { x: 340, y: 320, radiusX: 5, radiusY: 5, force: 1, id: 2 }
  ]);
  await sleep(150);
  var tpIn = await evalJS('MTE_GAME.tilePx()');
  ok(tpIn > tp0 * 1.5, 'pinching apart zooms in (' + Math.round(tp0) + ' -> ' + Math.round(tpIn) + 'px)');

  // Squeeze the fingers together => zoom out, a long way.
  await touch('touchMove', [
    { x: 222, y: 320, radiusX: 5, radiusY: 5, force: 1, id: 1 },
    { x: 228, y: 320, radiusX: 5, radiusY: 5, force: 1, id: 2 }
  ]);
  await sleep(150);
  var tpOut = await evalJS('MTE_GAME.tilePx()');
  ok(tpOut < tp0, 'pinching together zooms out (' + Math.round(tpIn) + ' -> ' + tpOut.toFixed(1) + 'px)');
  await touch('touchEnd', []);
  await sleep(200);

  var postPinch = JSON.parse(await stateSummary());
  ok(postPinch.x === prePinch.x && postPinch.y === prePinch.y, 'pinching never moves the player');

  // Far zoom-out stays cheap and keeps painting varied terrain. Reveal a wide
  // area first so the downsampled blocks have real terrain to sample.
  await evalJS('MTE_GAME.core.revealAround(MTE_GAME.getState(), 120)');
  await evalJS('MTE_GAME.setZoom(0.08)');
  await sleep(300);
  var farTp = await evalJS('MTE_GAME.tilePx()');
  ok(farTp <= 4.5, 'can zoom far out to tiny tiles (' + farTp.toFixed(2) + 'px each)');
  var far = JSON.parse(await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var seen={},lit=0;for(var i=0;i<d.length;i+=1600){var r=d[i],gg=d[i+1],b=d[i+2];if(r+gg+b>30){seen[(r>>4)+","+(gg>>4)+","+(b>>4)]=1;lit++;}}return JSON.stringify({colors:Object.keys(seen).length,lit:lit});})()'));
  ok(far.lit > 0, 'world still renders when zoomed far out');
  ok(far.colors >= 3, 'far zoom draws varied terrain, not one flat fill (' + far.colors + ' block colours)');
  console.log('  screenshot: ' + await shot('06-zoom-out.png'));

  // Zoom is clamped to a sane range at both ends.
  await evalJS('MTE_GAME.setZoom(999)');
  var capped = await evalJS('MTE_GAME.zoom()');
  await evalJS('MTE_GAME.setZoom(99999)');
  ok(Number.isFinite(capped) && capped === await evalJS('MTE_GAME.zoom()') && await evalJS('MTE_GAME.tilePx() < innerHeight'), 'zoom-in is capped (at ' + capped.toFixed(2) + 'x, a tile smaller than the screen)');
  await evalJS('MTE_GAME.setZoom(0.0001)');
  ok(await evalJS('MTE_GAME.tilePx()') >= 0.25, 'zoom-out cannot shrink tiles below the floor');
  await evalJS('MTE_GAME.setZoom(1)');
  await sleep(120);

  /* ---------------------- tile highlight must survive max zoom-out */
  console.log('\n== Tile highlight at max zoom-out ==');
  var errBase = pageErrors.length;
  var hSpot = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&c.richness(s.world,x,y,0)>0){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!hSpot, 'stood on a gatherable tile for the highlight test (' + hSpot + ')');
  await evalJS('MTE_GAME.setZoom(0.0001)'); // all the way out: the world map, tiles a quarter pixel
  await sleep(250);
  var hTime = await evalJS('MTE_GAME.getState().time');
  await sleep(400);
  eq(pageErrors.length, errBase, 'max zoom-out over a resource throws no render errors');
  ok(await evalJS('MTE_GAME.getState().time') > hTime, 'render loop still alive at max zoom-out (clock still ticks)');
  await evalJS('MTE_GAME.setZoom(1)');
  await sleep(120);

  /* ------------------------------------------------------------- errors */
  /* ----------------------------------------------------------- the view */
  console.log('\n== The view ==');
  errBase = pageErrors.length;
  eq(await evalJS('document.getElementById("btnTilt")'), null, 'there is no tilt button: the view keeps its one slight lean');
  ok(await evalJS('MTE_GAME.pitch() > 0 && MTE_GAME.pitch() < 0.4'), 'the view leans slightly, never flat (' + await evalJS('MTE_GAME.pitch()') + ')');

  // Underground: a tap on the top of a wall digs that wall.
  // Embark above created another empty-handed world. This later fixture
  // must make its own pick as well; no equipment carries over.
  await evalJS('MTE_GAME.addRes("mycelium",8);MTE_GAME.addRes("stone",5);document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
  await sleep(150);
  await evalJS('document.querySelector("button[data-kind=tool][data-id=pickaxe]").click();document.getElementById("btnClose").click()');
  eq(await evalJS('MTE_GAME.getState().tools.pickaxe'), 2, 'craft another pick after the empty-handed restart');
  await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player;var t=c.nearestTile(p.x,p.y,80,function(x,y){return c.tileAt(s.world,x,y,0)===c.T.CAVE;});MTE_GAME.setPlayer(t.x+0.5,t.y+0.5);})()');
  await sleep(200);
  mineBtn = await rect('#btnMine'); await tap(mineBtn.x, mineBtn.y);
  ok(await waitFor('MTE_GAME.getState().player.z < 0', 5000), 'went down a cave mouth into the mine');
  // The camera moves to the new layer when it next draws: wait for a frame so
  // the wall's screen position below is projected from where it is now shown.
  await evalJS('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});})');
  // Arriving carves a small cave (v0.148.0): stand on open ground just south
  // of the nearest diggable wall, so there is rock beside the player.
  await evalJS('(function(){var G=MTE_GAME,C=G.core,s=G.getState(),p=s.player,z=p.z;var t=C.nearestTile(p.x,p.y,12,function(x,y){var k=C.tileAt(s.world,x,y,z);return C.TILE_INFO[k].solid&&k!==C.T.SHAFT&&C.walkable(s.world,x,y+1,z);});if(t)G.setPlayer(t.x+0.5,t.y+1.5);})()');
  await evalJS('new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r);});})');
  // A diggable wall beside the player (north first, so it stands in front of the row behind).
  var wall = JSON.parse(await evalJS('(function(){var G=MTE_GAME,C=G.core,s=G.getState(),p=s.player,px=Math.floor(p.x),py=Math.floor(p.y);' +
    'var near=[[0,-1],[1,0],[-1,0],[0,1]];for(var i=0;i<near.length;i++){var x=px+near[i][0],y=py+near[i][1],t=C.tileAt(s.world,x,y,p.z);' +
    'if(!C.TILE_INFO[t].solid||t===C.T.SHAFT)continue;C.markExplored(s.world,x,y,p.z);var h=C.tileHeight(s.world,x,y,p.z);var sp=G.project(x+0.5,y+0.4,p.z+h);' +
    'return JSON.stringify({x:x,y:y,z:p.z,h:h,sx:sp.x,sy:sp.y,solid:true,type:t});}return JSON.stringify({solid:false});})()'));
  ok(wall.solid && wall.h === 1, 'rock beside the player stands a full layer tall (' + JSON.stringify(wall) + ')');
  // One tap is one swing: it digs into the wall (a rich seam takes several to clear).
  var wallRich = 'MTE_GAME.core.richness(MTE_GAME.getState().world,' + wall.x + ',' + wall.y + ',' + wall.z + ')';
  var richBefore = await evalJS(wallRich);
  await tap(wall.sx, wall.sy);
  var dugWall = await waitFor(wallRich + ' === ' + (richBefore - 1), 1500);
  ok(dugWall, 'tapping the top of a wall digs that wall' + (dugWall ? '' : ' — tap picked ' +
    await evalJS('JSON.stringify({pick:MTE_GAME.unproject(' + wall.sx + ',' + wall.sy + '),player:MTE_GAME.getState().player})')));
  console.log('  screenshot: ' + await shot('07-mine-wall.png'));
  mineBtn = await rect('#btnMine'); await tap(mineBtn.x, mineBtn.y);
  ok(await waitFor('MTE_GAME.getState().player.z === 0', 2000), 'back up on the surface');
  console.log('  screenshot: ' + await shot('08-surface.png'));
  eq(pageErrors.length, errBase, 'the mine and surface draw without errors');

  /* ------------------------------------------------- performance panel */
  console.log('\n== Performance panel ==');
  eq(await evalJS('document.getElementById("perf").hidden'), true, 'the performance panel starts closed');
  await key('keyDown', 'F3', 'F3', 114); await key('keyUp', 'F3', 'F3', 114);
  ok(await waitFor('!document.getElementById("perf").hidden && /FPS\\s+\\d+/.test(document.getElementById("perf").textContent)', 2000), 'F3 opens the panel, showing FPS');
  var perfText = await evalJS('document.getElementById("perf").textContent');
  ok(['frame', 'logic', 'draw', 'tiles', 'screen', 'canvas'].every(function (k) { return perfText.indexOf(k) >= 0; }), 'the panel shows frame time, logic, draw, tiles, screen and canvas');
  var snap = await evalJS('MTE_GAME.perf()');
  ok(snap.fps > 0 && snap.tiles > 0 && snap.drawMs > 0, 'the figures are live (' + Math.round(snap.fps) + ' fps, ' + snap.tiles + ' tiles, draw ' + snap.drawMs.toFixed(2) + ' ms)');
  await key('keyDown', 'F3', 'F3', 114); await key('keyUp', 'F3', 'F3', 114);
  eq(await evalJS('document.getElementById("perf").hidden'), true, 'F3 closes it again');

  /* ------------------------------------------------------------ pictures */
  console.log('\n== Pictures ==');
  // A texture pack an older version kept in this browser is left where it
  // is and never used: the game has one look.
  await evalJS('new Promise(function(done){var r=indexedDB.open("more-than-enough",1);r.onupgradeneeded=function(){r.result.createObjectStore("packs");};' +
    'r.onsuccess=function(){var tx=r.result.transaction("packs","readwrite");tx.objectStore("packs").put({format:1,name:"Old pack",looks:{"color.backdrop":{color:"#123456"}}},"player");tx.oncomplete=function(){r.result.close();done(true);};};})');
  await navigate('http://127.0.0.1:' + PORT + '/');
  ok(await waitFor('window.MTE_GAME && document.getElementById("crash").hidden', 3000), 'the game starts with an old texture pack still in the browser');
  ok(await evalJS('MTE_GAME.look.color("color.backdrop") !== "#123456"'), 'and draws in its own look, not the old pack');
  ok(await waitFor('[...document.querySelectorAll("img[data-look]")].every(function(i){return i.complete && i.naturalWidth > 0;})', 3000),
    'every picture on the HUD and buttons comes from the pack and has loaded');
  eq(await evalJS('document.querySelectorAll("#resources .chip img.ic").length'), 4, 'each resource counter shows its pack icon');
  ok(await evalJS('!/\\p{Extended_Pictographic}/u.test(document.getElementById("controls").textContent + document.getElementById("resources").textContent)'),
    'no emoji left on the buttons or counters');
  eq(await evalJS('document.getElementById("btnBackupSave").hidden || document.getElementById("btnBackupLoad").hidden'), false, 'your own world has Save a backup and Load a backup');
  // The sheet's rows use the pack's pictures too.
  await evalJS('document.getElementById("btnBuild").click()');
  ok(await waitFor('document.querySelectorAll("#sheetBody .row .ic img").length >= 8', 2000), 'the Build sheet shows each building\'s picture');
  await evalJS('document.getElementById("btnClose").click()');

  /* ---------------------------------------------------------- stockpile */
  console.log('\n== Stockpile ==');
  await navigate('http://127.0.0.1:' + PORT + '/');
  // Explore around home and set a known inventory: 3,452 mycelium is 3+4 piles (two leading digits).
  await evalJS('(function(){var G=MTE_GAME,C=G.core,s=G.getState(),h=C.home(s);s.player.z=0;G.setPlayer(h.x+0.5,h.y+0.5);' +
    'for(var y=-16;y<=16;y++)for(var x=-16;x<=16;x++)C.markExplored(s.world,h.x+x,h.y+y,0);' +
    's.inv.mycelium=3452;s.inv.stone=0;s.inv.ore=0;s.inv.crystal=0;G.setZoom(0.7);})()');
  ok(await waitFor('MTE_GAME.yard.piles.size === 7', 3000), 'what you own stands around home: 3,452 mycelium is 7 piles (' + await evalJS('MTE_GAME.yard.piles.size') + ')');
  var tiers = await evalJS('[...MTE_GAME.yard.piles.values()].map(function(p){return p.tier;}).sort().join("")');
  eq(tiers, '2222333', 'one pile per unit of the two leading digits: 4 baskets, 3 carts');
  console.log('  screenshot: ' + await shot('09-stockpile.png'));
  await evalJS('MTE_GAME.getState().inv.mycelium = 9990');
  ok(await waitFor('MTE_GAME.yard.piles.size === 18', 2000), '9,990 mycelium is 9 carts and 9 baskets');
  await evalJS('MTE_GAME.getState().inv.mycelium = 10000');
  ok(await waitFor('MTE_GAME.yard.piles.size === 1 && [...MTE_GAME.yard.merging(MTE_GAME.getState().time)].length > 0', 2000),
    'ten carts merge into one bigger pile: the smaller ones slide into it');
  ok(await waitFor('[...MTE_GAME.yard.merging(MTE_GAME.getState().time)].length === 0', 3000), '...and are gone once they reach it');
  await evalJS('MTE_GAME.getState().inv.mycelium = 3000');
  ok(await waitFor('MTE_GAME.yard.piles.size === 3', 2000), 'spending takes piles away (3,000 mycelium is 3 carts)');
  await evalJS('MTE_GAME.getState().inv.stone = 12345678');
  ok(await waitFor('[...MTE_GAME.yard.piles.values()].some(function(p){return p.res==="stone"&&p.tier===7&&p.span===2;})', 2000),
    'ten million of something takes a 2 x 2 square of ground');
  ok(await evalJS('MTE_GAME.yard.covered.size > MTE_GAME.yard.piles.size'), 'big piles cover the tiles around them');
  eq(await evalJS('document.getElementById("crash").hidden'), true, 'the yard draws without errors');

  /* --------------------------------------------------------------- wiki */
  console.log('\n== Wiki ==');
  await navigate2('http://127.0.0.1:' + PORT + '/wiki/#mine');
  ok(await waitFor('document.querySelectorAll("[data-table] table").length > 10', 4000), 'the wiki renders its tables from the game data');
  eq(await evalJS('[...document.querySelectorAll("article")].filter(function(a){return !a.hidden;}).map(function(a){return a.id;}).join()'), 'mine', 'wiki links open the right article');
  eq(await evalJS('[...document.querySelectorAll("[data-k]")].filter(function(n){return !/^[0-9]/.test(n.textContent);}).length'), 0, 'every figure in the wiki resolves to a number');
  ok(await evalJS('document.querySelector(".version").textContent.indexOf(".") > 0'), 'the wiki states the game version it documents');
  // From any page of the wiki, the game is one tap away, and on a phone the
  // button is on screen without scrolling.
  ok(await evalJS('(function(){var a=document.querySelector("a.play"),r=a.getBoundingClientRect();return new URL(a.href).pathname.replace(/index\\.html$/,"")==="/"&&r.width>100&&r.top>=0&&r.bottom<=innerHeight;})()'), 'a big Play the game button is on screen in the wiki');
  await evalJS('location.hash = "#ideas"');
  ok(await waitFor('!document.getElementById("ideas").hidden && document.querySelectorAll("#ideas .idea").length >= 20', 2000), 'the wiki has an Ideas section full of ideas');
  ok(await evalJS('document.querySelector("#ideas .note-ideas").textContent.indexOf("None of this is in the game") >= 0'), 'the Ideas section says plainly that none of it is in the game');
  await evalJS('location.hash = "#stockpile"');
  ok(await waitFor('document.querySelectorAll("#stockpile img.pile").length >= 4 * 10 && [...document.querySelectorAll("#stockpile img.pile")].every(function(i){return i.complete && i.naturalWidth > 0;})', 4000),
    'the Stockpile article shows every kind of pile for every resource');
  await evalJS('location.hash = "#things"');
  var things = await evalJS('import("/src/core/index.js").then(function(C){return C.LOOKS.length;})');
  ok(await waitFor('document.querySelectorAll("#things .thing").length === ' + things, 3000), 'Everything in the game lists every thing in the catalog (' + things + ')');
  ok(await waitFor('[...document.querySelectorAll("#things .thing")].every(function(t){return t.querySelector("img, .swatch");})', 2000), 'each one shows its default picture or colour');
  // The list's pictures load lazily; ask for them all before checking.
  await evalJS('document.querySelectorAll("#things img").forEach(function(i){i.loading="eager";})');
  ok(await waitFor('[...document.querySelectorAll("#things img")].every(function(i){return i.complete && i.naturalWidth > 0;})', 6000), 'every picture in the list loads');
  // Prices: every amount sits in one pill with its resource's picture.
  ok(await evalJS('(function(){var a=[...document.querySelectorAll(".cost .amt")];return a.length>50&&a.every(function(p){return p.querySelectorAll("img").length===1&&/^[0-9,]+$/.test(p.querySelector(".n").textContent);});})()'), 'each price pairs every amount with its resource in one pill');
  // Search lists every mention, not just which articles mention it.
  await evalJS('(function(){var b=document.getElementById("search");b.value="overclock";b.dispatchEvent(new Event("input"));})()');
  ok(await waitFor('!document.getElementById("results").hidden && document.querySelectorAll("#results .hits li").length >= 4', 2000),
    'searching "overclock" lists each passage that mentions it (' + await evalJS('document.querySelectorAll("#results .hits li").length') + ')');
  ok(await evalJS('[...document.querySelectorAll("#results .hits li")].every(function(l){return /overclock/i.test(l.querySelector("mark").textContent);})'), 'each result marks the word');
  eq(await evalJS('location.hash'), '#search/overclock', 'the search has its own address');
  ok(await evalJS('document.querySelectorAll("article:not([hidden])").length === 0'), 'results replace the article');
  var hitHref = await evalJS('document.querySelector("#results .hits a").getAttribute("href")');
  await evalJS('document.querySelector("#results .hits a").click()');
  ok(await waitFor('!document.getElementById("' + hitHref.slice(1).split('/')[0] + '").hidden && document.querySelector(".flash") && document.querySelector("mark.found")', 2000), 'a result opens its article at the passage, with the word marked');
  await evalJS('history.back()');
  ok(await waitFor('!document.getElementById("results").hidden', 2000), 'Back returns to the results');
  await evalJS('(function(){var b=document.getElementById("search");b.value="mycelium stone";b.dispatchEvent(new Event("input"));})()');
  ok(await waitFor('document.querySelectorAll("#results .hits li").length > 3', 2000), 'pictures count by name: costs in mycelium and stone are found');
  await evalJS('(function(){var b=document.getElementById("search");b.value="zzqx";b.dispatchEvent(new Event("input"));})()');
  ok(await waitFor('/Not mentioned/.test(document.getElementById("results").textContent)', 2000), 'a word the wiki never uses says so');
  await evalJS('(function(){var b=document.getElementById("search");b.value="";b.dispatchEvent(new Event("input"));})()');
  ok(await waitFor('document.getElementById("results").hidden && !document.getElementById("home").hidden && document.querySelectorAll("#toc li:not([hidden])").length === document.querySelectorAll("article").length', 2000), 'clearing the search returns to the wiki');

  console.log('\n== Sound on a fresh page ==');
  // Each way of starting to play must also start the sound, on a page that
  // has just been reloaded (no gesture yet), not only menu buttons.
  var starts = {
    'dragging the map': async function () { await drag(80, 600, 160, 560, 5, 30); },
    'tapping the map': async function () { await tap(195, 300); },
    'tapping Gather': async function () { var b = await rect('#btnAction'); await tap(b.x, b.y); },
    'holding Gather': async function () { var b = await rect('#btnAction'); await hold(b.x, b.y, 900); },
    'holding Perfect': async function () { var b = await rect('#btnPerfect'); await hold(b.x, b.y, 900); },
    'a key': async function () { await key('keyDown', 'd', 'KeyD', 68); await sleep(200); await key('keyUp', 'd', 'KeyD', 68); }
  };
  // Each in a brand-new browser profile: Chrome remembers that you used a
  // site and would let a plain reload play at once.
  var mainSession = session;
  for (var how in starts) {
    var bc = await cdp.send('Target.createBrowserContext', {});
    var tgt = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: bc.browserContextId });
    session = (await cdp.send('Target.attachToTarget', { targetId: tgt.targetId, flatten: true })).sessionId;
    await cdp.send('Runtime.enable', {}, session);
    await cdp.send('Page.enable', {}, session);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }, session);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, session);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, session);
    await cdp.send('Page.bringToFront', {}, session);
    // Headless Chrome lets every page play at once, so enforce the rule real
    // browsers apply: sound starts suspended and may only resume during a
    // gesture (transient user activation).
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: '(function(){var AC=window.AudioContext;window.AudioContext=class extends AC{constructor(o){super(o);super.suspend();}resume(){return navigator.userActivation.isActive?super.resume():Promise.reject(new DOMException("needs a gesture","NotAllowedError"));}};})()' }, session);
    await navigate('http://127.0.0.1:' + PORT + '/index.html');
    await sleep(1200); // the game's own retries happen without a gesture: they must not start it
    var before = await evalJS('MTE_GAME.audioState()');
    await starts[how]();
    var started = await waitFor('MTE_GAME.audioState() === "running"', 1500);
    ok(before === 'suspended' && started, 'on a fresh page, ' + how + ' starts the sound (' + before + ' -> ' + await evalJS('MTE_GAME.audioState()') + ')');
    ok(await loudness('MTE_GAME.audio.collect()') > 0.01, '...and it is heard');
    await cdp.send('Target.closeTarget', { targetId: tgt.targetId });
    await cdp.send('Target.disposeBrowserContext', { browserContextId: bc.browserContextId });
  }
  session = mainSession;
  await cdp.send('Page.bringToFront', {}, session);

  console.log('\n== Languages: English and Lithuanian ==');
  await navigate('http://127.0.0.1:' + PORT + '/');
  // Every English phrase that Lithuanian says differently: none may show once
  // the game is in Lithuanian, on the HUD or on any tab of the sheet.
  var englishLeft = 'new Promise(function(done){Promise.all([import("/src/i18n/en.js"),import("/src/i18n/lt.js")]).then(function(m){' +
    'var en=m[0].default,lt=m[1].default,text=document.body.innerText,left=[];' +
    'for(var k in en){var v=en[k];if(typeof v!=="string"||/[{&]/.test(v)||v.length<4||v===lt[k])continue;' +
    'if(new RegExp("(^|[^\\\\p{L}])"+v.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")+"($|[^\\\\p{L}])","u").test(text))left.push(v);}done(JSON.stringify(left));});})';
  var langBefore = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  eq(await evalJS('document.documentElement.lang'), 'en', 'the game starts in the browser\'s language, English');
  await evalJS('document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click()');
  await evalJS('document.getElementById("btnLanguage").click()');
  ok(await waitFor('document.documentElement.lang === "lt" && !!window.MTE_GAME', 8000), 'the Language button reloads the game in Lithuanian');
  await sleep(400);
  var langAfter = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  ok(Math.abs(langAfter.x - langBefore.x) < 0.01 && Math.abs(langAfter.y - langBefore.y) < 0.01 && langAfter.z === langBefore.z, 'switching language keeps the world and where you stand');
  eq(await evalJS('document.querySelector("#btnUpgrade .cap").textContent'), 'Įranga', 'the thumb buttons speak Lithuanian');
  eq(await evalJS('localStorage.getItem("mte.lang")'), 'lt', 'the choice is remembered');
  var ltLeft = [];
  for (var tabName of ['upgrades', 'build', 'awards', 'collected']) {
    await evalJS(tabName === 'collected' ? 'document.querySelector("#resources .chip").click()' : 'document.getElementById("sheet").classList.contains("open") || document.getElementById("btnUpgrade").click();document.getElementById("btnEquipmentCraft").click(); document.querySelector(".tab[data-tab=' + tabName + ']").click()');
    await sleep(200);
    ltLeft = ltLeft.concat(JSON.parse(await evalJS(englishLeft)));
  }
  eq(JSON.stringify(ltLeft), '[]', 'no English is left on the screen or the sheet in Lithuanian');
  await shot('lithuanian.png');
  await evalJS('document.getElementById("btnClose").click()');
  await navigate2('http://127.0.0.1:' + PORT + '/wiki/');
  ok(await waitFor('document.body.dataset.filled === "true"', 8000), 'the wiki fills itself in Lithuanian');
  eq(await evalJS('document.documentElement.lang + " " + document.querySelector("#toc a").textContent'), 'lt Gyvieji kristalai ir mieganti mašina', 'the wiki follows the chosen language');
  await evalJS('document.getElementById("language").click()');
  ok(await waitFor('document.documentElement.lang === "en" && document.body.dataset.filled === "true"', 8000), "the wiki's own Language button switches back to English");
  await navigate('http://127.0.0.1:' + PORT + '/');
  eq(await evalJS('document.querySelector("#btnUpgrade .cap").textContent'), 'Equipment', 'and the game follows');

  console.log('\n== A new player: the first press, leaving, coming back ==');
  // The very first thing a new player does is press the big button, standing
  // in the bare clearing at home: it walks them to something and gathers it.
  // (Another host name: storage of its own, empty, as on a new phone.)
  var NEW_PLAYER = 'http://localhost:' + PORT + '/';
  await navigate(NEW_PLAYER);
  ok(await evalJS('!document.getElementById("btnAction").classList.contains("disabled")'), 'in the clearing at home, Explore is lit: there is somewhere to go');
  // (Pressed through its pointer events: touches this late in the run no
  // longer reach the page in headless Chrome; the touch path is tested above.)
  var pressExplore = 'document.getElementById("btnAction").dispatchEvent(new PointerEvent("pointerdown",{pointerId:7}));document.getElementById("btnAction").dispatchEvent(new PointerEvent("pointerup",{pointerId:7}))';
  await evalJS(pressExplore);
  ok(await waitFor('(function(){var i=MTE_GAME.getState().inv;return i.mycelium+i.stone>0;})()', 8000), 'one press of Explore walks to the nearest resource and gathers it');
  var gotFirst = await evalJS('JSON.stringify(MTE_GAME.getState().inv)');
  // Gone the moment it's gathered (tab closed, reloaded): nothing is lost.
  await navigate(NEW_PLAYER);
  eq(await evalJS('JSON.stringify(MTE_GAME.getState().inv)'), gotFirst, 'what was just gathered is there after leaving at once');
  // Storage off altogether (some private modes): the game still plays.
  var noStorage = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(window,"localStorage",{get:function(){throw new DOMException("denied","SecurityError");}});' }, session);
  await navigate(NEW_PLAYER);
  ok(await evalJS('document.getElementById("crash").hidden && MTE_GAME.getState().inv.mycelium === 0'), 'with storage blocked the game starts a new world and does not break');
  await evalJS(pressExplore);
  ok(await waitFor('(function(){var i=MTE_GAME.getState().inv;return i.mycelium+i.stone>0;})()', 8000), 'and can be played');
  ok(await evalJS('MTE_GAME.messages.lines.some(function(l){return l.indexOf("game: Saving failed")===0;})'), 'it says progress is not being saved');
  pageErrors = pageErrors.filter(function (e) { return e.indexOf('Saving failed') < 0; });
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: noStorage.identifier }, session);

  console.log('\n== Runtime errors ==');
  await navigate('http://127.0.0.1:' + PORT + '/');
  eq(await evalJS('document.getElementById("crash").hidden'), true, 'the crash report stays hidden while nothing is broken');
  await evalJS('(function(){var real=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError");};MTE_GAME.save();Storage.prototype.setItem=real;})()');
  ok(await evalJS('MTE_GAME.messages.lines.some(function(l){return l.indexOf("game: Saving failed")===0;})'), 'a save that fails says so');
  pageErrors = pageErrors.filter(function (e) { return e.indexOf('Saving failed') < 0; });
  // What iOS Safari reports when the Share sheet's own scripts throw in the
  // page: a hidden cross-origin error. It isn't the game's, so play goes on.
  await evalJS('dispatchEvent(new ErrorEvent("error", { message: "Script error." }))');
  await evalJS('dispatchEvent(new ErrorEvent("error", { message: "e2e: foreign", filename: "https://example.com/x.js", lineno: 1, error: new Error("e2e: foreign") }))');
  await sleep(100);
  eq(await evalJS('document.getElementById("crash").hidden'), true, 'an error from a script that is not the game (Share sheet, extensions) does not stop the game');
  await evalJS('setTimeout(function(){ throw new Error("e2e: deliberate break"); })');
  // Since v0.152.0 the game gets past an error after boot and keeps a report
  // of it (src/game/faults.js); only frames that keep failing show the crash screen.
  var reportExpr = '(function(){var f=JSON.parse(localStorage.getItem("mte.faults")||"[]").find(function(r){return r.head.indexOf("e2e: deliberate break")>=0;});return f?JSON.stringify(f):"";})()';
  ok(await waitFor(reportExpr + ' !== ""', 2000), 'an uncaught error is kept as a report');
  eq(await evalJS('document.getElementById("crash").hidden'), true, 'and the game plays on, with no crash screen');
  var report = JSON.parse(await evalJS(reportExpr));
  ok(/^\d+\.\d+\.\d+ \(build /.test(report.context.version) && report.context.browser === await evalJS('navigator.userAgent'), 'the report names the game version and the browser');
  pageErrors = pageErrors.filter(function (e) { return e.indexOf('deliberate break') < 0; });
  ok(pageErrors.length === 0, 'no page errors captured' + (pageErrors.length ? ': ' + pageErrors.slice(0, 4).join(' | ') : ''));

  /* ------------------------------------------------------------- done */
  console.log('\nScreenshots in ' + SHOT_DIR);
  cdp.close();
  cleanup();
  await sleep(200);

  console.log('\n' + (failures === 0 ? 'ALL BROWSER TESTS PASSED' : failures + ' BROWSER FAILURE(S)') + ' — ' + checks + ' checks');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(function (e) {
  die(2, 'ERROR: ' + (e && e.stack || e));
});
