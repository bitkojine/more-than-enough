/* The game's own yes-or-no question, for the few things that can't be
 * undone (Embark, stopping an invite link): a title, what will happen, and two buttons,
 * the safe one first. Tapping outside the card or Escape says no. */

import { t } from '../i18n/i18n.js';

export function createAsk(box) {
  const title = box.querySelector('strong');
  const text = box.querySelector('p');
  const link = box.querySelector('a');
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
    // Says no, as Cancel does.
    cancel: () => close(false),
    // Resolves true if the player said yes. `danger` paints yes as destructive;
    // `link` ({href, text}) shows a link to read more (it opens a new tab).
    ask({ title: heading, text: body, yes: label, danger = false, link: more = null }) {
      close(false);
      title.textContent = heading;
      text.textContent = body;
      link.hidden = !more;
      if (more) { link.href = more.href; link.textContent = more.text + ' \u2197'; }
      no.textContent = t('ask.cancel');
      yes.textContent = label;
      yes.classList.toggle('danger', danger);
      box.hidden = false;
      // The keyboard starts on the safe answer when yes destroys something.
      (danger ? no : yes).focus({ preventScroll: true });
      return new Promise((resolve) => { answer = resolve; });
    }
  };
}
