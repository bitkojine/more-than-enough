/* The band: each instrument is a few Web Audio nodes made for one note and
 * thrown away after it. Strings (harp, bass) are plucked for real with the
 * Karplus-Strong method: a burst of noise ringing round a short delay, which
 * is why they sound like strings rather than beeps. Every voice is
 *   play(ctx, out, when, midi, seconds, velocity)
 * and connects itself to `out`. */

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const PLUCK_RATE = 22050; // plucked strings are rendered at this rate and cached per note

// One envelope-shaped gain: rises in `attack`, holds, falls in `release`.
function envelope(ctx, out, t, dur, vol, attack, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  g.connect(out);
  return g;
}

function osc(ctx, type, freq, t, stop, dest) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(dest);
  o.start(t);
  o.stop(stop);
  return o;
}

/* ---------------------------------------------------- plucked strings */

const plucks = new Map();

// A string plucked at `midi`, `seconds` long: noise fed round a loop one
// period long, averaged each pass (that averaging is the string losing its
// brightness as it rings). `damp` < 1 shortens the ring.
function pluckBuffer(ctx, midi, seconds, damp, bright) {
  const key = midi + ':' + seconds + ':' + damp + ':' + bright;
  let buf = plucks.get(key);
  if (buf) return buf;
  const period = Math.max(2, Math.round(PLUCK_RATE / hz(midi)));
  const len = Math.floor(PLUCK_RATE * seconds);
  buf = ctx.createBuffer(1, len, PLUCK_RATE);
  const d = buf.getChannelData(0);
  // The pluck: noise, softened so the attack isn't a hiss.
  let prev = 0;
  for (let i = 0; i < period; i++) {
    const n = Math.random() * 2 - 1;
    prev = prev + (n - prev) * bright;
    d[i] = prev;
  }
  for (let i = period; i < len; i++) d[i] = damp * 0.5 * (d[i - period] + d[i - period + 1]);
  let peak = 0;
  for (let i = 0; i < period * 4 && i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
  buf.tune = hz(midi) / (PLUCK_RATE / period); // the rounding error in the period, fixed on playback
  plucks.set(key, buf);
  return buf;
}

function plucked(ctx, out, t, midi, dur, vol, ring, damp, bright, cutoff) {
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(ctx, midi, ring, damp, bright);
  src.playbackRate.value = src.buffer.tune;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.value = vol;
  // Let it ring past its written length, then damp it.
  const end = t + Math.min(ring, Math.max(dur * 1.6, 0.4));
  g.gain.setValueAtTime(vol, end - 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(lp); lp.connect(g); g.connect(out);
  src.start(t);
  src.stop(end + 0.02);
}

/* ------------------------------------------------------------- voices */

export const INSTRUMENTS = {
  // A harp or lute: a bright plucked string.
  harp(ctx, out, t, midi, dur, vel) {
    plucked(ctx, out, t, midi, dur, 0.5 * vel, 1.4, 0.996, 0.55, 4200);
  },

  // The bass: a darker, longer string.
  bass(ctx, out, t, midi, dur, vel) {
    plucked(ctx, out, t, midi, dur, 0.75 * vel, 1.6, 0.997, 0.3, 900);
  },

  // A wooden flute: a pure tone that breathes in, then sings with a
  // vibrato that only arrives once the note is held.
  flute(ctx, out, t, midi, dur, vel) {
    const f = hz(midi);
    const g = envelope(ctx, out, t, dur, 0.32 * vel, 0.06, 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = f * 4;
    lp.connect(g);
    const stop = t + dur + 0.15;
    const main = osc(ctx, 'sine', f, t, stop, lp);
    const air = ctx.createGain();
    air.gain.value = 0.18;
    air.connect(lp);
    const over = osc(ctx, 'triangle', f * 2, t, stop, air);
    if (dur > 0.35) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5 + Math.random();
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.5, dur * 0.6));
      lfo.connect(depth);
      depth.connect(main.frequency);
      depth.connect(over.frequency);
      lfo.start(t);
      lfo.stop(stop);
    }
  },

  // A squeezebox: two reeds a hair out of tune with each other.
  reed(ctx, out, t, midi, dur, vel) {
    const f = hz(midi);
    const g = envelope(ctx, out, t, dur, 0.1 * vel, 0.03, 0.08);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(5000, f * 5);
    lp.Q.value = 0.8;
    lp.connect(g);
    const stop = t + dur + 0.1;
    osc(ctx, 'sawtooth', f * 1.0025, t, stop, lp);
    osc(ctx, 'sawtooth', f * 0.9975, t, stop, lp);
    osc(ctx, 'square', f * 0.5, t, stop, lp);
  },

  // A music box / celesta: a struck tine that rings and fades.
  bell(ctx, out, t, midi, dur, vel) {
    const f = hz(midi);
    const ring = Math.max(1.6, dur * 1.5);
    for (const [mult, vol, len] of [[1, 0.5, 1], [2, 0.15, 0.5], [3.01, 0.07, 0.3], [5.4, 0.03, 0.12]]) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring * len);
      g.connect(out);
      osc(ctx, 'sine', f * mult, t, t + ring * len + 0.02, g);
    }
  },

  // A marimba: a soft wooden bar, mostly fundamental with a knock.
  mallet(ctx, out, t, midi, dur, vel) {
    const f = hz(midi);
    const ring = Math.min(0.9, 0.35 + dur * 0.4);
    for (const [mult, vol, len] of [[1, 0.36, 1], [3.9, 0.07, 0.25], [9.2, 0.03, 0.06]]) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol * vel, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ring * len);
      g.connect(out);
      osc(ctx, 'sine', f * mult, t, t + ring * len + 0.02, g);
    }
  },

  // Strings held under everything: slow to swell, slow to fade.
  pad(ctx, out, t, midi, dur, vel) {
    const f = hz(midi);
    const g = envelope(ctx, out, t, dur, 0.05 * vel, Math.min(0.8, dur * 0.4), 0.9);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(g);
    const stop = t + dur + 1;
    osc(ctx, 'sawtooth', f * 1.003, t, stop, lp);
    osc(ctx, 'sawtooth', f * 0.997, t, stop, lp);
  },

  // A frame drum: a soft low thump.
  drum(ctx, out, t, midi, dur, vel) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    g.connect(out);
    const o = osc(ctx, 'sine', 140, t, t + 0.32, g);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.25);
  }
};
