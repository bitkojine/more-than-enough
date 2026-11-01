/* A value written into JavaScript source that a test sends to the browser or
 * to Node's loader. JSON is already valid JavaScript; the characters that
 * could end a <script> or a line early are escaped as well, so a value can
 * never become code. */

const ESCAPES = {
  '<': '\\u003C',
  '>': '\\u003E',
  '/': '\\u002F',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029'
};

export function jsLiteral(value) {
  const json = JSON.stringify(value);
  if (json === undefined) return 'undefined';
  return json.replace(/[<>/\u2028\u2029]/g, (c) => ESCAPES[c]);
}
