# The soundtrack

Every kind of place has its own composed tune, played in the browser by
synthesized instruments. The whole soundtrack is a few kilobytes of notes
(`src/game/music/score.js`), so it costs players nothing to download.

## What we took from RuneScape

RuneScape's music is remembered twenty years on although it was MIDI played
on a cheap sound card. What made it work, and what we copy:

1. **A place is its music.** Every area has its own track, and walking into
   a new area changes the music. You learn the world by ear. Here the
   surface is split into big named regions a few minutes' walk across
   (`src/core/regions.js`), and each kind of land plays its own track
   (its `music` in `BIOMES`): meadows, woods, lakes, heaths, highlands and
   fens all sound different. The music changes only when you cross into another
   region, never tile by tile. Night, the first mine layers and the deep
   have their own (`sceneFor`).
2. **A real tune.** Each track is a melody you could hum, over simple chords
   and a bass line, not an ambient wash or random notes. Tracks are written
   by hand, bar by bar.
3. **Folk instruments, folk harmony.** Flute, harp, lute, squeezebox,
   bells, in modes (dorian, mixolydian, phrygian) rather than film-score
   drama. Warm, a little old-fashioned, easy to live with.
4. **Mood matches the place.** Bright and open in the fields, a waltz in
   the woods, a rowing jig on the water, a lullaby at night, curious and
   busy in the mines, slow and strange in the deep.
5. **Made to be heard for hours.** Moderate tempos, nothing harsh, sitting
   under the sound effects. A round of a track is about a minute and a
   half, and each time through the band varies it (an answering harmony,
   passing notes, the tune an octave up or on another instrument), so it
   stays the same song without wearing thin.
6. **Unlocking tracks.** The first time you hear a track, the game tells
   you its name, like RuneScape's music list. Settings shows what is
   playing.

## How it fits together

- `src/game/music/score.js`: the tracks (notation explained at the top),
  and `sceneFor`, which picks a track for where you are.
- `src/game/music/instruments.js`: the band. Harp and bass are plucked
  strings (Karplus-Strong), the rest are small oscillator voices.
- `src/game/music/player.js`: queues bars ahead of the audio clock, varies
  each pass, crossfades when the place changes (after it has held for a
  moment, so walking along a forest's edge doesn't flick between tunes),
  and adds the room's reverb.
- `src/game/audio.js`: owns the audio context; sound effects use the
  playing track's pentatonic scale, so gathering plays along in key.

## Adding a track

Write it in `TRACKS` (each bar of melody must add up to the meter; `npm
test` checks), give it a name in `src/i18n/en.js` and `lt.js` as
`music.<id>`, and return its id from `sceneFor` for the place it belongs
to (for a kind of land, its `music` in `BIOMES`).
