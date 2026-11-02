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
- `src/game/music/chime.js`: the hello, a short music-box chime played
  once a page the moment the sound wakes (Watch picked it, 2026-11-02).

## How the sound starts and stops

Browsers keep a page silent until the player has done something on it
(iOS Safari counts only a tap that ends in a click, not a drag), so no sound
can play on a plain reload. So the game starts asleep (`src/game/sleep.js`,
Watch 2026-11-02): grey and still, Wiki dozing on Mica's hood, "Tap to wake"
under Mica. The one tap or key that wakes the game wakes its sound too.

1. **Load.** The sound and the sleep are made before the pictures load
   (`createWaking` in `sleep.js`), so a tap while the game is still loading
   counts: it wakes the sound, and the game opens awake. The sound makes an
   audio context at once: where the browser allows sound without a gesture
   (some desktop browsers), the hello and the music start right away.
2. **First press.** Every kind of press (pointer, touch, mouse, key, click)
   tries to wake the context from inside the gesture, with the silent
   one-sample trick mobile Safari needs. A context made before any gesture
   that has played nothing yet is swapped for a fresh one made inside the
   gesture (Edge could leave the first one silent, issue #1). The hello is
   queued on the waking context, so it plays the moment the audio runs,
   however busy the page is; then the music for where Mica stands begins
   at once and comes in within a quarter of a second (later tracks still
   swell in slowly when the place changes).
3. **While playing.** The scene is told four times a second (presenter.js);
   a new place must hold 1.5 s before the music crossfades.
4. **Tab hidden, phone call, the OS taking the audio.** Hiding the tab
   puts the game back to sleep, so coming back takes the wake tap. The music stops
   queueing bars while the page is hidden or the context is not running,
   so nothing bursts out on return. Once the page has had a gesture, the
   context is nudged back on return, on focus and every second.
5. **Settings.** Sound off silences everything, hello included; Music off
   stops only the soundtrack. Both are kept per browser (`loadView` in
   `src/game/storage.js`), and Sound off holds from the moment the page
   loads.

## Adding a track

Write it in `TRACKS` (each bar of melody must add up to the meter; `npm
test` checks), give it a name in `src/i18n/en.js` and `lt.js` as
`music.<id>`, and return its id from `sceneFor` for the place it belongs
to (for a kind of land, its `music` in `BIOMES`).
