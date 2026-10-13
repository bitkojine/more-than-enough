/* The Ideas section: directions the game could take next. Nothing here is in
 * the game. It's a sketchbook to pick from, so ideas are added freely and
 * removed once they ship (or are dropped).
 *
 *   area     which group it sits in (see AREAS)
 *   size     rough effort: small, medium, large or huge
 *   pitch    what it is and why it would be good
 *   builds   what already in the game it grows out of */

export const AREAS = [
  { id: 'look', name: 'How things look', blurb: 'The wanderer, items, buildings and the world itself.' },
  { id: 'depth', name: 'Height and depth', blurb: 'Taking the plateau, the cliffs and the layers further.' },
  { id: 'mechanics', name: 'Mechanics', blurb: 'New things to do with your hands and your head.' },
  { id: 'economy', name: 'Economy and progression', blurb: 'What you build toward, and how the surplus grows.' },
  { id: 'big', name: 'Big swings', blurb: 'Changes that would make it a different game. Some of these are wild on purpose.' }
];

export const SIZES = { small: 'Small', medium: 'Medium', large: 'Large', huge: 'Huge' };

export const IDEAS = [
  /* ------------------------------------------------------------ look */
  {
    title: 'A wanderer, not a ball', area: 'look', size: 'medium',
    pitch: 'Replace the round token with a small hooded figure carrying a lantern, drawn upright so it reads at every tilt. It turns to face where it walks and swings its tool when it gathers.',
    builds: 'The player sprite and the facing direction it already tracks.'
  },
  {
    title: 'Tools you can see', area: 'look', size: 'small',
    pitch: 'Each Axe and Pickaxe level changes what the wanderer holds: flint, bronze, iron, crystal. Progress shows on the character instead of only in the sheet.',
    builds: 'Tool levels in the upgrade registry.'
  },
  {
    title: 'A pack that fills up', area: 'look', size: 'small',
    pitch: 'Logs, stones and glinting ore pile up on a backpack or a little sled behind you as your stock grows, and spill into a cart once it gets absurd. "More than enough" you can see.',
    builds: 'Inventory totals and the flyers that already zip into your pack.'
  },
  {
    title: 'Buildings that grow', area: 'look', size: 'medium',
    pitch: 'Extractors gain visible parts as you build more of the same kind: scaffolds, chimneys, conveyor stubs. A full one puffs smoke or glows, so you can read the whole camp at a glance with no ring overlays.',
    builds: 'Extractor counts and buffer fill.'
  },
  {
    title: 'Crystals that light the dark', area: 'look', size: 'small',
    pitch: 'Crystal tiles and seams glow at night and underground, lighting nearby ground and the cliff faces they sit in. Finding a crystal vein turns a dark corner of the map into a landmark.',
    builds: 'Night lighting and crystal tiles.'
  },
  {
    title: 'Seasons', area: 'look', size: 'medium',
    pitch: 'Over many in-game days the forest shifts from green to gold to bare and back. Each season could also nudge regrowth and swimming, but even purely visual it gives long sessions a sense of time.',
    builds: 'The day/night clock.'
  },

  /* ----------------------------------------------------------- depth */
  {
    title: 'Distant plateaus', area: 'depth', size: 'medium',
    pitch: 'Far out in the dark, other islands of land hang at different heights, dimly lit, hinting at biomes you haven\'t reached. Walking toward one eventually joins it to your plateau.',
    builds: 'The plateau-over-the-dark look and endless terrain.'
  },
  {
    title: 'Waterfalls off the edge', area: 'depth', size: 'medium',
    pitch: 'Where a river or lake reaches the edge of the known world, water pours over the cliff into the dark, with spray catching the light. Underground, water that meets a hole falls to the layer below.',
    builds: 'Water tiles, cliffs and holes.'
  },
  {
    title: 'Tunnels in the cliff face', area: 'depth', size: 'small',
    pitch: 'Tunnels dug near the edge of the known world show as openings on the cliff below it, so from the surface you can see where your mine runs.',
    builds: 'Cliffs already show what you\'ve found on each layer.'
  },
  {
    title: 'Turn the view', area: 'depth', size: 'large',
    pitch: 'Rotate the camera in quarter turns to look at the plateau from another side. Needs east, west and north faces drawn, but makes the world feel like a real object you can walk around.',
    builds: 'The camera\'s project/unproject seam.'
  },
  {
    title: 'Deep biomes', area: 'depth', size: 'large',
    pitch: 'Every few layers the rock changes character: root-tangled soil, glowing fungus caverns, cold blue ice, warm magma rock, and very deep, buried ruins. Each with its own colours, sounds and one new resource.',
    builds: 'The geology table already unlocks rock types by depth.'
  },
  {
    title: 'Building upward', area: 'depth', size: 'large',
    pitch: 'Layers above the surface: scaffolds, towers and lookout posts that reveal fog from far away. The coordinate system already allows z above 0.',
    builds: 'Layered (x, y, z) world and explore radius.'
  },

  /* ------------------------------------------------------- mechanics */
  {
    title: 'Lifts in hole columns', area: 'mechanics', size: 'medium',
    pitch: 'Build a winch over a column of holes and it carries what your underground extractors make up to the surface, and you with it. Makes deep mining a logistics puzzle instead of a long climb.',
    builds: 'Holes, columns and Logistics.'
  },
  {
    title: 'Minecart rails', area: 'mechanics', size: 'large',
    pitch: 'Lay rails along tunnels; carts roll ore to a lift on their own. Laying track could reuse the Trail gesture: draw the route with your thumb.',
    builds: 'Trails and dug tunnels.'
  },
  {
    title: 'Cave-ins and timber', area: 'mechanics', size: 'medium',
    pitch: 'Big open caverns creak and may collapse unless propped with wooden beams, giving wood a reason to go underground and making mine layout a choice.',
    builds: 'Dug tiles and wood.'
  },
  {
    title: 'A lantern that runs low', area: 'mechanics', size: 'small',
    pitch: 'Underground your sight radius slowly shrinks unless you refuel the lantern with wood or crystal. Light becomes a resource without any text explaining it: you just notice it getting darker.',
    builds: 'Explore radius and night lighting.'
  },
  {
    title: 'Glow ore', area: 'mechanics', size: 'small',
    pitch: 'A rare ore you can only see at night or in the dark, shimmering faintly. Rewards being out at night and exploring the mine by feel.',
    builds: 'Day/night and fog.'
  },
  {
    title: 'Little diggers', area: 'mechanics', size: 'large',
    pitch: 'Small creatures living in the dark: moles that dig tunnels on their own, or thieves that nibble at full extractor buffers. A reason to keep the camp tidy and a bit of life in the world.',
    builds: 'Extractor buffers and tunnels.'
  },
  {
    title: 'Weather', area: 'mechanics', size: 'medium',
    pitch: 'Rain fills ponds and speeds regrowth; dry spells shrink lakes and open new paths. Weather rolls in as visible clouds, so you see it coming.',
    builds: 'Regrowth and water tiles.'
  },

  /* --------------------------------------------------------- economy */
  {
    title: 'Visual recipes', area: 'economy', size: 'medium',
    pitch: 'A workbench where you drop resources in and see what comes out: icons only, no words, discovered by trying combinations. Fits the figure-it-out rule perfectly.',
    builds: 'Converters and the no-text rule.'
  },
  {
    title: 'Roads', area: 'economy', size: 'small',
    pitch: 'Paved paths you lay between buildings that make you walk faster and extend Logistics range along them. Turns the camp into a network you design.',
    builds: 'Movement speed and Logistics range.'
  },
  {
    title: 'Caravans at the edge', area: 'economy', size: 'medium',
    pitch: 'Every so often a caravan appears at the edge of the known world and trades one resource for another. Exploring further brings bigger caravans.',
    builds: 'Fog edges and resources.'
  },
  {
    title: 'Trophies on the plateau', area: 'economy', size: 'small',
    pitch: 'Milestones leave a physical marker in the world: a cairn, a statue, a lit beacon, so your history stands on the map instead of in a list.',
    builds: 'Milestones (goals) and their celebration.'
  },
  {
    title: 'Insight as constellations', area: 'economy', size: 'medium',
    pitch: 'Perks bought with Insight appear as stars in the night sky, forming constellations over worlds you embark to. The prestige layer becomes something you look up at.',
    builds: 'Insight, perks and night.'
  },

  /* ------------------------------------------------------------- big */
  {
    title: 'A mountain colony', area: 'big', size: 'huge',
    pitch: 'Settlers arrive and live in the tunnels you dig; you assign them to jobs by placing tools near them. The game shifts from one wanderer to a small society inside the mountain.',
    builds: 'Tunnels, buildings and production.'
  },
  {
    title: 'Every embark is a new mountain', area: 'big', size: 'large',
    pitch: 'Lean into the plateau: each world is one mountain with a summit, a shape and a depth limit, and Embark means climbing down and walking to the next peak. Short runs, strong meta-progression.',
    builds: 'Embark and Insight.'
  },
  {
    title: 'Visit a friend\'s plateau', area: 'big', size: 'huge',
    pitch: 'Share a link to your world; friends can walk your plateau, leave a gift at your camp, or dig a hole that appears in your mine. Asynchronous, no accounts, the save format already captures a whole world compactly.',
    builds: 'Seeded worlds and compact saves.'
  },
  {
    title: 'The world that remembers', area: 'big', size: 'large',
    pitch: 'When you embark, the old world stays behind and can be found again much later: overgrown camps, collapsed tunnels, your own trophies. Prestige becomes archaeology.',
    builds: 'Seeds, saves and embark.'
  },
  {
    title: 'Down is the whole game', area: 'big', size: 'huge',
    pitch: 'Flip the focus: the surface is a small starting meadow and the real game is the descent, layer after layer, each one a self-contained cave to light, mine and connect with holes. The surface becomes home base.',
    builds: 'Layers, holes, mine fog and cliffs.'
  },
  {
    title: 'No numbers at all', area: 'big', size: 'large',
    pitch: 'Go further than "no tutorial": hide all counters and let the size of your piles, the glow of buildings and the length of your tunnels tell you how you\'re doing. The wiki keeps the numbers for those who want them.',
    builds: 'The no-text rule and the wiki.'
  }
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// The ideas grouped by area, as HTML.
export function renderIdeas() {
  return AREAS.map((area) => {
    const cards = IDEAS.filter((i) => i.area === area.id).map((i) => `
      <li class="idea">
        <div class="idea-head"><strong>${esc(i.title)}</strong><span class="size size-${i.size}">${SIZES[i.size]}</span></div>
        <p>${esc(i.pitch)}</p>
        <p class="builds">Builds on: ${esc(i.builds)}</p>
      </li>`).join('');
    return `<h2>${area.name}</h2><p class="area-blurb">${area.blurb}</p><ul class="ideas">${cards}</ul>`;
  }).join('');
}
