/* One pace for everything done by hand (Watch, 2026-10-26): gathering,
 * digging, collecting, a tap on a tile, a Trail or AUTO all take turns on
 * one clock, a turn every HAND_SECONDS of play time. Holding Gather keeps
 * exactly that pace, so pressing faster, tapping, or mixing ways never
 * works a tile sooner: no control rewards being pressed quickly.
 *
 * The clock is a plain {at}: the play time (ms) of the next free turn. The
 * game keeps one for the player (src/game/controller.js) and the room keeps
 * its own for each player's acts (server/src/shadow.js), so both hold the
 * same pace from the same rule. */

export const HAND_SECONDS = 0.25;
export const HAND_MS = HAND_SECONDS * 1000;
export const HANDS_PER_SECOND = 1 / HAND_SECONDS;
const EPSILON_MS = 1e-6; // a held pace lands exactly on the turn, give or take float rounding

// A clock whose first turn is free.
export const handClock = () => ({ at: -Infinity });

// Whether a turn is free at play time `ms`. `slackMs`: how early one may
// come (the room's acts carry play time rounded to whole ms).
export const handReady = (h, ms, slackMs = 0) => ms >= h.at - slackMs - EPSILON_MS;

// Takes the turn at `ms`. A turn taken on time keeps the beat (the next is
// one HAND_MS after this one was due, so a hold doesn't drift slower with
// frame timing); one taken late, or on a clock that went back (a new
// world), starts the beat afresh from `ms`.
export function useHand(h, ms) {
  h.at = ms >= h.at - HAND_MS && ms < h.at + HAND_MS ? h.at + HAND_MS : ms + HAND_MS;
}
