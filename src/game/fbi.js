/* The "FBI" notice: a shared-world character the moderator froze because
 * its progress was hacked (server/src/room.js freeze). Every time the
 * player tries to use that character, this is all they get: a joke badge
 * from the Fair-play Bureau of Investigation (a parody, not the real
 * agency), word that we know, and one button back to their own world.
 * Escape and taps outside don't close it: the button does. */

export function createFbi(box) {
  const button = box.querySelector('button');
  let done = null;

  button.addEventListener('click', () => {
    box.hidden = true;
    const then = done;
    done = null;
    if (then) then();
  });

  return {
    get open() { return !box.hidden; },
    // Shows the notice; `then` runs when the player closes it.
    show(then = null) {
      done = then;
      box.hidden = false;
      button.focus({ preventScroll: true });
    }
  };
}
