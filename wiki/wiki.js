/* The wiki reads its numbers straight from the game's core modules, so every
 * table and figure here matches the game that ships alongside it. */

import * as Core from '../src/core/index.js';
import { VERSION } from '../src/version.js';
import { renderIdeas } from './ideas.js';

const { T } = Core;
const icon = (res) => Core.RESOURCE_ICON[res];
const num = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 1000) / 1000));
const pct = (f) => Math.round(f * 100) + '%';

function costText(cost) {
  return Object.keys(cost).map((r) => num(cost[r]) + ' ' + icon(r)).join(' ');
}

function table(headers, rows, numeric = []) {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => '<tr>' + r.map((c, i) => `<td${numeric.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('') + '</tr>').join('');
  return `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* --------------------------------------------------------------- tiles */

const TILE_NAME = {
  [T.GRASS]: 'Grass', [T.FOREST]: 'Forest', [T.STONE]: 'Stone', [T.ORE]: 'Ore', [T.CRYSTAL]: 'Crystal',
  [T.WATER]: 'Water', [T.ROCK]: 'Mountain', [T.TUNNEL]: 'Tunnel', [T.SOIL]: 'Soil',
  [T.STONE_SEAM]: 'Stone seam', [T.ORE_SEAM]: 'Ore seam', [T.CRYSTAL_SEAM]: 'Crystal seam',
  [T.FOSSIL]: 'Fossil', [T.BEDROCK]: 'Bedrock', [T.SHAFT]: 'Shaft', [T.SHAFT_OPEN]: 'Open shaft'
};

function tileNotes(t) {
  const info = Core.TILE_INFO[t];
  const notes = [];
  if (info.swim) notes.push('Swimmable, at ' + pct(Core.SWIM_SPEED) + ' speed');
  else if (info.walk) notes.push('Walkable');
  else if (info.solid) notes.push('Solid until dug');
  else notes.push('Impassable');
  if (info.res) notes.push('yields ' + icon(info.res) + ' ' + Core.RESOURCE_LABEL[info.res]);
  if (info.regrows) notes.push('regrows');
  else if (info.harvest && !info.solid) notes.push('never regrows');
  if (info.land) notes.push('converters can stand here');
  if (info.descend) notes.push('drop to the layer below');
  if (t === T.SHAFT) notes.push('one dig opens it');
  if (t === T.BEDROCK) notes.push('cannot be dug');
  return notes.join(' · ');
}

const surfaceTiles = [T.GRASS, T.FOREST, T.STONE, T.ORE, T.CRYSTAL, T.WATER, T.ROCK];
const undergroundTiles = [T.SOIL, T.STONE_SEAM, T.ORE_SEAM, T.CRYSTAL_SEAM, T.FOSSIL, T.BEDROCK, T.SHAFT, T.SHAFT_OPEN, T.TUNNEL];

/* -------------------------------------------------------------- tables */

const TABLES = {
  surface: () => table(['Tile', 'Richness', 'Notes'], surfaceTiles.map((t) => {
    const d = Core.DEPOSIT[t];
    return [TILE_NAME[t], d ? `${d.base}–${d.base + d.spread}` : '—', tileNotes(t)];
  }), [1]),

  underground: () => table(['Tile', 'Notes'], undergroundTiles.map((t) => [TILE_NAME[t], tileNotes(t)])),

  geology: () => {
    let prev = 0;
    const rows = Core.GEOLOGY.map((g) => {
      const share = g.below - prev;
      prev = g.below;
      return [TILE_NAME[g.type], pct(share), g.from === 1 ? 'every layer' : `layer ${g.from} and deeper`];
    });
    rows.push([TILE_NAME[T.SOIL], pct(1 - prev) + ' + any band not yet unlocked', 'every layer']);
    return table(['Tile', 'Share of tiles', 'Found on'], rows, [1]);
  },

  tools: () => Object.keys(Core.TOOLS).map((id) => {
    const tool = Core.TOOLS[id];
    const rows = tool.levels.map((lv, i) => [i + 1, lv.yield !== undefined ? lv.yield + ' per swing' : '×' + lv.mult, lv.cost ? costText(lv.cost) : 'starting tool']);
    return `<h3>${tool.icon} ${tool.name}</h3><p>${tool.desc}.</p>` + table(['Level', 'Effect', 'Cost'], rows, [0, 1]);
  }).join(''),

  extractors: () => table(['Building', 'Stands on', 'Makes', 'Base rate', 'Holds', 'First one costs'],
    Core.DEPOSIT_EXTRACTORS.map((k) => {
      const e = Core.EXTRACTORS[k];
      return [`${e.icon} ${e.name}`, TILE_NAME[e.tile], icon(e.res), e.rate + '/s', e.buffer, costText(e.baseCost)];
    }), [3, 4]),

  converters: () => table(['Building', 'Needs', 'Makes', 'Base rate', 'Holds', 'First one costs'],
    Core.CONVERTERS.map((k) => {
      const e = Core.EXTRACTORS[k];
      return [`${e.icon} ${e.name}`, Core.UNLOCKS[e.unlock].name, icon(e.res), e.rate + '/s', e.buffer, costText(e.baseCost)];
    }), [3, 4]),

  unlocks: () => table(['Unlock', 'What it does', 'Cost'],
    Object.keys(Core.UNLOCKS).map((k) => {
      const u = Core.UNLOCKS[k];
      return [`${u.icon} ${u.name}`, u.desc, costText(u.cost)];
    })),

  abundance: () => table(['Level', 'Trickle', 'Production', 'Cost of this level'],
    [0, 1, 2, 3, 4, 5].map((lv) => [lv + 1, `+${lv + 1}/s each`, '×' + num(Math.pow(Core.ABUNDANCE.prodMult, lv + 1)),
      costText(Core.scaleCost(Core.ABUNDANCE.baseCost, Math.pow(Core.ABUNDANCE.growth, lv)))]), [0, 2]),

  refineries: () => Core.RESOURCES.map((res) => {
    const chain = Core.REFINERIES[res];
    let total = 1;
    const rows = chain.levels.map((lv, i) => {
      total *= lv.mult;
      return [i + 1, '×' + lv.mult, '×' + num(total), costText(lv.cost)];
    });
    return `<h3>${chain.icon} ${chain.name} ${icon(res)}</h3>` + table(['Level', 'Step', 'Total', 'Cost'], rows, [0, 1, 2]);
  }).join(''),

  perks: () => table(['Perk', 'What it does', 'Cost in Insight'],
    Object.keys(Core.PERKS).map((k) => {
      const p = Core.PERKS[k];
      return [`${p.icon} ${p.name}`, p.desc, p.repeat ? `${p.base}, then +1 per level owned` : `${p.base} (once)`];
    })),

  milestones: () => '<ol>' + Core.GOALS.map((g) => `<li>${g.text}</li>`).join('') + '</ol>'
};

// Single figures in prose: <span data-k="DAY_LENGTH"></span>, with optional
// data-f="pct". Dotted names reach into tables (ABUNDANCE.growth).
function constant(name) {
  return name.split('.').reduce((v, k) => v[k], Core);
}

function fill() {
  for (const node of document.querySelectorAll('[data-table]')) node.innerHTML = TABLES[node.dataset.table]();
  for (const node of document.querySelectorAll('[data-k]')) {
    const v = constant(node.dataset.k);
    node.textContent = node.dataset.f === 'pct' ? pct(v) : num(v);
  }
  for (const node of document.querySelectorAll('[data-ideas]')) node.innerHTML = renderIdeas();
  document.querySelector('.version').textContent = 'for game v' + VERSION;
}

/* ------------------------------------------------------------- routing */

const articles = [...document.querySelectorAll('article')];
const toc = document.getElementById('toc');
toc.innerHTML = articles.map((a) => `<li><a href="#${a.id}">${a.dataset.title}</a></li>`).join('');

function show() {
  const id = location.hash.slice(1);
  const current = articles.find((a) => a.id === id) || articles[0];
  for (const a of articles) a.hidden = a !== current;
  for (const link of toc.querySelectorAll('a')) {
    if (link.getAttribute('href') === '#' + current.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = (current === articles[0] ? '' : current.dataset.title + ' – ') + 'More Than Enough Wiki';
  window.scrollTo(0, 0);
}

// The search box filters the article list by title and text.
document.getElementById('search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  articles.forEach((a, i) => {
    const hit = !q || a.dataset.title.toLowerCase().includes(q) || a.textContent.toLowerCase().includes(q);
    toc.children[i].hidden = !hit;
  });
});

window.addEventListener('hashchange', show);
fill();
show();
