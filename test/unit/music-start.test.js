/* How the sound starts (src/game/music/player.js, chime.js): the first
 * track comes straight in rather than swelling up from silence, and the
 * hello chime is heard at once and is short. Run on a stand-in audio
 * context that records what is scheduled. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMusic } from '../../src/game/music/player.js';
import { chime } from '../../src/game/music/chime.js';

function fakeContext() {
  const ctx = { currentTime: 0, sampleRate: 22050, state: 'running', ramps: [], starts: [] };
  const param = (value = 1) => ({
    value,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime(v, t) {
      ctx.ramps.push({ param: this, v, t });
    },
    cancelScheduledValues() {},
    setTargetAtTime() {}
  });
  const node = (extra) => ({ connect() {}, disconnect() {}, ...extra });
  const source = () =>
    node({
      frequency: param(),
      playbackRate: param(),
      start: (t) => ctx.starts.push(t),
      stop() {}
    });
  Object.assign(ctx, {
    createGain: () => node({ gain: param() }),
    createConvolver: () => node({}),
    createBiquadFilter: () => node({ frequency: param(), Q: param() }),
    createOscillator: source,
    createBufferSource: source,
    createBuffer: (channels, length) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: (c) => data[c] };
    }
  });
  return ctx;
}

function withPage(run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'document');
  globalThis.document = { hidden: false };
  try {
    return run();
  } finally {
    if (had) Object.defineProperty(globalThis, 'document', had);
    else delete globalThis.document;
  }
}

// When the gain of the track that just began reaches full loudness.
const fadeEnd = (ctx, from) => {
  const ramp = ctx.ramps.slice(from).find((r) => r.v >= 0.5);
  return ramp.t;
};

test('the first track comes in at once, a later one crossfades slowly', () =>
  withPage(() => {
    const ctx = fakeContext();
    const started = [];
    const music = createMusic(
      ctx,
      { connect() {} },
      {
        canPlay: () => true,
        onStart: (id) => started.push(id)
      }
    );
    try {
      music.want('meadow'); // starts now, not at the next 200 ms tick
      assert.deepEqual(started, ['meadow']);
      assert.ok(fadeEnd(ctx, 0) <= 0.3, 'the first track is loud within 0.3 s');
      assert.ok(Math.min(...ctx.starts) <= 0.05, 'its first notes play at once');

      ctx.currentTime = 10;
      music.want('night');
      ctx.currentTime = 12; // the new place has held long enough
      const before = ctx.ramps.length;
      music.wake();
      assert.equal(music.playing, 'night');
      assert.ok(fadeEnd(ctx, before) - 12 >= 1, 'a later track swells in under the crossfade');
    } finally {
      music.stop();
    }
  }));

test('nothing starts while the sound may not play, and starts when it wakes', () =>
  withPage(() => {
    const ctx = fakeContext();
    let running = false;
    const music = createMusic(ctx, { connect() {} }, { canPlay: () => running });
    try {
      music.want('meadow');
      assert.equal(music.playing, null);
      running = true;
      music.wake();
      assert.equal(music.playing, 'meadow');
    } finally {
      music.stop();
    }
  }));

test('the hello chime is heard at once and is short', () => {
  const ctx = fakeContext();
  const lasts = chime(ctx, { connect() {} }, 1);
  assert.ok(ctx.starts.length > 0);
  assert.equal(Math.min(...ctx.starts), 1, 'it starts when asked');
  assert.ok(Math.max(...ctx.starts) < 1.5, 'its notes all start within half a second');
  assert.ok(lasts > 0 && lasts <= 2, 'it is over within two seconds');
});
