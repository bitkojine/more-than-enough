/* The wiki reads its numbers straight from the game's core modules, so every
 * table and figure here matches the game that ships alongside it. */

import * as Core from '../src/core/index.js';
import { VERSION } from '../src/version.js';
import { renderIdeas } from './ideas.js';
import { loadDefaultPack, pic, colorOf, tierUrl, renderThings, wireDownload } from './textures.js';
import { find, renderResults, passages, mark, unmark } from './search.js';
import { t, localizePage, setLanguage, nextLanguage, number, LOCALE } from './strings.js';

const { T, TILE_NAME } = Core;
// Pictures come from the default texture pack.
const icon = (res) => pic(Core.resourceLook(res), 'icon', 'pic', Core.RESOURCE_LABEL[res]);
const tileName = (type) => pic(Core.tileLook(type), 'top') + ' ' + TILE_NAME[type];
const num = (n) => number(Number.isInteger(n) ? n : Math.round(n * 1000) / 1000);
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

function tileNotes(type) {
  const info = Core.TILE_INFO[type];
  const notes = [];
  if (info.swim) notes.push(t('wiki.note.swim', { pct: pct(Core.SWIM_SPEED) }));
  else if (info.walk) notes.push(t('wiki.note.walk'));
  else if (info.solid) notes.push(t('wiki.note.solid'));
  else notes.push(t('wiki.note.impassable'));
  if (info.res) notes.push(t('wiki.note.yields', { res: icon(info.res) + ' ' + Core.RESOURCE_LOWER[info.res] }));
  else if (info.harvest && info.sweep !== false) notes.push(t('wiki.note.empty'));
  if (info.harvest && !info.solid) notes.push(t('wiki.note.neverRegrows'));
  if (info.land) notes.push(t('wiki.note.land'));
  if (type === T.HOME) notes.push(t('wiki.note.home'));
  if (info.descend) notes.push(t('wiki.note.descend'));
  if (info.rise) notes.push(t('wiki.note.rise'));
  if (type === T.SHAFT) notes.push(t('wiki.note.shaft'));
  if (info.find) notes.push(t('wiki.note.find'));
  if (type === T.BEDROCK) notes.push(t('wiki.note.bedrock'));
  return notes.join(' · ');
}

const surfaceTiles = [T.HOME, T.GRASS, T.FOREST, T.STONE, T.ORE, T.CRYSTAL, T.WATER, T.ROCK, T.WALL, T.HEDGE, T.CAVE];
const undergroundTiles = [T.SOIL, T.STONE_SEAM, T.ORE_SEAM, T.CRYSTAL_SEAM, T.SPORE_BED, T.BEDROCK, T.CACHE, T.GEODE, T.SHAFT, T.SHAFT_OPEN, T.RISE, T.TUNNEL];

// Table headings, by key.
const heads = (...keys) => keys.map((k) => t('wiki.col.' + k));
const fromLayer = (from) => (from === 1 ? t('wiki.everyLayer') : t('wiki.fromLayer', { layer: from }));

/* -------------------------------------------------------------- tables */

const TABLES = {
  surface: () => table(heads('tile', 'richness', 'notes'), surfaceTiles.map((type) => {
    const d = Core.DEPOSIT[type];
    const rich = (r, wealth) => Math.max(1, Math.min(30, Math.round(r * wealth)));
    return [tileName(type), d ? `${rich(d.base, Core.WEALTH.near)}–${rich(d.base + d.spread, Core.WEALTH.far)}` : '—', tileNotes(type)];
  }), [1]),

  underground: () => table(heads('tile', 'notes'), undergroundTiles.map((type) => [tileName(type), tileNotes(type)])),

  regions: () => table(heads('land', 'notes', 'music'), Core.BIOME_KEYS.map((b) =>
    [t('biome.' + b), t('wiki.biome.' + b), t('music.' + Core.BIOMES[b].music)])),

  geology: () => {
    const rows = Core.GEOLOGY.map((g) =>
      [tileName(g.type), g.deep === g.share ? pct(g.share) : `${pct(g.share)} → ${pct(g.deep)}`, fromLayer(g.from)]);
    const firstLayer = Core.GEOLOGY.reduce((sum, g) => sum + Core.geologyShare(g, 1), 0);
    rows.push([tileName(T.SOIL), t('wiki.soilShare', { pct: pct(1 - firstLayer) }), t('wiki.everyLayer')]);
    return table(heads('tile', 'share', 'foundOn'), rows, [1]);
  },

  mushrooms: () => {
    const common = (w) => t(w >= 4 ? 'wiki.common' : w >= 2 ? 'wiki.fairlyCommon' : w >= 1 ? 'wiki.uncommon' : 'wiki.rare');
    return table(heads('mushroom', 'grows', 'howCommon', 'whatItIs'), Core.MUSHROOM_KEYS.map((k) => {
      const m = Core.MUSHROOMS[k];
      const where = m.where === 'cave'
        ? (m.from > 1 ? t('wiki.sporeBedsFrom', { layer: m.from }) : t('wiki.sporeBeds'))
        : m.kinds.map((f) => Core.FOREST_KINDS[f].name.toLocaleLowerCase(LOCALE)).join(', ');
      return [`${pic(Core.mushroomLook(k), 'image')} ${m.name}${m.magic ? ' ✦' : ''}`, where, common(m.weight), m.does];
    }));
  },

  props: () => table(heads('thing', 'cost', 'light', 'whatItDoes'),
    Object.keys(Core.PROPS).filter((k) => Core.PROPS[k].on === 'tunnel').map((k) => {
      const p = Core.PROPS[k];
      return [`${pic('mark.' + k, 'image')} ${p.name}`, costText(p.cost), p.light ? num(p.light) : '—', p.does];
    }), [2]),

  waterPower: () => table(heads('thing', 'cost', 'whatItDoes'),
    Object.keys(Core.PROPS).filter((k) => Core.PROPS[k].charge).map((k) => {
      const p = Core.PROPS[k];
      return [`${pic('mark.' + k, 'image')} ${p.name}`, costText(p.cost), p.does];
    })),

  finds: () => table(heads('find', 'loot', 'foundOn'),
    Object.keys(Core.FINDS).map((type) => {
      const f = Core.FINDS[type];
      return [tileName(+type), Object.keys(f.loot).map((r) => f.loot[r] + ' ' + icon(r)).join(' '), fromLayer(f.from)];
    })),

  tools: () => Object.keys(Core.TOOLS).map((id) => {
    const tool = Core.TOOLS[id];
    const opens = (level) => Core.toolOpens(id, level).map((d) => t('door.' + d.id, { n: d.layer })).join(', ') || '—';
    const rows = tool.levels.map((lv, i) => [i + 1, lv.yield !== undefined ? t('wiki.perSwing', { n: lv.yield }) : '×' + num(lv.mult), opens(i + 1), lv.cost ? costText(lv.cost) : t('wiki.startingTool')]);
    return `<h3>${pic('tool.' + id)} ${tool.name}</h3><p>${t('sentence', { text: tool.desc })}</p>` + table(heads('level', 'effect', 'opens', 'cost'), rows, [0, 1]);
  }).join(''),

  extractors: () => table(heads('building', 'standsOn', 'makes', 'baseRate', 'holds', 'firstCosts'),
    Core.DEPOSIT_EXTRACTORS.map((k) => {
      const e = Core.EXTRACTORS[k];
      return [`${pic('building.' + k, 'image')} ${e.name}`, tileName(e.tile), icon(e.res), num(e.rate) + '/s', e.buffer, costText(e.baseCost)];
    }), [3, 4]),

  converters: () => table(heads('building', 'needs', 'makes', 'baseRate', 'holds', 'firstCosts'),
    Core.CONVERTERS.map((k) => {
      const e = Core.EXTRACTORS[k];
      return [`${pic('building.' + k, 'image')} ${e.name}`, Core.UNLOCKS[e.unlock].name, icon(e.res), num(e.rate) + '/s', e.buffer, costText(e.baseCost)];
    }), [3, 4]) + '<p>' + t('wiki.depotCollection') + '</p>' + table(heads('building', 'whatItDoes', 'firstCosts'), Core.SUPPORT_BUILDINGS.map(k => {
      const e = Core.EXTRACTORS[k];
      return [pic('building.' + k, 'image') + ' ' + e.name, Core.LOOK['building.' + k].does, costText(e.baseCost)];
    })),

  unlocks: () => table(heads('unlock', 'whatItDoes', 'cost'),
    Object.keys(Core.UNLOCKS).map((k) => {
      const u = Core.UNLOCKS[k];
      return [`${pic('unlock.' + k)} ${u.name}`, u.desc, costText(u.cost)];
    })),

  abundance: () => table(heads('level', 'trickle', 'production', 'levelCost'),
    [0, 1, 2, 3, 4, 5].map((lv) => [lv + 1, t('wiki.trickle', { n: lv + 1 }), '×' + num(Math.pow(Core.ABUNDANCE.prodMult, lv + 1)),
      costText(Core.scaleCost(Core.ABUNDANCE.baseCost, Math.pow(Core.ABUNDANCE.growth, lv)))]), [0, 2]),

  refineries: () => Core.RESOURCES.map((res) => {
    const chain = Core.REFINERIES[res];
    let total = 1;
    const rows = chain.levels.map((lv, i) => {
      total *= lv.mult;
      return [i + 1, '×' + lv.mult, '×' + num(total), costText(lv.cost)];
    });
    return `<h3>${pic('refinery.' + res)} ${chain.name} ${icon(res)}</h3>` + table(heads('level', 'step', 'total', 'cost'), rows, [0, 1, 2]);
  }).join(''),

  perks: () => table(heads('perk', 'whatItDoes', 'insightCost'),
    Object.keys(Core.PERKS).map((k) => {
      const p = Core.PERKS[k];
      return [`${pic('perk.' + k)} ${p.name}`, p.desc, p.retired ? '—' : p.repeat ? t('wiki.perkRepeat', { n: p.base }) : t('wiki.perkOnce', { n: p.base })];
    })),

  // One row per power of ten: the pile for each resource, and its footprint.
  piles: () => {
    const rows = [];
    for (let tier = 0; tier <= Core.SPAN_FROM + 5; tier++) { // up to 10^12, the top of the kingdom ladder
      const span = Core.pileSpan(tier);
      rows.push([num(Math.pow(Core.PILE_BASE, tier)),
        ...Core.RESOURCES.map((r) => `<img class="pile" src="${tierUrl(r, tier)}" alt="${Core.RESOURCE_LABEL[r]}, ${num(Math.pow(10, tier))}" loading="lazy">`),
        span === 1 ? t('wiki.oneTile') : t('wiki.tilesSquare', { n: span })]);
    }
    return table([t('wiki.col.pileIs'), ...Core.RESOURCES.map(icon), t('wiki.col.ground')], rows, [0]);
  },

  milestones: () => '<ol>' + Core.GOALS.map((g) => `<li>${g.text}</li>`).join('') + '</ol>'
};

// Single figures in prose: <span data-k="DAY_LENGTH"></span>, with optional
// data-f="pct". Dotted names reach into tables (ABUNDANCE.growth).
function constant(name) {
  return name.split('.').reduce((v, k) => v[k], Core);
}

TABLES.cultivation=()=>table(heads('thing','cost','whatItDoes'),[...['chamber','cooler','vault','conduit','lantern','carrier'].map(k=>[t('cr.'+k),costText(Core.CULTIVATION_RECIPES[k]),t('cr.'+k+'.desc')]),...Core.MACHINE_REPAIRS.map((cost,i)=>[t('cr.machine')+' · '+(i+1),costText(cost),t('cr.repair')])]);
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
  document.querySelector('.version').textContent = t('wiki.forVersion', { version: VERSION });
}

/* ------------------------------------------------------------- routing */

// Addresses: #article, #article/n (the n-th passage of an article, from a
// search result) and #search/words.
// Each article's words come from the dictionaries, in the reader's language.
const chapter=document.createElement('article');chapter.id='cultivation';document.querySelector('main').prepend(chapter);
const articles = [...document.querySelectorAll('article')];
for (const a of articles) {
  a.dataset.title = t(`wiki.article.${a.id}.title`);
  a.innerHTML = t(`wiki.article.${a.id}`);
  if(a.id!=='cultivation')a.insertAdjacentHTML('afterbegin',`<p class="note">${t('wiki.legacyRules')}</p>`);
}
localizePage();
document.getElementById('language').addEventListener('click', () => setLanguage(nextLanguage()));
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
    document.title = t('wiki.searchTitle');
    return;
  }
  const current = r.article;
  results.hidden = true;
  for (const a of articles) a.hidden = a !== current;
  for (const link of toc.querySelectorAll('a')) {
    if (link.getAttribute('href') === '#' + current.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = current === articles[0] ? t('wiki.title') : t('wiki.articleTitle', { article: current.dataset.title });
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
  const note = document.createElement('div');
  note.className = 'note error'; // i18n-ok: CSS classes
  note.textContent = t('wiki.loadFailed', { error: err.message });
  document.querySelector('main').prepend(note);
  throw err;
});
