/* Everything that exists in the game, by the id a texture pack knows it by.
 *
 * The game decides what each thing is and what it does; a texture pack
 * decides what it looks like. Each thing names the slots a pack can fill:
 *
 *   color  '#rrggbb'. Used far out, for sparks and as a fallback.
 *   top    the ground: an image stretched over the tile's top (squashed by
 *          the view's lean)
 *   face   the front of a raised tile, seen below its top; one image is one
 *          layer tall and repeats down taller faces
 *   stand  something standing up on a tile you can gather (trees, boulders): never on
 *          other ground, so nothing shown is decoration you can't pick up; bottom
 *          centre on the tile's centre; it never squashes
 *   cut    what stands there once the tile has been worked out
 *   image  a thing standing on the map (buildings, the wanderer, the boat);
 *          also its picture in the sheet
 *   icon   a square picture for the buttons, counters and lists
 *   stages a building on the map as its output builds up: a list of
 *          pictures, empty first, full last (nothing waiting to collect
 *          shows the first; full shows the last; the ones between share
 *          the way up). `image` stays its picture in the sheet.
 *   tiers  the stockpile's piles, smallest first: picture k stands for
 *          10^k of the resource (past the last, the last stands in). Drawn
 *          one tile wide; piles of 10^7 and more cover a square of tiles
 *          (see pileSpan) and their picture is drawn that many tiles wide.
 *
 * Required slots must be in the default pack; a player's pack can fill any
 * subset and the default fills the rest. Everything here is plain data so
 * the wiki can list it. */

import { T, TILE_INFO, TILE_KEY, TILE_NAME, RESOURCES, RESOURCE_LABEL, RESOURCE_LOWER, RESOURCE_OF } from './tiles.js';
import { t, capitalize, LOCALE } from '../i18n/i18n.js';
import { EXTRACTORS, TOOLS, UNLOCKS, PERKS, ABUNDANCE, REFINERIES, FINDS, GEAR } from './content.js';
import { PATH_FAMILIES } from './upgrades.js';
import { FOREST_KINDS, forestKind } from './terrain.js';
import { MUSHROOMS } from './mushrooms.js';

export const PACK_FORMAT = 1;  // the texture pack format this version reads
export const BOAT_DECK = 0.16; // where the wanderer stands on the boat, up from its bottom
export const DEFAULT_TILE = 64; // a pack's picture pixels per tile, unless it says otherwise
export const SLOTS = ['color', 'top', 'face', 'stand', 'cut', 'image', 'icon', 'tiers', 'stages'];

// The groups, in the order the wiki lists them.
export const LOOK_GROUPS = [
  'tile',
  'forest',
  'mushroom',
  'resource',
  'pile',
  'building',
  'character',
  'mark',
  'ui',
  'tool',
  'refinery',
  'engine',
  'unlock',
  'perk',
  'path',
  'color'
].map((id) => ({ id, name: t('group.' + id), blurb: t('group.' + id + '.blurb') }));

const req = (...slots) => Object.fromEntries(slots.map((s) => [s, true]));
const opt = (...slots) => Object.fromEntries(slots.map((s) => [s, false]));

function tileDoes(type) {
  const info = TILE_INFO[type];
  const out = [];
  if (info.swim) out.push(t('tileDoes.walkSlow'));
  else if (info.walk) out.push(t('tileDoes.walk'));
  else if (info.solid) out.push(t('tileDoes.solid'));
  else out.push(t('tileDoes.impassable'));
  if (info.res) out.push(t('tileDoes.yields', { res: RESOURCE_OF[info.res] }));
  if (info.find) {
    const loot = Object.keys(FINDS[type].loot).map((r) => RESOURCE_LOWER[r]).join(', ');
    out.push(t('tileDoes.find', { loot }));
  }
  if (info.forage) out.push(t('tileDoes.forage'));
  if (info.harvest && !info.solid) out.push(t('tileDoes.spent'));
  if (info.land) out.push(t('tileDoes.land'));
  if (info.descend) out.push(t('tileDoes.descend'));
  if (info.rise) out.push(t('tileDoes.rise'));
  if (GEAR.rock[type]) out.push(t('tileDoes.needs', { tool: TOOLS.pickaxe.name, lv: GEAR.rock[type] }));
  if (info.swim) out.push(t('tileDoes.needs', { tool: TOOLS.boots.name, lv: GEAR.water }));
  if (type === T.SHAFT) {
    out.push(t('tileDoes.shaft'));
    for (const g of GEAR.shafts) out.push(t('tileDoes.deepShaft', { from: g.from, tool: TOOLS.pickaxe.name, lv: g.level }));
  }
  if (type === T.CAVE) out.push(t('tileDoes.cave'));
  if (type === T.BEDROCK) out.push(t('tileDoes.bedrock'));
  if (type === T.TUNNEL) out.push(t('tileDoes.tunnel'));
  if (info.height >= 1) out.push(t('tileDoes.tall'));
  if (type === T.HOME) out.push(t('tileDoes.home'));
  return out.join(' ');
}

function tileSlots(t) {
  const info = TILE_INFO[t];
  const workable = info.harvest && !info.solid; // surface deposits can be worked out
  // Only what you can gather stands up on a tile: anything standing on
  // ground you can't gather would be decoration you can't pick up. A forest
  // is never worked out: its trees stand for good, and what runs out is the
  // mushrooms at their feet (see the mushroom looks).
  const standing = info.forage ? opt('stand') : opt('stand', 'cut');
  return { ...req('color', 'top'), ...opt('face'), ...(workable ? standing : {}) };
}

const things = [];
const add = (group, key, name, does, slots) => things.push({ id: `${group}.${key}`, group, key, name, does, slots });

for (let type = 0; type < TILE_KEY.length; type++) add('tile', TILE_KEY[type], TILE_NAME[type], tileDoes(type), tileSlots(type));
// A forest kind's trees (stand), and optionally its own ground (top);
// anything it leaves out comes from tile.forest.
for (const key of Object.keys(FOREST_KINDS)) {
  add('forest', key, FOREST_KINDS[key].name, t('look.forest.does', { does: FOREST_KINDS[key].does }), { ...req('stand'), ...opt('top') });
}

// Each kind of mushroom: a little clump of it, drawn at the trees' feet on
// the map while a forest patch has some left (smaller as it runs low), and
// in the earnings statement.
for (const key of Object.keys(MUSHROOMS)) add('mushroom', key, MUSHROOMS[key].name, MUSHROOMS[key].does, req('image'));

for (const r of RESOURCES) add('resource', r, RESOURCE_LABEL[r], t('look.resource.does'), req('icon', 'color'));
add('resource', 'insight', t('res.insight'), t('look.insight.does'), req('icon', 'color'));

for (const r of RESOURCES) {
  add('pile', r, capitalize(t('look.pile', { res: RESOURCE_OF[r] })), t('look.pile.does', { res: RESOURCE_LOWER[r] }), req('tiers'));
}

for (const key of Object.keys(EXTRACTORS)) {
  const e = EXTRACTORS[key];
  const does = e.depot ? t('building.depot.desc') : e.support ? t('building.' + key + '.desc') : e.tile === null ? t('look.converter.does', { res: RESOURCE_OF[e.res] })
    : t('look.extractor.does', { res: RESOURCE_OF[e.res], tile: TILE_NAME[e.tile].toLocaleLowerCase(LOCALE) });
  add('building', key, e.name, does, req('image', 'stages'));
}

add('character', 'wanderer', t('look.character.wanderer'), t('look.character.wanderer.does'), req('image'));
add('character', 'phone', t('look.character.phone'), t('look.character.phone.does'), req('image', 'color'));
add('character', 'laptop', t('look.character.laptop'), t('look.character.laptop.does'), req('image', 'color'));
add('character', 'boat', t('look.character.boat'), t('look.character.boat.does', { pct: Math.round(BOAT_DECK * 100) }), req('image'));

add('mark', 'hole', t('look.mark.hole'), t('look.mark.hole.does'), req('top', 'color'));
add('mark', 'skylight', t('look.mark.skylight'), t('look.mark.skylight.does'), req('color'));
add('mark', 'ladder', t('look.mark.ladder'), t('look.mark.ladder.does'), req('image'));
add('mark', 'glowcap', t('look.mark.glowcap'), t('look.mark.glowcap.does'), req('image', 'color'));
add('mark', 'lamp', t('look.mark.lamp'), t('look.mark.lamp.does'), req('image', 'color'));
add('mark', 'flag', t('look.mark.flag'), t('look.mark.flag.does'), req('image', 'color'));
add('mark', 'solar', t('look.mark.solar'), t('look.mark.solar.does'), req('image'));
add('mark', 'wheel', t('look.mark.wheel'), t('look.mark.wheel.does'), req('image'));

const UI = ['perfect', 'explore', 'wait', 'build', 'upgrade', 'climbDown', 'climb', 'gather', 'collect', 'embark'];
for (const key of UI) add('ui', key, t('look.ui.' + key), t('look.ui.' + key + '.does'), req('icon'));

for (const key of Object.keys(TOOLS)) add('tool', key, TOOLS[key].name, t('sentence', { text: TOOLS[key].desc }), req('icon'));
for (const r of RESOURCES) add('refinery', r, REFINERIES[r].name, t('look.refinery.does', { res: RESOURCE_OF[r] }), req('icon'));
add('engine', 'abundance', ABUNDANCE.name, t('sentence', { text: ABUNDANCE.desc }), req('icon'));
for (const key of Object.keys(UNLOCKS)) add('unlock', key, UNLOCKS[key].name, t('sentence', { text: UNLOCKS[key].desc }), req('icon'));
for (const key of Object.keys(PERKS)) add('perk', key, PERKS[key].name, t('sentence', { text: PERKS[key].desc }), req('icon'));
for (const f of PATH_FAMILIES) add('path', f.id, f.name, t('look.path.does'), req('icon'));

const COLORS = ['backdrop', 'unknown', 'cloud', 'cloudShade', 'dial', 'dialFull'];
for (const key of COLORS) add('color', key, t('look.color.' + key), t('look.color.' + key + '.does'), req('color'));

export const LOOKS = things;
export const LOOK = Object.fromEntries(things.map((t) => [t.id, t]));

// Things the game no longer draws. A pack that still has them (one saved or
// exported before they went) loads as before; they are just ignored.
export const RETIRED_LOOKS = new Set(['color.visited', 'color.cavity', 'color.edge']);

// The look id for a tile type and for a resource.
export const tileLook = (t) => 'tile.' + TILE_KEY[t];
export const resourceLook = (r) => 'resource.' + r;
export const forestLook = (seed, x, y) => 'forest.' + forestKind(seed, x, y);
export const mushroomLook = (key) => 'mushroom.' + key;
