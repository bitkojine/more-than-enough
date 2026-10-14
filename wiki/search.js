/* Search: every place the wiki mentions what you typed, not just which
 * articles do. Each article is split into passages (paragraphs, list items,
 * table rows, headings); a passage matches when it holds every word of the
 * query. Results list each passage with its article and section, the words
 * marked, and link to that exact spot. Pictures count by their names, so
 * "mycelium" finds a cost shown as a mushroom icon. */

const CARD = '.thing, .idea'; // a card is one passage: its name with what it says
const PASSAGE = CARD + ', p, li, tbody tr, h2, h3, pre';  // i18n-ok: CSS selectors
const SNIP = 220; // characters of context shown per hit

import { t } from './strings.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const words = (q) => q.toLowerCase().split(/\s+/).filter((w) => w.length > 0);

// A passage's text, with pictures read as their names.
function textOf(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
  if (node.nodeName === 'IMG') return node.alt ? ' ' + node.alt + ' ' : '';
  if (node.nodeName === 'TR') return [...node.children].map(textOf).join(' · ');
  let out = '';
  for (const c of node.childNodes) out += textOf(c);
  return out;
}

// The passages of an article, in reading order: cards whole, otherwise only
// innermost ones, so a list item holding a paragraph counts once.
export function passages(article) {
  return [...article.querySelectorAll(PASSAGE)]
    .filter((el) => el.matches(CARD) || (!el.closest(CARD) && !el.querySelector(PASSAGE)));
}

// Every passage of every article that holds all the words.
export function find(articles, q) {
  const ws = words(q);
  if (!ws.length) return [];
  const groups = [];
  for (const a of articles) {
    let section = a.dataset.title;
    const hits = [];
    const list = passages(a);
    const clean = (el) => textOf(el).replace(/\s+/g, ' ').trim();
    list.forEach((el, n) => {
      const heading = el.matches('h2, h3');
      let text = clean(el);
      if (heading) section = text;
      const low = text.toLowerCase();
      if (!ws.every((w) => low.includes(w))) return;
      // A heading that matches: show what follows it, the explanation.
      if (heading && list[n + 1] && !list[n + 1].matches('h2, h3')) text += ': ' + clean(list[n + 1]);
      hits.push({ n, text, section: heading ? a.dataset.title : section });
    });
    if (a.dataset.title.toLowerCase().includes(ws.join(' ')) || hits.length) groups.push({ article: a, hits });
  }
  return groups;
}

// The text around the first match, with every word marked.
function snippet(text, ws) {
  const low = text.toLowerCase();
  const first = Math.min(...ws.map((w) => low.indexOf(w)).filter((i) => i >= 0));
  let from = 0, to = text.length;
  if (text.length > SNIP) {
    from = Math.max(0, first - 60);
    to = Math.min(text.length, from + SNIP);
    if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  }
  let out = esc(text.slice(from, to));
  const pattern = new RegExp('(' + ws.map((w) => esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  out = out.replace(pattern, '<mark>$1</mark>');
  return (from > 0 ? '…' : '') + out + (to < text.length ? '…' : '');
}

export function renderResults(groups, q) {
  const ws = words(q);
  const total = groups.reduce((n, g) => n + g.hits.length, 0);
  const head = `<h1>${t('wiki.search.head', { query: esc(q.trim()) })}</h1>`;
  if (!groups.length) return head + `<p class="lede">${t('wiki.search.none')}</p>`;
  const lede = `<p class="lede">${t('wiki.search.mentions', { count: total, articles: t('wiki.search.articles', { count: groups.length }) })}</p>`;
  return head + lede + groups.map((g) => `
    <section class="hit-group">
      <h2><a href="#${g.article.id}">${esc(g.article.dataset.title)}</a> <span class="hit-count">${g.hits.length}</span></h2>
      <ul class="hits">${g.hits.map((h) => `
        <li><a href="#${g.article.id}/${h.n}"><span class="where">${esc(h.section)}</span><span class="snip">${snippet(h.text, ws)}</span></a></li>`).join('')}
      </ul>
    </section>`).join('');
}

/* ------------------------------------------- marking words in an article */

export function unmark(root) {
  for (const m of root.querySelectorAll('mark.found')) {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  }
}

// Wraps every occurrence of the words in `root` in <mark class="found">.
export function mark(root, q) {
  const ws = words(q);
  if (!ws.length) return;
  const pattern = new RegExp(ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of text.matchAll(pattern)) {
      frag.append(text.slice(at, m.index));
      const el = document.createElement('mark');
      el.className = 'found';
      el.textContent = m[0];
      frag.append(el);
      at = m.index + m[0].length;
    }
    frag.append(text.slice(at));
    node.parentNode.replaceChild(frag, node);
  }
}
