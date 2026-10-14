/* Everything that exists in the game, by the id a texture pack knows it by.
 *
 * The game decides what each thing is and what it does; a texture pack
 * decides what it looks like. Each thing names the slots a pack can fill:
 *
 *   color  '#rrggbb'. Used far out, on cliffs, for sparks and as a fallback.
 *   top    the ground: an image stretched over the tile's top (it squashes
 *          as the view tilts)
 *   face   the front of a raised tile, seen when tilted; one image is one
 *          layer tall and repeats down taller faces
 *   stand  something standing up on a tile you can gather (trees, boulders): never on
 *          other ground, so nothing shown is decoration you can't pick up; bottom
 *          centre on the tile's centre; it never squashes
 *   cut    what stands there once the tile has been worked out
 *   crop   what grows at the foot of a stand you forage (mushrooms under
 *          the trees); drawn in front of it while there is some left
 *   image  a thing standing on the map (buildings, the wanderer, the boat);
 *          also its picture in the sheet
 *   icon   a square picture for the buttons, counters and lists
 *   tiers  the stockpile's piles, smallest first: picture k stands for
 *          10^k of the resource (past the last, the last stands in). Drawn
 *          one tile wide; piles of 10^7 and more cover a square of tiles
 *          (see pileSpan) and their picture is drawn that many tiles wide.
 *
 * Required slots must be in the default pack; a player's pack can fill any
 * subset and the default fills the rest. Everything here is plain data so
 * the wiki can list it. */

import { T, TILE_INFO, TILE_KEY, TILE_NAME, RESOURCES, RESOURCE_LABEL } from './tiles.js';
import { EXTRACTORS, TOOLS, UNLOCKS, PERKS, ABUNDANCE, REFINERIES, FINDS } from './content.js';
import { PATH_FAMILIES } from './upgrades.js';
import { FOREST_KINDS, forestKind } from './terrain.js';

export const PACK_FORMAT = 1;  // the texture pack format this version reads
export const BOAT_DECK = 0.16; // where the wanderer stands on the boat, up from its bottom
export const DEFAULT_TILE = 64; // a pack's picture pixels per tile, unless it says otherwise
export const SLOTS = ['color', 'top', 'face', 'stand', 'cut', 'crop', 'image', 'icon', 'tiers'];

// The groups, in the order the wiki lists them.
export const LOOK_GROUPS = [
  { id: 'tile', name: 'Ground', blurb: 'Every kind of tile, on the surface and in the mine.' },
  { id: 'forest', name: 'Forests', blurb: 'Kinds of forest, by region: each grows its own mix of trees. Their floors all yield mycelium alike.' },
  { id: 'resource', name: 'Resources', blurb: 'What you gather and spend.' },
  { id: 'pile', name: 'The stockpile', blurb: 'What you own, piled up around home: one kind of pile per power of ten.' },
  { id: 'building', name: 'Buildings', blurb: 'Extractors and converters you place on the map.' },
  { id: 'character', name: 'The wanderer', blurb: 'You, your lantern and your boat.' },
  { id: 'mark', name: 'Marks in the world', blurb: 'Ways between layers, their ladders, the light through them, and what you place in the mine.' },
  { id: 'ui', name: 'Buttons', blurb: 'The thumb buttons and the sheet.' },
  { id: 'tool', name: 'Tools', blurb: 'Upgrades you craft.' },
  { id: 'refinery', name: 'Refineries', blurb: 'Upgrades that multiply one resource.' },
  { id: 'engine', name: 'Abundance Engine', blurb: 'The endless upgrade.' },
  { id: 'unlock', name: 'Unlocks and blueprints', blurb: 'One-time purchases.' },
  { id: 'perk', name: 'Perks', blurb: 'Bought with Insight; they outlast a world.' },
  { id: 'path', name: 'Upgrade groups', blurb: 'The headings of the Upgrades sheet.' },
  { id: 'color', name: 'Colours', blurb: 'The dark, the cliffs and the light.' }
];

const req = (...slots) => Object.fromEntries(slots.map((s) => [s, true]));
const opt = (...slots) => Object.fromEntries(slots.map((s) => [s, false]));

function tileDoes(t) {
  const info = TILE_INFO[t];
  const out = [];
  if (info.swim) out.push('Walkable, slowly; you float across in a boat.');
  else if (info.walk) out.push('Walkable.');
  else if (info.solid) out.push('Solid rock until you dig it out.');
  else out.push('Impassable.');
  if (info.res) out.push(`Gathering it yields ${RESOURCE_LABEL[info.res].toLowerCase()}.`);
  if (info.find) {
    const loot = Object.keys(FINDS[t].loot).map((r) => RESOURCE_LABEL[r].toLowerCase()).join(', ');
    out.push(`A find: one dig pays out ${loot} all at once, more on deeper layers and with better tools. It glints in the dark from a way off.`);
  }
  if (info.forage) out.push('Its trees are never cut: you forage the forest floor, and the trees stand for good.');
  if (info.regrows) out.push('Grows back near you.');
  if (info.land) out.push('Converters can be built on it.');
  if (info.descend) out.push('A way down to the layer below.');
  if (info.rise) out.push('A ladder up to the way down of the layer above.');
  if (t === T.SHAFT) out.push('A way down to the layer below once one dig opens it.');
  if (t === T.CAVE) out.push('The only ways into the mine are these, scattered through the forest: you can\'t dig down.');
  if (t === T.BEDROCK) out.push('Cannot be dug.');
  if (t === T.TUNNEL) out.push('Dug-out space in the mine.');
  if (info.height >= 1) out.push('Stands a full layer tall.');
  if (t === T.HOME) out.push('The clearing every world starts in, kept for your stockpile.');
  else if (info.yard > 0) out.push('Your stockpile spills onto it once home ground is full.');
  return out.join(' ');
}

function tileSlots(t) {
  const info = TILE_INFO[t];
  const workable = info.harvest && !info.solid; // surface deposits can be worked out
  // Only what you can gather stands up on a tile: anything standing on
  // ground you can't gather would be decoration you can't pick up. A forest
  // is never worked out: its trees stand for good and its crop runs out.
  const standing = info.forage ? opt('stand', 'crop') : opt('stand', 'cut');
  return { ...req('color', 'top'), ...opt('face'), ...(workable ? standing : {}) };
}

const things = [];
const add = (group, key, name, does, slots) => things.push({ id: `${group}.${key}`, group, key, name, does, slots });

for (let t = 0; t < TILE_KEY.length; t++) add('tile', TILE_KEY[t], TILE_NAME[t], tileDoes(t), tileSlots(t));
// A forest kind's trees (stand), and optionally its own ground (top) and
// what grows at the trees' feet (crop); anything it leaves out comes from
// tile.forest.
for (const key of Object.keys(FOREST_KINDS)) {
  add('forest', key, FOREST_KINDS[key].name, FOREST_KINDS[key].does + ' Its floor yields mycelium like any forest.', { ...req('stand'), ...opt('top', 'crop') });
}

for (const r of RESOURCES) add('resource', r, RESOURCE_LABEL[r], `A resource. Counted at the top of the screen.`, req('icon', 'color'));
add('resource', 'insight', 'Insight', 'Earned by embarking to a new world; spent on perks.', req('icon', 'color'));

for (const r of RESOURCES) {
  add('pile', r, `${RESOURCE_LABEL[r]} piles`, `Your ${RESOURCE_LABEL[r].toLowerCase()} in the stockpile: one pile for each unit of each digit you own, bigger piles for bigger powers of ten.`, req('tiers'));
}

for (const key of Object.keys(EXTRACTORS)) {
  const e = EXTRACTORS[key];
  const where = e.tile === null ? 'on any open land' : `on ${TILE_NAME[e.tile].toLowerCase()}`;
  add('building', key, e.name, `Makes ${RESOURCE_LABEL[e.res].toLowerCase()} ${where}.`, req('image'));
}

add('character', 'wanderer', 'Wanderer', 'You. Drawn facing right and mirrored to walk left. As an animation, the first frame is standing still and the rest loop while you walk.', req('image'));
add('character', 'lantern', 'Lantern', 'Carried at night and underground, drawn over the wanderer at the same size and place (so it lines up with their hand), and mirrored with them. It is what lights the way; the colour is its light.', req('image', 'color'));
add('character', 'boat', 'Boat', `Carries you over water. Drawn facing right and to the same scale as the wanderer (who stands in it at full size, ${Math.round(BOAT_DECK * 100)}% of its height up from the bottom), so make the mast taller than them.`, req('image'));

add('mark', 'hole', 'Hole', 'An opening in the floor down to the layer below (a cave mouth or an open shaft). The colour is the dark inside it.', req('top', 'color'));
add('mark', 'skylight', 'Skylight', 'Light falling through a hole in the ceiling, and holes seen in a cliff.', req('color'));
add('mark', 'ladder', 'Ladder', 'Stands in every way between layers: down into the pit from above, up into the light (or the dark of a shaft not yet opened) from below. Drawn upright, top at the top; it is stretched to fit.', req('image'));
add('mark', 'glowcap', 'Glowcap', 'A glowing mushroom you planted in a tunnel. It lights the tunnel around it for good; the colour is its light.', req('image', 'color'));
add('mark', 'lamp', 'Crystal lamp', 'A crystal lamp you placed in the mine. It lights much further than a glowcap; the colour is its light.', req('image', 'color'));
add('mark', 'flag', 'Marker flag', 'A flag you planted in the mine to find your way back. The colour is the pin that shows through the dark over it, or at the edge of the screen pointing to it.', req('image', 'color'));

const UI = {
  build: ['Build', 'Opens the Build sheet.'],
  upgrade: ['Upgrade', 'Opens the Upgrades sheet.'],
  climbDown: ['Climb down', 'Climbs down the cave mouth you stand in, into the mine.'],
  climb: ['Climb up', 'Climbs the ladder you stand at the foot of, up to the layer above.'],
  gather: ['Gather', 'Works whatever is in reach (shown when nothing is).'],
  collect: ['Collect', 'Empties nearby buildings into your pack.'],
  embark: ['Embark', 'Leaves this world for a new one.']
};
for (const key of Object.keys(UI)) add('ui', key, UI[key][0], UI[key][1], req('icon'));

for (const key of Object.keys(TOOLS)) add('tool', key, TOOLS[key].name, TOOLS[key].desc + '.', req('icon'));
for (const r of RESOURCES) add('refinery', r, REFINERIES[r].name, `Multiplies all ${RESOURCE_LABEL[r].toLowerCase()} production.`, req('icon'));
add('engine', 'abundance', ABUNDANCE.name, ABUNDANCE.desc + '.', req('icon'));
for (const key of Object.keys(UNLOCKS)) add('unlock', key, UNLOCKS[key].name, UNLOCKS[key].desc + '.', req('icon'));
for (const key of Object.keys(PERKS)) add('perk', key, PERKS[key].name, PERKS[key].desc + '.', req('icon'));
for (const f of PATH_FAMILIES) add('path', f.id, f.name, 'A heading in the Upgrades sheet.', req('icon'));

const COLORS = {
  backdrop: ['Backdrop', 'The dark around the known world.'],
  unknown: ['Unknown layer', 'Layers in a cliff you have never been down to.'],
  visited: ['Visited layer', 'Layers in a cliff you have been down to but not seen here.'],
  cavity: ['Dug space', 'Open space in a cliff where you dug.'],
  edge: ['Edge of the known', 'The light lip along edges facing the dark.'],
  dial: ['Output dial', 'The dial over a building holding output you have to collect, filling as it holds more.'],
  dialFull: ['Full dial', 'The dial over a building that is full and has stopped working until you collect.']
};
for (const key of Object.keys(COLORS)) add('color', key, COLORS[key][0], COLORS[key][1], req('color'));

export const LOOKS = things;
export const LOOK = Object.fromEntries(things.map((t) => [t.id, t]));

// The look id for a tile type and for a resource.
export const tileLook = (t) => 'tile.' + TILE_KEY[t];
export const resourceLook = (r) => 'resource.' + r;
export const forestLook = (seed, x, y) => 'forest.' + forestKind(seed, x, y);
