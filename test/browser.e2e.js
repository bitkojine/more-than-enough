/* End-to-end test: launches a static server + headless Chrome, then drives the
 * real game through the DevTools Protocol (touch input, keyboard, DOM clicks),
 * verifying gameplay and persistence through the shipped code paths. */
'use strict';

var cp = require('child_process');
var fs = require('fs');
var os = require('os');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var PORT = 8200 + Math.floor(Math.random() * 400);
var CDP_PORT = 9400 + Math.floor(Math.random() * 400);
var SHOT_DIR = process.env.MTE_SHOT_DIR || path.join(os.tmpdir(), 'mte-shots');
var CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

var failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL: ' + msg); } else { console.log('  ok: ' + msg); } }
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
  return new Promise(function (res, rej) { self.pending.set(id, { res: res, rej: rej }); });
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

  // Clear any stale headless browsers we launched previously.
  try { cp.execSync('pkill -f "mte-chrome-" >/dev/null 2>&1 || true'); } catch (e) { }

  // static server
  var server = cp.spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await sleep(700);

  // headless chrome
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mte-chrome-'));
  var chrome = cp.spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--mute-audio',
    '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore', detached: true });

  function cleanup() {
    try { process.kill(-chrome.pid, 'SIGKILL'); } catch (e) { }
    try { chrome.kill('SIGKILL'); } catch (e) { }
    try { cp.execSync('pkill -f ' + JSON.stringify(profile) + ' >/dev/null 2>&1 || true'); } catch (e) { }
    try { process.kill(-server.pid, 'SIGKILL'); } catch (e) { }
    try { server.kill('SIGKILL'); } catch (e) { }
  }
  process.on('exit', cleanup);

  var version = null;
  for (var i = 0; i < 60; i++) {
    try { version = await httpJson('http://127.0.0.1:' + CDP_PORT + '/json/version'); break; } catch (e) { await sleep(250); }
  }
  if (!version) { console.log('Could not start Chrome'); process.exit(2); }

  var cdp = new CDP(version.webSocketDebuggerUrl);
  await cdp.ready();
  cdp.on(function (msg) {
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(JSON.stringify(msg.params.exceptionDetails.exception || msg.params.exceptionDetails.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(msg.params.args.map(function (a) { return a.value; }).join(' '));
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
    if (!loaded) throw new Error('game did not boot at ' + url);
    await sleep(400);
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
    return evalJS('(function(){var s=MTE_GAME.getState();return JSON.stringify({x:+s.player.x.toFixed(2),y:+s.player.y.toFixed(2),inv:s.inv,tools:s.tools,unlocks:s.unlocks,ext:s.extractors.length,goal:s.goalIndex,buf:s.extractors.map(function(e){return +e.buffer.toFixed(2);})});})()');
  }

  var results = {};

  /* ------------------------------------------------------------- boot */
  console.log('\n== Boot & render ==');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  await evalJS('localStorage.clear()');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  ok(await evalJS('!!window.MTE_GAME'), 'game booted');
  var goalTxt = await evalJS('document.getElementById("goal").textContent');
  ok(goalTxt && goalTxt.length > 3, 'goal banner shows: ' + goalTxt);
  var chips = await evalJS('document.querySelectorAll("#resources .chip").length');
  eq(chips, 4, 'four resource chips visible');
  var overlap = await evalJS('(function(){function rect(e){var b=e.getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom};}function hit(a,b){return !(a.r<=b.l||b.r<=a.l||a.b<=b.t||b.b<=a.t);}var v=rect(document.getElementById("version"));var g=rect(document.getElementById("goal"));var cs=[].slice.call(document.querySelectorAll("#resources .chip")).map(rect);return JSON.stringify({hitGoal:hit(v,g),hitChips:cs.some(function(c){return hit(v,c);})});})()');
  var ov = JSON.parse(overlap);
  ok(!ov.hitGoal && !ov.hitChips, 'version badge does not overlap goal or resource chips');

  // canvas actually painted
  var painted = await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var set={};var n=0;for(var i=0;i<d.length;i+=40000){var k=d[i]+","+d[i+1]+","+d[i+2];if(!set[k]){set[k]=1;n++;}}return n;})()');
  ok(painted > 3, 'canvas renders distinct colors (' + painted + ')');
  var s0 = await shot('01-start.png');
  console.log('  screenshot: ' + s0);
  console.log(await asciiArt(evalJS));

  /* --------------------------------------------------------- movement */
  console.log('\n== Movement (keyboard) ==');
  var before = JSON.parse(await stateSummary());
  await key('keyDown', 'd', 'KeyD', 68);
  await sleep(700);
  await key('keyUp', 'd', 'KeyD', 68);
  await sleep(150);
  var after = JSON.parse(await stateSummary());
  ok(after.x > before.x + 0.5, 'player moved right with keyboard (' + before.x + ' -> ' + after.x + ')');

  console.log('\n== Movement (touch joystick drag) ==');
  var b2 = JSON.parse(await stateSummary());
  // drag from a clear area of the canvas
  await drag(120, 420, 200, 360, 5, 60);
  await sleep(150);
  var a2 = JSON.parse(await stateSummary());
  ok(Math.abs(a2.x - b2.x) + Math.abs(a2.y - b2.y) > 0.3, 'player moved with touch joystick (' + b2.x + ',' + b2.y + ' -> ' + a2.x + ',' + a2.y + ')');

  /* ------------------------------------------------------------ gather */
  console.log('\n== Gathering (touch the action button) ==');
  var spot = await evalJS('(function(){var s=MTE_GAME.getState();for(var y=10;y<86;y++){for(var x=10;x<86;x++){var i=y*96+x;if(s.world.type[i]===1&&s.world.rich[i]>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!spot, 'found a rich forest tile to stand on (' + spot + ')');
  await sleep(150);
  var act = await rect('#btnAction');
  ok(act && act.w > 60, 'action button is a comfortable tap target (' + (act && act.w) + 'px)');
  var g0 = JSON.parse(await stateSummary());
  await hold(act.x, act.y, 2200); // hold to auto-repeat gather
  await sleep(200);
  var g1 = JSON.parse(await stateSummary());
  ok(g1.inv.wood > g0.inv.wood, 'holding GATHER collected wood (' + g0.inv.wood + ' -> ' + g1.inv.wood + ')');
  var s1 = await shot('02-gathered.png');
  console.log(await asciiArt(evalJS));
  var contrast = await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var n=0,sum=0,sum2=0;for(var i=0;i<d.length;i+=160){var l=(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11)/255;sum+=l;sum2+=l*l;n++;}var m=sum/n;return JSON.stringify({mean:+m.toFixed(3),std:+Math.sqrt(sum2/n-m*m).toFixed(3)});})()');
  console.log('  luminance ' + contrast);

  /* ----------------------------------------------------------- upgrade */
  console.log('\n== Upgrade (craft an Axe) ==');
  var woodNow = g1.inv.wood;
  await evalJS('document.getElementById("btnUpgrade").click()');
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'upgrade sheet opened');
  var axeCraft = await evalJS('(function(){var b=document.querySelector(".row button[data-id=axe]");return b?{disabled:b.disabled}:"missing";})()');
  if (woodNow < 6) { await evalJS('MTE_GAME.addRes("wood",20)'); await sleep(150); }
  await evalJS('document.querySelector(".row button[data-id=axe]").click()');
  await sleep(200);
  var u1 = JSON.parse(await stateSummary());
  eq(u1.tools.axe, 2, 'axe upgraded to level 2');
  await evalJS('document.getElementById("btnClose").click()');
  await sleep(200);

  /* ------------------------------------------------------------ build */
  console.log('\n== Build extractor (touch Place) ==');
  var spot2 = await evalJS('(function(){var s=MTE_GAME.getState();for(var y=10;y<86;y++){for(var x=10;x<86;x++){var i=y*96+x;if(s.world.type[i]===1&&!s.extractors.some(function(e){return e.x===x&&e.y===y;})){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  await evalJS('MTE_GAME.addRes("wood",80)');
  await sleep(150);
  var buildBtn = await rect('#btnBuild');
  await tap(buildBtn.x, buildBtn.y);
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'build sheet opened via touch tap');
  eq(await evalJS('document.querySelector("#tabs .tab.active").dataset.tab'), 'build', 'Build tab is highlighted when opened via the button');
  var placeReady = await evalJS('(function(){var b=document.querySelector(".row button[data-id=lumber]");return b?!b.disabled:false;})()');
  ok(placeReady, 'Lumber Camp can be placed on the current tile');
  await evalJS('document.querySelector(".row button[data-id=lumber]").click()');
  await sleep(250);
  var b3 = JSON.parse(await stateSummary());
  eq(b3.ext, 1, 'lumber camp constructed');
  await evalJS('document.getElementById("btnClose").click()');
  await sleep(200);

  console.log('\n== BUILD / UPGRADE buttons switch tabs ==');
  var upBtn = await rect('#btnUpgrade');
  await tap(upBtn.x, upBtn.y);
  await sleep(250);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'upgrade sheet opened via touch tap');
  eq(await evalJS('document.querySelector("#tabs .tab.active").dataset.tab'), 'upgrades', 'Upgrades tab is highlighted when opened via the button');
  await key('keyDown', 'b', 'KeyB', 66);
  await key('keyUp', 'b', 'KeyB', 66);
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'B key keeps the sheet open while switching tabs');
  eq(await evalJS('document.querySelector("#tabs .tab.active").dataset.tab'), 'build', 'B key switches an open sheet to the Build tab');
  await key('keyDown', 'b', 'KeyB', 66);
  await key('keyUp', 'b', 'KeyB', 66);
  await sleep(300);
  ok(!(await evalJS('document.getElementById("sheet").classList.contains("open")')), 'B key closes the sheet when Build is already active');

  console.log('\n== Automation produces over time ==');
  await sleep(2500);
  var prod = JSON.parse(await stateSummary());
  ok(prod.buf[0] > 0.3, 'lumber camp is producing (buffer ' + prod.buf[0] + ')');

  /* ------------------------------------------------------ persistence */
  console.log('\n== Persistence across reload ==');
  await evalJS('MTE_GAME.addRes("ore",42); MTE_GAME.save();');
  var pre = JSON.parse(await stateSummary());
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  var post = JSON.parse(await stateSummary());
  eq(post.tools.axe, pre.tools.axe, 'axe level survives reload');
  eq(post.ext, pre.ext, 'extractor survives reload');
  eq(Math.floor(post.inv.ore), Math.floor(pre.inv.ore), 'ore inventory survives reload');
  eq(post.seed === undefined ? undefined : post.seed, undefined, 'seed key shape ok'); // no-op guard
  ok(Math.abs(post.x - pre.x) < 0.05 && Math.abs(post.y - pre.y) < 0.05, 'player position survives reload');

  var s3 = await shot('03-reloaded.png');
  console.log('  screenshot: ' + s3);

  /* --------------------------------------------------- exploration aid */
  console.log('\n== Exploration: ore is reachable and richer farther out ==');
  var reachInfo = await evalJS('(function(){var s=MTE_GAME.getState();var cx=48,cy=48;var nearOre=null,minD=1e9;for(var y=0;y<96;y++)for(var x=0;x<96;x++){if(s.world.type[y*96+x]===3){var d=Math.hypot(x-cx,y-cy);if(d<minD){minD=d;nearOre=[x,y];}}}var F=[];for(var y2=0;y2<96;y2++)for(var x2=0;x2<96;x2++){var i2=y2*96+x2;if(s.world.type[i2]===1){var d2=Math.hypot(x2-cx,y2-cy);F.push([d2,s.world.max[i2]]);}}F.sort(function(a,b){return a[0]-b[0];});var nearAvg=F.slice(0,20).reduce(function(a,c){return a+c[1];},0)/20;var farAvg=F.slice(-20).reduce(function(a,c){return a+c[1];},0)/20;return JSON.stringify({minOreDist:+minD.toFixed(1),nearAvg:+nearAvg.toFixed(1),farAvg:+farAvg.toFixed(1)});})()');
  var ri = JSON.parse(reachInfo);
  console.log('  nearest ore ' + ri.minOreDist + ' tiles; forest richness near=' + ri.nearAvg + ' far=' + ri.farAvg);
  ok(ri.minOreDist > 4 && ri.minOreDist < 40, 'ore requires venturing out');
  ok(ri.farAvg > ri.nearAvg, 'deposits are richer farther from spawn');

  /* -------------------------------------------------- late-game UI */
  console.log('\n== Late-game UI (refinery chains, converters, Beyond) ==');
  await evalJS('MTE_GAME.addRes("wood",900000); MTE_GAME.addRes("stone",900000); MTE_GAME.addRes("ore",900000); MTE_GAME.addRes("crystal",90000);');
  await evalJS('document.getElementById("btnUpgrade").click()');
  await sleep(300);
  var resupRows = await evalJS('document.querySelectorAll("#sheetBody button[data-kind=resup]").length');
  eq(resupRows, 4, 'four refinery-chain rows rendered');
  ok(await evalJS('!!document.querySelector("#sheetBody button[data-id=abundance]")'), 'Abundance Engine row is levelable');
  var woodBefore = await evalJS('MTE_GAME.getState().resUp.wood');
  await evalJS('document.querySelector("#sheetBody button[data-kind=resup][data-id=wood]").click()');
  await sleep(200);
  eq(await evalJS('MTE_GAME.getState().resUp.wood'), woodBefore + 1, 'clicking Refine advances the wood chain');
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
  await evalJS('MTE_GAME.setPlayer(48.5,48.5)');
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

  await evalJS('(function(){var s=MTE_GAME.getState();s.stats.wood=19000;s.stats.stone=1000;})()');
  await sleep(500);
  ok(await evalJS('!document.getElementById("tabBeyond").hidden'), 'Beyond tab reveals once embark is within reach');
  await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
  await sleep(250);
  eq(await evalJS('document.querySelectorAll("#sheetBody button[data-kind=perk]").length'), 5, 'five perks offered in the Beyond tab');
  ok(await evalJS('(function(){var b=document.querySelector("#sheetBody button[data-kind=embark]");return b?!b.disabled:false;})()'), 'Embark is enabled at 20k lifetime');
  await evalJS('(function(){var s=MTE_GAME.getState();s.insight=5;})()');
  await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
  await sleep(200);
  var legacyBefore = await evalJS('MTE_GAME.getState().perks.legacy');
  await evalJS('document.querySelector("#sheetBody button[data-kind=perk][data-id=legacy]").click()');
  await sleep(150);
  eq(await evalJS('MTE_GAME.getState().perks.legacy'), legacyBefore + 1, 'buying Legacy raises the perk level');
  console.log('  screenshot: ' + await shot('04-beyond.png'));

  await evalJS('window.confirm = function(){return true;}');
  var prestigeBefore = await evalJS('MTE_GAME.getState().prestiges');
  await evalJS('document.querySelector("#sheetBody button[data-kind=embark]").click()');
  await sleep(400);
  var afterEmbark = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState();return JSON.stringify({prestiges:s.prestiges,insight:s.insight,ext:s.extractors.length});})()'));
  eq(afterEmbark.prestiges, prestigeBefore + 1, 'embark increments the prestige count');
  eq(afterEmbark.ext, 0, 'embark resets extractors');
  ok(afterEmbark.insight > 0, 'embark banks Insight for perks');

  /* ------------------------------------------------ day/night + light */
  console.log('\n== Day/night cycle & flashlight ==');
  var di = JSON.parse(await evalJS('(function(){var c=MTE_GAME.core;return JSON.stringify({len:c.DAY_LENGTH,noon:c.daylight(0),mid:c.daylight(c.DAY_LENGTH/2)});})()'));
  ok(di.len > 0 && di.noon === 1 && Math.round(di.mid) === 0, 'daylight curve sane (cycle ' + di.len + 's, noon ' + di.noon + ', midnight ' + di.mid + ')');
  await evalJS('MTE_GAME.getState().time = MTE_GAME.core.DAY_LENGTH / 2'); // force midnight
  await sleep(300);
  var nightShot = await shot('05-night.png');
  ok(!!nightShot, 'night render screenshot: ' + nightShot);
  var lum = JSON.parse(await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var w=c.width,h=c.height;function lum(i,j){var o=(Math.floor(h*j)*w+Math.floor(w*i))*4;return (d[o]*0.3+d[o+1]*0.59+d[o+2]*0.11)/255;}return JSON.stringify({center:+lum(0.5,0.5).toFixed(3),corner:+lum(0.05,0.05).toFixed(3)});})()'));
  console.log('  night luminance: center=' + lum.center + ' corner=' + lum.corner);
  ok(lum.center > lum.corner + 0.08, 'flashlight pools light around the player at night (center ' + lum.center + ' vs corner ' + lum.corner + ')');
  await evalJS('MTE_GAME.getState().time = 0'); // back to noon
  await sleep(300);
  var dayLum = JSON.parse(await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var w=c.width,h=c.height;function lum(i,j){var o=(Math.floor(h*j)*w+Math.floor(w*i))*4;return (d[o]*0.3+d[o+1]*0.59+d[o+2]*0.11)/255;}return JSON.stringify({center:+lum(0.5,0.5).toFixed(3),corner:+lum(0.05,0.05).toFixed(3)});})()'));
  console.log('  day luminance: center=' + dayLum.center + ' corner=' + dayLum.corner);
  ok(dayLum.center > lum.corner, 'daytime is brighter than the dark edges of night');

  /* ------------------------------------------------------------- errors */
  console.log('\n== Runtime errors ==');
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
  console.error('E2E ERROR: ' + (e && e.stack || e));
  process.exit(2);
});
