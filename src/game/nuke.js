/* The nuke screen: when an update brings worlds this one can't have, a big
 * red button takes the middle of the screen. There's no closing it and no
 * other way on: press it, and the world is made again from scratch with
 * everything new. Alone that happens at once (main.js); in a shared world
 * once everyone has pressed it or had it pressed for them (together.js). */

export function createNuke(box) {
  const title = box.querySelector('strong');
  const [text, status] = box.querySelectorAll('p');
  const button = box.querySelector('button');
  const label = button.querySelector('b');
  let pressed = null; // what pressing does, while the screen is up
  let alone = false;  // it's the nuke for your own world, not a shared one

  button.addEventListener('click', () => { if (pressed) pressed(); });

  return {
    get open() { return !box.hidden; },
    get alone() { return alone; },
    // Puts the screen up (or updates it): its words, the button's label,
    // a status line, whether it's already pressed, and what pressing does.
    show({ heading, body, button: buttonLabel, line = '', done = false, press, alone: own = false }) {
      alone = own;
      title.textContent = heading;
      text.textContent = body;
      label.textContent = buttonLabel;
      status.textContent = line;
      status.hidden = !line;
      button.disabled = done;
      button.setAttribute('aria-pressed', String(done));
      pressed = press;
      if (box.hidden) {
        box.hidden = false;
        button.focus({ preventScroll: true });
      }
    },
    hide() {
      box.hidden = true;
      pressed = null;
    }
  };
}
