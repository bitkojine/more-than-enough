/* Who's in a shared world, on screen: the person button at the end of the
 * zoom bar counts who is playing now and opens the Players screen, which
 * lists everyone. src/game/together.js keeps who they are; this draws them,
 * from elements and text only, never HTML. */

import { t, distance, number } from '../i18n/i18n.js';

// Everyone awake counts (online, away or out of touch), you too; sleepers
// show on the Players screen and lying in the world (Watch, 2026-11-08).
export const awakeCount = (chips) => 1 + chips.filter((f) => f.st !== 'offline').length;

/* ------------------------------------------------- the Players screen */

// Everyone in the world, you first, then those awake, then those asleep,
// nearest first: their colour, name, how they're doing and how far away
// they are. `rows`: [{id, name, color, st, you, bot, far, dz}] (far in
// tiles, dz layers up (+) or down (-), both null if not known).
export function renderPlayers(box, rows) {
  const head = document.createElement('p');
  head.className = 'count';
  head.textContent = t('players.count', { count: rows.length });
  box.replaceChildren(
    head,
    ...rows.map((p) => {
      const row = document.createElement('div');
      row.className = 'player ' + p.st + (p.you ? ' you' : '');
      row.style.setProperty('--friend', p.color);
      const text = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = p.name;
      // You, or one of the room's company bots (0.206.0): a small tag after the name.
      if (p.you || p.bot) {
        const tag = document.createElement('span');
        tag.textContent = t(p.you ? 'players.you' : 'players.bot');
        name.append(' ', tag);
      }
      const sub = document.createElement('small');
      const where = [];
      if (!p.you && p.far !== null) where.push(distance(p.far));
      if (!p.you && p.dz)
        where.push(t(p.dz > 0 ? 'players.up' : 'players.down', { count: Math.abs(p.dz) }));
      sub.textContent = [t('together.state.' + p.st), ...where].join(' · ');
      text.append(name, sub);
      row.append(document.createElement('i'), text);
      return row;
    })
  );
}

/* ------------------------------------------------ friends, kept on screen */

// The person button and the Players screen kept in step with `friends`
// (friends.js). `shared()`: whether you're in a shared world; `at()`: where
// you stand. The button itself opens Players (wired in together.js).
export function createFriendsHud({ el, friends, shared, at }) {
  let shown = ''; // what the button shows, to redraw only on a change

  // The Players screen: everyone in the world.
  const list = () => renderPlayers(el.playersPanel, friends.rows(at()));

  function render() {
    if (!el.playersPanel.hidden) list();
    el.playersCount.textContent = number(friends.size + 1);
    const n = shared() ? awakeCount(friends.chips()) : 0;
    const key = String(n);
    if (key === shown) return;
    shown = key;
    el.people.hidden = !n;
    el.zoomControls.classList.toggle('social', n > 0);
    el.peopleCount.textContent = number(n);
    el.people.setAttribute('aria-label', t('players.title') + ': ' + t('players.awake', { n }));
  }

  return { render, list };
}
