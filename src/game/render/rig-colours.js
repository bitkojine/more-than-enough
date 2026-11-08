/* The colours Mica's coat is painted (rig-model.js), whoever wears it. */

// Mica's own orange coat and its repair patch. Another player wears their
// player colour (Watch, 2026-11-08), a shade darker so it sits with the
// flat painted world, and a patch a little lighter than it.
export const COAT = 0xc8743a,
  PATCH = 0xd18b54;
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16),
    c = (v) => Math.round(Math.min(255, v * k));
  return (c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255);
};
export const coatColours = (colour) =>
  /^#[0-9a-f]{6}$/i.test(colour ?? '')
    ? { coat: shade(colour, 0.82), patch: shade(colour, 0.92) }
    : { coat: COAT, patch: PATCH };
