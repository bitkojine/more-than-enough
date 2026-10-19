/* The phone's own Back (Android's back button or gesture, a swipe in from
 * the edge, the browser's Back) steps back through the game's menus instead
 * of leaving the game. While a sheet or question is up, one history entry of
 * the game's own sits on top; going back takes it off, and `goBack` steps
 * back one level (a screen inside Settings to Settings, a sheet or question
 * closed). If something is still open, the entry goes back on. With nothing
 * open, Back leaves the game as usual. */

export function createBack({ isOpen, goBack, win = window }) {
  const ours = () => !!(win.history.state && win.history.state.mteMenu);
  win.addEventListener('popstate', () => {
    if (!ours() && isOpen()) goBack();
  });
  return {
    // Every frame: once something is open, our entry goes on top (once).
    tick() {
      if (isOpen() && !ours()) win.history.pushState({ mteMenu: true }, '');
    }
  };
}
