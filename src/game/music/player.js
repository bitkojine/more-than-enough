/* Plays the soundtrack (score.js) on the band (instruments.js). The tune is
 * always the composed one; what changes from one time through to the next is
 * how it is played: an answering harmony, a passing note, the tune an octave
 * up or handed to another instrument, a little looseness in timing and touch.
 * So a track you hear for an hour stays the same song without wearing thin.
 *
 * Where you are picks the track (sceneFor in score.js). A new place has to
 * hold for a moment before the music follows, so walking along a forest's
 * edge doesn't flick between two tunes; then the old track fades as the new
 * one starts from its beginning. */

import { TRACKS, MODES, parseSection, triad, degreeNote } from './score.js';
import { INSTRUMENTS } from './instruments.js';

const LOOKAHEAD = 0.6;   // seconds of music queued ahead of the clock
const SETTLE = 1.5;      // seconds a new place must hold before the music changes
const FADE_IN = 1.5;
const FADE_OUT = 0.9;    // time constant of the old track's fade
const BREATH_BARS = 2;   // accompaniment alone between rounds of a track

const rand = Math.random;
const into = (midi, low) => { while (midi < low) midi += 12; while (midi >= low + 12) midi -= 12; return midi; };

// A room's echo: two channels of noise dying away, darker as it fades.
function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      prev += ((rand() * 2 - 1) - prev) * (0.9 - 0.75 * k);
      d[i] = prev * Math.pow(1 - k, decay);
    }
  }
  return buf;
}

export function createMusic(ctx, out, { canPlay, onStart }) {
  const bus = ctx.createGain();
  bus.gain.value = 0.26;    // under the sound effects, not over them
  bus.connect(out);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 3, 2.4);
  verb.connect(bus);

  let enabled = true;
  let current = null;           // the track playing: see begin()
  let wanted = null, wantedAt = 0;

  function begin(id) {
    const track = TRACKS[id];
    const at = ctx.currentTime + 0.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(track.gain || 1, at + FADE_IN);
    gain.connect(bus);
    const send = ctx.createGain();
    send.gain.value = track.space;
    gain.connect(send);
    send.connect(verb);
    const sections = {};
    for (const [key, sec] of Object.entries(track.sections)) sections[key] = parseSection(track, sec);
    current = { id, track, sections, gain, send, cursor: at, formAt: 0, barAt: 0, round: 0, heard: {}, style: null };
    if (onStart) onStart(id);
  }

  function end() {
    if (!current) return;
    const { gain, send, cursor } = current;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
    gain.gain.setTargetAtTime(0.0001, now, FADE_OUT);
    setTimeout(() => { gain.disconnect(); send.disconnect(); }, (cursor - now + FADE_OUT * 6) * 1000);
    current = null;
  }

  /* ------------------------------------------------------------- a bar */

  function play(name, t, midi, seconds, vel) {
    const p = current;
    try {
      INSTRUMENTS[name](ctx, p.gain, t + (rand() - 0.5) * 0.012, midi, seconds, vel * (0.88 + rand() * 0.24));
    } catch { /* a note lost is better than the music stopping */ }
  }

  // How this pass through a section is played. The first time: as written.
  // After that the band takes liberties, more of them each round.
  function styleFor(times) {
    if (times === 0) return 'plain';
    const r = rand();
    if (r < 0.3) return 'third';
    if (r < 0.5) return 'octave';
    if (r < 0.65) return 'swap';
    return 'plain';
  }

  function melody(bar, t0, spb, style) {
    const { track } = current;
    const { lead, echo } = track.band;
    const voice = style === 'swap' ? echo : lead;
    const up = style === 'octave' && track.root + 12 <= 84 ? 12 : 0;
    const notes = bar.notes;
    notes.forEach((n, i) => {
      if (n.deg === null) return;
      const t = t0 + n.at * spb;
      const len = n.beats * spb;
      const midi = degreeNote(track, n.deg, n.oct) + up;
      const accent = n.at === 0 ? 1 : n.at % 1 === 0 ? 0.9 : 0.8;
      const next = notes[i + 1];
      // A passing note between two notes a third apart, now and then.
      if (style !== 'plain' && next && next.deg !== null && n.beats >= 1 && next.oct === n.oct &&
          Math.abs(next.deg - n.deg) === 2 && rand() < 0.35) {
        play(voice, t, midi, len / 2, accent);
        play(voice, t + len / 2, degreeNote(track, (n.deg + next.deg) / 2, n.oct) + up, len / 2, 0.75);
      } else {
        play(voice, t, midi, len * 0.95, accent);
      }
      if (style === 'third') play(echo, t + 0.01, degreeNote(track, n.deg - 2, n.oct) + up, len * 0.9, 0.45);
    });
  }

  function accompany(bar, t0, spb) {
    const { track } = current;
    const { comp, bass, pad, drum } = track.band;
    const group = track.meter % 3 === 0 ? 3 : 2; // beats per bass step
    for (const ch of bar.chords) {
      const [a, b, c] = triad(track, ch.deg).map((m) => into(m, 55));
      const chord = [a, b < a ? b + 12 : b, c < a ? c + 12 : c];
      const root = into(chord[0], 38);
      const start = t0 + ch.at * spb;
      const span = ch.beats * spb;
      if (bass) {
        for (let u = 0; u < ch.beats; u += group) {
          play(bass, start + u * spb, u % (group * 2) === 0 ? root : root + 7, group * spb, u === 0 ? 0.9 : 0.7);
        }
      }
      if (pad) for (const m of chord) play('pad', start, m, span, 0.8);
      if (drum) {
        for (let u = 0; u < ch.beats; u += 3) play('drum', start + u * spb, 0, 0.3, u === 0 ? 1 : 0.6);
      }
      const notes = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12];
      if (comp === 'arp') {
        const order = [0, 2, 3, 4, 5, 4, 3, 2];
        for (let k = 0; k < ch.beats * 2; k++) play('harp', start + k * spb / 2, notes[order[k % order.length]], spb, k === 0 ? 0.45 : 0.32);
      } else if (comp === 'waltz') {
        for (let u = 1; u < ch.beats; u++) chord.forEach((m, k) => play('harp', start + u * spb + k * 0.012, m + 12, spb, 0.24));
      } else if (comp === 'oompah') {
        for (let u = 0; u < ch.beats; u++) {
          if (u % 3) chord.forEach((m, k) => play('harp', start + u * spb + k * 0.008, m, spb * 0.8, 0.2));
        }
      } else if (comp === 'ostinato') {
        const order = [0, 0, 2, 3, 0, 2, 1, 2];
        for (let k = 0; k < ch.beats * 2; k++) play('harp', start + k * spb / 2, notes[order[k % order.length]] - 12, spb / 2, k % 2 ? 0.26 : 0.36);
      } else if (comp === 'drone') {
        [0, 2, 4].forEach((n, k) => { if (k < ch.beats) play('harp', start + k * spb, notes[n], spb * 2, 0.28); });
      }
    }
  }

  // Queues the next bar of the current track, then moves along the form.
  function nextBar() {
    const p = current;
    const { track } = p;
    const spb = 60 / track.tempo;
    const key = track.form[p.formAt];
    const bars = p.sections[key];
    if (p.barAt === 0) {
      p.style = styleFor((p.heard[key] || 0) + p.round);
    }
    const bar = bars[p.barAt];
    accompany(bar, p.cursor, spb);
    melody(bar, p.cursor, spb, p.style);
    p.cursor += track.meter * spb;
    p.barAt++;
    // Between rounds the intro comes back shortened, as a breath.
    const length = key === 'I' && p.round > 0 ? Math.min(BREATH_BARS, bars.length) : bars.length;
    if (p.barAt >= length) {
      p.heard[key] = (p.heard[key] || 0) + 1;
      p.barAt = 0;
      if (++p.formAt >= track.form.length) { p.formAt = 0; p.round++; }
    }
  }

  function tick() {
    const ok = enabled && canPlay() && !document.hidden;
    if (!ok) { end(); return; }
    const now = ctx.currentTime;
    if (wanted && (!current || (current.id !== wanted && now - wantedAt >= SETTLE))) {
      end();
      begin(wanted);
    }
    if (!current) return;
    if (current.cursor < now) current.cursor = now + 0.05; // the clock ran on without us
    while (current.cursor < now + LOOKAHEAD) nextBar();
  }
  setInterval(tick, 200);

  return {
    // Where the player is now: the music follows once it holds.
    want(id) {
      if (id === wanted || !TRACKS[id]) return;
      wanted = id;
      wantedAt = ctx.currentTime;
    },
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; tick(); },
    // The track playing, or null.
    get playing() { return current ? current.id : null; },
    // Eight pitches (Hz) of the playing track's pentatonic scale around
    // middle C, for sound effects that should sit in its key; null if silent.
    scale() {
      if (!current) return null;
      const { track } = current;
      const minor = MODES[track.mode][2] === 3;
      const degs = minor ? [1, 3, 4, 5, 7] : [1, 2, 3, 5, 6];
      const base = into(track.root, 57) - track.root;
      const out = [];
      for (let oct = 0; out.length < 8; oct++) {
        for (const d of degs) if (out.length < 8) out.push(degreeNote(track, d) + base + 12 * oct);
      }
      return out.map((m) => 440 * Math.pow(2, (m - 69) / 12));
    }
  };
}
