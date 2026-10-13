/* Two tabs, one save. When another tab has saved since this one last did,
 * this tab stops saving (so it can't overwrite that progress) and pauses,
 * and the player picks which world to keep: the other tab's or this one's.
 * The one further along is marked. */

import * as Core from '../core/index.js';
import { fmt, esc } from './format.js';

function played(seconds) {
  const m = Math.floor(seconds / 60);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}

function summary(s) {
  const parts = [played(s.time) + ' played', fmt(Core.lifetimeTotal(s)) + ' gathered'];
  if (s.prestiges > 0) parts.push(s.prestiges + (s.prestiges === 1 ? ' embark' : ' embarks'));
  return parts.join(' · ');
}

// Positive when a is further along than b.
function compare(a, b) {
  return (a.prestiges - b.prestiges) || (Core.lifetimeTotal(a) - Core.lifetimeTotal(b)) || (a.time - b.time);
}

export function createFork(box) {
  const body = box.querySelector('.choices');
  let open = false;

  // Shows the choice. `other` is the other tab's state, or null if this
  // version of the game can't read it (the other tab runs a newer one).
  // `keepOther` and `keepMine` are called with the player's pick.
  function show(mine, other, { keepOther, keepMine, reload }) {
    const otherAhead = other && compare(other, mine) > 0;
    const card = (id, title, text, ahead) => `
      <button type="button" data-pick="${id}" class="${ahead ? 'ahead' : ''}">
        <span class="title">${esc(title)}${ahead ? ' <em>further along</em>' : ''}</span>
        <span class="text">${esc(text)}</span>
      </button>`;
    body.innerHTML = other
      ? card('other', "The other tab's world", summary(other), otherAhead) + card('mine', "This tab's world", summary(mine), !otherAhead)
      : card('reload', 'Reload', 'The other tab saved with a newer version of the game.', true) + card('mine', "This tab's world", summary(mine), false);
    box.hidden = false;
    open = true;
    for (const b of body.querySelectorAll('button')) {
      b.addEventListener('click', () => {
        box.hidden = true;
        open = false;
        ({ other: keepOther, mine: keepMine, reload })[b.dataset.pick]();
      });
    }
  }

  return { show, get open() { return open; } };
}
