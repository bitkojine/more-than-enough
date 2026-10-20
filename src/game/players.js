/* Who's in a shared world, on screen: a chip per friend under the top bar,
 * as many as fit across the screen with a "+N" for the rest, and the
 * Players screen (Settings) listing everyone. src/game/together.js keeps
 * who they are; this draws them, from elements and text only, never HTML. */

import { t, distance } from '../i18n/i18n.js';

const MAX_CHIPS = 5;   // friends shown by name under the top bar, when they fit

/* ------------------------------------------------- chips under the top bar */

// `list`: friends to show, in order ({id, name, st, color}); `tap(id)` on a
// chip, `more()` on the "+N", which opens the Players screen.
export function renderChips(box, list, { tap, more }) {
  const chips = list.slice(0, MAX_CHIPS).map((f) => {
    const chip = button('', 'friend ' + f.st, () => tap(f.id));
    chip.style.setProperty('--friend', f.color);
    chip.setAttribute('aria-label', f.name + ', ' + t('together.state.' + f.st));
    const name = document.createElement('span');
    name.textContent = f.name;
    chip.append(document.createElement('i'), name);
    return chip;
  });
  const plus = button('', 'friend more', more); // i18n-ok: class names
  let rest = list.length - chips.length;
  const count = () => {
    plus.textContent = '+' + rest;
    plus.setAttribute('aria-label', t('together.more', { n: rest }));
  };
  box.replaceChildren(...chips);
  if (rest > 0) { count(); box.append(plus); }
  // On a narrow screen, fewer: the last chips fold into the "+N".
  while (chips.length && box.scrollWidth > box.clientWidth + 1) {
    chips.pop().remove();
    rest++;
    count();
    if (!plus.isConnected) box.append(plus);
  }
}

/* ------------------------------------------------- the Players screen */

// Everyone in the world, you first, then those awake, then those asleep,
// nearest first: their colour, name, how they're doing and how far away
// they are. `rows`: [{id, name, color, st, you, far, dz}] (far in
// tiles, dz layers up (+) or down (-), both null if not known).
export function renderPlayers(box, rows) {
  const head = document.createElement('p');
  head.className = 'count';
  head.textContent = t('players.count', { count: rows.length });
  box.replaceChildren(head, ...rows.map((p) => {
    const row = document.createElement('div');
    row.className = 'player ' + p.st + (p.you ? ' you' : '');
    row.style.setProperty('--friend', p.color);
    const text = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = p.name;
    if (p.you) {
      const tag = document.createElement('span');
      tag.textContent = t('players.you');
      name.append(' ', tag);
    }
    const sub = document.createElement('small');
    const where = [];
    if (!p.you && p.far !== null) where.push(distance(p.far));
    if (!p.you && p.dz) where.push(t(p.dz > 0 ? 'players.up' : 'players.down', { count: Math.abs(p.dz) }));
    sub.textContent = [t('together.state.' + p.st), ...where].join(' · ');
    text.append(name, sub);
    row.append(document.createElement('i'), text);
    return row;
  }));
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
