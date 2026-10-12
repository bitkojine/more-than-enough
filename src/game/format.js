/* Number and text formatting for the UI. */

export function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(1) + 'k';
  if (n < 1e9) return (n / 1e6).toFixed(2) + 'M';
  return (n / 1e9).toFixed(2) + 'B';
}

export function fmt1(n) {
  return (Math.round(n * 10) / 10).toFixed(1);
}

// Multipliers read best as "2.5" when small and "26.0k" when large.
export function fmtMult(m) {
  return m >= 1000 ? fmt(m) : String(Math.round(m * 100) / 100);
}

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ENTITIES[c]);
}
