/* End-to-end test: launches a static server + headless Chrome, then drives the
 * real game through the DevTools Protocol (touch input, keyboard, DOM clicks),
 * verifying gameplay and persistence through the shipped code paths. */
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

var ROOT = path.resolve(import.meta.dirname, '..');
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
    if (!loaded) throw new Error('game did not boot at ' + url);
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
    return evalJS('(function(){var s=MTE_GAME.getState();return JSON.stringify({x:+s.player.x.toFixed(2),y:+s.player.y.toFixed(2),inv:s.inv,tools:s.tools,unlocks:s.unlocks,ext:s.extractors.length,goal:s.goalIndex,buf:s.extractors.map(function(e){return +e.buffer.toFixed(2);})});})()');
  }

  var results = {};

  /* ------------------------------------------------------------- boot */
  console.log('\n== Boot & render ==');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  await evalJS('localStorage.clear()');
  await navigate('http://127.0.0.1:' + PORT + '/index.html');
  ok(await evalJS('!!window.MTE_GAME'), 'game booted');
  // Movement and timing checks assume the game runs in real time. If the
  // machine is starved, say so here rather than as odd failures later.
  var pace = JSON.parse(await evalJS('new Promise(function(done){var t0=MTE_GAME.getState().time,n=0,w0=performance.now();' +
    '(function f(){n++;if(performance.now()-w0<1000)requestAnimationFrame(f);else done(JSON.stringify({fps:n,sim:MTE_GAME.getState().time-t0}));})();})'));
  ok(pace.fps >= 20 && pace.sim >= 0.8, 'the game runs in real time (' + pace.fps + ' fps, ' + pace.sim.toFixed(2) + 's of game time per second)' +
    (pace.fps < 20 ? ' — FRAMES ARE STARVED: close other headless browsers or heavy apps; timing checks below will fail' : ''));
  // No hand-holding: nothing to read on screen, no tutorial, no prompts.
  ok(await evalJS('!document.getElementById("tutorial") && !document.getElementById("trailHint") && !document.getElementById("goal")'), 'the game ships no tutorial, hint or goal banner');
  ok(await evalJS('document.getElementById("depth").hidden'), 'the depth marker stays hidden on the surface');
  eq(await evalJS('document.getElementById("toast").textContent'), '', 'a fresh world shows no message');
  var chips = await evalJS('document.querySelectorAll("#resources .chip").length');
  eq(chips, 4, 'four resource chips visible');
  eq(await evalJS('document.querySelectorAll("#thumbDock .btn").length'), 4, 'gather, build, upgrade and mine share the thumb dock');
  var zoomIn = await rect('#btnZoomIn');
  await tap(zoomIn.x, zoomIn.y);
  eq(Math.round(await evalJS('MTE_GAME.zoom()') * 100), 125, 'thumb zoom-in control changes map zoom');
  eq(await evalJS('document.getElementById("zoomLevel").textContent'), '125%', 'zoom level is shown beside the thumb controls');
  var zoomOut = await rect('#btnZoomOut');
  await tap(zoomOut.x, zoomOut.y);
  eq(await evalJS('MTE_GAME.zoom()'), 1, 'thumb zoom-out control restores default zoom');
  var entry = JSON.parse(await evalJS('(function(){var p=MTE_GAME.getState().player;return JSON.stringify({x:Math.floor(p.x),y:Math.floor(p.y)});})()'));
  var mineBtn = await rect('#btnMine');
  await tap(mineBtn.x, mineBtn.y);
  eq(await evalJS('MTE_GAME.getState().player.z'), -1, 'mine button drops to the layer beneath the forest');
  ok(await evalJS('MTE_GAME.core.holeBelow(MTE_GAME.getState().world,' + entry.x + ',' + entry.y + ',0)'), 'going down leaves a hole in the forest floor');
  ok(await waitFor('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;return c.isExplored(s.world,' + (entry.x + 1) + ',' + entry.y + ',-1)&&!c.isExplored(s.world,' + (entry.x + 8) + ',' + entry.y + ',-1);})()', 1000), 'underground, only the rock close by is revealed');
  eq(await evalJS('document.getElementById("depth").hidden ? "" : document.getElementById("depth").textContent'), '\u25BC 1', 'the depth marker shows layer 1');
  eq(await evalJS('document.getElementById("mineLabel").textContent'), 'UP', 'mine button becomes the climb-up control underground');
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
  var shaftSpot = JSON.parse(await evalJS('(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core,p=s.player;var t=c.nearestTile(p.x,p.y,40,function(x,y){return c.tileAt(s.world,x,y,-1)===c.T.SHAFT;});c.setRichness(s.world,t.x+1,t.y,-1,0);MTE_GAME.setPlayer(t.x+1.5,t.y+0.5);return JSON.stringify({x:t.x,y:t.y,sx:innerWidth/2-MTE_GAME.tilePx(),sy:innerHeight/2});})()'));
  await sleep(120);
  var shaftOpen = '(function(){var s=MTE_GAME.getState(),c=MTE_GAME.core;return c.tileAt(s.world,' + shaftSpot.x + ',' + shaftSpot.y + ',-1)===c.T.SHAFT_OPEN;})()';
  await tap(shaftSpot.sx, shaftSpot.sy);
  eq(await evalJS('MTE_GAME.getState().player.z'), -1, 'uncovering the marked shaft does not descend automatically');
  ok(await evalJS(shaftOpen), 'the marked shaft opens after a separate dig');
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
  eq(await evalJS('MTE_GAME.getState().player.z'), -1, 'UP climbs back through the shaft you came down');
  await evalJS('MTE_GAME.setPlayer(' + (entry.x + 0.5) + ',' + (entry.y + 0.5) + ')');
  await tap(mineBtn.x, mineBtn.y);
  eq(await evalJS('(function(){var p=MTE_GAME.getState().player;return Math.floor(p.x)+","+Math.floor(p.y)+","+p.z;})()'), entry.x + ',' + entry.y + ',0', 'UP under the first hole comes out where you went down');
  var overlap = await evalJS('(function(){function rect(e){var b=e.getBoundingClientRect();return {l:b.left,t:b.top,r:b.right,b:b.bottom};}function hit(a,b){return !(a.r<=b.l||b.r<=a.l||a.b<=b.t||b.b<=a.t);}var v=rect(document.getElementById("version"));var g=rect(document.getElementById("depth"));var cs=[].slice.call(document.querySelectorAll("#resources .chip")).map(rect);return JSON.stringify({hitGoal:hit(v,g),hitChips:cs.some(function(c){return hit(v,c);})});})()');
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
  var trailGlow = await evalJS('(function(){var c=document.getElementById("game"),g=c.getContext("2d"),d=g.getImageData(0,0,c.width,c.height).data,s=c.width/window.innerWidth;for(var yy=615;yy<=645;yy+=2)for(var xx=245;xx<=265;xx+=2){var i=(Math.floor(yy*s)*c.width+Math.floor(xx*s))*4;if(d[i]<230&&d[i+1]>180&&d[i+2]<175)return true;}return false;})()');
  ok(trailGlow, 'live Trail stroke paints visibly on the map');
  await touch('touchEnd', []);
  await sleep(180);
  var trailEndInv = JSON.parse(await stateSummary()).inv.wood;
  ok(trailEndInv > trailStartInv + 1, 'releasing a Trail gathers its highlighted resource tiles (' + trailStartInv + ' -> ' + trailEndInv + ')');
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
  var spotF = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&c.richness(s.world,x,y,0)>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
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
  var spotK = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&c.richness(s.world,x,y,0)>5){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
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
  var spot2 = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;for(var y=-60;y<60;y++){for(var x=-60;x<60;x++){if(c.tileAt(s.world,x,y,0)===1&&!s.extractors.some(function(e){return e.x===x&&e.y===y;})){MTE_GAME.setPlayer(x+0.5,y+0.5);return x+","+y;}}}return null;})()');
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
  eq(await evalJS('document.getElementById("wikiLink").getAttribute("href")'), 'wiki/', 'the sheet links to the wiki');
  eq(await evalJS('document.getElementById("wikiLink").target'), '_blank', 'the wiki opens outside the game');
  var audioState = await evalJS('MTE_GAME.audioState()');
  console.log('  audio state after gestures: ' + audioState);
  ok(audioState !== 'none', 'audio context is created by early gestures (was: ' + audioState + ')');
  ok(!(await evalJS('document.getElementById("tabBeyond").hidden')), 'Beyond tab is visible from the start');
  eq(await evalJS('document.querySelectorAll("#sheetBody button[data-family]").length'), 5, 'Progression map shows five family headers (4 world + legacy)');
  await evalJS('document.querySelector(".tab[data-tab=beyond]").click()');
  var beyondPreviewReady = await waitFor('document.querySelector("#sheetTitle").textContent === "Beyond" && document.querySelector("#sheetBody button[data-kind=embark]").disabled && document.querySelectorAll("#sheetBody button.max").length === 5', 3000);
  ok(beyondPreviewReady, 'Beyond shows Embark and the perks locked before the loop is reachable');
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
  eq(post.tools.axe, pre.tools.axe, 'axe level survives reload');
  eq(post.ext, pre.ext, 'extractor survives reload');
  eq(Math.floor(post.inv.ore), Math.floor(pre.inv.ore), 'ore inventory survives reload');
  eq(post.seed === undefined ? undefined : post.seed, undefined, 'seed key shape ok'); // no-op guard
  ok(Math.abs(post.x - pre.x) < 0.05 && Math.abs(post.y - pre.y) < 0.05, 'player position survives reload');

  var s3 = await shot('03-reloaded.png');
  console.log('  screenshot: ' + s3);

  /* --------------------------------------------------- exploration aid */
  console.log('\n== Endless world: resources everywhere + fog reveal ==');
  var exploreInfo = await evalJS('(function(){var s=MTE_GAME.getState();var c=MTE_GAME.core;var ore=0,crystal=0;for(var y=-60;y<60;y++)for(var x=-60;x<60;x++){var t=c.tileAt(s.world,x,y,0);if(t===3)ore++;if(t===4)crystal++;}var px=Math.floor(s.player.x),py=Math.floor(s.player.y);return JSON.stringify({ore:ore,crystal:crystal,here:c.isExplored(s.world,px,py,0),far:c.isExplored(s.world,px+300,py+300,0),farTile:typeof c.tileAt(s.world,420000,-420000,0)});})()');
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
  await evalJS('(function(){var s=MTE_GAME.getState();s.unlocks.logistics=true;var ex={key:"lumber",res:"wood",x:Math.floor(s.player.x),y:Math.floor(s.player.y),z:0,buffer:10};s.extractors.push(ex);MTE_GAME.setPlayer(ex.x+0.5,ex.y+0.5);})()');
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
  /* ------------------------------------------------------ tilt the view */
  console.log('\n== Tilt the view ==');
  errBase = pageErrors.length;
  var startTilt = await evalJS('MTE_GAME.tilt()');
  ok(startTilt > 0 && startTilt < 0.5, 'the view starts at a slight angle, never flat (' + startTilt + ')');
  var tiltBtn = await rect('#btnTilt');
  await tap(tiltBtn.x, tiltBtn.y);
  ok(await waitFor('MTE_GAME.tilt() > 0.98', 2000), 'the tilt button swings the view to full tilt');
  eq(await evalJS('document.getElementById("btnTilt").getAttribute("aria-pressed")'), 'true', 'the tilt button shows it is on');
  eq(await evalJS('JSON.parse(localStorage.getItem("more-than-enough-view")).tilt'), 1, 'the tilt is remembered for next time');

  // Two fingers sliding down together tilt back toward flat, without zooming.
  var zoomBefore = await evalJS('MTE_GAME.zoom()');
  await touch('touchStart', [
    { x: 180, y: 300, radiusX: 5, radiusY: 5, force: 1, id: 1 },
    { x: 270, y: 300, radiusX: 5, radiusY: 5, force: 1, id: 2 }
  ]);
  for (var ty = 320; ty <= 400; ty += 20) {
    await touch('touchMove', [
      { x: 180, y: ty, radiusX: 5, radiusY: 5, force: 1, id: 1 },
      { x: 270, y: ty, radiusX: 5, radiusY: 5, force: 1, id: 2 }
    ]);
    await sleep(30);
  }
  await touch('touchEnd', []);
  await sleep(100);
  var tiltAfterDrag = await evalJS('MTE_GAME.tilt()');
  ok(tiltAfterDrag > 0.3 && tiltAfterDrag < 0.8, 'a two-finger drag down eases the tilt (' + tiltAfterDrag.toFixed(2) + ')');
  eq(await evalJS('MTE_GAME.zoom()'), zoomBefore, 'tilting with two fingers leaves the zoom alone');

  // Underground, tilted: a tap on the top of a wall digs that wall.
  await evalJS('MTE_GAME.setTilt(1)');
  mineBtn = await rect('#btnMine'); await tap(mineBtn.x, mineBtn.y);
  ok(await waitFor('MTE_GAME.getState().player.z < 0', 2000), 'went down into the mine with the view tilted');
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
  ok(dugWall, 'tapping the top of a wall, tilted, digs that wall' + (dugWall ? '' : ' — tap picked ' +
    await evalJS('JSON.stringify({pick:MTE_GAME.unproject(' + wall.sx + ',' + wall.sy + '),player:MTE_GAME.getState().player,tilt:MTE_GAME.tilt()})')));
  console.log('  screenshot: ' + await shot('07-tilted-mine.png'));
  mineBtn = await rect('#btnMine'); await tap(mineBtn.x, mineBtn.y);
  ok(await waitFor('MTE_GAME.getState().player.z === 0', 2000), 'back up on the surface');
  console.log('  screenshot: ' + await shot('08-tilted-surface.png'));
  eq(pageErrors.length, errBase, 'tilting throws no render errors');
  await evalJS('MTE_GAME.setTilt(0)');

  /* ------------------------------------------------- performance panel */
  console.log('\n== Performance panel ==');
  eq(await evalJS('document.getElementById("perf").hidden'), true, 'the performance panel starts closed');
  var badge = await rect('#version');
  await tap(badge.x, badge.y);
  ok(await waitFor('!document.getElementById("perf").hidden && /FPS\\s+\\d+/.test(document.getElementById("perf").textContent)', 2000), 'tapping the version badge opens the panel, showing FPS');
  var perfText = await evalJS('document.getElementById("perf").textContent');
  ok(['frame', 'logic', 'draw', 'tiles', 'screen', 'canvas'].every(function (k) { return perfText.indexOf(k) >= 0; }), 'the panel shows frame time, logic, draw, tiles, screen and canvas');
  var snap = await evalJS('MTE_GAME.perf()');
  ok(snap.fps > 0 && snap.tiles > 0 && snap.drawMs > 0, 'the figures are live (' + Math.round(snap.fps) + ' fps, ' + snap.tiles + ' tiles, draw ' + snap.drawMs.toFixed(2) + ' ms)');
  eq(await evalJS('JSON.parse(localStorage.getItem("more-than-enough-view")).perf'), true, 'the open panel is remembered for next time');
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

  await pickPack({ format: 1, name: 'Missing file', looks: { 'resource.wood': { icon: 'wood.svg' } } });
  ok(await waitFor('/wood\\.svg" was not among the files picked/.test(document.getElementById("packReport").textContent)', 2000),
    'a picture that wasn\'t picked with the pack is named in the report');
  await evalJS('document.querySelector("#packReport button").click()');

  var woodBefore = await evalJS('document.querySelector("#resources img.ic").src');
  await pickPack({ format: 1, name: 'Test pack', looks: {
    'resource.wood': { icon: 'wood.svg' },
    'resource.stone': { icon: dot('#ff00ff') },
    'color.backdrop': { color: '#123456' },
    'tile.grass': { top: ['wood.svg', null], color: '#aa2200' }
  } }, [{ name: 'wood.svg', text: dot('#00ff00') }]);
  ok(await waitFor('MTE_GAME.look.name === "Test pack"', 3000), 'a good pack (a pack.json plus a picture file, and inline SVG) is used straight away');
  eq(await evalJS('document.getElementById("packName").textContent'), 'Test pack', 'the Textures button shows its name');
  ok(await evalJS('document.querySelector("#resources img.ic").src') !== woodBefore, 'the wood counter switches to the pack\'s picture');
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
  ok(await waitFor('window.MTE_GAME && MTE_GAME.look.name === "Lanternlight"', 3000), 'and the old pack is forgotten');
  pageErrors = pageErrors.filter(function (e) { return e.indexOf('Texture pack not used') < 0; });

  /* --------------------------------------------------------------- wiki */
  console.log('\n== Wiki ==');
  await navigate2('http://127.0.0.1:' + PORT + '/wiki/#mine');
  ok(await waitFor('document.querySelectorAll("[data-table] table").length > 10', 4000), 'the wiki renders its tables from the game data');
  eq(await evalJS('[...document.querySelectorAll("article")].filter(function(a){return !a.hidden;}).map(function(a){return a.id;}).join()'), 'mine', 'wiki links open the right article');
  eq(await evalJS('[...document.querySelectorAll("[data-k]")].filter(function(n){return !/^[0-9]/.test(n.textContent);}).length'), 0, 'every figure in the wiki resolves to a number');
  ok(await evalJS('document.querySelector(".version").textContent.indexOf(".") > 0'), 'the wiki states the game version it documents');
  await evalJS('location.hash = "#ideas"');
  ok(await waitFor('!document.getElementById("ideas").hidden && document.querySelectorAll("#ideas .idea").length >= 20', 2000), 'the wiki has an Ideas section full of ideas');
  ok(await evalJS('document.querySelector("#ideas .note-ideas").textContent.indexOf("None of this is in the game") >= 0'), 'the Ideas section says plainly that none of it is in the game');
  await evalJS('location.hash = "#things"');
  var things = await evalJS('import("/src/core/index.js").then(function(C){return C.LOOKS.length;})');
  ok(await waitFor('document.querySelectorAll("#things .thing").length === ' + things, 3000), 'Everything in the game lists every thing in the catalog (' + things + ')');
  ok(await waitFor('[...document.querySelectorAll("#things .thing")].every(function(t){return t.querySelector("img, .swatch");})', 2000), 'each one shows its default picture or colour');
  ok(await waitFor('[...document.querySelectorAll("#things img")].every(function(i){return i.complete && i.naturalWidth > 0;})', 6000), 'every picture in the list loads');
  await evalJS('location.hash = "#textures"');
  var bundled = await evalJS('import("/wiki/textures.js").then(function(m){return m.bundleDefaultPack();}).then(function(p){return {n:Object.keys(p.looks).length, svg:JSON.stringify(p).indexOf("<svg")>0, paths:JSON.stringify(p).split(".svg").length > 1};})');
  ok(bundled.n === things && bundled.svg && !bundled.paths, 'the default pack downloads as one file with every picture inside it');

  console.log('\n== Runtime errors ==');
  await navigate('http://127.0.0.1:' + PORT + '/');
  eq(await evalJS('document.getElementById("crash").hidden'), true, 'the crash report stays hidden while nothing is broken');
  await evalJS('(function(){var real=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError");};MTE_GAME.save();Storage.prototype.setItem=real;})()');
  ok((await evalJS('document.getElementById("toast").textContent')).indexOf('Saving failed') === 0, 'a save that fails says so');
  pageErrors = pageErrors.filter(function (e) { return e.indexOf('Saving failed') < 0; });
  await evalJS('setTimeout(function(){ throw new Error("e2e: deliberate break"); })');
  ok(await waitFor('!document.getElementById("crash").hidden', 2000), 'an uncaught error shows the crash report');
  ok((await evalJS('document.querySelector("#crash pre").textContent')).indexOf('deliberate break') >= 0, 'the crash report says what broke');
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
