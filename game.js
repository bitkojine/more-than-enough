/* MORE THAN ENOUGH — browser shell: rendering, input, UI, persistence. */
(function () {
  'use strict';

  var Core = window.MTE.Core;
  var T = Core.T;
  var RESOURCES = Core.RESOURCES;
  var RESOURCE_LABEL = Core.RESOURCE_LABEL;
  var RESOURCE_ICON = Core.RESOURCE_ICON;
  var TOOLS = Core.TOOLS;
  var EXTRACTORS = Core.EXTRACTORS;
  var UNLOCKS = Core.UNLOCKS;
  var SAVE_KEY = 'more-than-enough-v3';

  /* ------------------------------------------------------------- dom */

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var elResources = document.getElementById('resources');
  var elGoal = document.getElementById('goal');
  var elAction = document.getElementById('btnAction');
  var elActionIcon = document.getElementById('actionIcon');
  var elActionLabel = document.getElementById('actionLabel');
  var elBuild = document.getElementById('btnBuild');
  var elUpgrade = document.getElementById('btnUpgrade');
  var elSheet = document.getElementById('sheet');
  var elSheetBody = document.getElementById('sheetBody');
  var elClose = document.getElementById('btnClose');
  var elReset = document.getElementById('btnReset');
  var elMute = document.getElementById('btnMute');
  var elToast = document.getElementById('toast');
  var elSheetGrab = document.getElementById('sheetGrab');
  var elTabBeyond = document.getElementById('tabBeyond');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  /* ----------------------------------------------------------- state */

  var state = null;
  var W = 0, H = 0, dprMax = 2, tilePx = 48;
  var baseTilePx = 48; // the 1x tile size for the current viewport
  var zoom = 1;        // user pinch/wheel zoom multiplier (tilePx = baseTilePx * zoom)
  var camX = 0, camY = 0;
  var particles = [];
  var floats = [];
  var flyers = []; // gathered items homing in on the player
  var joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, moved: 0, t: 0 };
  var pointers = {};                               // pointerId -> {x, y}, for pinch
  var pinch = { active: false, dist: 0, zoom: 1 }; // two-finger pinch-zoom state
  var keys = {};
  var moveTarget = null;
  var stall = 0;
  var actDown = false;
  var actionCd = 0;
  var lastTileX = -1, lastTileY = -1;
  var hasMoved = false;
  var sheetOpen = false;
  var currentTab = 'upgrades';
  var saveAcc = 0, goalAcc = 0, hudAcc = 0, hintAcc = 0;
  var goalFlashT = 0;
  var hintDir = null;
  var audioCtx = null;
  var muted = false;
  var toastT = 0;
  var moveDirX = 0, moveDirY = 1;
  var lastCtxIcon = null, lastCtxLabel = null, lastCtxReady = null;

  var GATHER_CD = 0.25;

  // Effect budgets. Gathered resources zip to the player as "flyers"; without a
  // lifetime a fast flyer can overshoot and orbit the player forever, so sprites
  // pile up and cascade into endless pop particles. These caps keep bursts cheap.
  var MAX_PARTICLES = 160;
  var MAX_FLYERS = 40;
  var FLYER_LIFE = 0.8; // seconds before a flyer force-lands

  // Pinch-to-zoom. Zooming out is effectively unlimited: once tiles get smaller
  // than LOD_PX the renderer switches to downsampled blocks, so the per-frame
  // draw count stays bounded however far out you pinch.
  var ZOOM_MAX = 3;    // 3x in
  var MIN_TILE_PX = 3; // floor on tile size — the practical zoom-out limit
  var LOD_PX = 10;     // below this tile size, draw level-of-detail blocks

  /* ----------------------------------------------------------- utils */

  function fmt(n) {
    n = Math.floor(n);
    if (n < 10000) return String(n);
    if (n < 1e6) return (n / 1000).toFixed(1) + 'k';
    if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
    return (n / 1e9).toFixed(2) + 'B';
  }

  function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  // Multipliers read best as "2.5" when small and "26.0k" when large.
  function fmtMult(m) {
    if (m >= 1000) return fmt(m);
    return String(Math.round(m * 100) / 100);
  }

  function floatText(text, color) {
    floats.push({ x: state.player.x, y: state.player.y - 0.4, vy: -1.1, life: 1.0, max: 1.0, text: text, color: color });
  }

  function tv(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function shade(hex, f) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    var m = 0.84 + f * 0.34;
    return 'rgb(' + Math.round(r * m) + ',' + Math.round(g * m) + ',' + Math.round(b * m) + ')';
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    if (w <= 0 || h <= 0) return; // nothing to draw (e.g. sub-pixel tiles when zoomed out)
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function toast(msg) {
    elToast.textContent = msg;
    elToast.classList.add('show');
    toastT = 1.6;
  }

  var PAL = {};
  PAL[T.GRASS] = '#243018';
  PAL[T.FOREST] = '#0e1a0c';
  PAL[T.STONE] = '#34372e';
  PAL[T.ORE] = '#34372e';
  PAL[T.CRYSTAL] = '#141d30';
  PAL[T.WATER] = '#0e2138';
  PAL[T.ROCK] = '#0b0e11';

  var RES_COLOR = { wood: '#d2a458', stone: '#c3c8bf', ore: '#e0903c', crystal: '#7fe8ff' };

  /* ------------------------------------------------------------ audio */

  // A tiny WebAudio synth with humanization. Gathering walks a pentatonic
  // ladder at random (mostly rising, sometimes resting or dropping) and slips
  // between several keys and octaves, so the melody keeps evolving instead of
  // looping the same riff. Tool level still thickens the tone (square pluck ->
  // triangle + fifth -> plus octave shimmer), and the extractor network drives
  // a slow-breathing "operation hum" drone.

  var audioMaster = null;
  var droneMix = null;          // automated hum level -> tremolo -> master
  var droneOscs = [null, null];
  // Pentatonic keys the melody can drift into (all consonant, no wrong notes).
  var SCALES = [
    [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25], // C major
    [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33], // A minor
    [349.23, 392.00, 440.00, 523.25, 587.33, 698.46, 783.99, 880.00], // F major
    [293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25, 783.99]  // D minor
  ];
  var curScale = null;
  var noteStep = 0;
  var activeNotes = 0;

  function pickScale() {
    return SCALES[(Math.random() * SCALES.length) | 0];
  }

  // When a melodic phrase ends: half the time slip into a new key, otherwise
  // hop the whole phrase an octave up or down for register variety.
  function phraseEnd() {
    if (Math.random() < 0.5) {
      curScale = pickScale();
    } else {
      var m = Math.random() < 0.55 ? 2 : 0.5;
      curScale = curScale.map(function (f) { return f * m; });
    }
  }

  function initAudio() {
    if (!audioCtx) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      } catch (e) { audioCtx = null; return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () { });
    if (audioMaster) return;
    try {
      audioMaster = audioCtx.createGain();
      audioMaster.gain.value = 0.85;
      audioMaster.connect(audioCtx.destination);
      // operation hum: droneMix holds the automated level, then a slow tremolo
      // LFO makes it breathe in and out; inaudible until extractors exist.
      droneMix = audioCtx.createGain();
      droneMix.gain.value = 0;
      var trem = audioCtx.createGain();
      trem.gain.value = 1;
      droneMix.connect(trem); trem.connect(audioMaster);
      var lfo = audioCtx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05 + Math.random() * 0.06; // 3-7s breath cycle
      var lfoAmt = audioCtx.createGain();
      lfoAmt.gain.value = 0.22;                          // gentle swell
      lfo.connect(lfoAmt); lfoAmt.connect(trem.gain);
      lfo.start();
      var root = 110; // A2
      for (var i = 0; i < 2; i++) {
        var o = audioCtx.createOscillator();
        o.type = 'sine';
        o.frequency.value = i === 0 ? root : root * 1.5;
        var g = audioCtx.createGain();
        g.gain.value = i === 0 ? 1 : 0.45;
        o.connect(g); g.connect(droneMix);
        o.start();
        droneOscs[i] = o;
      }
    } catch (e) { audioCtx = null; }
  }

  function note(freq, dur, type, vol, harmony, delay) {
    if (!audioCtx || muted || !audioMaster) return;
    if (activeNotes > 26) return;
    activeNotes++;
    try {
      var t = audioCtx.currentTime + (delay || 0);
      var lp = audioCtx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600 + Math.random() * 1200; // humanized cutoff
      lp.Q.value = 0.6;
      var v = (vol || 0.1) * (0.82 + Math.random() * 0.36); // per-note dynamics
      var o = audioCtx.createOscillator();
      o.type = type || 'triangle';
      o.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.006); // detune
      var g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(audioMaster);
      o.start(t); o.stop(t + dur + 0.03);
      if (harmony) {
        var h = audioCtx.createOscillator();
        h.type = o.type;
        h.frequency.value = freq * harmony * (1 + (Math.random() - 0.5) * 0.004);
        var hg = audioCtx.createGain();
        hg.gain.setValueAtTime(0.0001, t);
        hg.gain.exponentialRampToValueAtTime(v * (0.3 + Math.random() * 0.2), t + 0.006);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        h.connect(lp); hg.connect(audioMaster);
        h.start(t); h.stop(t + dur + 0.03);
      }
      setTimeout(function () { activeNotes--; }, (dur + 0.15) * 1000);
    } catch (e) { activeNotes--; }
  }

  function gatherSound(res, amount) {
    if (!curScale) { curScale = pickScale(); noteStep = 0; }
    var lvl = res === 'wood' ? state.tools.axe : state.tools.pickaxe;
    // biased random walk: usually climb, sometimes rest, rarely drop
    var r = Math.random();
    var step = r < 0.5 ? 1 : r < 0.78 ? 2 : (r < 0.86 ? 0 : -1);
    var old = noteStep;
    noteStep = (noteStep + step + curScale.length) % curScale.length;
    if (old + step >= curScale.length) phraseEnd(); // phrase wrapped -> re-key
    var f = curScale[noteStep];
    // occasional register surprise (octave hop) keeps it lively
    var reg = Math.random();
    if (reg < 0.1) f *= 2;
    else if (reg < 0.16) f *= 0.5;
    var vol = (0.09 + Math.min(0.04, amount * 0.0012)) * (0.85 + Math.random() * 0.3);
    if (lvl >= 5) {
      var harm = Math.random() < 0.6 ? 1.5 : (Math.random() < 0.5 ? 2 : 1.333); // fifth/oct/fourth
      note(f, 0.17, 'triangle', vol, harm);
      if (Math.random() < 0.5) { // occasional high sparkle
        var s = f < 300 ? 4 : f < 600 ? 2 : 1.5;
        note(f * s, 0.2, 'triangle', vol * 0.32, 0, 0.015);
      }
    } else if (lvl >= 3) {
      var harm2 = Math.random() < 0.7 ? 1.5 : (Math.random() < 0.6 ? 2 : 1.333);
      note(f, 0.14, 'triangle', vol, harm2);
    } else {
      note(f, 0.09, 'square', vol);
      if (Math.random() < 0.12) note(f * 2, 0.08, 'square', vol * 0.5, 0, 0.012);
    }
  }

  function collectSound() {
    if (!curScale) { curScale = pickScale(); noteStep = 0; }
    var n = 3 + ((Math.random() * 2) | 0);             // 3 or 4 notes
    var start = (Math.random() * curScale.length) | 0;
    var dir = Math.random() < 0.55 ? 1 : -1;           // up or down
    for (var i = 0; i < n; i++) {
      var idx = (start + dir * i + curScale.length) % curScale.length;
      var f = curScale[idx];
      f *= f <= 600 ? 2 : (Math.random() < 0.5 ? 1.5 : 1); // sparkle register
      note(f, 0.09 + Math.random() * 0.05, 'triangle', 0.085,
        Math.random() < 0.3 ? 1.5 : 0, i * (0.035 + Math.random() * 0.025));
    }
    noteStep = (start + dir * n + curScale.length) % curScale.length;
    if (dir === 1 && start + n >= curScale.length) phraseEnd();
  }

  function upgradeSound() {
    var roots = [233.08, 261.63, 311.13, 349.23, 392.00];
    var b = roots[(Math.random() * roots.length) | 0];
    if (Math.random() < 0.34) { // major triad + octave bloom
      note(b, 0.35, 'triangle', 0.09, 0, 0);
      note(b * 1.25, 0.35, 'triangle', 0.07, 0, 0.015 + Math.random() * 0.02);
      note(b * 1.5, 0.4, 'triangle', 0.07, 0, 0.04 + Math.random() * 0.03);
      note(b * 2, 0.55, 'sine', 0.05, 0, 0.14);
    } else if (Math.random() < 0.5) { // major-7th shimmer
      note(b, 0.35, 'triangle', 0.08, 0, 0);
      note(b * 1.5, 0.38, 'triangle', 0.07, 0, 0.03 + Math.random() * 0.02);
      note(b * 1.875, 0.4, 'triangle', 0.06, 0, 0.07 + Math.random() * 0.02);
      note(b * 2.5, 0.5, 'sine', 0.045, 0, 0.16);
    } else { // airy add-2
      note(b, 0.35, 'triangle', 0.08, 0, 0);
      note(b * 1.125, 0.35, 'triangle', 0.06, 0, 0.02 + Math.random() * 0.02);
      note(b * 1.5, 0.4, 'triangle', 0.07, 0, 0.05 + Math.random() * 0.02);
      note(b * 2, 0.5, 'sine', 0.05, 0, 0.14);
    }
  }

  function buildSound() {
    if (!curScale) { curScale = pickScale(); noteStep = 0; }
    var thump = 0.92 + Math.random() * 0.16; // varied thump weight
    note(200 * thump, 0.12, 'sine', 0.2, 0, 0);
    note(100 * thump, 0.18, 'sine', 0.14, 0, 0.01);
    var i = (Math.random() * curScale.length) | 0;
    var j = (i + 1 + ((Math.random() * 3) | 0)) % curScale.length;
    note(curScale[i], 0.14, 'triangle', 0.08, Math.random() < 0.35 ? 1.5 : 0, 0.05);
    note(curScale[j], 0.2, 'triangle', 0.07, Math.random() < 0.2 ? 2 : 0, 0.13);
    noteStep = j;
  }

  function fanfare() {
    var roots = [392.00, 440.00, 523.25, 587.33];
    var b = roots[(Math.random() * roots.length) | 0];
    if (Math.random() < 0.55) { // rising arpeggio
      note(b, 0.28 + Math.random() * 0.06, 'triangle', 0.09, 0, 0);
      note(b * 1.25, 0.28, 'triangle', 0.08, 0, 0.06);
      note(b * 1.5, 0.3, 'triangle', 0.08, 0, 0.12);
      note(b * 2, 0.5, 'triangle', 0.1, Math.random() < 0.8 ? 1.5 : 0, 0.2);
    } else { // twinkling scale run with an octave leap at the end
      for (var i = 0; i < 5; i++) {
        note(b * Math.pow(2, i / 12) * (i === 4 ? 2 : 1), 0.22, 'triangle', 0.07, 0, i * 0.055);
      }
    }
  }

  function updateDrone() {
    if (!audioCtx || muted || !droneMix) return;
    var n = state.extractors.length;
    var oc = 1;
    try { oc = Core.overclockMult(state); } catch (e) { /* keep 1 */ }
    var target = 0;
    if (n > 0) target = Math.min(0.05, 0.012 * Math.min(3, n)) * (0.6 + 0.4 * Math.min(1, (oc - 1) / 3));
    var t = audioCtx.currentTime;
    var root = 110 + (oc - 1) * 2 + (Math.random() - 0.5) * 1.6; // slight wander
    droneMix.gain.setTargetAtTime(target, t, 0.9);
    droneOscs[0].frequency.setTargetAtTime(root, t, 0.9);
    droneOscs[1].frequency.setTargetAtTime(root * (1.45 + Math.random() * 0.1), t, 0.9);
  }

  /* ------------------------------------------------------------ input */

  function screenToWorld(cx, cy) {
    return { x: (cx + camX) / tilePx, y: (cy + camY) / tilePx };
  }

  function canvasPoint(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /* Two-finger pinch zoom (and mouse-wheel zoom). The camera always stays on the
     player, so zoom simply scales tilePx around the player. */
  function pointerCount() {
    var n = 0;
    for (var k in pointers) n++;
    return n;
  }

  function pinchDistance() {
    var ids = Object.keys(pointers);
    if (ids.length < 2) return 0;
    var a = pointers[ids[0]], b = pointers[ids[1]];
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function setZoom(z) {
    if (!(z > 0)) return;
    var min = MIN_TILE_PX / baseTilePx;
    if (z < min) z = min;
    if (z > ZOOM_MAX) z = ZOOM_MAX;
    zoom = z;
    tilePx = baseTilePx * zoom;
  }

  function onPointerDown(e) {
    initAudio();
    if (sheetOpen) return;
    if (e.button !== undefined && e.button !== 0) return;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    var p = canvasPoint(e);
    pointers[e.pointerId] = { x: p.x, y: p.y };

    if (pinch.active || pointerCount() >= 2) {
      // A second finger means pinch-zoom, not a joystick drag.
      joy.active = false; joy.x = 0; joy.y = 0;
      if (!pinch.active) { pinch.active = true; pinch.dist = pinchDistance() || 1; pinch.zoom = zoom; }
      e.preventDefault();
      return;
    }

    joy.active = true; joy.id = e.pointerId;
    joy.ox = p.x; joy.oy = p.y; joy.x = 0; joy.y = 0;
    joy.moved = 0; joy.t = performance.now();
    e.preventDefault();
  }

  function onPointerMove(e) {
    var tracked = pointers[e.pointerId];
    if (tracked) { var pp = canvasPoint(e); tracked.x = pp.x; tracked.y = pp.y; }

    if (pinch.active) {
      var d = pinchDistance();
      if (d > 1) setZoom(pinch.zoom * (d / pinch.dist));
      e.preventDefault();
      return;
    }

    if (sheetOpen || !joy.active || e.pointerId !== joy.id) return;
    var p = canvasPoint(e);
    var dx = p.x - joy.ox, dy = p.y - joy.oy;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var max = 74;
    if (dist > joy.moved) joy.moved = dist;
    if (dist < 12) { joy.x = 0; joy.y = 0; return; }
    if (dist > max) {
      // recenter so the stick follows the thumb
      joy.ox += dx * (1 - max / dist);
      joy.oy += dy * (1 - max / dist);
      dx = p.x - joy.ox; dy = p.y - joy.oy;
      dist = max;
    }
    joy.x = dx / max;
    joy.y = dy / max;
    if (dist > 34) { moveTarget = null; hasMoved = true; }
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (pointers[e.pointerId]) delete pointers[e.pointerId];

    if (pinch.active) {
      if (pointerCount() < 2) pinch.active = false; // ignore the leftover finger
      e.preventDefault();
      return;
    }

    if (!joy.active || e.pointerId !== joy.id) return;
    var wasTap = joy.moved < 14 && (performance.now() - joy.t) < 320;
    joy.active = false; joy.x = 0; joy.y = 0;
    if (wasTap && !sheetOpen) {
      var p = canvasPoint(e);
      tapAt(p.x, p.y);
    }
    e.preventDefault();
  }

  function tapAt(sx, sy) {
    var w = screenToWorld(sx, sy);
    var tx = Math.floor(w.x), ty = Math.floor(w.y);
    // gather if the tile is in range
    var g = Core.gatherTarget(state);
    if (g && g.x === tx && g.y === ty) { doGather(); return; }
    // collect if an extractor is in range
    var c = Core.collectTarget(state);
    if (c) {
      for (var i = 0; i < c.list.length; i++) {
        var e = c.list[i];
        if (e.x === tx && e.y === ty) { doCollect(); return; }
      }
    }
    moveTarget = { x: tx + 0.5, y: ty + 0.5 };
    stall = 0;
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp, { passive: false });
  canvas.addEventListener('pointercancel', onPointerUp, { passive: false });
  canvas.addEventListener('wheel', function (e) {
    if (sheetOpen) return;
    e.preventDefault();
    setZoom(zoom * Math.pow(1.0015, -e.deltaY));
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    initAudio();
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'Enter') {
      if (!sheetOpen) {
        actDown = true;
        // One action per physical press; ignore OS autorepeat (e.repeat) —
        // holding is driven by the cooldown-gated loop in update() like the
        // touch button, so repeats can't fire doAction() without GATHER_CD.
        if (!e.repeat && doAction()) actionCd = GATHER_CD;
      }
      e.preventDefault();
    }
    if (e.key === 'Escape' && sheetOpen) closeSheet();
    var k = e.key.toLowerCase();
    if (k === 'b') { toggleTab('build'); }
    if (k === 'u' || k === 'c') { toggleTab('upgrades'); }
  });
  window.addEventListener('keyup', function (e) {
    keys[e.key.toLowerCase()] = false;
    if (e.key === ' ' || e.key === 'Enter') actDown = false;
  });

  // Block browser scrolling / gestures outside the sheet.
  document.addEventListener('touchmove', function (e) {
    if (e.target && e.target.closest && e.target.closest('#sheet')) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });

  /* --------------------------------------------------------- actions */

  function doGather() {
    var g = Core.gather(state);
    if (!g) return false;
    spawnGatherFX(g.x, g.y, g.res, g.amount);
    gatherSound(g.res, g.amount);
    onWorldChanged();
    return true;
  }

  function doCollect() {
    var t = Core.collectTarget(state);
    if (!t) return false;
    // snapshot the sources before Core.collect drains them, so each extractor
    // can feed a flyer animation from its own position
    var sources = t.list.map(function (e) { return { x: e.x, y: e.y, res: e.res, amt: Math.floor(e.buffer) }; });
    var gained = Core.collect(state);
    if (!gained) return false;
    for (var i = 0; i < sources.length; i++) {
      if (sources[i].amt > 0) spawnFlyers(sources[i].x, sources[i].y, sources[i].res, sources[i].amt);
    }
    var first = true;
    for (var r in gained) {
      if (gained[r] <= 0) continue;
      floatText('+' + fmt(gained[r]) + ' ' + RESOURCE_ICON[r], RES_COLOR[r]);
      if (first) { collectSound(); first = false; }
    }
    onWorldChanged();
    return true;
  }

  function doAction() {
    if (Core.collectTarget(state)) return doCollect();
    return doGather();
  }

  /* ---------------------------------------------------------- effects */

  // Every transient effect goes through these so the budgets above are always
  // enforced, and clearEffects() can wipe them all in one place on a new world.
  function addParticle(p) { if (particles.length < MAX_PARTICLES) particles.push(p); }
  function addFlyer(f) { if (flyers.length < MAX_FLYERS) flyers.push(f); }

  function clearEffects() {
    particles.length = 0;
    floats.length = 0;
    flyers.length = 0;
    moveTarget = null;
    hintDir = null;
    stall = 0;
  }

  function spawnGatherFX(tx, ty, res, amount) {
    var col = RES_COLOR[res];
    for (var i = 0; i < 6; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 1.2 + Math.random() * 2.2;
      addParticle({
        x: tx + 0.5 + (Math.random() - 0.5) * 0.5,
        y: ty + 0.5 + (Math.random() - 0.5) * 0.5,
        vx: Math.cos(a) * sp * 0.6,
        vy: Math.sin(a) * sp * 0.6 - 1.4,
        life: 0.45 + Math.random() * 0.25, max: 0.7,
        size: 1.6 + Math.random() * 2.2,
        color: col
      });
    }
    floats.push({ x: tx + 0.5, y: ty + 0.2, vy: -1.3, life: 0.9, max: 0.9, text: '+' + fmt(amount), color: col });
    spawnFlyers(tx, ty, res, amount);
  }

  // A handful of little resource sprites that zip from the source to the
  // player (used by both gathering and collecting so the inventory gain is
  // always visible on screen).
  function spawnFlyers(tx, ty, res, amount) {
    var n = Math.max(1, Math.min(7, Math.ceil(amount * 0.35)));
    for (var i = 0; i < n; i++) {
      addFlyer({
        x: tx + 0.5 + (Math.random() - 0.5) * 0.5,
        y: ty + 0.5 + (Math.random() - 0.5) * 0.5,
        res: res,
        seed: Math.random() * Math.PI * 2,   // stagger/rotation flavour
        delay: Math.random() * 0.16,          // tiny launch stagger
        t: 0,
        vx: 0, vy: 0
      });
    }
  }

  function popFlyer(fy) {
    var col = RES_COLOR[fy.res];
    for (var i = 0; i < 3; i++) {
      var a = Math.random() * Math.PI * 2;
      addParticle({
        x: state.player.x, y: state.player.y - 0.2,
        vx: Math.cos(a) * (1 + Math.random() * 1.8),
        vy: Math.sin(a) * (1 + Math.random() * 1.8) - 0.7,
        life: 0.22 + Math.random() * 0.18, max: 0.4,
        size: 1.2 + Math.random() * 1.6,
        color: col
      });
    }
  }

  function spawnBuildFX(tx, ty) {
    var col = '#9fe08a';
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2;
      addParticle({
        x: tx + 0.5, y: ty + 0.5,
        vx: Math.cos(a) * 2, vy: Math.sin(a) * 2 - 1,
        life: 0.6 + Math.random() * 0.4, max: 1.0,
        size: 2 + Math.random() * 2, color: col
      });
    }
  }

  function onWorldChanged() {
    updateHud();
    saveAcc = 999; // force a save soon
  }

  /* ------------------------------------------------------------- goals */

  function checkGoals() {
    var advanced = false;
    while (state.goalIndex < Core.GOALS.length && Core.GOALS[state.goalIndex].test(state)) {
      state.goalIndex++;
      advanced = true;
    }
    if (advanced) {
      goalFlashT = 1.2;
      elGoal.classList.add('flash');
      fanfare();
      setTimeout(function () { elGoal.classList.remove('flash'); }, 700);
      hintDir = null;
      updateHud();
    }
  }

  function currentGoalText() {
    var i = Math.min(state.goalIndex, Core.GOALS.length - 1);
    return Core.GOALS[i].text;
  }

  /* --------------------------------------------------------------- hud */

  var chipEls = {};

  function buildChips() {
    elResources.innerHTML = '';
    for (var i = 0; i < RESOURCES.length; i++) {
      var r = RESOURCES[i];
      var chip = document.createElement('div');
      chip.className = 'chip';
      chip.innerHTML = '<span class="ic">' + RESOURCE_ICON[r] + '</span>' +
        '<span class="col"><span class="val">0</span><span class="lbl">' + RESOURCE_LABEL[r] + '</span></span>' +
        '<span class="rate"></span>';
      elResources.appendChild(chip);
      chipEls[r] = { val: chip.querySelector('.val'), rate: chip.querySelector('.rate') };
    }
  }

  function productionRates() {
    var rates = { wood: 0, stone: 0, ore: 0, crystal: 0 };
    for (var j = 0; j < state.extractors.length; j++) {
      var e = state.extractors[j];
      rates[e.res] += EXTRACTORS[e.key].rate * Core.resProdMult(state, e.res);
    }
    for (var i = 0; i < RESOURCES.length; i++) {
      rates[RESOURCES[i]] += Core.abundanceTrickle(state, RESOURCES[i]);
    }
    return rates;
  }

  // The Beyond tab is revealed once the player is close to (or past) their
  // first embark, so brand-new players aren't overwhelmed.
  function beyondUnlocked() {
    return (state.insight || 0) > 0 || (state.prestiges || 0) > 0 || Core.canEmbark(state);
  }
  var lastBeyondUnlocked = false;

  function updateHud() {
    if (!state) return;
    for (var i = 0; i < RESOURCES.length; i++) {
      var r = RESOURCES[i];
      chipEls[r].val.textContent = fmt(state.inv[r]);
    }
    var rates = productionRates();
    for (var j = 0; j < RESOURCES.length; j++) {
      var rr = RESOURCES[j];
      chipEls[rr].rate.textContent = rates[rr] > 0.01 ? '+' + fmt1(rates[rr]) + '/s' : '';
    }
    elGoal.textContent = currentGoalText();
    var bu = beyondUnlocked();
    if (bu !== lastBeyondUnlocked) {
      lastBeyondUnlocked = bu;
      if (elTabBeyond) elTabBeyond.hidden = !bu;
      if (!bu && currentTab === 'beyond') setTab('upgrades');
    }
  }

  function updateActionButton() {
    var c = context();
    var ic = '\u2014', label = 'EXPLORE', ready = false, disabled = true;
    if (c.type === 'collect') {
      ic = '\uD83D\uDCE6'; label = 'COLLECT ' + fmt(c.total); ready = true; disabled = false;
    } else if (c.type === 'gather') {
      ic = RESOURCE_ICON[c.res]; label = 'GATHER +' + fmt(c.amount); ready = true; disabled = false;
    }
    if (ic !== lastCtxIcon) { elActionIcon.textContent = ic; lastCtxIcon = ic; }
    if (label !== lastCtxLabel) { elActionLabel.textContent = label; lastCtxLabel = label; }
    if (ready !== lastCtxReady) {
      elAction.classList.toggle('ready', ready);
      elAction.classList.toggle('disabled', disabled);
      lastCtxReady = ready;
    }
  }

  function context() {
    var c = Core.collectTarget(state);
    if (c) return { type: 'collect', total: c.total };
    var g = Core.gatherTarget(state);
    if (g) return { type: 'gather', res: g.res, amount: Core.gatherYield(state, g.res) };
    return { type: 'none' };
  }

  /* ------------------------------------------------------------- sheet */

  function openSheet(tab) {
    sheetOpen = true;
    elSheet.classList.add('open');
    elSheet.setAttribute('aria-hidden', 'false');
    setTab(tab || currentTab);
  }

  function closeSheet() {
    sheetOpen = false;
    elSheet.classList.remove('open');
    elSheet.setAttribute('aria-hidden', 'true');
    actDown = false;
  }

  // BUILD / UPGRADE buttons and shortcuts: open the sheet, switch to the tab
  // if it's open on another one, or close it when the tab is already shown.
  function toggleTab(tab) {
    if (!sheetOpen) { openSheet(tab); return; }
    if (currentTab === tab) closeSheet();
    else setTab(tab);
  }

  function setTab(tab) {
    currentTab = tab;
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.tab === tab);
    renderSheet();
  }

  function costHtml(cost) {
    var parts = [];
    for (var r in cost) parts.push(fmt(cost[r]) + ' ' + RESOURCE_ICON[r]);
    return parts.join(' ');
  }

  function renderSheet() {
    if (currentTab === 'upgrades') renderUpgrades();
    else if (currentTab === 'build') renderBuild();
    else renderBeyond();
  }

  function renderUpgrades() {
    var html = '<div class="section">Tools</div>';
    var toolIds = ['axe', 'pickaxe', 'boots', 'overclock'];
    for (var i = 0; i < toolIds.length; i++) {
      var id = toolIds[i];
      var def = TOOLS[id];
      var info = Core.upgradeInfo(state, id);
      var lv = state.tools[id];
      var described;
      if (info.maxed) {
        described = 'Level ' + lv + ' / ' + info.max + ' \u2014 MAX';
      } else {
        var nx = info.next;
        var effect = '';
        if (nx.yield !== undefined) effect = 'yield ' + def.levels[lv - 1].yield + ' \u2192 <span class="ok">' + nx.yield + '</span>';
        else if (nx.mult !== undefined) {
          var cur = def.levels[lv - 1].mult;
          effect = (id === 'boots' ? 'speed ' : 'output ') + '&times;' + cur + ' \u2192 <span class="ok">&times;' + nx.mult + '</span>';
        }
        described = 'Level ' + lv + ' / ' + info.max + ' &middot; ' + effect + '<br><span class="' + (Core.canAfford(state.inv, info.cost) ? 'ok' : 'bad') + '">Cost: ' + costHtml(info.cost) + '</span>';
      }
      var btn = info.maxed
        ? '<button class="buy max" disabled>MAX</button>'
        : '<button class="buy" data-kind="tool" data-id="' + id + '"' + (Core.canAfford(state.inv, info.cost) ? '' : ' disabled') + '>Craft</button>';
      html += row(def.icon, def.name, described, btn);
    }

    // Abundance Engine — repeatable levels: +1/s passive, refineries ×1.5 each.
    var ablv = state.abundanceLv || 0;
    var acost = Core.abundanceCost(state);
    var aafford = Core.canAfford(state.inv, acost);
    var adesc = 'Level ' + ablv + ' &middot; +' + ablv + '/s of each resource';
    if (ablv > 0) adesc += ' &middot; extractors &times;' + fmtMult(Core.abundanceMult(state));
    adesc += '<br><span class="' + (aafford ? 'ok' : 'bad') + '">Cost: ' + costHtml(acost) + '</span>';
    var abtn = '<button class="buy" data-kind="unlock" data-id="abundance"' + (aafford ? '' : ' disabled') + '>' + (ablv === 0 ? 'Build' : 'Level ' + (ablv + 1)) + '</button>';
    html += '<div class="section">Abundance Engine</div>';
    html += row(UNLOCKS.abundance.icon, UNLOCKS.abundance.name, adesc, abtn);

    // Refinery chains — each level multiplies ALL production of one resource.
    html += '<div class="section">Refinery Chains</div>';
    for (var ri = 0; ri < RESOURCES.length; ri++) {
      var rr = RESOURCES[ri];
      var names = Core.RES_UPGRADE_NAMES[rr];
      var rinfo = Core.resUpgradeInfo(state, rr);
      var rsub;
      if (rinfo.maxed) {
        rsub = 'Level ' + rinfo.level + ' / ' + rinfo.max + ' &middot; &times;' + fmtMult(Core.resUpgradeMul(state, rr)) + ' &mdash; MAX';
      } else {
        var curM = Core.resUpgradeMul(state, rr);
        rsub = 'Level ' + rinfo.level + ' / ' + rinfo.max + ' &middot; &times;' + fmtMult(curM) + ' \u2192 <span class="ok">&times;' + fmtMult(curM * rinfo.next.mult) + '</span>';
        rsub += '<br><span class="' + (Core.canAfford(state.inv, rinfo.cost) ? 'ok' : 'bad') + '">Cost: ' + costHtml(rinfo.cost) + '</span>';
      }
      var rbtn = rinfo.maxed
        ? '<button class="buy max" disabled>MAX</button>'
        : '<button class="buy" data-kind="resup" data-id="' + rr + '"' + (Core.canAfford(state.inv, rinfo.cost) ? '' : ' disabled') + '>Refine</button>';
      html += row(names.icon, names.name + ' <span class="tag">' + RESOURCE_ICON[rr] + '</span>', rsub, rbtn);
    }

    html += '<div class="section">Unlocks &amp; Blueprints</div>';
    var unlockIds = ['logistics', 'sapling', 'brickyard', 'foundry', 'observatory'];
    for (var j = 0; j < unlockIds.length; j++) {
      var uid = unlockIds[j];
      var ud = UNLOCKS[uid];
      var uinfo = Core.upgradeInfo(state, uid);
      var sub;
      if (uinfo.unlocked) sub = '<span class="ok">Active</span> &middot; ' + ud.desc;
      else sub = ud.desc + '<br><span class="' + (Core.canAfford(state.inv, ud.cost) ? 'ok' : 'bad') + '">Cost: ' + costHtml(ud.cost) + '</span>';
      var ubtn = uinfo.unlocked
        ? '<button class="buy max" disabled>OWNED</button>'
        : '<button class="buy" data-kind="unlock" data-id="' + uid + '"' + (Core.canAfford(state.inv, ud.cost) ? '' : ' disabled') + '>Unlock</button>';
      html += row(ud.icon, ud.name, sub, ubtn);
    }
    elSheetBody.innerHTML = html;
  }

  function renderBuild() {
    var html = '<div class="section">Extractors</div>';
    var deposits = ['lumber', 'quarry', 'mine', 'resonator'];
    var terrainName = { lumber: 'forest', quarry: 'stone', mine: 'ore', resonator: 'crystal' };
    for (var i = 0; i < deposits.length; i++) {
      var id = deposits[i];
      var def = EXTRACTORS[id];
      var count = Core.extractorCount(state, id);
      var cost = Core.extractorCost(state, id);
      var tgt = Core.buildTarget(state, id);
      var afford = Core.canAfford(state.inv, cost);
      var rate = def.rate * Core.resProdMult(state, def.res);
      var terrain = terrainName[id];
      var sub;
      if (!tgt) sub = '<span class="bad">Stand on / next to ' + terrain + '</span>';
      else if (!afford) sub = 'On ' + terrain + ' &middot; +' + fmt1(rate) + ' ' + RESOURCE_ICON[def.res] + '/s<br><span class="bad">Cost: ' + costHtml(cost) + '</span>';
      else sub = 'On ' + terrain + ' &middot; +' + fmt1(rate) + ' ' + RESOURCE_ICON[def.res] + '/s<br><span class="ok">Cost: ' + costHtml(cost) + '</span>';
      var btn = '<button class="buy" data-kind="build" data-id="' + id + '"' + (tgt && afford ? '' : ' disabled') + '>Place</button>';
      html += row(def.icon, def.name + (count ? ' <span class="tag">\u00D7' + count + '</span>' : ''), sub, btn);
    }

    html += '<div class="section">Converters &middot; any land</div>';
    var converts = ['sapling', 'brickyard', 'foundry', 'observatory'];
    for (var c = 0; c < converts.length; c++) {
      var cid = converts[c];
      var cdef = EXTRACTORS[cid];
      var locked = cdef.unlock && !state.unlocks[cdef.unlock];
      var ccount = Core.extractorCount(state, cid);
      var ccost = Core.extractorCost(state, cid);
      var cafford = Core.canAfford(state.inv, ccost);
      var csub;
      if (locked) {
        var bp = UNLOCKS[cdef.unlock];
        csub = '<span class="bad">Locked \u2014 craft ' + (bp ? bp.name : 'a blueprint') + '</span>';
      } else {
        var ctgt = Core.buildTarget(state, cid);
        var stat = 'On any land &middot; +' + fmt1(cdef.rate * Core.resProdMult(state, cdef.res)) + ' ' + RESOURCE_ICON[cdef.res] + '/s';
        if (!ctgt) csub = stat + '<br><span class="bad">No open land around you</span>';
        else csub = stat + '<br><span class="' + (cafford ? 'ok' : 'bad') + '">Cost: ' + costHtml(ccost) + '</span>';
      }
      var cbtn = locked
        ? '<button class="buy" data-kind="build" data-id="' + cid + '" disabled>Locked</button>'
        : '<button class="buy" data-kind="build" data-id="' + cid + '"' + (cafford && Core.buildTarget(state, cid) ? '' : ' disabled') + '>Place</button>';
      html += row(cdef.icon, cdef.name + (ccount ? ' <span class="tag">\u00D7' + ccount + '</span>' : ''), csub, cbtn);
    }

    elSheetBody.innerHTML = html;
  }

  function renderBeyond() {
    var gain = Core.embarkGain(state);
    var lifetime = Math.floor((state.totalEver || 0) + Core.sumStats(state));

    var html = '<div class="section">Insight</div>';
    html += row('\u2728', fmt(state.insight || 0) + ' Insight',
      'Prestiges: ' + (state.prestiges || 0) + ' &middot; Lifetime gathered: ' + fmt(lifetime), '');

    html += '<div class="section">New World</div>';
    var can = Core.canEmbark(state);
    var esub = can
      ? 'Reset the world, inventory and upgrades. Keep Insight &amp; perks, and gain <span class="ok">+' + fmt(gain) + '</span> Insight.'
      : 'Reach ' + fmt(Core.EMBARK_MIN_TOTAL) + ' lifetime resources. Currently ' + fmt(lifetime) + '.';
    var ebtn = '<button class="buy" data-kind="embark"' + (can ? '' : ' disabled') + '>' + (can ? 'Embark +' + fmt(gain) : 'Embark') + '</button>';
    html += row('\uD83C\uDF0D', 'Embark', esub, ebtn);

    html += '<div class="section">Perks</div>';
    var keys = ['legacy', 'memory', 'heirloom', 'cartographer', 'nomad'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var d = Core.PERKS[k];
      var owned = Core.perkOwned(state, k);
      var cost = Core.perkCost(state, k);
      var maxed = !d.repeat && owned;
      var psub = d.desc + '<br>' + (maxed ? '<span class="ok">Active</span>'
        : '<span class="' + ((state.insight || 0) >= cost ? 'ok' : 'bad') + '">' + cost + ' Insight</span>');
      var pbtn = maxed
        ? '<button class="buy max" disabled>OWNED</button>'
        : '<button class="buy" data-kind="perk" data-id="' + k + '"' + ((state.insight || 0) >= cost ? '' : ' disabled') + '>' + (d.repeat && owned ? 'Level ' + (owned + 1) : 'Buy') + '</button>';
      var tag = owned ? ' <span class="tag">' + (d.repeat ? 'Lv ' + owned : 'Owned') + '</span>' : '';
      html += row(d.icon, d.name + tag, psub, pbtn);
    }
    elSheetBody.innerHTML = html;
  }

  function doEmbark() {
    if (!Core.canEmbark(state)) {
      toast('Reach ' + fmt(Core.EMBARK_MIN_TOTAL) + ' lifetime resources first');
      return;
    }
    var gain = Core.embarkGain(state);
    if (!window.confirm('Embark on a new world?\n\nYour world, inventory, extractors and upgrades reset. You keep Insight and perks, and gain ' + gain + ' Insight.')) return;
    var res = Core.embark(state);
    if (!res.ok) { toast(res.reason || 'Cannot embark'); return; }
    state = res.state;
    lastTileX = -1; lastTileY = -1;
    clearEffects();
    actDown = false; lastBeyondUnlocked = false;
    closeSheet();
    updateHud(); updateHint(); save(true);
    try { initAudio(); } catch (e) { /* audio optional */ }
    fanfare();
    toast('New world \u2014 gained ' + res.gained + ' Insight');
  }

  function row(icon, name, sub, button) {
    return '<div class="row"><div class="ic">' + icon + '</div>' +
      '<div class="main"><div class="nm">' + name + '</div><div class="sub">' + sub + '</div></div>' +
      button + '</div>';
  }

  elSheetBody.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('button[data-kind]') : null;
    if (!btn || btn.disabled) return;
    var kind = btn.dataset.kind, id = btn.dataset.id;
    if (kind === 'tool' || kind === 'unlock') {
      var res = Core.buyUpgrade(state, id);
      if (res.ok) {
        upgradeSound();
        updateDrone();
        floatText('\u2726 UPGRADE', '#9fe08a');
      } else {
        toast(res.reason || 'Cannot craft');
      }
    } else if (kind === 'resup') {
      var rr = Core.buyResUpgrade(state, id);
      if (rr.ok) {
        upgradeSound();
        updateDrone();
        floatText('\u2726 REFINE', '#9fe08a');
      } else {
        toast(rr.reason || 'Cannot refine');
      }
    } else if (kind === 'perk') {
      var pk = Core.buyPerk(state, id);
      if (pk.ok) {
        upgradeSound();
        floatText('\u2726 PERK', '#cbb0f0');
      } else {
        toast(pk.reason || 'Cannot buy perk');
      }
    } else if (kind === 'build') {
      var pr = Core.place(state, id);
      if (pr.ok) {
        spawnBuildFX(pr.x, pr.y);
        buildSound();
        updateDrone();
        goalFlashT = 0.6;
      } else {
        toast(pr.reason || 'Cannot build');
      }
    } else if (kind === 'embark') {
      doEmbark();
      return;
    }
    onWorldChanged();
    checkGoals();
    renderSheet();
  });

  elAction.addEventListener('pointerdown', function (e) {
    initAudio();
    e.preventDefault();
    elAction.setPointerCapture && elAction.setPointerCapture(e.pointerId);
    actDown = true;
    if (context().type !== 'none' && actionCd <= 0) {
      if (doAction()) actionCd = GATHER_CD;
    }
  });
  function releaseAction(e) { actDown = false; e.preventDefault(); }
  elAction.addEventListener('pointerup', releaseAction);
  elAction.addEventListener('pointercancel', releaseAction);
  elAction.addEventListener('pointerleave', function () { actDown = false; });

  function bindTabButton(el, tab) {
    el.addEventListener('click', function () {
      initAudio();
      toggleTab(tab);
    });
  }
  bindTabButton(elBuild, 'build');
  bindTabButton(elUpgrade, 'upgrades');
  elClose.addEventListener('click', closeSheet);
  for (var ti = 0; ti < tabs.length; ti++) {
    tabs[ti].addEventListener('click', function (e) { setTab(e.currentTarget.dataset.tab); });
  }

  // Swipe the sheet down (from its grab handle) to dismiss it.
  (function () {
    var dragging = false, startY = 0, dy = 0;
    elSheetGrab.addEventListener('pointerdown', function (e) {
      dragging = true; startY = e.clientY; dy = 0;
      if (elSheetGrab.setPointerCapture) elSheetGrab.setPointerCapture(e.pointerId);
      elSheet.style.transition = 'none';
      e.preventDefault();
    });
    elSheetGrab.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      elSheet.style.transform = 'translateY(' + dy + 'px)';
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      elSheet.style.transition = '';
      elSheet.style.transform = '';
      if (dy > 80) closeSheet();
    }
    elSheetGrab.addEventListener('pointerup', endDrag);
    elSheetGrab.addEventListener('pointercancel', endDrag);
  })();

  elReset.addEventListener('click', function () {
    if (!window.confirm('Start a brand new world? Current progress will be lost.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { }
    state = Core.createState((Math.random() * 4294967295) >>> 0);
    lastTileX = -1; lastTileY = -1;
    clearEffects();
    closeSheet(); updateHud(); save(true);
    toast('New world generated');
  });

  elMute.addEventListener('click', function () {
    muted = !muted;
    elMute.textContent = 'Sound: ' + (muted ? 'off' : 'on');
  });

  /* -------------------------------------------------------------- save */

  function save(force) {
    if (!state) return;
    try {
      localStorage.setItem(SAVE_KEY, Core.serialize(state));
    } catch (e) { /* quota or private mode */ }
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
    if (raw) {
      var s = Core.deserialize(raw);
      if (s) return s;
    }
    return Core.createState((Math.random() * 4294967295) >>> 0);
  }

  window.addEventListener('pagehide', function () { save(true); });
  window.addEventListener('visibilitychange', function () { if (document.hidden) save(true); });
  window.addEventListener('blur', function () { actDown = false; keys = {}; });

  /* ------------------------------------------------------------- resize */

  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    dprMax = Math.min(2, window.devicePixelRatio || 1);
    W = vw; H = vh;
    canvas.width = Math.round(W * dprMax);
    canvas.height = Math.round(H * dprMax);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dprMax, 0, 0, dprMax, 0, 0);
    baseTilePx = Math.max(34, Math.min(64, Math.min(W / 7.2, H / 11)));
    setZoom(zoom); // keep the player's zoom across resizes, re-clamped
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  /* ------------------------------------------------------------- update */

  function update(dt) {
    // movement input
    var ix = 0, iy = 0;
    if (joy.active && (joy.x || joy.y)) { ix = joy.x; iy = joy.y; }
    else if (!sheetOpen) {
      if (keys['w'] || keys['arrowup']) iy -= 1;
      if (keys['s'] || keys['arrowdown']) iy += 1;
      if (keys['a'] || keys['arrowleft']) ix -= 1;
      if (keys['d'] || keys['arrowright']) ix += 1;
    }
    var mag = Math.sqrt(ix * ix + iy * iy);
    var moved = false;
    if (mag > 0.001) {
      moveTarget = null;
      if (mag > 1) { ix /= mag; iy /= mag; }
      var bx = state.player.x, by = state.player.y;
      Core.move(state, ix, iy, dt);
      if (Math.abs(state.player.x - bx) + Math.abs(state.player.y - by) > 0.0005) {
        moved = true; hasMoved = true;
        moveDirX = ix; moveDirY = iy;
      }
    } else if (moveTarget) {
      var dx = moveTarget.x - state.player.x, dy = moveTarget.y - state.player.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.18) { moveTarget = null; }
      else {
        var bx2 = state.player.x, by2 = state.player.y;
        Core.move(state, dx, dy, dt);
        moveDirX = dx; moveDirY = dy;
        var step = Math.abs(state.player.x - bx2) + Math.abs(state.player.y - by2);
        if (step < 0.0004) { stall += dt; if (stall > 0.35) moveTarget = null; }
        else { stall = 0; hasMoved = true; moved = true; }
      }
    }

    Core.step(state, dt);

    // logistics auto-collect pushes transient events into the state each step;
    // the game layer turns them into on-screen flyer animations
    for (var ev = state.events.length - 1; ev >= 0; ev--) {
      var evt = state.events[ev];
      spawnFlyers(evt.x, evt.y, evt.res, evt.amt);
      state.events.splice(ev, 1);
    }

    // exploration reveal when the player changes tile
    var cx = Math.floor(state.player.x), cy = Math.floor(state.player.y);
    if (cx !== lastTileX || cy !== lastTileY) {
      lastTileX = cx; lastTileY = cy;
      Core.updateExplored(state);
    }

    // repeat action while the big button is held
    actionCd -= dt;
    if (actDown && actionCd <= 0) {
      if (doAction()) actionCd = GATHER_CD;
      else actDown = false;
    }

    // boat wake: little ripples while swimming
    if (moved && Core.onWater(state) && Math.random() < 0.35) {
      addParticle({
        x: state.player.x - moveDirX * 0.4, y: state.player.y - moveDirY * 0.4,
        vx: -moveDirX * 0.3 + (Math.random() - 0.5) * 0.8,
        vy: -moveDirY * 0.3 + (Math.random() - 0.5) * 0.8 - 0.25,
        life: 0.35 + Math.random() * 0.25, max: 0.6,
        size: 1 + Math.random() * 1.6, color: 'rgba(190,225,255,0.5)'
      });
    }

    // particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 5.5 * dt;
      p.vx *= 0.94;
    }
    for (var f = floats.length - 1; f >= 0; f--) {
      var fl = floats[f];
      fl.life -= dt;
      if (fl.life <= 0) { floats.splice(f, 1); continue; }
      fl.y += fl.vy * dt; fl.vy *= 0.96;
    }

    // flyers: ease-in homing toward the player, with a tiny wobble. A life cap
    // plus a distance-travelled arrival check guarantees each one lands quickly
    // instead of overshooting and orbiting the player forever.
    for (var fl2 = flyers.length - 1; fl2 >= 0; fl2--) {
      var fy = flyers[fl2];
      fy.t += dt;
      if (fy.t < fy.delay) continue;
      if (fy.t >= FLYER_LIFE) { popFlyer(fy); flyers.splice(fl2, 1); continue; }
      var fdx = state.player.x - fy.x, fdy = state.player.y - fy.y;
      var fd = Math.sqrt(fdx * fdx + fdy * fdy) || 0.0001;
      fy.vx += (fdx / fd) * 26 * dt;
      fy.vy += (fdy / fd) * 26 * dt;
      var wob = Math.sin(fy.t * 20 + fy.seed) * 2.6;
      fy.vx += (-fdy / fd) * wob * dt;
      fy.vy += (fdx / fd) * wob * dt;
      var vm = Math.hypot(fy.vx, fy.vy);
      if (vm > 10) { fy.vx = fy.vx / vm * 10; fy.vy = fy.vy / vm * 10; vm = 10; }
      // Land once the player is within this frame's travel (+ a small grace), so
      // a fast flyer can never step past the player and circle back.
      if (fd <= vm * dt + 0.2) { popFlyer(fy); flyers.splice(fl2, 1); continue; }
      fy.x += fy.vx * dt;
      fy.y += fy.vy * dt;
    }

    // timers
    saveAcc += dt; if (saveAcc > 3) { saveAcc = 0; save(); }
    goalAcc += dt; if (goalAcc > 0.4) { goalAcc = 0; checkGoals(); }
    hudAcc += dt; if (hudAcc > 0.25) { hudAcc = 0; updateHud(); updateDrone(); }
    hintAcc += dt; if (hintAcc > 0.5) { hintAcc = 0; updateHint(); }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) elToast.classList.remove('show'); }
    if (goalFlashT > 0) goalFlashT -= dt;

    updateActionButton();
  }

  function updateHint() {
    if (state.discovered.ore && state.discovered.crystal) { hintDir = null; return; }
    var want = state.discovered.ore ? T.CRYSTAL : T.ORE;
    var px = Math.floor(state.player.x), py = Math.floor(state.player.y);
    // Ring search outward, stopping at the first ring that holds the resource —
    // cost is bounded no matter how far the player has travelled.
    for (var r = 1; r <= 200; r++) {
      var best = null, bestD = Infinity;
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var x = px + dx, y = py + dy;
          if (Core.tileType(state.world, x, y) !== want) continue;
          var ddx = x + 0.5 - state.player.x, ddy = y + 0.5 - state.player.y;
          var d = ddx * ddx + ddy * ddy;
          if (d < bestD) { bestD = d; best = { x: x + 0.5, y: y + 0.5 }; }
        }
      }
      if (best) { hintDir = { x: best.x - state.player.x, y: best.y - state.player.y }; return; }
    }
    hintDir = null;
  }

  /* ------------------------------------------------------------- render */

  function updateCamera() {
    // The world is endless: always keep the player centred, no clamping.
    camX = state.player.x * tilePx - W / 2;
    camY = state.player.y * tilePx - H / 2;
  }

  function drawTile(x, y, u) {
    var sx = x * u - camX, sy = y * u - camY;
    if (!Core.isExplored(state.world, x, y)) { ctx.fillStyle = '#04060a'; ctx.fillRect(sx, sy, u + 1, u + 1); return; }
    var t = Core.tileType(state.world, x, y);
    ctx.fillStyle = shade(PAL[t], tv(x, y, 7));
    ctx.fillRect(sx, sy, u + 1, u + 1);
    var depleted = Core.tileRich(state.world, x, y) <= 0;

    if (t === T.FOREST) {
      if (depleted) { drawStump(sx, sy, u, x, y); }
      else drawTrees(sx, sy, u, x, y);
    } else if (t === T.STONE) {
      drawRocks(sx, sy, u, x, y, false, depleted);
    } else if (t === T.ORE) {
      drawRocks(sx, sy, u, x, y, true, false);
    } else if (t === T.CRYSTAL) {
      drawCrystal(sx, sy, u, x, y);
    } else if (t === T.WATER) {
      drawWater(sx, sy, u, x, y);
    } else if (t === T.ROCK) {
      drawRock(sx, sy, u, x, y);
    } else {
      drawGrass(sx, sy, u, x, y);
    }
  }

  // Far-zoom terrain: one flat block per `step` tiles, sampled at the block
  // centre. No per-tile detail — that's the point; it keeps far zoom cheap.
  function drawBlock(bx, by, step, ps) {
    var tx = bx * step + (step >> 1);
    var ty = by * step + (step >> 1);
    var sx = bx * ps - camX, sy = by * ps - camY;
    if (!Core.isExplored(state.world, tx, ty)) { ctx.fillStyle = '#04060a'; ctx.fillRect(sx, sy, ps + 1, ps + 1); return; }
    ctx.fillStyle = shade(PAL[Core.tileType(state.world, tx, ty)], tv(tx, ty, 7));
    ctx.fillRect(sx, sy, ps + 1, ps + 1);
  }

  function drawGrass(sx, sy, u, x, y) {
    if (tv(x, y, 101) < 0.45) return;
    ctx.strokeStyle = 'rgba(150,185,110,0.35)';
    ctx.lineWidth = Math.max(1, u * 0.03);
    for (var k = 0; k < 2; k++) {
      var gx = sx + u * (0.25 + 0.5 * tv(x, y, 102 + k));
      var gy = sy + u * (0.4 + 0.4 * tv(x, y, 104 + k));
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + u * 0.03, gy - u * (0.08 + 0.05 * tv(x, y, 106 + k)));
      ctx.stroke();
    }
  }

  function drawTrees(sx, sy, u, x, y) {
    var n = tv(x, y, 1) > 0.55 ? 2 : 1;
    for (var k = 0; k < n; k++) {
      var ox = (tv(x, y, 2 + k) - 0.5) * u * 0.55;
      var oy = (tv(x, y, 9 + k) - 0.5) * u * 0.45;
      var cx = sx + u * 0.5 + ox, cy = sy + u * 0.52 + oy;
      var w = u * 0.42, h = u * 0.52;
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath(); ctx.ellipse(cx, cy + u * 0.13, w * 0.5, u * 0.09, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = k ? '#2c5634' : '#3a6b41';
      ctx.beginPath(); ctx.moveTo(cx, cy - h); ctx.lineTo(cx - w / 2, cy + h * 0.32); ctx.lineTo(cx + w / 2, cy + h * 0.32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3f2d1e';
      ctx.fillRect(cx - u * 0.04, cy + h * 0.3, u * 0.08, u * 0.12);
    }
  }

  function drawStump(sx, sy, u, x, y) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(sx + u * 0.5, sy + u * 0.62, u * 0.16, u * 0.07, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#4a3826';
    ctx.beginPath(); ctx.arc(sx + u * 0.5, sy + u * 0.55, u * 0.13, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#6a5236';
    ctx.beginPath(); ctx.arc(sx + u * 0.5, sy + u * 0.54, u * 0.07, 0, 6.283); ctx.fill();
  }

  function drawRocks(sx, sy, u, x, y, ore, depleted) {
    var n = depleted ? 1 : 2;
    for (var k = 0; k < n; k++) {
      var cx = sx + u * (0.3 + 0.4 * tv(x, y, 3 + k));
      var cy = sy + u * (0.42 + 0.32 * tv(x, y, 5 + k));
      var r = u * (depleted ? 0.13 : 0.19) * (0.85 + 0.35 * tv(x, y, 11 + k));
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.55, r * 1.1, r * 0.4, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#454a41';
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.85, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#737a6e';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.18, cy - r * 0.24, r * 0.62, r * 0.5, 0, 0, 6.283); ctx.fill();
    }
    if (ore && !depleted) {
      for (var j = 0; j < 3; j++) {
        var px = sx + u * (0.25 + 0.5 * tv(x, y, 21 + j));
        var py = sy + u * (0.3 + 0.45 * tv(x, y, 31 + j));
        ctx.fillStyle = '#e0903c';
        ctx.beginPath(); ctx.arc(px, py, u * 0.055, 0, 6.283); ctx.fill();
        ctx.fillStyle = 'rgba(255,210,140,0.9)';
        ctx.beginPath(); ctx.arc(px - u * 0.014, py - u * 0.014, u * 0.022, 0, 6.283); ctx.fill();
      }
    }
  }

  function drawCrystal(sx, sy, u, x, y) {
    for (var k = 0; k < 3; k++) {
      var cx = sx + u * (0.28 + 0.44 * tv(x, y, 41 + k));
      var cy = sy + u * (0.38 + 0.38 * tv(x, y, 51 + k));
      var h = u * (0.16 + 0.13 * tv(x, y, 61 + k));
      // soft halo (cheap, no shadowBlur)
      ctx.fillStyle = 'rgba(110,220,255,0.14)';
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 1.5); ctx.lineTo(cx + h * 0.75, cy);
      ctx.lineTo(cx, cy + h * 1.5); ctx.lineTo(cx - h * 0.75, cy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = k === 0 ? '#8fefff' : '#5cc4e0';
      ctx.beginPath();
      ctx.moveTo(cx, cy - h); ctx.lineTo(cx + h * 0.45, cy);
      ctx.lineTo(cx, cy + h); ctx.lineTo(cx - h * 0.45, cy);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawWater(sx, sy, u, x, y) {
    ctx.fillStyle = '#0e2138';
    ctx.fillRect(sx, sy, u + 1, u + 1);
    ctx.fillStyle = 'rgba(30,60,95,0.5)';
    ctx.fillRect(sx, sy + u * 0.62, u + 1, u * 0.38);
    ctx.strokeStyle = 'rgba(90,150,200,0.22)';
    ctx.lineWidth = Math.max(1, u * 0.035);
    for (var k = 0; k < 2; k++) {
      var wy = sy + u * (0.32 + 0.34 * k) + Math.sin((state.time + tv(x, y, 71 + k)) * 1.6) * u * 0.04;
      ctx.beginPath();
      ctx.moveTo(sx + u * 0.16, wy);
      ctx.lineTo(sx + u * 0.55, wy);
      ctx.stroke();
    }
  }

  function drawRock(sx, sy, u, x, y) {
    ctx.fillStyle = '#0e1216';
    ctx.fillRect(sx, sy, u + 1, u + 1);
    ctx.fillStyle = '#1b2126';
    roundRect(sx + u * 0.12, sy + u * 0.16, u * 0.76, u * 0.68, u * 0.16);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(sx + u * 0.2, sy + u * 0.22, u * 0.5, u * 0.24, u * 0.1);
    ctx.fill();
  }

  function drawPlayer() {
    var sx = state.player.x * tilePx - camX;
    var sy = state.player.y * tilePx - camY;
    var r = Math.max(3, tilePx * 0.27); // stay visible when zoomed far out
    var bob = 0;
    if (Core.onWater(state)) {
      bob = Math.sin(state.time * 2.6 + state.player.x * 7.3) * tilePx * 0.04;
      // raft shadow
      ctx.fillStyle = 'rgba(12,24,34,0.4)';
      ctx.beginPath(); ctx.ellipse(sx, sy + bob + r * 1.0, r * 1.5, r * 0.4, 0, 0, 6.283); ctx.fill();
      // hull
      ctx.fillStyle = '#7a5230';
      ctx.beginPath(); ctx.ellipse(sx, sy + bob, r * 1.35, r * 0.6, 0, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#5a3a1e';
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      ctx.beginPath(); ctx.ellipse(sx, sy + bob, r * 1.35, r * 0.6, 0, 0, 6.283); ctx.stroke();
      // planks
      ctx.strokeStyle = 'rgba(255,225,180,0.4)';
      ctx.lineWidth = Math.max(1, r * 0.07);
      for (var p = -1; p <= 1; p++) {
        ctx.beginPath();
        ctx.moveTo(sx - r * 1.1, sy + bob + r * 0.2 * p);
        ctx.lineTo(sx + r * 1.1, sy + bob + r * 0.2 * p);
        ctx.stroke();
      }
      // little sail
      ctx.fillStyle = '#ece7d4';
      ctx.beginPath();
      ctx.moveTo(sx + r * 0.5, sy + bob - r * 0.25);
      ctx.lineTo(sx + r * 0.62, sy + bob - r * 0.85);
      ctx.lineTo(sx + r * 1.1, sy + bob - r * 0.6);
      ctx.closePath(); ctx.fill();
    }
    var py = sy + bob;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath(); ctx.ellipse(sx, py + r * 0.8, r * 1.05, r * 0.45, 0, 0, 6.283); ctx.fill();
    var g = ctx.createRadialGradient(sx - r * 0.3, py - r * 0.4, r * 0.1, sx, py, r);
    g.addColorStop(0, '#fdf4d8'); g.addColorStop(1, '#d9b877');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, py, r, 0, 6.283); ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.strokeStyle = '#5a4a2a';
    ctx.stroke();
    var ml = Math.sqrt(moveDirX * moveDirX + moveDirY * moveDirY) || 1;
    ctx.fillStyle = '#8a6f3f';
    ctx.beginPath();
    ctx.arc(sx + (moveDirX / ml) * r * 0.6, py + (moveDirY / ml) * r * 0.6, r * 0.22, 0, 6.283);
    ctx.fill();
  }

  function drawExtractors() {
    for (var i = 0; i < state.extractors.length; i++) {
      var e = state.extractors[i];
      var sx = (e.x + 0.5) * tilePx - camX, sy = (e.y + 0.5) * tilePx - camY;
      if (sx < -tilePx || sy < -tilePx || sx > W + tilePx || sy > H + tilePx) continue;
      var s = tilePx * 0.74;
      var def = EXTRACTORS[e.key];
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      roundRect(sx - s / 2, sy - s / 2 + s * 0.12, s, s, 8); ctx.fill();
      ctx.fillStyle = '#1e2822';
      roundRect(sx - s / 2, sy - s / 2, s, s, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = Math.max(1, s * 0.045);
      roundRect(sx - s / 2, sy - s / 2, s, s, 8); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = Math.round(s * 0.56) + 'px -apple-system, sans-serif';
      ctx.fillText(def.icon, sx, sy + s * 0.03);
      if (e.buffer >= 0.5) {
        var p = Math.min(1, e.buffer / def.buffer);
        ctx.beginPath();
        ctx.arc(sx, sy, s * 0.66, -Math.PI / 2, -Math.PI / 2 + p * 6.283);
        ctx.strokeStyle = p >= 1 ? '#ffd166' : '#7fd07a';
        ctx.lineWidth = Math.max(2, s * 0.11);
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
  }

  // Outline one tile. The inset is clamped so a sub-pixel tile when zoomed far
  // out can't produce a negative size (which used to throw and stop the loop).
  function strokeTileHighlight(tx, ty, color) {
    var inset = Math.min(2, tilePx * 0.2);
    var sz = tilePx - inset * 2;
    if (sz <= 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, tilePx * 0.05);
    roundRect(tx * tilePx - camX + inset, ty * tilePx - camY + inset, sz, sz, Math.min(6, sz / 2));
    ctx.stroke();
  }

  function drawHighlights() {
    var g = Core.gatherTarget(state);
    if (g) strokeTileHighlight(g.x, g.y, 'rgba(200,255,180,0.5)');
    if (sheetOpen && currentTab === 'build') {
      var ids = ['lumber', 'quarry', 'mine', 'resonator'];
      for (var i = 0; i < ids.length; i++) {
        var t = Core.buildTarget(state, ids[i]);
        if (t) strokeTileHighlight(t.x, t.y, 'rgba(140,220,255,0.6)');
      }
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x * tilePx - camX, p.y * tilePx - camY, p.size * (0.5 + a * 0.7), 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(Math.max(12, tilePx * 0.34)) + 'px -apple-system, sans-serif';
    for (var i = 0; i < floats.length; i++) {
      var f = floats[i];
      var a = Math.min(1, f.life / f.max * 1.6);
      ctx.globalAlpha = a;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      var sx = f.x * tilePx - camX, sy = f.y * tilePx - camY;
      ctx.strokeText(f.text, sx, sy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx, sy);
    }
    ctx.globalAlpha = 1;
  }

  function drawJoystick() {
    var hintY = H * 0.76;
    if (!joy.active && !hasMoved) {
      ctx.strokeStyle = 'rgba(190,220,190,0.30)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(W * 0.24, hintY, 42, 0, 6.283);
      ctx.stroke();
      ctx.fillStyle = 'rgba(210,235,210,0.55)';
      ctx.font = '700 12px -apple-system, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('DRAG TO MOVE', W * 0.24, hintY);
    }
    if (joy.active) {
      ctx.strokeStyle = 'rgba(190,220,190,0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 62, 0, 6.283); ctx.stroke();
      ctx.fillStyle = 'rgba(120,190,130,0.55)';
      ctx.beginPath(); ctx.arc(joy.ox + joy.x * 62, joy.oy + joy.y * 62, 26, 0, 6.283); ctx.fill();
    }
  }

  function drawHintArrow() {
    if (!hintDir || state.stats.gathers < 3) return;
    var px = state.player.x * tilePx - camX, py = state.player.y * tilePx - camY;
    var mag = Math.sqrt(hintDir.x * hintDir.x + hintDir.y * hintDir.y);
    if (mag < 2) return;
    var ax = hintDir.x / mag, ay = hintDir.y / mag;
    var cxs = W / 2, cys = H / 2;
    var radius = Math.min(W, H) * 0.34;
    var sx = cxs + ax * radius, sy = cys + ay * radius;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(ay, ax));
    ctx.fillStyle = 'rgba(230,180,90,0.85)';
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawTutorial() {
    var msg = null;
    if (!hasMoved) msg = 'Drag anywhere to move';
    else if (state.stats.gathers === 0) msg = 'Hold GATHER (or tap a resource tile)';
    if (!msg) return;
    ctx.font = '700 13px -apple-system, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(msg).width + 26;
    ctx.fillStyle = 'rgba(10,14,12,0.74)';
    roundRect(W / 2 - w / 2, H - 172, w, 30, 15);
    ctx.fill();
    ctx.fillStyle = '#cfe8cc';
    ctx.fillText(msg, W / 2, H - 157);
  }

  /* Night-lighting tuning: how tight the flashlight pool is around the player
   * and how quickly darkness closes in beyond it. */
  var FLASHLIGHT_RADIUS = 3.0;   // bright pool radius, in tiles (tight = real night)
  var FLASHLIGHT_FALLOFF = 0.14; // 0 = hard edge … 1 = falloff spreads to screen
  var NIGHT_DARK_MID = 0.5;      // darkness where the falloff begins
  var NIGHT_DARK_EDGE = 0.9;     // darkness at the screen edges

  // Gathered items zip across the screen into the player's pack. Drawn right
  // before the night pass so the flashlight glow falls over them too.
  function drawFlyers() {
    for (var i = 0; i < flyers.length; i++) {
      var fy = flyers[i];
      var sx = fy.x * tilePx - camX, sy = fy.y * tilePx - camY;
      var col = RES_COLOR[fy.res];
      ctx.globalAlpha = Math.min(1, 0.3 + fy.t * 2.5);
      ctx.fillStyle = col;
      if (fy.res === 'wood') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(fy.t * 5 + fy.seed);
        ctx.fillRect(-3.5, -1.4, 7, 2.8);
        ctx.restore();
      } else if (fy.res === 'crystal') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(fy.t * 4 + fy.seed);
        ctx.beginPath();
        ctx.moveTo(0, -4.2); ctx.lineTo(3.2, 0); ctx.lineTo(0, 4.2); ctx.lineTo(-3.2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, fy.res === 'ore' ? 3.4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* Day/night lighting pass. The world palette stays moody, but daytime gets a
   * gentle warm lift and after dusk the scene fades into darkness — except for
   * the flashlight pooling around the player, which switches on automatically
   * so you can always see (and keep gathering) after dark. */
  function applyLighting() {
    var dl = Core.daylight(state.time);

    // Daytime lift: a soft screen-blend glow that fades out by twilight.
    var glow = Math.max(0, (dl - 0.25) / 0.75) * 0.16;
    if (glow > 0.001) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(255,236,205,' + glow.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }

    // Night: darken everything except the flashlight pool at the player.
    if (dl < 0.6) {
      var night = Math.max(0, (0.6 - dl) / 0.6); // 0 = dusk … 1 = midnight
      var px = state.player.x * tilePx - camX;
      var py = state.player.y * tilePx - camY;
      var pool = Math.max(W, H) * 0.8;
      // Keep the pool usable when zoomed far out, where tilePx * radius is tiny.
      var lit = Math.min(pool, Math.max(tilePx * FLASHLIGHT_RADIUS, Math.min(W, H) * 0.28));
      var mid = lit + (pool - lit) * FLASHLIGHT_FALLOFF;
      var g = ctx.createRadialGradient(px, py, 0, px, py, pool);
      g.addColorStop(0, 'rgba(4,8,16,0)');
      g.addColorStop(Math.min(1, lit / pool), 'rgba(4,8,16,0)');
      g.addColorStop(Math.min(1, mid / pool), 'rgba(4,8,16,' + (night * NIGHT_DARK_MID).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(4,8,16,' + (night * NIGHT_DARK_EDGE).toFixed(3) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Warm flashlight tint so the pool reads as lamplight, not just a hole.
      ctx.globalCompositeOperation = 'lighter';
      var warm = ctx.createRadialGradient(px, py, 0, px, py, lit);
      warm.addColorStop(0, 'rgba(255,214,150,' + (night * 0.11).toFixed(3) + ')');
      warm.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = warm;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function render() {
    updateCamera();
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, W, H);

    // Endless world: draw whatever the (possibly negative) camera can see, with
    // a one-tile margin so no seam shows at the edges. When zoomed out past
    // LOD_PX we sample one tile per block instead of every tile, so the draw
    // count stays roughly constant however far the player pinches out.
    var step = Math.max(1, Math.ceil(LOD_PX / tilePx));
    var ps = tilePx * step;
    var x0 = Math.floor(camX / ps) - 1;
    var y0 = Math.floor(camY / ps) - 1;
    var x1 = Math.ceil((camX + W) / ps) + 1;
    var y1 = Math.ceil((camY + H) / ps) + 1;
    for (var by = y0; by <= y1; by++) {
      for (var bx = x0; bx <= x1; bx++) {
        if (step === 1) drawTile(bx, by, tilePx);
        else drawBlock(bx, by, step, ps);
      }
    }

    drawHighlights();
    drawExtractors();
    drawParticles();
    drawPlayer();
    drawFloats();
    drawFlyers();
    applyLighting();
    drawJoystick();
    drawHintArrow();
    drawTutorial();
  }

  /* --------------------------------------------------------------- loop */

  var last = 0;
  function frame(now) {
    if (!last) last = now;
    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1;
    if (!document.hidden) update(dt);
    render();
    requestAnimationFrame(frame);
  }

  /* --------------------------------------------------------------- boot */

  function boot() {
    document.getElementById('verText').textContent = 'v' + (window.MTE_VERSION || '0.0.0');
    resize();
    buildChips();
    state = load();
    updateHud();
    updateHint();
    setTab('upgrades');
    requestAnimationFrame(frame);
  }

  /* --------------------------------------------------------------- hook */

  // Small hook so automated tests can inspect/massage real game state.
  window.MTE_GAME = {
    getState: function () { return state; },
    save: function () { save(true); },
    setPlayer: function (x, y) { state.player.x = x; state.player.y = y; lastTileX = -1; lastTileY = -1; },
    addRes: function (r, n) { state.inv[r] = (state.inv[r] || 0) + n; updateHud(); },
    flyers: function () { return flyers; },
    zoom: function () { return zoom; },
    tilePx: function () { return tilePx; },
    setZoom: function (z) { setZoom(z); },
    core: Core
  };

  boot();
})();
