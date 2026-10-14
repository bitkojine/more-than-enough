/* The game's own yes-or-no question, for the few things that can't be
 * undone (Embark, the nuke): a title, what will happen, and two buttons,
 * the safe one first. Tapping outside the card or Escape says no. */

import { t } from '../i18n/i18n.js';

export function createAsk(box) {
  const title = box.querySelector('strong');
  const text = box.querySelector('p');
  const [no, yes] = box.querySelectorAll('button');
  let answer = null; // resolves the open question

  function close(result) {
    if (!answer) return;
    box.hidden = true;
    const done = answer;
    answer = null;
    done(result);
  }
  no.addEventListener('click', () => close(false));
  yes.addEventListener('click', () => close(true));
  box.addEventListener('click', (e) => { if (e.target === box) close(false); });
  // Escape answers this question and nothing else (it would close the sheet too).
  window.addEventListener('keydown', (e) => {
    if (!answer || e.key !== 'Escape') return;  // i18n-ok: a key name
    e.stopImmediatePropagation();
    close(false);
  });

  return {
    get open() { return !!answer; },
    // Resolves true if the player said yes. `danger` paints yes as destructive.
    ask({ title: heading, text: body, yes: label, danger = false }) {
      close(false);
      title.textContent = heading;
      text.textContent = body;
      no.textContent = t('ask.cancel');
      yes.textContent = label;
      yes.classList.toggle('danger', danger);
      box.hidden = false;
      // The keyboard starts on the safe answer when yes destroys something.
      (danger ? no : yes).focus();
      return new Promise((resolve) => { answer = resolve; });
    }
  };
}
