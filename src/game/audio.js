/* A tiny WebAudio synth with humanization. Gathering walks a pentatonic ladder
 * at random (mostly rising, sometimes resting or dropping) and slips between
 * keys and octaves, so the melody keeps evolving instead of looping. Tool level
 * thickens the tone, and the extractor network drives a slow-breathing hum.
 * Knows nothing about game state: callers pass in what each sound needs. */

// Pentatonic keys the melody can drift into (all consonant, no wrong notes).
const SCALES = [
  [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25], // C major
  [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33], // A minor
  [349.23, 392.00, 440.00, 523.25, 587.33, 698.46, 783.99, 880.00], // F major
  [293.66, 329.63, 392.00, 440.00, 493.88, 587.33, 659.25, 783.99]  // D minor
];
const MAX_VOICES = 26;

const rand = Math.random;
const pick = (list) => list[(rand() * list.length) | 0];

export function createAudio() {
  let ctx = null;
  let master = null;
  let droneMix = null;          // automated hum level -> tremolo -> master
  const droneOscs = [null, null];
  let noise = null;             // shared white-noise buffer for impact transients
  let muted = false;
  let scale = null;
  let noteStep = 0;
  let voices = 0;

  function currentScale() {
    if (!scale) { scale = pick(SCALES); noteStep = 0; }
    return scale;
  }

  // When a phrase ends: half the time slip into a new key, otherwise hop the
  // whole phrase an octave up or down for register variety.
  function phraseEnd() {
    if (rand() < 0.5) scale = pick(SCALES);
    else {
      const m = rand() < 0.55 ? 2 : 0.5;
      scale = scale.map((f) => f * m);
    }
  }

  // Browsers only let sound start after the player has done something on the
  // page, and some count only certain things (iOS Safari: a tap, not a drag).
  // So the context is made at load (it plays at once where the browser
  // allows it), every kind of press tries to wake it, and once the page has
  // had any gesture at all it is nudged back whenever it stalls (tab hidden,
  // a phone call, the OS taking the audio). Safe to call repeatedly.
  function create() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch { ctx = null; return false; }
    ctx.onstatechange = () => { if (ctx.state !== 'running') nudge(); };
    return true;
  }

  // Resume, with no gesture to hand: works once the page has had one.
  function nudge() {
    if (!ctx || ctx.state === 'running' || document.hidden) return;
    try { ctx.resume().catch(() => {}); } catch { /* the next gesture will */ }
  }

  // Inside a gesture: resume, plus a one-sample silent buffer, the trick that
  // wakes mobile Safari when resume() alone is ignored.
  function unlock() {
    if (!create()) return false;
    if (ctx.state !== 'running') {
      try { ctx.resume().catch(() => {}); } catch { /* keep going */ }
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      } catch { /* ignore */ }
    }
    return true;
  }

  function init() {
    if (!unlock() || master) return;
    build();
  }

  // The output chain and the operation hum.
  function build() {
    try {
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      // Operation hum: droneMix holds the automated level, then a slow tremolo
      // LFO makes it breathe; inaudible until extractors exist.
      droneMix = ctx.createGain();
      droneMix.gain.value = 0;
      const trem = ctx.createGain();
      trem.gain.value = 1;
      droneMix.connect(trem);
      trem.connect(master);
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.05 + rand() * 0.06; // 3-7 s breath cycle
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = 0.22;
      lfo.connect(lfoAmt);
      lfoAmt.connect(trem.gain);
      lfo.start();
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = i === 0 ? 110 : 165;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 1 : 0.45;
        o.connect(g);
        g.connect(droneMix);
        o.start();
        droneOscs[i] = o;
      }
    } catch { ctx = null; master = null; }
  }

  // Only while the clock runs: notes queued on a stalled context would all
  // burst out at once when it resumes.
  const live = () => ctx && master && !muted && ctx.state === 'running';

  function note(freq, dur, type, vol, harmony, delay, bright) {
    if (!live() || voices > MAX_VOICES) return;
    voices++;
    try {
      const t = ctx.currentTime + (delay || 0);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = (2600 + rand() * 1200) * (bright || 1);
      lp.Q.value = 0.6;
      const v = (vol || 0.1) * (0.82 + rand() * 0.36);
      const o = ctx.createOscillator();
      o.type = type || 'triangle';
      o.frequency.value = freq * (1 + (rand() - 0.5) * 0.006);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
      if (harmony) {
        const h = ctx.createOscillator();
        h.type = o.type;
        h.frequency.value = freq * harmony * (1 + (rand() - 0.5) * 0.004);
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.0001, t);
        hg.gain.exponentialRampToValueAtTime(v * (0.3 + rand() * 0.2), t + 0.006);
        hg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        h.connect(hg); hg.connect(master);
        h.start(t); h.stop(t + dur + 0.03);
      }
      setTimeout(() => { voices--; }, (dur + 0.15) * 1000);
    } catch { voices--; }
  }

  // A short filtered noise burst: the percussive transient that makes a hit
  // read as wood / stone / ore / crystal instead of just a tone.
  function impact(cutoff, dur, vol, q, delay) {
    if (!live()) return;
    try {
      if (!noise) {
        const len = Math.floor(ctx.sampleRate * 0.5);
        noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1;
      }
      const t = ctx.currentTime + (delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = cutoff;
      bp.Q.value = q || 1;
      const g = ctx.createGain();
      g.gain.setValueAtTime(Math.max(0.0001, vol), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.02);
    } catch { /* ignore */ }
  }

  // Each material has its own voice: wood knocks warmly, stone cracks dryly,
  // ore rings metallic, crystal pings glassy. The pentatonic walk picks the
  // pitch; toolLevel 4+ adds an overtone.
  function gather(res, amount, toolLevel) {
    const len = currentScale().length;
    const r = rand();
    const stepBy = r < 0.5 ? 1 : r < 0.78 ? 2 : r < 0.86 ? 0 : -1; // usually climb
    if (noteStep + stepBy >= len) phraseEnd(); // the phrase wrapped: re-key
    noteStep = (noteStep + stepBy + len) % len;
    const f = scale[noteStep];
    const vol = (0.085 + Math.min(0.04, amount * 0.0012)) * (0.85 + rand() * 0.3);
    const h = rand();
    const rich = toolLevel >= 4;

    if (res === 'wood') {
      const wf = f * 0.5 * (1 + (h - 0.5) * 0.02);
      note(wf, 0.15, 'sine', vol, 0, 0);
      impact(280 + h * 90, 0.12, vol * 0.5, 1.1, 0);
      if (rich && h < 0.5) note(wf * 1.5, 0.16, 'triangle', vol * 0.5, 0, 0.01);
    } else if (res === 'stone') {
      impact(1300 + h * 400, 0.07, vol * 0.85, 1.7, 0);
      impact(450 + h * 120, 0.11, vol * 0.45, 1.0, 0.004);
      note(f, 0.09, 'triangle', vol * 0.6, 0, 0);
      if (rich && h < 0.4) impact(2600, 0.04, vol * 0.3, 2.4, 0.01);
    } else if (res === 'ore') {
      const mf = 460 + h * 140;
      note(mf, 0.34, 'square', vol * 0.7, 0, 0, 1.4);
      note(mf * 2.37, 0.28, 'square', vol * 0.42, 0, 0.004, 1.8);
      note(mf * 3.11, 0.22, 'triangle', vol * 0.3, 0, 0.007, 2.2);
      impact(3200 + h * 600, 0.045, vol * 0.45, 2.6, 0);
      if (rich && h < 0.5) note(mf * 4.5, 0.18, 'triangle', vol * 0.2, 0, 0.012, 2.4);
    } else {
      const cf = (f < 520 ? f * 2 : f) * (1 + (h - 0.5) * 0.01);
      note(cf, 0.5, 'sine', vol, 0, 0, 2);
      note(cf * 2.01, 0.42, 'sine', vol * 0.5, 0, 0.008, 2.4);
      note(cf * 3.0, 0.3, 'sine', vol * 0.24, 0, 0.016, 2.8);
      impact(6500 + h * 800, 0.035, vol * 0.35, 3, 0);
      if (rich && h < 0.5) note(cf * 4, 0.5, 'sine', vol * 0.18, 0, 0.03, 3);
    }
  }

  // A soft thud for digging plain soil.
  function dig() {
    impact(220 + rand() * 80, 0.1, 0.06, 0.9, 0);
  }

  function collect() {
    const sc = currentScale();
    const n = 3 + ((rand() * 2) | 0);
    const start = (rand() * sc.length) | 0;
    const dir = rand() < 0.55 ? 1 : -1;
    for (let i = 0; i < n; i++) {
      let f = sc[(start + dir * i + sc.length * n) % sc.length];
      f *= f <= 600 ? 2 : (rand() < 0.5 ? 1.5 : 1); // sparkle register
      note(f, 0.09 + rand() * 0.05, 'triangle', 0.085, rand() < 0.3 ? 1.5 : 0, i * (0.035 + rand() * 0.025));
    }
    noteStep = (start + dir * n + sc.length * n) % sc.length;
    if (dir === 1 && start + n >= sc.length) phraseEnd();
  }

  function upgrade() {
    const b = pick([233.08, 261.63, 311.13, 349.23, 392.00]);
    const chord = rand() < 0.34 ? [1.25, 1.5, 2] : rand() < 0.5 ? [1.5, 1.875, 2.5] : [1.125, 1.5, 2];
    note(b, 0.35, 'triangle', 0.08, 0, 0);
    note(b * chord[0], 0.35, 'triangle', 0.07, 0, 0.02 + rand() * 0.02);
    note(b * chord[1], 0.4, 'triangle', 0.07, 0, 0.05 + rand() * 0.03);
    note(b * chord[2], 0.5, 'sine', 0.05, 0, 0.14);
  }

  function build() {
    const sc = currentScale();
    const thump = 0.92 + rand() * 0.16;
    note(200 * thump, 0.12, 'sine', 0.2, 0, 0);
    note(100 * thump, 0.18, 'sine', 0.14, 0, 0.01);
    const i = (rand() * sc.length) | 0;
    const j = (i + 1 + ((rand() * 3) | 0)) % sc.length;
    note(sc[i], 0.14, 'triangle', 0.08, rand() < 0.35 ? 1.5 : 0, 0.05);
    note(sc[j], 0.2, 'triangle', 0.07, rand() < 0.2 ? 2 : 0, 0.13);
    noteStep = j;
  }

  function fanfare() {
    const b = pick([392.00, 440.00, 523.25, 587.33]);
    if (rand() < 0.55) { // rising arpeggio
      note(b, 0.28 + rand() * 0.06, 'triangle', 0.09, 0, 0);
      note(b * 1.25, 0.28, 'triangle', 0.08, 0, 0.06);
      note(b * 1.5, 0.3, 'triangle', 0.08, 0, 0.12);
      note(b * 2, 0.5, 'triangle', 0.1, rand() < 0.8 ? 1.5 : 0, 0.2);
    } else { // twinkling run with an octave leap at the end
      for (let i = 0; i < 5; i++) note(b * Math.pow(2, i / 12) * (i === 4 ? 2 : 1), 0.22, 'triangle', 0.07, 0, i * 0.055);
    }
  }

  // The hum swells with the number of extractors and rises with overclock.
  function drone(extractors, overclock) {
    if (!live() || !droneMix) return;
    let target = 0;
    if (extractors > 0) target = Math.min(0.05, 0.012 * Math.min(3, extractors)) * (0.6 + 0.4 * Math.min(1, (overclock - 1) / 3));
    const t = ctx.currentTime;
    const root = 110 + (overclock - 1) * 2 + (rand() - 0.5) * 1.6;
    droneMix.gain.setTargetAtTime(target, t, 0.9);
    droneOscs[0].frequency.setTargetAtTime(root, t, 0.9);
    droneOscs[1].frequency.setTargetAtTime(root * (1.45 + rand() * 0.1), t, 0.9);
  }

  // Every kind of press, in the capture phase so it runs before handlers
  // that call preventDefault(). (Which of these count as a gesture differs by
  // browser: pointerup and touchend are the ones a tap on a phone gives.)
  for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click']) {
    window.addEventListener(ev, init, { capture: true, passive: true });
  }
  // Back to the tab, or anything else stalled it: try again.
  document.addEventListener('visibilitychange', nudge);
  window.addEventListener('focus', nudge);
  setInterval(nudge, 1000);
  if (create()) { build(); nudge(); }

  return {
    init, gather, dig, collect, upgrade, build, fanfare, drone,
    get muted() { return muted; },
    set muted(v) { muted = v; },
    state: () => (ctx ? ctx.state : 'none')
  };
}
