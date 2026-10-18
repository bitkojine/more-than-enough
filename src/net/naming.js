/* How shared worlds and their players are named, so the game and the room
 * service's admin page (server/src/admin.js) name them the same. Only the
 * words' keys (src/i18n: world.thing.*, world.place.*, together.name.*);
 * each side puts them in its own language. No imports, so the room service
 * can bundle it as is. */

const THINGS = ['glowcap', 'fern', 'moss', 'amber', 'crystal', 'heron', 'otter', 'lynx', 'owl', 'willow', 'juniper', 'clover', 'firefly', 'mist', 'thunder', 'honey'];
const PLACES = ['hollow', 'valley', 'ridge', 'meadow', 'grove', 'marsh', 'hills', 'shore', 'falls', 'woods', 'heath', 'lake'];
export const PLAYER_NAMES = Object.freeze(['moss', 'fern', 'acorn', 'clover', 'hazel', 'birch', 'willow', 'juniper', 'sparrow', 'otter', 'badger', 'hedgehog', 'fox', 'owl', 'hare', 'lynx', 'beaver', 'squirrel', 'heron', 'stork', 'bee', 'firefly', 'thyme', 'mint']);

// A world's name from its id: the same id always gives the same name.
export function worldWords(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return { thing: 'world.thing.' + THINGS[h % THINGS.length], place: 'world.place.' + PLACES[(h >>> 8) % PLACES.length] };
}

// Everyone's name number in a world, by id, from [id, colour] of each player
// and tombstone: a nature name picked from the id, never two the same, and
// the same on every phone (players are named in the order of their colours,
// which the room hands out).
export function nameNumbers(players) {
  const taken = new Set();
  const out = new Map();
  for (const [id] of [...players].sort((a, b) => a[1] - b[1])) {
    let k = parseInt(id.slice(0, 8), 16) % PLAYER_NAMES.length;
    while (taken.has(k)) k++;
    taken.add(k);
    out.set(id, k);
  }
  return out;
}

// A name number's word (its key) and, past the last name, its number:
// names come round again as Fox 2, Fox 3…
export function nameWord(k) {
  return { key: 'together.name.' + PLAYER_NAMES[k % PLAYER_NAMES.length], n: k < PLAYER_NAMES.length ? 0 : Math.floor(k / PLAYER_NAMES.length) + 1 };
}
