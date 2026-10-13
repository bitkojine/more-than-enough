/* The wiki reads its numbers straight from the game's core modules, so every
 * table and figure here matches the game that ships alongside it. */

import * as Core from '../src/core/index.js';
import { VERSION } from '../src/version.js';
import { renderIdeas } from './ideas.js';
import { loadDefaultPack, pic, colorOf, tierUrl, renderThings, wireDownload } from './textures.js';
import { find, renderResults, passages, mark, unmark } from './search.js';

const { T, TILE_NAME } = Core;
// Pictures come from the default texture pack.
const icon = (res) => pic(Core.resourceLook(res), 'icon', 'pic', Core.RESOURCE_LABEL[res]);
const tileName = (t) => pic(Core.tileLook(t), 'top') + ' ' + TILE_NAME[t];
const num = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 1000) / 1000));
const pct = (f) => Math.round(f * 100) + '%';

// A price: one pill per resource, picture first, so each amount clearly
// belongs to its resource.
function costText(cost) {
  return '<span class="cost">' + Object.keys(cost).map((r) =>
    `<span class="amt" style="--res:${colorOf(Core.resourceLook(r))}">${icon(r)}<span class="n">${num(cost[r])}</span></span>`).join('') + '</span>';
}

function table(headers, rows, numeric = []) {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.map((r) => '<tr>' + r.map((c, i) => `<td${numeric.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('') + '</tr>').join('');
  return `<div class="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* --------------------------------------------------------------- tiles */

function tileNotes(t) {
  const info = Core.TILE_INFO[t];
  const notes = [];
  if (info.swim) notes.push('Swimmable, at ' + pct(Core.SWIM_SPEED) + ' speed');
  else if (info.walk) notes.push('Walkable');
  else if (info.solid) notes.push('Solid until dug');
  else notes.push('Impassable');
  if (info.res) notes.push('yields ' + icon(info.res) + ' ' + Core.RESOURCE_LABEL[info.res]);
  else if (info.harvest && info.sweep !== false) notes.push('holds nothing: digging it only clears the way');
  if (info.regrows) notes.push('regrows');
  else if (info.harvest && !info.solid) notes.push('never regrows');
  if (info.land) notes.push('converters can stand here');
  if (t === T.HOME) notes.push('your stockpile is kept here');
  else if (info.yard !== undefined) notes.push('your stockpile spills onto it');
  if (info.descend) notes.push('drop to the layer below');
  if (t === T.SHAFT) notes.push('one dig opens it');
  if (info.find) notes.push('a find: glints in the dark, one dig pays its loot (see Finds)');
  if (t === T.BEDROCK) notes.push('cannot be dug');
  return notes.join(' · ');
}

const surfaceTiles = [T.HOME, T.GRASS, T.FOREST, T.STONE, T.ORE, T.CRYSTAL, T.WATER, T.ROCK];
const undergroundTiles = [T.SOIL, T.STONE_SEAM, T.ORE_SEAM, T.CRYSTAL_SEAM, T.FOSSIL, T.BEDROCK, T.CACHE, T.GEODE, T.SHAFT, T.SHAFT_OPEN, T.TUNNEL];

/* -------------------------------------------------------------- tables */

const TABLES = {
  surface: () => table(['Tile', 'Richness', 'Notes'], surfaceTiles.map((t) => {
    const d = Core.DEPOSIT[t];
    return [tileName(t), d ? `${d.base}–${d.base + d.spread}` : '—', tileNotes(t)];
  }), [1]),

  underground: () => table(['Tile', 'Notes'], undergroundTiles.map((t) => [tileName(t), tileNotes(t)])),

  geology: () => {
    let prev = 0;
    const rows = Core.GEOLOGY.map((g) => {
      const share = g.below - prev;
      prev = g.below;
      return [tileName(g.type), pct(share), g.from === 1 ? 'every layer' : `layer ${g.from} and deeper`];
    });
    rows.push([tileName(T.SOIL), pct(1 - prev) + ' + any band not yet unlocked', 'every layer']);
    return table(['Tile', 'Share of tiles', 'Found on'], rows, [1]);
  },

  props: () => table(['Thing', 'Cost', 'Light reach', 'What it does'],
    Object.keys(Core.PROPS).map((k) => {
      const p = Core.PROPS[k];
      return [`${pic('mark.' + k, 'image')} ${p.name}`, costText(p.cost), p.light || '—', p.does];
    }), [2]),

  finds: () => table(['Find', 'Loot on layer 1, per point of tool yield', 'Found on'],
    Object.keys(Core.FINDS).map((t) => {
      const f = Core.FINDS[t];
      return [tileName(+t), Object.keys(f.loot).map((r) => f.loot[r] + ' ' + icon(r)).join(' '), f.from === 1 ? 'every layer' : `layer ${f.from} and deeper`];
    })),

  tools: () => Object.keys(Core.TOOLS).map((id) => {
    const tool = Core.TOOLS[id];
    const rows = tool.levels.map((lv, i) => [i + 1, lv.yield !== undefined ? lv.yield + ' per swing' : '×' + lv.mult, lv.cost ? costText(lv.cost) : 'starting tool']);
    return `<h3>${pic('tool.' + id)} ${tool.name}</h3><p>${tool.desc}.</p>` + table(['Level', 'Effect', 'Cost'], rows, [0, 1]);
  }).join(''),

  extractors: () => table(['Building', 'Stands on', 'Makes', 'Base rate', 'Holds', 'First one costs'],
    Core.DEPOSIT_EXTRACTORS.map((k) => {
      const e = Core.EXTRACTORS[k];
      return [`${pic('building.' + k, 'image')} ${e.name}`, tileName(e.tile), icon(e.res), e.rate + '/s', e.buffer, costText(e.baseCost)];
    }), [3, 4]),

  converters: () => table(['Building', 'Needs', 'Makes', 'Base rate', 'Holds', 'First one costs'],
    Core.CONVERTERS.map((k) => {
      const e = Core.EXTRACTORS[k];
      return [`${pic('building.' + k, 'image')} ${e.name}`, Core.UNLOCKS[e.unlock].name, icon(e.res), e.rate + '/s', e.buffer, costText(e.baseCost)];
    }), [3, 4]),

  unlocks: () => table(['Unlock', 'What it does', 'Cost'],
    Object.keys(Core.UNLOCKS).map((k) => {
      const u = Core.UNLOCKS[k];
      return [`${pic('unlock.' + k)} ${u.name}`, u.desc, costText(u.cost)];
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
    return `<h3>${pic('refinery.' + res)} ${chain.name} ${icon(res)}</h3>` + table(['Level', 'Step', 'Total', 'Cost'], rows, [0, 1, 2]);
  }).join(''),

  perks: () => table(['Perk', 'What it does', 'Cost in Insight'],
    Object.keys(Core.PERKS).map((k) => {
      const p = Core.PERKS[k];
      return [`${pic('perk.' + k)} ${p.name}`, p.desc, p.repeat ? `${p.base}, then +1 per level owned` : `${p.base} (once)`];
    })),

  // One row per power of ten: the pile for each resource, and its footprint.
  piles: () => {
    const rows = [];
    for (let tier = 0; tier <= Core.SPAN_FROM + 2; tier++) {
      const span = Core.pileSpan(tier);
      rows.push([num(Math.pow(Core.PILE_BASE, tier)),
        ...Core.RESOURCES.map((r) => `<img class="pile" src="${tierUrl(r, tier)}" alt="${Core.RESOURCE_LABEL[r]}, ${num(Math.pow(10, tier))}" loading="lazy">`),
        span === 1 ? '1 tile' : `${span} × ${span} tiles`]);
    }
    return table(['Each pile is', ...Core.RESOURCES.map(icon), 'Ground'], rows, [0]);
  },

  milestones: () => '<ol>' + Core.GOALS.map((g) => `<li>${g.text}</li>`).join('') + '</ol>'
};

// Single figures in prose: <span data-k="DAY_LENGTH"></span>, with optional
// data-f="pct". Dotted names reach into tables (ABUNDANCE.growth).
function constant(name) {
  return name.split('.').reduce((v, k) => v[k], Core);
}

async function fill() {
  await loadDefaultPack();
  for (const node of document.querySelectorAll('[data-table]')) node.innerHTML = TABLES[node.dataset.table]();
  for (const node of document.querySelectorAll('[data-k]')) {
    const v = constant(node.dataset.k);
    node.textContent = node.dataset.f === 'pct' ? pct(v) : num(v);
  }
  for (const node of document.querySelectorAll('[data-ideas]')) node.innerHTML = renderIdeas();
  for (const node of document.querySelectorAll('[data-things]')) node.innerHTML = renderThings();
  for (const node of document.querySelectorAll('[data-download-pack]')) wireDownload(node);
  document.querySelector('.version').textContent = 'for game v' + VERSION;
}

/* ------------------------------------------------------------- routing */

// Addresses: #article, #article/n (the n-th passage of an article, from a
// search result) and #search/words.
const articles = [...document.querySelectorAll('article')];
const toc = document.getElementById('toc');
const results = document.getElementById('results');
const search = document.getElementById('search');
toc.innerHTML = articles.map((a) => `<li><a href="#${a.id}">${a.dataset.title}</a></li>`).join('');

function route() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith('search/')) return { query: hash.slice(7) };
  const [id, n] = hash.split('/');
  return { article: articles.find((a) => a.id === id) || articles[0], passage: n === undefined ? -1 : Number(n) };
}

function show() {
  const r = route();
  for (const a of articles) unmark(a);
  document.body.classList.toggle('searching', r.query !== undefined);
  if (r.query !== undefined) {
    if (search.value !== r.query) search.value = r.query;
    for (const a of articles) a.hidden = true;
    results.hidden = false;
    results.innerHTML = renderResults(find(articles, r.query), r.query);
    filterToc(r.query);
    document.title = 'Search – More Than Enough Wiki';
    return;
  }
  const current = r.article;
  results.hidden = true;
  for (const a of articles) a.hidden = a !== current;
  for (const link of toc.querySelectorAll('a')) {
    if (link.getAttribute('href') === '#' + current.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = (current === articles[0] ? '' : current.dataset.title + ' – ') + 'More Than Enough Wiki';
  // Came from a search: mark the words in the article and go to the spot.
  const spot = r.passage >= 0 && passages(current)[r.passage];
  if (spot) {
    if (search.value.trim()) mark(current, search.value);
    spot.classList.remove('flash');
    void spot.offsetWidth; // restart the flash
    spot.classList.add('flash');
    spot.scrollIntoView({ block: 'center' });
  } else {
    window.scrollTo(0, 0);
  }
}

// The article list shows only articles that mention the words.
function filterToc(q) {
  const hits = new Set(find(articles, q).map((g) => g.article));
  articles.forEach((a, i) => { toc.children[i].hidden = !!q.trim() && !hits.has(a); });
}

// Typing searches (the address follows, so Back returns to the results);
// clearing the box returns to the article list.
search.addEventListener('input', () => {
  const q = search.value;
  if (q.trim()) {
    const already = route().query !== undefined;
    history[already ? 'replaceState' : 'pushState'](null, '', '#search/' + encodeURIComponent(q));
  } else {
    filterToc('');
    history.replaceState(null, '', '#home');
  }
  show();
});

window.addEventListener('hashchange', show);
show();
// Fail loud: if the wiki can't fill itself in, say so at the top of the page.
fill().then(() => {
  document.body.dataset.filled = 'true';
  if (route().query !== undefined || route().passage >= 0) show(); // tables are in now
}, (err) => {
  document.querySelector('main').insertAdjacentHTML('afterbegin', `<div class="note error">The wiki couldn't load its tables: ${err.message}</div>`);
  throw err;
});
