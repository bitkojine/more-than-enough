/* What the player is playing on, so in a shared world their character holds
 * it: a phone or a laptop. A touch screen as the main pointer means a phone
 * (tablets count as phones for now); a mouse or trackpad means a laptop. */

const touch = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null; // i18n-ok: a media query

export function playDevice() {
  return touch && touch.matches ? 'phone' : 'laptop';
}
