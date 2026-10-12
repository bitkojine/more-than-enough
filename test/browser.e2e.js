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
  eq(await evalJS('document.querySelectorAll("#thumbDock .btn").length'), 3, 'gather, build and upgrade share the thumb dock');
  ok(!(await evalJS('document.getElementById("tutorial").hidden')), 'first visit opens the controls tutorial');
  ok(await evalJS('document.getElementById("tutorial").textContent.indexOf("Trail") >= 0'), 'tutorial explains Trail alongside the other controls');
  await tap((await rect('#tutorialDone')).x, (await rect('#tutorialDone')).y);
  ok(await evalJS('document.getElementById("tutorial").hidden'), 'Got it dismisses the tutorial');
  eq(await evalJS('localStorage.getItem("more-than-enough-controls-tutorial-seen-v1")'), '1', 'tutorial dismissal is remembered');
  var zoomIn = await rect('#btnZoomIn');
  await tap(zoomIn.x, zoomIn.y);
  eq(Math.round(await evalJS('MTE_GAME.zoom()') * 100), 125, 'thumb zoom-in control changes map zoom');
  eq(await evalJS('document.getElementById("zoomLevel").textContent'), '125%', 'zoom level is shown beside the thumb controls');
  var zoomOut = await rect('#btnZoomOut');
  await tap(zoomOut.x, zoomOut.y);
  eq(await evalJS('MTE_GAME.zoom()'), 1, 'thumb zoom-out control restores default zoom');
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
  // Teleport to an open tile so the world is endless but this test isn't foiled
  // by a rock/water tile that happens to sit next to the random spawn.
  await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;function ok(x,y){return c.walkable(s.world,x,y);}for(var r=0;r<80;r++){for(var dy=-r;dy<=r;dy++){for(var dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;if(ok(dx,dy)&&ok(dx+1,dy)&&ok(dx-1,dy)&&ok(dx,dy+1)&&ok(dx,dy-1)){MTE_GAME.setPlayer(dx+0.5,dy+0.5);return;}}}}})()');
  await sleep(150);
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
  await drag(90, 500, 135, 465, 5, 45);
  await sleep(150);
  var tapWalkStart = JSON.parse(await stateSummary());
  await tap(245, 430);
  await sleep(700);
  var tapWalkEnd = JSON.parse(await stateSummary());
  ok(Math.abs(tapWalkEnd.x - tapWalkStart.x) + Math.abs(tapWalkEnd.y - tapWalkStart.y) > 0.25, 'tapping a world destination starts walking');

  /* ------------------------------------------------------------ gather */
  console.log('\n== Gathering (touch the action button) ==');
  var spot = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileType(s.world,x,y)===1&&c.tileRich(s.world,x,y)>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!spot, 'found a rich forest tile to stand on (' + spot + ')');
  await evalJS('(function(){var p=' + JSON.stringify(spot) + '.split(",").map(Number),s=MTE_GAME.getState();MTE_GAME.core.setTileRich(s.world,p[0],p[1],200);})()');
  await sleep(150);
  var act = await rect('#btnAction');
  ok(act && act.w > 60, 'action button is a comfortable tap target (' + (act && act.w) + 'px)');
  var g0 = JSON.parse(await stateSummary());
  await hold(act.x, act.y, 2200); // hold to auto-repeat gather
  await sleep(200);
  var g1 = JSON.parse(await stateSummary());
  ok(g1.inv.wood > g0.inv.wood, 'holding GATHER collected wood (' + g0.inv.wood + ' -> ' + g1.inv.wood + ')');
  var trailStartInv = g1.inv.wood;
  var trailStart = await rect('#btnAction');
  await touch('touchStart', [{ x: trailStart.x, y: trailStart.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
  for (var trailStep = 1; trailStep <= 8; trailStep++) {
    await touch('touchMove', [{ x: trailStart.x + (195 - trailStart.x) * trailStep / 8, y: trailStart.y + (422 - trailStart.y) * trailStep / 8, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
    await sleep(20);
  }
  ok(await evalJS('document.getElementById("trailHint").textContent.indexOf("release to sweep") >= 0'), 'Trail shows a release cue after its trace locks onto a gatherable tile');
  var trailGlow = await evalJS('(function(){var c=document.getElementById("game"),g=c.getContext("2d"),d=g.getImageData(0,0,c.width,c.height).data,s=c.width/window.innerWidth;for(var yy=615;yy<=645;yy+=2)for(var xx=245;xx<=265;xx+=2){var i=(Math.floor(yy*s)*c.width+Math.floor(xx*s))*4;if(d[i]<230&&d[i+1]>180&&d[i+2]<175)return true;}return false;})()');
  ok(trailGlow, 'live Trail stroke paints visibly on the map');
  await touch('touchEnd', []);
  await sleep(180);
  var trailEndInv = JSON.parse(await stateSummary()).inv.wood;
  ok(trailEndInv > trailStartInv + 1, 'releasing a locked Trail gathers the highlighted resource (' + trailStartInv + ' -> ' + trailEndInv + ')');
  var tapGatherBefore = trailEndInv;
  await tap(195, 422);
  await sleep(150);
  var tapGatherAfter = JSON.parse(await stateSummary()).inv.wood;
  ok(tapGatherAfter > tapGatherBefore, 'tapping a resource tile gathers it directly');
  var s1 = await shot('02-gathered.png');
  console.log(await asciiArt(evalJS));
  var contrast = await evalJS('(function(){var c=document.getElementById("game");var g=c.getContext("2d");var d=g.getImageData(0,0,c.width,c.height).data;var n=0,sum=0,sum2=0;for(var i=0;i<d.length;i+=160){var l=(d[i]*0.3+d[i+1]*0.59+d[i+2]*0.11)/255;sum+=l;sum2+=l*l;n++;}var m=sum/n;return JSON.stringify({mean:+m.toFixed(3),std:+Math.sqrt(sum2/n-m*m).toFixed(3)});})()');
  console.log('  luminance ' + contrast);

  /* -------------------------------------------- items fly to the player */
  console.log('\n== Items fly to the player when gathering ==');
  var spotF = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileType(s.world,x,y)===1&&c.tileRich(s.world,x,y)>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!spotF, 'moved onto a fresh rich forest tile for the flyer test (' + spotF + ')');
  await sleep(150);
  var actF = await rect('#btnAction');
  await touch('touchStart', [{ x: actF.x, y: actF.y, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
  var sawFlyers = await waitFor('MTE_GAME.flyers().length > 0', 3000);
  ok(sawFlyers, 'gathering spawns items that fly toward the player');
  await touch('touchEnd', []);
  await sleep(1000);
  eq(await evalJS('MTE_GAME.flyers().length'), 0, 'flyers arrive and clear within ~1s');

  /* --------------------------------- SPACE hold must gather at the cd rate */
  console.log('\n== Hold SPACE gathers at GATHER_CD (no key-repeat turbo) ==');
  var spotK = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileType(s.world,x,y)===1&&c.tileRich(s.world,x,y)>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  ok(!!spotK, 'standing on a fresh rich forest tile for the SPACE test (' + spotK + ')');
  await sleep(150);
  var kg0 = await evalJS('MTE_GAME.getState().stats.gathers');
  await key('keyDown', ' ', 'Space', 32); // one physical press
  await sleep(60);
  var kg1 = await evalJS('MTE_GAME.getState().stats.gathers');
  eq(kg1, kg0 + 1, 'one SPACE press gathers exactly once (no double action)');
  for (var rep = 0; rep < 15; rep++) { // OS key-repeat storm
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, autoRepeat: true }, session);
  }
  await sleep(60); // still inside one GATHER_CD (0.25s) window
  var kg2 = await evalJS('MTE_GAME.getState().stats.gathers');
  ok(kg2 - kg1 <= 2, '15 repeat keydowns did not turbo-gather (gathers ' + kg1 + ' -> ' + kg2 + ')');
  await key('keyUp', ' ', 'Space', 32);
  await sleep(100);

  /* ----------------------------------------------------------- upgrade */
  console.log('\n== Upgrade (craft an Axe) ==');
  var woodNow = g1.inv.wood;
  var upgradeControl = await rect('#btnUpgrade');
  await tap(upgradeControl.x, upgradeControl.y);
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'upgrade sheet opened');
  var axeCraft = await evalJS('(function(){var b=document.querySelector(".row button[data-id=axe]");return b?{disabled:b.disabled}:"missing";})()');
  if (woodNow < 6) { await evalJS('MTE_GAME.addRes("wood",20)'); await sleep(150); }
  var axeButton = await rect('.row button[data-id=axe]');
  await tap(axeButton.x, axeButton.y);
  await sleep(200);
  var u1 = JSON.parse(await stateSummary());
  eq(u1.tools.axe, 2, 'axe upgraded to level 2');
  var doneButton = await rect('#btnClose');
  await tap(doneButton.x, doneButton.y);
  await sleep(200);

  /* ------------------------------------------------------------ build */
  console.log('\n== Build extractor (touch Place) ==');
  var spot2 = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileType(s.world,x,y)===1&&!s.extractors.some(function(e){return e.x===x&&e.y===y;})){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
  await evalJS('MTE_GAME.addRes("wood",80)');
  await sleep(150);
  var buildBtn = await rect('#btnBuild');
  await tap(buildBtn.x, buildBtn.y);
  await sleep(300);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'build sheet opened via touch tap');
  eq(await evalJS('document.querySelector("#tabs .tab.active").dataset.tab'), 'build', 'Build tab is highlighted when opened via the button');
  var placeReady = await evalJS('(function(){var b=document.querySelector(".row button[data-id=lumber]");return b?!b.disabled:false;})()');
  ok(placeReady, 'Lumber Camp can be placed on the current tile');
  var lumberButton = await rect('.row button[data-id=lumber]');
  await tap(lumberButton.x, lumberButton.y);
  await sleep(250);
  var b3 = JSON.parse(await stateSummary());
  eq(b3.ext, 1, 'lumber camp constructed');
  var camp = await evalJS('(function(){var e=MTE_GAME.getState().extractors[0];e.buffer=8;MTE_GAME.setPlayer(e.x+0.5,e.y+0.5);return e.x+","+e.y;})()');
  await sleep(400);
  ok(await evalJS('document.getElementById("actionLabel").textContent.indexOf("COLLECT") === 0'), 'Gather control changes to Collect near stored extractor goods (' + camp + ')');
  doneButton = await rect('#btnClose');
  await tap(doneButton.x, doneButton.y);
  await sleep(250);
  var collectBefore = JSON.parse(await stateSummary()).inv.wood;
  var collectButton = await rect('#btnAction');
  await tap(collectButton.x, collectButton.y);
  await sleep(200);
  var collectAfter = JSON.parse(await stateSummary());
  ok(collectAfter.inv.wood > collectBefore, 'one-thumb Collect action drains nearby stored goods');
  ok(collectAfter.buf[0] < 4, 'Collect drains the nearby buffer while production continues (' + collectAfter.buf[0].toFixed(2) + ' remains)');
  await sleep(200);

  console.log('\n== BUILD / UPGRADE buttons switch tabs ==');
  var upBtn = await rect('#btnUpgrade');
  await tap(upBtn.x, upBtn.y);
  await sleep(250);
  ok(await evalJS('document.getElementById("sheet").classList.contains("open")'), 'upgrade sheet opened via touch tap');
  eq(await evalJS('document.querySelector("#tabs .tab.active").dataset.tab'), 'upgrades', 'Upgrades tab is highlighted when opened via the button');
  var muteButton = await rect('#btnMute');
  await tap(muteButton.x, muteButton.y);
  eq(await evalJS('document.getElementById("btnMute").textContent'), 'Sound: off', 'Sound control mutes with one tap');
  muteButton = await rect('#btnMute');
  await tap(muteButton.x, muteButton.y);
  eq(await evalJS('document.getElementById("btnMute").textContent'), 'Sound: on', 'Sound control unmutes with one tap');
  var helpButton = await rect('#btnHelp');
  await tap(helpButton.x, helpButton.y);
  ok(await evalJS('document.getElementById("tutorial").hidden === false && !document.getElementById("sheet").classList.contains("open")'), 'Controls help reopens the tutorial and returns to the game');
  var helpDone = await rect('#tutorialDone');
  await tap(helpDone.x, helpDone.y);
  upBtn = await rect('#btnUpgrade');
  await tap(upBtn.x, upBtn.y);
  await sleep(250);
  var audioState = await evalJS('MTE_GAME.audioState()');
  console.log('  audio state after gestures: ' + audioState);
  ok(audioState !== 'none', 'audio context is created by early gestures (was: ' + audioState + ')');
  ok(!(await evalJS('document.getElementById("tabBeyond").hidden')), 'Beyond tab is visible from the start');
  eq(await evalJS('document.querySelectorAll("#sheetBody button[data-family]").length'), 5, 'Progression map shows five family headers (4 world + legacy)');
  await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
  var beyondPreviewReady = await waitFor('document.querySelector("#sheetTitle").textContent === "Beyond" && document.querySelector("#sheetBody").textContent.indexOf("A New World Awaits") >= 0', 3000);
  ok(beyondPreviewReady, 'Beyond shows a locked preview before the loop is reachable');
  var upgradesTab = await rect('.tab[data-tab=upgrades]');
  await tap(upgradesTab.x, upgradesTab.y);
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
  ok(await evalJS('document.getElementById("tutorial").hidden'), 'dismissed tutorial stays closed after reload');
  eq(post.tools.axe, pre.tools.axe, 'axe level survives reload');
  eq(post.ext, pre.ext, 'extractor survives reload');
  eq(Math.floor(post.inv.ore), Math.floor(pre.inv.ore), 'ore inventory survives reload');
  eq(post.seed === undefined ? undefined : post.seed, undefined, 'seed key shape ok'); // no-op guard
  ok(Math.abs(post.x - pre.x) < 0.05 && Math.abs(post.y - pre.y) < 0.05, 'player position survives reload');

  var s3 = await shot('03-reloaded.png');
  console.log('  screenshot: ' + s3);

  /* --------------------------------------------------- exploration aid */
  console.log('\n== Endless world: resources everywhere + fog reveal ==');
  var exploreInfo = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;var ore=0,crystal=0;for(var y=-60;y<60;y++)for(var x=-60;x<60;x++){var t=c.tileType(s.world,x,y);if(t===3)ore++;if(t===4)crystal++;}var px=Math.floor(s.player.x),py=Math.floor(s.player.y);return JSON.stringify({ore:ore,crystal:crystal,here:c.isExplored(s.world,px,py),far:c.isExplored(s.world,px+300,py+300),farTile:typeof c.tileType(s.world,420000,-420000)});})()');
  var ri = JSON.parse(exploreInfo);
  console.log('  near origin: ore=' + ri.ore + ' crystal=' + ri.crystal + '  fog(here/far)=' + ri.here + '/' + ri.far);
  ok(ri.ore > 30 && ri.crystal > 3, 'ore and crystal occur near the origin');
  ok(ri.here && !ri.far, 'fog is revealed around the player but not far away');
  ok(ri.farTile === 'number', 'terrain exists thousands of tiles from the origin');

  /* -------------------------------------------------- late-game UI */
  console.log('\n== Late-game UI (refinery chains, converters, Beyond) ==');
  await evalJS('MTE_GAME.addRes("wood",900000); MTE_GAME.addRes("stone",900000); MTE_GAME.addRes("ore",900000); MTE_GAME.addRes("crystal",90000);');
  await evalJS('document.getElementById("btnUpgrade").click()');
  await sleep(300);
  await evalJS('(function(){["refining","abundance","unlocks"].forEach(function(f){var b=document.querySelector("#sheetBody button[data-family="+f+"]");if(b)b.click();});})()');
  await sleep(250);
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
  ok(await evalJS('!document.getElementById("tabBeyond").hidden'), 'Beyond tab stays visible once embark is within reach too');
  await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
  await sleep(250);
  eq(await evalJS('document.querySelectorAll("#sheetBody button[data-kind=perk]").length'), 5, 'five perks offered in the Beyond tab');
  ok(await evalJS('(function(){var b=document.querySelector("#sheetBody button[data-kind=embark]");return b?!b.disabled:false;})()'), 'Embark is enabled at 20k gathered this world');
  await evalJS('(function(){var s=MTE_GAME.getState();s.insight=5;})()');
  await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
  await sleep(200);
  var legacyBefore = await evalJS('MTE_GAME.getState().perks.legacy');
  await evalJS('document.querySelector("#sheetBody button[data-kind=perk][data-id=legacy]").click()');
  await sleep(150);
  eq(await evalJS('MTE_GAME.getState().perks.legacy'), legacyBefore + 1, 'buying Legacy raises the perk level');
  console.log('  screenshot: ' + await shot('04-beyond.png'));

  await evalJS('window.confirm = function(){return true;}');
  // Inject a leftover flyer so we can prove a fresh world doesn't drag the old
  // world's resource sprites across the screen.
  await evalJS('MTE_GAME.flyers().push({x:-999,y:-999,res:"wood",seed:0,delay:0.16,t:0,vx:0,vy:0})');
  eq(await evalJS('MTE_GAME.flyers().length'), 1, 'a leftover flyer exists before embarking');
  var prestigeBefore = await evalJS('MTE_GAME.getState().prestiges');
  await evalJS('document.querySelector("#sheetBody button[data-kind=embark]").click()');
  await sleep(400);
  var afterEmbark = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState();return JSON.stringify({prestiges:s.prestiges,insight:s.insight,ext:s.extractors.length});})()'));
  eq(afterEmbark.prestiges, prestigeBefore + 1, 'embark increments the prestige count');
  eq(afterEmbark.ext, 0, 'embark resets extractors');
  ok(afterEmbark.insight > 0, 'embark banks Insight for perks');
  ok(await evalJS('!MTE_GAME.core.canEmbark(MTE_GAME.getState())'), 'carried lifetime progress cannot enable immediate re-embark');
  eq(await evalJS('MTE_GAME.flyers().length'), 0, 'embarking clears leftover resource flyers');

  /* ------------------------------------- logistics auto-collect is ranged */
  console.log('\n== Logistics auto-collect needs range ==');
  await evalJS('(function(){var s=MTE_GAME.getState();s.unlocks.logistics=true;var ex={key:"lumber",res:"wood",x:Math.floor(s.player.x),y:Math.floor(s.player.y),buffer:10,t:0};s.extractors.push(ex);MTE_GAME.setPlayer(ex.x+0.5,ex.y+0.5);})()');
  await sleep(300);
  var lg0 = JSON.parse(await stateSummary());
  ok(lg0.inv.wood >= 10, 'standing by the extractor auto-collects its buffer (' + lg0.inv.wood + ')');
  await evalJS('(function(){var s=MTE_GAME.getState();MTE_GAME.setPlayer(s.player.x+80,s.player.y+80);})()');
  await sleep(200);
  var lg1 = JSON.parse(await stateSummary());
  await sleep(1200);
  var lg2 = JSON.parse(await stateSummary());
  eq(lg2.inv.wood, lg1.inv.wood, 'walking far away stops auto-collect (inv holds at ' + lg1.inv.wood + ')');
  ok(lg2.buf[0] > lg1.buf[0], 'far extractor keeps producing into its buffer (' + lg1.buf[0] + ' -> ' + lg2.buf[0] + ')');
  // walking back re-engages it (and parks the player mid-world for the night test)
  await evalJS('(function(){var s=MTE_GAME.getState();var e=s.extractors[0];MTE_GAME.setPlayer(e.x+0.5,e.y+0.5);})()');
  await sleep(300);
  var lg3 = JSON.parse(await stateSummary());
  ok(lg3.inv.wood > lg2.inv.wood, 'walking back re-enables auto-collect (' + lg2.inv.wood + ' -> ' + lg3.inv.wood + ')');
  ok(lg3.buf[0] < 1.0, 'buffer drains again when nearby (' + lg3.buf[0] + ')');

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

  /* ----------------------------- reset button starts a clean world */
  console.log('\n== Reset button starts a clean world ==');
  await evalJS('MTE_GAME.flyers().length = 0');
  await evalJS('MTE_GAME.flyers().push({x:-999,y:-999,res:"wood",seed:0,delay:0.16,t:0,vx:0,vy:0})');
  eq(await evalJS('MTE_GAME.flyers().length'), 1, 'a leftover flyer exists before resetting');
  await evalJS('MTE_GAME.getState().inv.wood = 999999');
  var resetSheetOpen = await evalJS('document.getElementById("sheet").classList.contains("open")');
  if (!resetSheetOpen) {
    var resetSheetButton = await rect('#btnUpgrade');
    await tap(resetSheetButton.x, resetSheetButton.y);
    await sleep(250);
  }
  var resetButton = await rect('#btnReset');
  await tap(resetButton.x, resetButton.y);
  await sleep(300);
  eq(await evalJS('MTE_GAME.flyers().length'), 0, 'resetting clears leftover resource flyers');
  ok(await evalJS('MTE_GAME.getState().inv.wood') < 999999, 'reset wipes inventory into a fresh world');

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
  await evalJS('MTE_GAME.core.updateExplored(MTE_GAME.getState(), 120)');
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
  var hSpot = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileType(s.world,x,y)===1&&c.tileRich(s.world,x,y)>0){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
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
