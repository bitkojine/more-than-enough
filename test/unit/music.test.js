/* The soundtrack (src/game/music/score.js): every track is written so it
 * plays (each bar adds up, every section the form names exists), has a name
 * in every language, and every place picks a track. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import { TRACKS, TRACK_IDS, checkTrack, parseSection, degreeNote, sceneFor } from '../../src/game/music/score.js';
import { INSTRUMENTS } from '../../src/game/music/instruments.js';
import { LANGUAGES } from '../../src/i18n/i18n.js';

test('every track is written correctly', () => {
  for (const id of TRACK_IDS) assert.deepEqual(checkTrack(TRACKS[id]), [], id);
});

test('every track has a name in every language', () => {
  for (const id of TRACK_IDS) {
    assert.equal(TRACKS[id].name, 'music.' + id);
    for (const [code, lang] of Object.entries(LANGUAGES)) assert.ok(lang.strings['music.' + id], `${code} has no name for ${id}`);
  }
});

test('every track is played by instruments the band has', () => {
  for (const id of TRACK_IDS) {
    const { lead, echo, bass } = TRACKS[id].band;
    for (const name of [lead, echo, bass].filter(Boolean)) assert.ok(INSTRUMENTS[name], `${id}: no instrument ${name}`);
  }
});

test('tunes stay in a comfortable range', () => {
  for (const id of TRACK_IDS) {
    const track = TRACKS[id];
    for (const sec of Object.values(track.sections)) {
      for (const bar of parseSection(track, sec)) {
        for (const n of bar.notes) {
          if (n.deg === null) continue;
          const midi = degreeNote(track, n.deg, n.oct);
          assert.ok(midi >= 55 && midi <= 96, `${id}: note ${midi} out of range`);
        }
      }
    }
  }
});

test('a melody note reads as degree, octave and length', () => {
  const t = { root: 60, mode: 'ionian' };
  assert.equal(degreeNote(t, 1), 60);
  assert.equal(degreeNote(t, 5), 67);
  assert.equal(degreeNote(t, 1, 1), 72);
  assert.equal(degreeNote(t, 7, -1), 59);
  assert.equal(degreeNote(t, 0), 59); // below degree 1 wraps down an octave
});

test('every place has its own music, and every region plays one', () => {
  const at = (o) => sceneFor({ depth: 0, daylight: 1, land: 'meadow', ...o });
  assert.equal(at({}), 'meadow');
  assert.equal(at({ land: 'forest' }), 'forest');
  assert.equal(at({ daylight: 0.1, land: 'forest' }), 'night');
  assert.equal(at({ depth: 1, land: 'water' }), 'mines');
  assert.equal(at({ depth: 5 }), 'deep');
  const lands = Object.values(C.BIOMES).map((b) => b.music);
  for (const land of lands) assert.ok(TRACK_IDS.includes(land), 'a region plays ' + land);
  const used = new Set();
  for (const depth of [0, 1, 3]) for (const daylight of [0, 1]) for (const land of lands) used.add(at({ depth, daylight, land }));
  assert.deepEqual([...used].sort(), [...TRACK_IDS].sort(), 'a track no place plays');
});
