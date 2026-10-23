/* End-to-end test: launches a static server + headless Chrome, then drives the
 * real game through the DevTools Protocol (touch input, keyboard, DOM clicks),
 * verifying gameplay and persistence through the shipped code paths. */
import cp from 'node:child_process';
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
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
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
    await sleep(400);
  }

  async function navigate2(url) {
    await cdp.send('Page.navigate', { url: url }, session);
    await sleep(600);
  }

  async function touch(type, points) {
    await cdp.send('Input.dispatchTouchEvent', { type: type, touchPoints: points }, session);
  }
  async function tap(x, y) {
    await touch('touchStart', [{ x: x, y: y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    await sleep(40);
    await touch('touchEnd', []);
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
  console.log('\n== Boot & render ==');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  await evalJS('localStorage.clear()');
  if(process.env.MTE_CULTIVATION_RUN){
    const run=JSON.parse(fs.readFileSync(process.env.MTE_CULTIVATION_RUN,'utf8'));
    if(run.result!=='won'||!run.activationSave)throw Error('A completed canonical playtest checkpoint is required');
    await evalJS('localStorage.setItem("more-than-enough-save",'+JSON.stringify(run.activationSave)+')');
    await navigate('http://127.0.0.1:'+PORT+'/?lang=en');
    console.log('\n== Fresh playthrough checkpoint: actual activation and next world ==');
    eq(await evalJS('MTE_GAME.getState().seed'),run.seed,'resumes the world played from empty hands');
    ok(await evalJS('!MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'repairs alone have not won');
    await evalJS('document.getElementById("btnBuild").click()');
    ok(await evalJS('document.getElementById("sheetBody").textContent.includes("3/3")'),'machine shows all three physical repairs');
    ok(await evalJS('!!document.querySelector("[data-action=activate]")'),'real Build sheet offers activation');
    await evalJS('document.querySelector("[data-action=activate]").click()');
    ok(await waitFor('MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'real activation button wins the world');
    ok(await evalJS('MTE_GAME.getState().goalsDone.includes("master")'),'completion milestone is recorded immediately');
    ok(await evalJS('MTE_GAME.core.nextGoal(MTE_GAME.getState())===null'),'completion has no stale mining objective');
    await evalJS('MTE_GAME.save();document.getElementById("btnClose").click()');
    await shot('cultivation-world-complete.png');
    await navigate('http://127.0.0.1:'+PORT+'/?lang=lt');
    ok(await evalJS('MTE_GAME.core.canEmbark(MTE_GAME.getState())'),'win survives normal browser reload');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true},session);
    await evalJS('document.getElementById("btnBuild").click()');await sleep(200);
    ok(await evalJS('!document.querySelector("[data-action=activate]")'),'completed machine cannot be activated twice');
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
    await evalJS('document.getElementById("btnUpgrade").click()');
    ok(await evalJS('!!document.querySelector("[data-kind=cultivation][data-id=carrier]")'),'equipment added to original Upgrade sheet');
    ok(await evalJS('!document.querySelector("[data-kind=resup]")'),'new world has no abstract refinement purchases');
    await evalJS('document.getElementById("btnClose").click()');
    // Funded UI fixture only: tests controls and renderer, not fair fresh play.
    await evalJS(`(()=>{const c=MTE_GAME.core,s=MTE_GAME.getState();for(const r of c.RESOURCES)c.earn(s,r,300,'hand');for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++){const t=c.tileAt(s.world,x,y,-2);if(!c.TILE_INFO[t].rise&&!c.TILE_INFO[t].descend){c.setRichness(s.world,x,y,-2,0);c.markExplored(s.world,x,y,-2);}}s.player={x:.5,y:.5,z:-2};})()`);
    await evalJS('document.getElementById("btnBuild").click()');
    await evalJS('document.querySelector("[data-kind=cultivation][data-id=chamber]").click()');
    ok(await evalJS('MTE_GAME.getState().cultivation.facilities.some(b=>b.kind==="chamber")'),'real Build control constructs chamber in original world');
    ok(await evalJS('MTE_GAME.getState().inv.ore===292'),'construction spends ordinary metal inventory: '+await evalJS('MTE_GAME.getState().inv.ore'));
    await evalJS('[...document.querySelectorAll("[data-action=shutter]")].find(e=>e.dataset.x==="0"&&e.dataset.y==="0").click()');
    ok(await evalJS('MTE_GAME.core.cultivationAt(MTE_GAME.getState(),0,0).closed===false'),'original sheet controls real shutters');
    ok(await evalJS('document.getElementById("sheetBody").textContent.includes("Temperature")'),'inspection shows exact temperature');
    await evalJS('MTE_GAME.save()');var seed=await evalJS('MTE_GAME.getState().seed');
    await evalJS('document.getElementById("btnClose").click()');
    await cdp.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false},session);
    await sleep(300);await shot('cultivation-existing-art.png');
    await navigate('http://127.0.0.1:'+PORT+'/?lang=lt');
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
    eq(await evalJS('MTE_GAME.core.extractorCount(MTE_GAME.getState(),"depot")'),1,'real button constructs a depot');
    ok(await evalJS('MTE_GAME.getState().inv.stone<20&&MTE_GAME.getState().inv.ore===0'),'placement spends its full recipe');
    ok(await evalJS('(function(){var c=MTE_GAME.core,s=MTE_GAME.getState();return !!c.depotFor(s,s.extractors[0])&&!c.depotFor(s,s.extractors[1]);})()'),'coverage includes nearby producer and excludes distant producer');
    ok(await waitFor('MTE_GAME.getState().sources.stone.buildings>10',5000),'covered producer delivers new output');
    ok(await evalJS('MTE_GAME.getState().extractors[1].buffer>20'),'unserved producer retains its output');
    await evalJS('document.getElementById("btnClose").click();MTE_GAME.hud.newWorld()');
    await sleep(150);await shot('depot-built.png');
    await evalJS('document.getElementById("btnUpgrade").click()');
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
    await evalJS('document.getElementById("btnUpgrade").click()');
    await sleep(200);
    ok(await evalJS('document.querySelector("button[data-id=pickaxe]").disabled'), 'first pick cannot be crafted for free');
    ok(await evalJS('document.querySelector("button[data-id=pickaxe]").closest(".row").textContent.includes("Not crafted")'), 'uncrafted equipment is identified');
    await evalJS('document.getElementById("btnClose").click();MTE_GAME.addRes("mycelium",42);MTE_GAME.addRes("stone",5);document.getElementById("btnUpgrade").click()');
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
  ok(icons.n >= 6 && icons.bad.length === 0 && icons.name === 'More Than Enough' && icons.maskable, 'favicon, home-screen icon and manifest icons all load (' + JSON.stringify(icons) + ')');
  // No hand-holding: nothing to read on screen, no tutorial, no prompts.
  ok(await evalJS('!document.getElementById("tutorial") && !document.getElementById("trailHint") && !document.getElementById("goal")'), 'the game ships no tutorial, hint or goal banner');
  // A new player's first read is what to do: the next milestone.
  ok(await evalJS('!document.getElementById("milestone").hidden && (/next milestone/i.test(document.querySelector("#milestone small").textContent) || /^Next: ./.test(document.querySelector("#milestone .next").textContent))'),
    'a new world names the next milestone (' + await evalJS('document.getElementById("milestone").textContent') + ')');
  ok(await evalJS('document.getElementById("depth").hidden'), 'the depth marker stays hidden on the surface');
  eq(await evalJS('document.getElementById("toast").textContent'), '', 'a fresh world shows no message');
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
  eq(await evalJS('document.querySelectorAll("#thumbDock .btn").length'), 5, 'Gather, Perfect, build, upgrade and mine share the thumb dock');
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
  await evalJS('MTE_GAME.addRes("mycelium",8);MTE_GAME.addRes("stone",5);document.getElementById("btnUpgrade").click()');
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
  await sleep(120); // let the camera settle on the new layer
  var mineSpot = await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player,px=Math.floor(p.x),py=Math.floor(p.y);for(var i=0;i<4;i++){var x=px+[1,0,-1,0][i],y=py+[0,1,0,-1][i],t=c.tileAt(s.world,x,y,-1);if(t!==c.T.BEDROCK&&t!==c.T.SHAFT){return JSON.stringify({x:x,y:y,dx:x-px,dy:y-py,sx:innerWidth/2+(x+.5-p.x)*MTE_GAME.tilePx(),sy:innerHeight/2+(y+.5-p.y)*MTE_GAME.tilePx()});}}return null;})()');
  var ms = JSON.parse(mineSpot);
  await tap(ms.sx, ms.sy);
  eq(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;return c.tileAt(s.world,' + ms.x + ',' + ms.y + ',-1)===c.T.TUNNEL;})()'), true, 'tapping a nearby tile uses the same Gather action to dig');
  var minePos = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  await drag(195, 422, 195 + ms.dx * 80, 422 + ms.dy * 80, 5, 35);
  var minePosAfter = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  ok((minePosAfter.x - minePos.x) * ms.dx + (minePosAfter.y - minePos.y) * ms.dy > 0.05, 'same thumb joystick moves into the freshly dug underground tunnel');
  eq(minePosAfter.z, -1, 'digging an ordinary tile does not change layers');
  // Drill: holding the stick against a wall digs through it, no tapping.
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
  await evalJS('MTE_GAME.setPlayer(' + (entry.x + 4.5) + ',' + (entry.y + 0.5) + ')');
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
  // A milestone reached (gathering, or ore spotted on the way) is celebrated with a banner naming it.
  ok(await waitFor('(function(){var s=MTE_GAME.getState(),txt=document.querySelector("#milestone strong").textContent;return !document.getElementById("milestone").hidden&&MTE_GAME.core.GOALS.some(function(g){return s.goalsDone.indexOf(g.id)>=0&&g.reached===txt;});})()', 2000),
    'reaching a milestone shows a banner naming it (' + await evalJS('document.getElementById("milestone").textContent') + ')');
  var g0 = JSON.parse(await stateSummary());
  await startListening();
  await hold(act.x, act.y, 2200); // hold to auto-repeat gather
  ok(await heard(200) > 0.01, 'gathering in play is heard');
  var g1 = JSON.parse(await stateSummary());
  ok(g1.inv.mycelium > g0.inv.mycelium, 'holding GATHER collected mycelium (' + g0.inv.mycelium + ' -> ' + g1.inv.mycelium + ')');
  console.log('  screenshot: ' + await shot('02a-milestone.png'));
  ok(/of \d+/.test(await evalJS('document.querySelector("#milestone .of").textContent')), 'the banner says which milestone of how many');
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
  var trailStartInv = g1.inv.mycelium;
  var trailStart = await rect('#btnAction');
  await touch('touchStart', [{ x: trailStart.x, y: trailStart.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
  for (var trailStep = 1; trailStep <= 8; trailStep++) {
    await touch('touchMove', [{ x: trailStart.x + (195 - trailStart.x) * trailStep / 8, y: trailStart.y + (422 - trailStart.y) * trailStep / 8, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    await sleep(20);
  }
  // Look for warm white chalk part way along the live stroke.
  var probe = { x: Math.round(trailStart.x + (195 - trailStart.x) * 0.45), y: Math.round(trailStart.y + (422 - trailStart.y) * 0.45) };
  var trailChalk = await evalJS('(function(){var c=document.getElementById("game"),g=c.getContext("2d"),d=g.getImageData(0,0,c.width,c.height).data,s=c.width/window.innerWidth;for(var yy=' + (probe.y - 15) + ';yy<=' + (probe.y + 15) + ';yy+=2)for(var xx=' + (probe.x - 15) + ';xx<=' + (probe.x + 15) + ';xx+=2){var i=(Math.floor(yy*s)*c.width+Math.floor(xx*s))*4;if(d[i]>220&&d[i+1]>215&&d[i+2]>200&&Math.abs(d[i]-d[i+1])<20&&Math.abs(d[i+1]-d[i+2])<25)return true;}return false;})()');
  ok(trailChalk, 'live white chalk Trail paints visibly on the map');
  console.log('  screenshot: ' + await shot('02b-chalk-trail.png'));
  await touch('touchEnd', []);
  await sleep(180);
  var trailEndInv = JSON.parse(await stateSummary()).inv.mycelium;
  ok(trailEndInv > trailStartInv + 1, 'releasing a Trail gathers its highlighted resource tiles (' + trailStartInv + ' -> ' + trailEndInv + ')');
  await evalJS('(()=>{const s=MTE_GAME.getState(),c=MTE_GAME.core;const at=c.nearestTile(s.player.x,s.player.y,20,(x,y)=>c.tileAt(s.world,x,y,0)===c.T.FOREST&&c.richness(s.world,x,y,0)>=10);if(at)MTE_GAME.setPlayer(at.x+.5,at.y+.5);})()');
  await sleep(200);
  var tapGatherBefore = trailEndInv;
  await tap(195, 422);
  await sleep(150);
  var tapGatherAfter = JSON.parse(await stateSummary()).inv.mycelium;
  ok(tapGatherAfter > tapGatherBefore, 'tapping a resource tile gathers it directly');
  await hold(195, 422, 1400);
  var holdGatherAfter = JSON.parse(await stateSummary()).inv.mycelium;
  ok(holdGatherAfter >= tapGatherAfter + 2, 'holding a finger still on a resource keeps gathering it (' + tapGatherAfter + ' -> ' + holdGatherAfter + ')');
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
  var spot2 = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&!s.extractors.some(function(e){return e.x===x&&e.y===y;})){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
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
  var b3 = JSON.parse(await stateSummary());
  eq(b3.ext, 1, 'garden camp constructed');
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
  ok(await evalJS('document.getElementById("btnTextures").offsetParent === null && document.getElementById("version").offsetParent === null'), 'Settings keeps textures and the version out of sight');
  await evalJS('document.getElementById("btnNerds").click()');
  await sleep(100);
  eq(await evalJS('document.getElementById("sheetTitle").textContent'), 'Nerds', 'Nerds opens its own screen');
  ok(await evalJS('document.getElementById("sheetTitle").offsetParent !== null && getComputedStyle(document.getElementById("tabs")).display === "none"'), 'Nerds shows its title, not the game tabs');
  ok(await evalJS('document.getElementById("btnTextures").offsetParent !== null && document.getElementById("btnMute").offsetParent === null'), 'Nerds shows Textures, not the everyday settings');
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
  eq(await evalJS('document.querySelector("#place strong").textContent'), next.name, 'walking into a region shows its name (banner: ' + await evalJS('document.getElementById("milestone").hidden ? "none" : document.getElementById("milestone").textContent') + '; toast: ' + await evalJS('document.getElementById("toast").textContent') + ')');
  await evalJS('MTE_GAME.getState().player.z=' + was.z + ';MTE_GAME.setPlayer(' + was.x + ',' + was.y + ')');
  await evalJS('document.getElementById("btnMap").click()');
  await sleep(400);
  ok(await evalJS('!document.getElementById("mapPanel").hidden && document.getElementById("worldMap").width > 100'), 'the map button opens the world map');
  ok(JSON.parse(await evalJS('JSON.stringify(MTE_GAME.mapNames())')).indexOf(home.name) >= 0, 'the map names the home region');
  await evalJS('document.getElementById("btnMapOut").click(); document.getElementById("btnMapMe").click()');
  console.log('  screenshot: ' + await shot('05b-world-map.png'));
  await evalJS('document.getElementById("btnMap").click()');
  await sleep(300);
  ok(await evalJS('!document.getElementById("sheet").classList.contains("open")'), 'and the button closes it again');

  /* -------------------------------------------------- late-game UI */
  console.log('\n== Late-game UI (refinery chains, converters, Beyond) ==');
  await evalJS('MTE_GAME.addRes("mycelium",900000); MTE_GAME.addRes("stone",900000); MTE_GAME.addRes("ore",900000); MTE_GAME.addRes("crystal",90000);');
  await evalJS('document.getElementById("btnUpgrade").click()');
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
  await evalJS('document.getElementById("btnUpgrade").click()');
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
  ok(await waitFor('/kept safe to one side/.test(document.getElementById("toast").textContent)', 3000), 'a note says the save is kept to one side');
  ok(await evalJS('!document.getElementById("nuke")'), 'there is no nuke screen any more');
  ok(await evalJS('MTE_GAME.getState().inv.mycelium') < 999999, 'a new world meanwhile');
  eq(await evalJS('JSON.parse(localStorage.getItem("more-than-enough-save-aside")).v'), 1, 'the old world\'s save is kept to one side, not written over');
  // A damaged save: the note says what happened.
  await evalJS('localStorage.setItem("more-than-enough-save", "{\\"v\\":1")');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  ok(await waitFor('/^Your saved world couldn\'t be opened/.test(document.getElementById("toast").textContent)', 3000), 'a damaged save says it could not be opened');
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
  ok(await evalJS('MTE_GAME.zoom()') <= 3, 'zoom-in is capped at 3x');
  await evalJS('MTE_GAME.setZoom(0.0001)');
  ok(await evalJS('MTE_GAME.tilePx()') >= 3, 'zoom-out cannot shrink tiles below the floor');
  await evalJS('MTE_GAME.setZoom(1)');
  await sleep(120);

  /* ---------------------- tile highlight must survive max zoom-out */
  console.log('\n== Tile highlight at max zoom-out ==');
  var errBase = pageErrors.length;
  var hSpot = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&c.richness(s.world,x,y,0)>0){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!hSpot, 'stood on a gatherable tile for the highlight test (' + hSpot + ')');
  await evalJS('MTE_GAME.setZoom(0.0001)'); // all the way out: tiles ~3px
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
  await evalJS('MTE_GAME.addRes("mycelium",8);MTE_GAME.addRes("stone",5);document.getElementById("btnUpgrade").click()');
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

  /* ----------------------------------------------------------- textures */
  console.log('\n== Texture packs ==');
  await navigate('http://127.0.0.1:' + PORT + '/');
  eq(await evalJS('MTE_GAME.look.name'), 'Lanternlight', 'the game starts in the default texture pack');
  ok(await waitFor('[...document.querySelectorAll("img[data-look]")].every(function(i){return i.complete && i.naturalWidth > 0;})', 3000),
    'every picture on the HUD and buttons comes from the pack and has loaded');
  eq(await evalJS('document.querySelectorAll("#resources .chip img.ic").length'), 4, 'each resource counter shows its pack icon');
  ok(await evalJS('!/\\p{Extended_Pictographic}/u.test(document.getElementById("controls").textContent + document.getElementById("resources").textContent)'),
    'no emoji left on the buttons or counters');
  eq(await evalJS('document.getElementById("packName").textContent'), 'Lanternlight', 'the Textures button names the pack in use');
  eq(await evalJS('document.getElementById("btnTexturesDefault").hidden'), true, '"Default textures" only shows while another pack is in use');
  eq(await evalJS('document.getElementById("btnBackupSave").hidden || document.getElementById("btnBackupLoad").hidden'), false, 'your own world has Save a backup and Load a backup');
  // The sheet's rows use the pack's pictures too.
  await evalJS('document.getElementById("btnBuild").click()');
  ok(await waitFor('document.querySelectorAll("#sheetBody .row .ic img").length >= 8', 2000), 'the Build sheet shows each building\'s picture');
  await evalJS('document.getElementById("btnClose").click()');

  // A pack picked as files: helpers build File objects in the page.
  var pickPack = function (pack, extra) {
    return evalJS('(function(){var files=[new File([' + JSON.stringify(JSON.stringify(pack)) + '],"pack.json",{type:"application/json"})];' +
      (extra || []).map(function (f) { return 'files.push(new File([' + JSON.stringify(f.text) + '],' + JSON.stringify(f.name) + ',{type:"image/svg+xml"}));'; }).join('') +
      'return MTE_GAME.textures.fromFiles(files).then(function(){return true;});})()');
  };
  var dot = function (fill) { return '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="' + fill + '"/></svg>'; };

  await pickPack({ format: 1, name: 'Broken', looks: { 'tile.gras': { top: 'g.png' }, 'tile.water': { icon: 'w.png' }, 'color.backdrop': { color: 'black' } } });
  ok(await waitFor('!document.getElementById("packReport").hidden', 2000), 'a broken pack opens the problem report');
  var report = await evalJS('[...document.querySelectorAll("#packReport li")].map(function(li){return li.textContent;})');
  ok(report.length === 3 && /^tile\.gras: no such thing/.test(report[0]) && /^tile\.water icon:/.test(report[1]) && /^color\.backdrop color:/.test(report[2]),
    'the report lists every problem by thing and slot (' + report.join(' | ') + ')');
  eq(await evalJS('MTE_GAME.look.name'), 'Lanternlight', 'a broken pack is not used at all');
  await evalJS('document.querySelector("#packReport button").click()');
  ok(await evalJS('document.getElementById("packReport").hidden'), 'the report closes');

  await pickPack({ format: 1, name: 'Missing file', looks: { 'resource.mycelium': { icon: 'mycelium.svg' } } });
  ok(await waitFor('/mycelium\\.svg" was not among the files picked/.test(document.getElementById("packReport").textContent)', 2000),
    'a picture that wasn\'t picked with the pack is named in the report');
  await evalJS('document.querySelector("#packReport button").click()');

  var myceliumBefore = await evalJS('document.querySelector("#resources img.ic").src');
  await pickPack({ format: 1, name: 'Test pack', looks: {
    'resource.mycelium': { icon: 'mycelium.svg' },
    'resource.stone': { icon: dot('#ff00ff') },
    'color.backdrop': { color: '#123456' },
    'tile.grass': { top: ['mycelium.svg', null], color: '#aa2200' }
  } }, [{ name: 'mycelium.svg', text: dot('#00ff00') }]);
  ok(await waitFor('MTE_GAME.look.name === "Test pack"', 3000), 'a good pack (a pack.json plus a picture file, and inline SVG) is used straight away');
  eq(await evalJS('document.getElementById("packName").textContent'), 'Test pack', 'the Textures button shows its name');
  ok(await evalJS('document.querySelector("#resources img.ic").src') !== myceliumBefore, 'the mycelium counter switches to the pack\'s picture');
  eq(await evalJS('MTE_GAME.look.color("color.backdrop")'), '#123456', 'the pack\'s colours are used');
  eq(await evalJS('MTE_GAME.look.color("tile.forest")'), '#3a5a2c', 'anything the pack leaves out keeps the default look');
  eq(await evalJS('document.getElementById("btnTexturesDefault").hidden'), false, '"Default textures" appears');
  ok(await waitFor('/^Textures: Test pack/.test(document.getElementById("toast").textContent)', 1000), 'a toast confirms the pack');
  eq(await evalJS('document.getElementById("crash").hidden'), true, 'the map keeps drawing in the new pack');

  await navigate('http://127.0.0.1:' + PORT + '/');
  ok(await waitFor('MTE_GAME.look.name === "Test pack"', 3000), 'the pack is remembered after a reload');
  await evalJS('document.getElementById("btnTexturesDefault").click()');
  ok(await waitFor('MTE_GAME.look.name === "Lanternlight" && document.getElementById("btnTexturesDefault").hidden', 2000), '"Default textures" goes back to Lanternlight');
  await navigate('http://127.0.0.1:' + PORT + '/');
  ok(await waitFor('window.MTE_GAME && MTE_GAME.look.name === "Lanternlight"', 3000), 'and the old pack is forgotten (' + await evalJS('window.MTE_GAME ? MTE_GAME.look.name : "no game"') + ')');
  pageErrors = pageErrors.filter(function (e) { return e.indexOf('Texture pack not used') < 0; });

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
  await evalJS('location.hash = "#textures"');
  // The same module instance the wiki loaded (a staged site stamps ?v= on it).
  var bundled = await evalJS('import(performance.getEntriesByType("resource").map(function(e){return e.name;}).filter(function(n){return /\\/wiki\\/textures\\.js/.test(n);})[0] || "/wiki/textures.js").then(function(m){return m.bundleDefaultPack();}).then(function(p){return {n:Object.keys(p.looks).length, svg:JSON.stringify(p).indexOf("<svg")>0, paths:JSON.stringify(p).split(".svg").length > 1};})');
  ok(bundled.n === things && bundled.svg && !bundled.paths, 'the default pack downloads as one file with every picture inside it');

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
  await evalJS('document.getElementById("btnUpgrade").click()');
  await evalJS('document.getElementById("btnLanguage").click()');
  ok(await waitFor('document.documentElement.lang === "lt" && !!window.MTE_GAME', 8000), 'the Language button reloads the game in Lithuanian');
  await sleep(400);
  var langAfter = JSON.parse(await evalJS('JSON.stringify(MTE_GAME.getState().player)'));
  ok(Math.abs(langAfter.x - langBefore.x) < 0.01 && Math.abs(langAfter.y - langBefore.y) < 0.01 && langAfter.z === langBefore.z, 'switching language keeps the world and where you stand');
  eq(await evalJS('document.querySelector("#btnUpgrade .cap").textContent'), 'TOBULINTI', 'the thumb buttons speak Lithuanian');
  eq(await evalJS('localStorage.getItem("mte.lang")'), 'lt', 'the choice is remembered');
  var ltLeft = [];
  for (var tabName of ['upgrades', 'build', 'awards', 'collected']) {
    await evalJS(tabName === 'collected' ? 'document.querySelector("#resources .chip").click()' : 'document.getElementById("sheet").classList.contains("open") || document.getElementById("btnUpgrade").click(); document.querySelector(".tab[data-tab=' + tabName + ']").click()');
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
  eq(await evalJS('document.querySelector("#btnUpgrade .cap").textContent'), 'UPGRADE', 'and the game follows');

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
  ok((await evalJS('document.getElementById("toast").textContent')).indexOf('Saving failed') === 0, 'it says progress is not being saved');
  pageErrors = pageErrors.filter(function (e) { return e.indexOf('Saving failed') < 0; });
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: noStorage.identifier }, session);

  console.log('\n== Runtime errors ==');
  await navigate('http://127.0.0.1:' + PORT + '/');
  eq(await evalJS('document.getElementById("crash").hidden'), true, 'the crash report stays hidden while nothing is broken');
  await evalJS('(function(){var real=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError");};MTE_GAME.save();Storage.prototype.setItem=real;})()');
  ok((await evalJS('document.getElementById("toast").textContent')).indexOf('Saving failed') === 0, 'a save that fails says so');
  pageErrors = pageErrors.filter(function (e) { return e.indexOf('Saving failed') < 0; });
  // What iOS Safari reports when the Share sheet's own scripts throw in the
  // page: a hidden cross-origin error. It isn't the game's, so play goes on.
  await evalJS('dispatchEvent(new ErrorEvent("error", { message: "Script error." }))');
  await evalJS('dispatchEvent(new ErrorEvent("error", { message: "e2e: foreign", filename: "https://example.com/x.js", lineno: 1, error: new Error("e2e: foreign") }))');
  await sleep(100);
  eq(await evalJS('document.getElementById("crash").hidden'), true, 'an error from a script that is not the game (Share sheet, extensions) does not stop the game');
  await evalJS('setTimeout(function(){ throw new Error("e2e: deliberate break"); })');
  ok(await waitFor('!document.getElementById("crash").hidden', 2000), 'an uncaught error shows the crash report');
  var report = await evalJS('document.querySelector("#crash pre").textContent');
  ok(report.indexOf('Error: e2e: deliberate break') >= 0, 'the crash report says what broke');
  ok(report.indexOf('Game v') === 0 && report.indexOf(await evalJS('navigator.userAgent')) > 0, 'the crash report names the game version and the browser');
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
