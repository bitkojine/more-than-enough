/* What the page tells the game: the screen changed size, the page is
 * leaving or hidden or back, the address changed (a friend's QR or a link
 * from your other device scanned while the game is open), the network came
 * back. Each is handed to the part it concerns.
 *
 * `p` holds the game's parts (see main.js). */

export function listenToPage(p, win = window, doc = document) {
  const { game, together, perf, quality, loop } = p;
  const sync = () => p.sync();
  win.addEventListener('resize', p.resize);
  win.addEventListener('orientationchange', () => setTimeout(p.resize, 120));
  win.visualViewport?.addEventListener('resize', p.resize);
  win.addEventListener('pagehide', () => {
    game.saveNow();
    sync()?.flush();
  });
  // A copy link opened over this tab: copies start before anything reads
  // storage (copy.js), so the page loads again for it.
  win.addEventListener('hashchange', () => {
    if (!p.copy && new URLSearchParams(win.location.hash.slice(1)).has('copy'))
      return win.location.reload();
    together.joinFromLink();
    p.syncing().linkFromHash();
  });
  // The network came back: reconnect to the shared world now.
  win.addEventListener('online', () => together.online());
  doc.addEventListener('visibilitychange', () => {
    perf.suspend();
    p.clock().reset();
    loop.resume();
    together.away(doc.hidden);
    quality.settle();
    if (doc.hidden) {
      game.saveNow();
      sync()?.flush();
    } else {
      p.checkFork();
      p.syncSoon();
    }
  });
  // Focus and coming back to the front come together: one check for both.
  win.addEventListener('focus', () => p.syncSoon());
}
