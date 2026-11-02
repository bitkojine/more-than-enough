/* The hello: a short music-box chime played the moment the game's sound
 * wakes (at load where the browser allows it, otherwise on the first touch
 * or key), so the sound is plainly on from the start instead of the
 * soundtrack swelling in a moment later. Watch picked it (2026-11-02) from
 * three tried. Four tines up a D major chord (the key of the meadow tune the
 * game usually opens on), the last left to ring, over one soft harp string.
 * Played on the band (instruments.js); returns the seconds it lasts. */

import { INSTRUMENTS } from './instruments.js';

export function chime(ctx, out, t) {
  INSTRUMENTS.harp(ctx, out, t, 62, 0.8, 0.35);
  [86, 90, 93, 98].forEach((m, i) =>
    INSTRUMENTS.bell(ctx, out, t + i * 0.085, m, i === 3 ? 0.9 : 0.25, 0.28)
  );
  return 1.6;
}
