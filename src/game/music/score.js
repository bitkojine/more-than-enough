/* The soundtrack, written down. Each track is a real, composed tune (a
 * melody you could hum, over chords and a bass line), not random notes:
 * that is what makes a game's music worth listening to (see docs/music.md).
 * The browser plays it with synthesized instruments (player.js), so the
 * whole soundtrack is the few kilobytes of this file.
 *
 * How a track is written:
 *   tempo    beats per minute, where a beat is one unit of `meter`
 *   meter    beats per bar (6 for a 6/8 jig, counted in eighths)
 *   root     MIDI note of scale degree 1 in the melody's register
 *   mode     the scale the degrees count in (MODES)
 *   form     the order the sections play in; 'I' (the intro) is the
 *            accompaniment alone, and also the breath between rounds
 *   sections each { chords, melody }, one bar per '|':
 *     chords  scale degrees, one or two per bar ('4 5' splits the bar),
 *             each a triad built from the mode
 *     melody  notes as degree[octave]/beats: '5' is degree 5 for one beat,
 *             "3'/2" an octave up for two beats, '5,/.5' an octave down for
 *             half a beat, '-/4' a rest. Every bar must add up to `meter`.
 *   band     who plays: lead (the tune), echo (answers the tune on repeats),
 *            comp (how the chords are played), bass, pad (sustained
 *            strings), drum. Instruments are in instruments.js.
 *   space    how much reverb: an open field, a forest, a cave
 *   gain     loudness, so quiet, sparse tracks sit level with busy ones */

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10]
};

export const TRACKS = {
  // Open land by day: a bright, singable tune over a harp, the "you have
  // just arrived somewhere friendly" feeling.
  meadow: {
    name: 'music.meadow', tempo: 92, meter: 4, root: 74, mode: 'ionian',
    band: { lead: 'flute', echo: 'harp', comp: 'arp', bass: 'bass', pad: false, drum: false },
    space: 0.28,
    form: ['I', 'A', 'A', 'B', 'A'],
    sections: {
      I: { chords: '1 | 4 | 1 | 5', melody: '-/4 | -/4 | -/4 | -/4' },
      A: {
        chords: '1 | 5 | 6 | 4 | 1 | 5 | 4 5 | 1',
        melody: '3/1.5 2/.5 1 2 | 2/1.5 1/.5 7, 5, | 1 3 6/1.5 5/.5 | 4 3 1/2 | ' +
          '3/1.5 2/.5 1 2 | 3 5 4 2 | 1 2/.5 3/.5 2 7, | 1/3 -/1'
      },
      B: {
        chords: '4 | 1 | 4 | 5 | 6 | 3 | 4 | 5',
        melody: "6/1.5 5/.5 4 6 | 5/2 3 1 | 6/1.5 1'/.5 6 5 | 5/2 4 2 | " +
          "3/1.5 4/.5 5 6 | 7 6 5/2 | 4 6 1' 6 | 5/3 -/1"
      }
    }
  },

  // Under the trees by day: a folk waltz in dorian, lute and recorder.
  forest: {
    name: 'music.forest', tempo: 108, meter: 3, root: 74, mode: 'dorian',
    band: { lead: 'flute', echo: 'harp', comp: 'waltz', bass: 'bass', pad: true, drum: false },
    space: 0.35,
    form: ['I', 'A', 'A', 'B', 'A'],
    sections: {
      I: { chords: '1 | 7 | 1 | 7', melody: '-/3 | -/3 | -/3 | -/3' },
      A: {
        chords: '1 | 7 | 1 | 4 | 1 | 7 | 3 4 | 1',
        melody: '1 2 3 | 4/1.5 3/.5 2 | 1/2 5, | 6, 7, 1 | 5 4 3 | 2 4 3/.5 2/.5 | 1 3 2 | 1/3'
      },
      B: {
        chords: '3 | 7 | 4 | 5 | 3 | 7 | 4 5 | 1',
        melody: "5 1' 6/.5 5/.5 | 7/1.5 6/.5 5 | 4 5 6 | 5/2 -/1 | 1'/1.5 7/.5 6 | 5 3 4 | 2 3 4 | 1/3"
      }
    }
  },

  // Out on the water: a rowing jig in 6/8, squeezebox over an oom-pah.
  water: {
    name: 'music.water', tempo: 270, meter: 6, root: 67, mode: 'mixolydian', gain: 0.8,
    band: { lead: 'reed', echo: 'flute', comp: 'oompah', bass: 'bass', pad: false, drum: true },
    space: 0.22,
    form: ['I', 'A', 'B', 'A', 'B'],
    sections: {
      I: { chords: '1 | 7 | 1 | 7', melody: '-/6 | -/6 | -/6 | -/6' },
      A: {
        chords: '1 | 1 | 7 | 7 | 1 | 4 | 5 7 | 1',
        melody: '1/2 1 3/2 1 | 5/2 4 3/2 2 | 7,/2 2 4/2 2 | 4/2 6 5/2 4 | ' +
          '3/2 4 5/2 3 | 4/2 3 4/2 6 | 5/3 4/2 2 | 1/3 -/3'
      },
      B: {
        chords: '4 | 1 | 7 | 1 | 4 | 1 | 5 7 | 1',
        melody: "1'/2 1' 7/2 6 | 5/3 3/3 | 4/2 4 2/2 7, | 1/2 2 3/3 | " +
          "1'/2 7 6/2 5 | 3/2 5 1'/3 | 7/3 6/2 4 | 5/2 2 1/3"
      }
    }
  },

  // The heath by day: wide and windswept, a lone flute over held strings
  // and slow plucked chords, in mixolydian.
  heath: {
    name: 'music.heath', tempo: 84, meter: 4, root: 74, mode: 'mixolydian', gain: 1.4,
    band: { lead: 'flute', echo: 'bell', comp: 'drone', bass: 'bass', pad: true, drum: false },
    space: 0.4,
    form: ['I', 'A', 'A', 'B', 'A'],
    sections: {
      I: { chords: '1 | 7 | 1 | 7', melody: '-/4 | -/4 | -/4 | -/4' },
      A: {
        chords: '1 | 7 | 4 | 1 | 1 | 7 | 5 4 | 1',
        melody: "5/2 3 1 | 4/1.5 2/.5 7,/2 | 1 4 6/1.5 5/.5 | 5/3 -/1 | " +
          "3/1.5 4/.5 5 1' | 7/2 6 4 | 5 2 1 6, | 1/4"
      },
      B: {
        chords: '4 | 1 | 7 | 1 | 4 | 1 | 2 | 7',
        melody: "1' 6 4 6 | 5/2 3/2 | 4 2 7, 2 | 3/3 -/1 | 6/1.5 1'/.5 2' 1' | 5/2 3 5 | 2 4 6 4 | 4/3 -/1"
      }
    }
  },

  // The highlands by day: a proud march on pipes over a drone and a drum,
  // in dorian.
  highlands: {
    name: 'music.highlands', tempo: 96, meter: 4, root: 69, mode: 'dorian', gain: 1.1,
    band: { lead: 'reed', echo: 'flute', comp: 'drone', bass: 'bass', pad: true, drum: true },
    space: 0.3,
    form: ['I', 'A', 'A', 'B', 'A', 'B'],
    sections: {
      I: { chords: '1 | 1 | 7 | 1', melody: '-/4 | -/4 | -/4 | -/4' },
      A: {
        chords: '1 | 1 | 7 | 7 | 1 | 1 | 7 4 | 1',
        melody: "1/.5 2/.5 3 5 3 | 5/1.5 6/.5 5 3 | 2/2 7, 2 | 4/1.5 2/.5 7,/2 | " +
          "1/.5 2/.5 3 5 1' | 7/1.5 5/.5 6 5 | 2 7, 4 6 | 1/3 -/1"
      },
      B: {
        chords: '3 | 7 | 4 | 1 | 3 | 7 | 4 7 | 1',
        melody: "5/1.5 5/.5 1' 7 | 7/2 5 2 | 6/1.5 4/.5 1 4 | 5/3 -/1 | " +
          "1'/1.5 2'/.5 3' 1' | 7/1.5 1'/.5 7 5 | 4 6 2 7, | 1/4"
      }
    }
  },

  // The fens by day: still water and mist, a low flute over rippling harp
  // in a slow 6/8, in lydian (the dreamy raised fourth).
  fen: {
    name: 'music.fen', tempo: 150, meter: 6, root: 65, mode: 'lydian', gain: 1.1,
    band: { lead: 'flute', echo: 'bell', comp: 'arp', bass: 'bass', pad: true, drum: false },
    space: 0.55,
    form: ['I', 'A', 'B', 'A'],
    sections: {
      I: { chords: '1 | 2 | 1 | 2', melody: '-/6 | -/6 | -/6 | -/6' },
      A: {
        chords: '1 | 2 | 1 | 2 | 6 | 3 | 2 5 | 1',
        melody: "5/3 3/2 1 | 2/3 4/2 6 | 5/2 6 5/2 3 | 4/6 | 6/3 1'/2 6 | 5/2 3 7,/3 | 2/2 4 5/3 | 1/6"
      },
      B: {
        chords: '6 | 3 | 2 | 1 | 6 | 3 | 2 | 5',
        melody: "1'/3 6/2 4 | 5/3 3/3 | 4/2 6 2'/3 | 1'/3 5/3 | 6/2 1' 3'/3 | 2'/2 1' 7/3 | 6/3 4/3 | 5/6"
      }
    }
  },

  // The surface at night: a slow music-box lullaby over soft strings.
  night: {
    name: 'music.night', tempo: 66, meter: 4, root: 81, mode: 'aeolian', gain: 2.6,
    band: { lead: 'bell', echo: 'harp', comp: 'arp', bass: false, pad: true, drum: false },
    space: 0.45,
    form: ['I', 'A', 'B', 'A'],
    sections: {
      I: { chords: '1 | 6 | 1 | 6', melody: '-/4 | -/4 | -/4 | -/4' },
      A: {
        chords: '1 | 6 | 3 | 7 | 1 | 6 | 4 5 | 1',
        melody: "5/2 3 1 | 1'/2 7 6 | 5/3 3 | 2/2 7, 5, | 1/1.5 2/.5 3 5 | 6/2 5 3 | 4/2 2 7, | 1/4"
      },
      B: {
        chords: '6 | 7 | 1 | 1 | 4 | 6 | 7 | 7',
        melody: "3'/2 1' 6 | 2'/2 7 5 | 1'/1.5 7/.5 6 5 | 3/3 -/1 | 4 6 1' 6 | 5/2 3 1 | 2/1.5 3/.5 2 7, | 2/3 -/1"
      }
    }
  },

  // The first mine layers: a busy, curious tune on mallets over a
  // plucked ostinato, the sound of people at work underground.
  mines: {
    name: 'music.mines', tempo: 100, meter: 4, root: 76, mode: 'dorian',
    band: { lead: 'mallet', echo: 'flute', comp: 'ostinato', bass: 'bass', pad: true, drum: false },
    space: 0.5,
    form: ['I', 'A', 'A', 'B', 'A'],
    sections: {
      I: { chords: '1 | 1 | 7 | 7', melody: '-/4 | -/4 | -/4 | -/4' },
      A: {
        chords: '1 | 1 | 7 | 7 | 4 | 4 | 3 7 | 1',
        melody: '1/.5 3/.5 5 4/.5 3/.5 1 | 2 3 2 7, | 1/.5 7,/.5 6, 7, 2 | 7,/3 -/1 | ' +
          '4/.5 5/.5 6 5/.5 4/.5 3 | 1 3 4/2 | 3 5 4 2 | 1/3 -/1'
      },
      B: {
        chords: '3 | 7 | 4 | 1 | 3 | 7 | 4 | 5',
        melody: "5/1.5 3/.5 5 1' | 7/2 6 5 | 6/1.5 5/.5 4 6 | 5/3 -/1 | " +
          "3' 2' 1' 5 | 7/1.5 1'/.5 7 6 | 4 6 5 4 | 2/2 7, 5,"
      }
    }
  },

  // Deep below: slow, sparse and strange, bells in a huge dark space.
  deep: {
    name: 'music.deep', tempo: 60, meter: 3, root: 69, mode: 'phrygian', gain: 1.5,
    band: { lead: 'bell', echo: 'harp', comp: 'drone', bass: 'bass', pad: true, drum: false },
    space: 0.65,
    form: ['I', 'A', 'B', 'A'],
    sections: {
      I: { chords: '1 | 2 | 1 | 2', melody: '-/3 | -/3 | -/3 | -/3' },
      A: {
        chords: '1 | 2 | 1 | 7 | 1 | 6 | 2 | 1',
        melody: '5/2 6 | 6/1.5 5/.5 4 | 5/3 | 4 2 7, | 1 3 5 | 6/2 3 | 2/2 4 | 1/3'
      },
      B: {
        chords: '6 | 7 | 6 | 2 | 4 | 7 | 2 | 1',
        melody: "1'/2 7 | 6/1.5 4/.5 2 | 3/2 5 | 4/3 | 6 5 4 | 2/2 7, | 2 3 2 | 1/3"
      }
    }
  }
};

export const TRACK_IDS = Object.keys(TRACKS);

/* ------------------------------------------------------------ reading */

const NOTE = /^(-|[1-7])([',]*)(?:\/(\d*\.?\d+))?$/;

// The MIDI note of a scale degree (1-7, any octave above or below).
export function degreeNote(track, degree, octave = 0) {
  const steps = MODES[track.mode];
  const d = degree - 1;
  const oct = Math.floor(d / 7) + octave;
  return track.root + steps[((d % 7) + 7) % 7] + 12 * oct;
}

// One bar of melody: [{deg, oct, at, beats}] (deg null for a rest).
export function parseBar(text) {
  let at = 0;
  return text.trim().split(/\s+/).map((tok) => {
    const m = NOTE.exec(tok);
    if (!m) throw new Error('bad note ' + JSON.stringify(tok)); // i18n-ok: a composer's error, checked by the tests
    const beats = m[3] ? Number(m[3]) : 1;
    const oct = [...m[2]].reduce((o, c) => o + (c === "'" ? 1 : -1), 0);
    const note = { deg: m[1] === '-' ? null : Number(m[1]), oct, at, beats };
    at += beats;
    return note;
  });
}

// A section, ready to play: bars of {notes, chords: [{deg, at, beats}]}.
export function parseSection(track, section) {
  const melody = section.melody.split('|');
  const chords = section.chords.split('|');
  if (melody.length !== chords.length) throw new Error('melody and chords differ in bars'); // i18n-ok: a composer's error, checked by the tests
  return melody.map((bar, i) => {
    const degs = chords[i].trim().split(/\s+/).map(Number);
    const beats = track.meter / degs.length;
    return {
      notes: parseBar(bar),
      chords: degs.map((deg, j) => ({ deg, at: j * beats, beats }))
    };
  });
}

// A triad on a scale degree, as MIDI notes from its root up.
export function triad(track, deg) {
  return [0, 2, 4].map((k) => degreeNote(track, deg + k));
}

// Every problem with a track, as messages (an empty list: it plays).
export function checkTrack(track) {
  const problems = [];
  if (!MODES[track.mode]) problems.push('unknown mode ' + track.mode); // i18n-ok: a composer's error, checked by the tests
  for (const id of track.form) if (!track.sections[id]) problems.push('form names missing section ' + id); // i18n-ok: a composer's error, checked by the tests
  for (const [id, sec] of Object.entries(track.sections)) {
    let bars;
    try { bars = parseSection(track, sec); } catch (err) { problems.push(id + ': ' + err.message); continue; }
    bars.forEach((bar, i) => {
      const sum = bar.notes.reduce((n, x) => n + x.beats, 0);
      if (Math.abs(sum - track.meter) > 1e-9) problems.push(`${id} bar ${i + 1} lasts ${sum} beats, not ${track.meter}`); // i18n-ok: a composer's error, checked by the tests
      for (const c of bar.chords) if (!(c.deg >= 1 && c.deg <= 7)) problems.push(`${id} bar ${i + 1} has chord ${c.deg}`); // i18n-ok: a composer's error, checked by the tests
    });
  }
  return problems;
}

/* ------------------------------------------------------------- scenes */

// Which track fits where the player is. On the surface the region you're in
// picks it (`land`: its kind of land's track, see BIOMES in core/regions.js),
// so the music changes as you cross into another region, never tile by tile;
// the night has its own. Below, the mines and the deep do.
export function sceneFor({ depth, daylight, land }) {
  if (depth >= 3) return 'deep';
  if (depth >= 1) return 'mines';
  if (daylight < 0.3) return 'night';
  return land;
}
