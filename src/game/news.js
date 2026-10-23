/* What's new, without ever stopping play. The version is always on screen
 * (a small badge under the gear). When the game has updated itself
 * (src/game/update.js) or comes back on a newer version, the badge plays a
 * short animation from the old number to the new one and keeps a dot until
 * the player looks. Tapping it opens the changelog: every release's notes,
 * newest first, with the ones they haven't seen yet marked new.
 *
 * Every release adds its version to NEWS (newest first) and its notes to the
 * dictionaries as "news.<version>": what a player will notice, one thing per
 * line, in plain words. npm test fails when the current VERSION has none. */

import { t, addStrings } from '../i18n/i18n.js';

let history;
export function loadNews() {
  return history ||= import('./news-text.js').then(({ default: notes }) => addStrings(notes));
}

export const NEWS = [
  '0.135.0',
  '0.134.1',
  '0.134.0',
  '0.133.1',
  '0.133.0',
  '0.132.0',
  '0.131.8',
  '0.131.7',
  '0.131.6',
  '0.131.5',
  '0.131.4',
  '0.131.3',
  '0.131.2',
  '0.131.1',
  '0.131.0',
  '0.130.2',
  '0.130.1',
  '0.130.0',
  '0.129.0',
  '0.128.0',
  '0.127.2',
  '0.127.1',
  '0.127.0',
  '0.126.0',
  '0.125.0',
  '0.124.0',
  '0.123.0',
  '0.122.0',
  '0.121.2',
  '0.121.1',
  '0.121.0',
  '0.120.1',
  '0.120.0',
  '0.119.0',
  '0.118.0',
  '0.117.1',
  '0.117.0',
  '0.116.0',
  '0.115.0',
  '0.114.0',
  '0.113.1',
  '0.113.0',
  '0.112.0',
  '0.111.0',
  '0.110.1',
  '0.110.0',
  '0.109.0',
  '0.108.0',
  '0.107.0',
  '0.106.0',
  '0.105.1',
  '0.105.0',
  '0.104.1',
  '0.104.0',
  '0.103.2',
  '0.103.1',
  '0.103.0',
  '0.102.2',
  '0.102.1',
  '0.102.0',
  '0.101.2',
  '0.101.1',
  '0.101.0',
  '0.100.1',
  '0.100.0',
  '0.99.0',
  '0.98.0',
  '0.97.0',
  '0.96.0',
  '0.95.0',
  '0.94.0',
  '0.93.0',
  '0.92.0',
  '0.91.1',
  '0.91.0',
  '0.90.0',
  '0.89.0',
  '0.88.0',
  '0.87.0',
  '0.86.1',
  '0.86.0',
  '0.85.0',
  '0.84.0',
  '0.83.0',
  '0.82.2',
  '0.82.1',
  '0.82.0',
  '0.81.0',
  '0.80.2',
  '0.80.1',
  '0.80.0',
  '0.79.1',
  '0.79.0',
  '0.78.0',
  '0.77.1',
  '0.77.0',
  '0.76.0',
  '0.75.1',
  '0.75.0',
  '0.74.1',
  '0.74.0',
  '0.73.0',
  '0.72.2',
  '0.72.1',
  '0.72.0',
  '0.71.1',
  '0.71.0',
  '0.70.1',
  '0.70.0',
  '0.69.0',
  '0.68.0',
  '0.67.0',
  '0.66.0',
  '0.65.0',
  '0.64.0',
  '0.63.0',
  '0.62.0',
  '0.61.0',
  '0.60.2',
  '0.60.1',
  '0.60.0',
  '0.59.2',
  '0.59.1',
  '0.59.0',
  '0.58.0',
  '0.57.2',
  '0.57.1',
  '0.57.0',
  '0.56.1',
  '0.56.0',
  '0.55.0',
  '0.54.0'
];

// Where players share ideas with the developers.
export const IDEAS_URL = 'https://github.com/bitkojine/more-than-enough/issues';
// Every change in technical detail, for developers.
export const CHANGELOG_URL = 'https://github.com/bitkojine/more-than-enough/blob/main/CHANGELOG.md';

const RAN_STORE = 'mte.ranVersion';    // the version this browser last played
const SEEN_STORE = 'mte.newsSeen';     // the newest notes the player has looked at

// -1, 0 or 1, comparing two "major.minor.patch" versions.
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}

// The versions with notes after `from` up to `to`, newest first.
export function newsSince(from, to, news = NEWS) {
  return news.filter((v) => compareVersions(v, from) > 0 && compareVersions(v, to) <= 0);
}

const isVersion = (v) => typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v);
const read = (store, key) => { try { const v = store.getItem(key); return isVersion(v) ? v : null; } catch { return null; } };
const write = (store, key, v) => { try { store.setItem(key, v); } catch { /* storage off: shown again next time */ } };
// Some private modes throw on merely touching localStorage.
const localStore = () => { try { return globalThis.localStorage; } catch { return null; } };

/* Where this start stands: `from` is the older version just left behind
 * (null when the version didn't change, or on a first ever start), and
 * `seen` the newest notes already looked at. `updatedFrom` is what the
 * updater noted before reloading this tab; `ran` the version this browser
 * last played. A first ever start has nothing new: a new player isn't
 * handed a hundred releases. */
export function newsState({ version, updatedFrom = null, ran = null, seen = null }) {
  const before = [updatedFrom, ran].filter((v) => isVersion(v) && compareVersions(v, version) < 0)
    .sort(compareVersions)[0] || null;
  return { from: before, seen: isVersion(seen) ? seen : before || version };
}

export function createNews({ badge, panel, version, updatedFrom = null, store = localStore(), openIdeas = () => window.open(IDEAS_URL, '_blank', 'noopener') }) {
  const now = badge.querySelector('.now');
  const was = badge.querySelector('.was');
  const { from, seen: seenAtStart } = newsState({ version, updatedFrom, ran: read(store, RAN_STORE), seen: read(store, SEEN_STORE) });
  let seen = seenAtStart;
  write(store, RAN_STORE, version);
  write(store, SEEN_STORE, seen);

  now.textContent = 'v' + version;
  const unseen = () => newsSince(seen, version);
  function mark() {
    const fresh = unseen().length > 0;
    badge.classList.toggle('fresh', fresh);
    badge.setAttribute('aria-label', t(fresh ? 'news.badgeNew' : 'news.badge', { v: version }));
  }
  mark();

  // The old number rolls up and away, the new one rolls in and glows.
  function play() {
    if (!from) return;
    was.textContent = 'v' + from;
    badge.classList.remove('rolling');
    void badge.offsetWidth;  // restart the animation
    badge.classList.add('rolling');
  }
  badge.addEventListener('animationend', (e) => { if (e.animationName === 'ver-glow') badge.classList.remove('rolling'); });

  // The whole changelog, newest first; what's new since they last looked
  // is marked. Looking at it counts as seen.
  async function render() {
    await loadNews();
    const fresh = new Set(unseen());
    const ideas = document.createElement('button');
    ideas.type = 'button';
    ideas.className = 'setRow newsIdeas';  // i18n-ok: class names
    ideas.innerHTML = '<span></span><b aria-hidden="true">&#8599;</b>';
    ideas.firstChild.textContent = t('news.shareIdea');
    ideas.addEventListener('click', openIdeas);
    const sections = NEWS.filter((v) => compareVersions(v, version) <= 0).map((v) => {
      const section = document.createElement('section');
      if (fresh.has(v)) section.className = 'fresh';
      const head = document.createElement('h3');
      head.textContent = 'v' + v;
      if (v === version) head.append(' ', Object.assign(document.createElement('small'), { textContent: t('news.playing') }));
      if (fresh.has(v)) head.append(' ', Object.assign(document.createElement('em'), { textContent: t('news.new') }));
      const items = document.createElement('ul');
      items.append(...t('news.' + v).split('\n').map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }));
      section.append(head, items);
      return section;
    });
    const full = document.createElement('a');
    full.className = 'setRow newsFull';  // i18n-ok: class names
    full.href = CHANGELOG_URL;
    full.target = '_blank';
    full.rel = 'noopener';
    full.innerHTML = '<span></span><b aria-hidden="true">&#8599;</b>';
    full.firstChild.textContent = t('news.full');
    const group = (row) => Object.assign(document.createElement('div'), { className: 'setGroup' }).appendChild(row).parentNode;  // i18n-ok: a class name
    panel.replaceChildren(group(ideas), ...sections, group(full));
    panel.scrollTop = 0;
    seen = version;
    write(store, SEEN_STORE, seen);
    mark();
  }

  return { play, render, get fresh() { return unseen().length > 0; }, from };
}
