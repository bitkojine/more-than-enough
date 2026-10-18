/* What's new: after the game updates itself (src/game/update.js), a card
 * thanks the player, says the game just updated, lists what each release
 * since their old version added, and asks for their ideas.
 *
 * Every release adds its version to NEWS (newest first) and its notes to the
 * dictionaries as "news.<version>": what a player will notice, one thing per
 * line, in plain words. npm test fails when the current VERSION has none. */

import { t } from '../i18n/i18n.js';

export const NEWS = [
  '0.120.0', '0.119.0', '0.118.0', '0.117.1', '0.117.0', '0.116.0', '0.115.0', '0.114.0', '0.113.1', '0.113.0', '0.112.0', '0.111.0', '0.110.1', '0.110.0', '0.109.0', '0.108.0', '0.107.0', '0.106.0', '0.105.1', '0.105.0', '0.104.1', '0.104.0', '0.103.2', '0.103.1', '0.103.0', '0.102.2', '0.102.1', '0.102.0', '0.101.2', '0.101.1', '0.101.0', '0.100.1', '0.100.0', '0.99.0', '0.98.0', '0.97.0', '0.96.0', '0.95.0', '0.94.0', '0.93.0', '0.92.0', '0.91.1', '0.91.0', '0.90.0', '0.89.0', '0.88.0', '0.87.0', '0.86.1', '0.86.0', '0.85.0', '0.84.0', '0.83.0', '0.82.2', '0.82.1', '0.82.0', '0.81.0', '0.80.2', '0.80.1', '0.80.0', '0.79.1', '0.79.0', '0.78.0', '0.77.1', '0.77.0', '0.76.0', '0.75.1', '0.75.0', '0.74.1', '0.74.0', '0.73.0', '0.72.2', '0.72.1', '0.72.0', '0.71.1', '0.71.0', '0.70.1', '0.70.0', '0.69.0', '0.68.0', '0.67.0', '0.66.0', '0.65.0', '0.64.0', '0.63.0', '0.62.0', '0.61.0', '0.60.2', '0.60.1', '0.60.0', '0.59.2',
  '0.59.1', '0.59.0', '0.58.0', '0.57.2', '0.57.1', '0.57.0', '0.56.1', '0.56.0', '0.55.0',
  '0.54.0'
];

// Where players share ideas with the developers.
export const IDEAS_URL = 'https://github.com/bitkojine/more-than-enough/issues';

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

export function createNews(box) {
  const title = box.querySelector('strong');
  const list = box.querySelector('.news');
  const [ideas, play] = box.querySelectorAll('button');
  const close = () => { box.hidden = true; };
  play.addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  window.addEventListener('keydown', (e) => {
    if (box.hidden || e.key !== 'Escape') return;  // i18n-ok: a key name
    e.stopImmediatePropagation();
    close();
  });
  ideas.addEventListener('click', () => window.open(IDEAS_URL, '_blank', 'noopener'));

  return {
    get open() { return !box.hidden; },
    // Shows what's new since `from`, if this is a newer version with notes.
    show(from, to) {
      const versions = from ? newsSince(from, to) : [];
      if (versions.length === 0) return false;
      title.textContent = t('news.title', { v: to });
      list.replaceChildren(...versions.map((v) => {
        const section = document.createElement('section');
        const head = document.createElement('h3');
        head.textContent = 'v' + v;
        const items = document.createElement('ul');
        items.append(...t('news.' + v).split('\n').map((line) => {
          const li = document.createElement('li');
          li.textContent = line;
          return li;
        }));
        section.append(head, items);
        return section;
      }));
      list.scrollTop = 0;
      box.hidden = false;
      play.focus({ preventScroll: true });
      return true;
    }
  };
}
