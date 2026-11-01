/* What each press does: taps and drags on the world (input.js hands them
 * over), the keyboard's commands, and the buttons around the screen. Where
 * each button sits is docs/ui.md's; what it does is decided here and done
 * by the part it belongs to.
 *
 * `p` holds the game's parts (see main.js); none is reached any other way,
 * so tests can press every control with stand-ins. */

// Whether screen point (x, y) is inside rectangle `r` ({x, y, w, h}).
export const inside = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// The handlers input.js calls.
export function inputHandlers(p) {
  const { cam, sheet, mapView, placing, card, controller, wiki, problems } = p;
  return {
    blocked: p.blocked,
    dismiss: () => sheet.close(),
    tap(x, y) {
      // On your sign: copy its link. Anywhere else: the world. The world
      // map is only for looking, except a teleport stop while you stand at
      // the woken machine (teleport-map.js).
      if (inside(p.signRect(), x, y)) return p.together.copyLink();
      if (mapView.on()) return void p.teleportMap?.tap(x, y);
      if (placing.tap(x, y)) return;
      const at = cam.unproject(x, y);
      problems.crumb(`map tap ${Math.floor(at.x)}, ${Math.floor(at.y)}, layer ${at.z}`); // i18n-ok: world coordinates in a developer report
      const opened = card.tap(x, y);
      if (opened === 'work') controller.work(Math.floor(at.x), Math.floor(at.y));
      else if (!opened) controller.tap(x, y);
    },
    // While placing, a finger on the ghost drags it.
    grab: (x, y) => !mapView.on() && placing.grab(x, y),
    grabMove: (x, y) => placing.drag(x, y),
    grabEnd: () => placing.drop(),
    // Zoomed out to the map, a drag pans it.
    pans: mapView.pans,
    pan: mapView.pan,
    zoomed: mapView.zoomed,
    // A finger held still on the map asks Wiki about what is under it.
    longPress: (x, y) => !mapView.on() && wiki.longPress(x, y),
    longPressMove: (x, y) => wiki.longPressMove(x, y),
    longPressEnd: () => wiki.longPressEnd(),
    actionPressed: controller.press,
    perfectPressed: p.autoPressed,
    perfectReleased: p.autoReleased,
    trailEnded: controller.trailEnded,
    viewChanged: () => {
      p.hud.view(cam);
      p.keepView();
      problems.crumb(`zoom ${cam.zoom.toFixed(2)}x`);
    },
    // A key's command (input.js KEYS).
    command(cmd) {
      if (cmd === 'perf') p.perf.toggle();
      else if (cmd === 'back') p.goBack();
      else if (cmd === 'lantern') p.lights.toggleLantern();
      else if (cmd === 'flare') p.lights.useFlare();
      else if (cmd === 'upgrades') p.hudLayout.toggle();
      else sheet.toggle(cmd);
    }
  };
}

// The buttons around the screen.
export function wireButtons(el, p) {
  const { sheet, mapView, perf } = p;
  const on = (button, fn) => button.addEventListener('click', fn);
  on(el.build, () => sheet.toggle('build'));
  on(el.depth, () => mapView.button());
  on(el.map, () => mapView.button());
  on(el.mapUp, () => mapView.layer(1));
  on(el.mapDown, () => mapView.layer(-1));
  on(el.awards, () => sheet.toggle('awards'));
  on(el.settings, () => sheet.toggle('settings'));
  on(el.versionBtn, () => sheet.toggle('news'));
  // A resource chip opens what it earns and spends.
  on(el.resources, (e) => {
    const chip = e.target.closest('.chip');
    if (chip) sheet.showStatement(chip.dataset.res || null);
  });
  on(el.mine, p.controller.toggleMine);
  on(el.worldsBtn, () => sheet.show('worlds'));
  on(el.invitesBtn, () => sheet.show('invites'));
  on(el.playersBtn, () => sheet.show('players'));
  on(el.devicesBtn, () => sheet.show('devices'));
  on(el.nerdsBtn, () => {
    p.problems.show();
    sheet.show('nerds');
  });
  on(el.perfBtn, () => perf.toggle());
  el.perf.addEventListener('perfdetails', () => {
    sheet.show('performance');
    perf.details();
  });
}

// Back (Escape, or the phone's own Back): a question says no, a placing or
// a card or the HUD layout closes, else the sheet steps back a screen.
export function goBack({ ask, placing, card, hudLayout, sheet }) {
  if (ask.open) ask.cancel();
  else if (placing.open) placing.cancel();
  else if (card.open) card.close();
  else if (hudLayout.open) hudLayout.close();
  else sheet.back();
}
