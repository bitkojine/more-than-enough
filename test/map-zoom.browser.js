/* One-hand zoom on the world map, as in Google Maps (Watch, 2026-10-31):
 * double tap, hold the second tap and drag down to zoom in, up to zoom out;
 * a plain double tap zooms in a step. Off the map a tap and a drag still
 * walk. Runs with the world map open (MTE_GAME.mapOn()). */
export async function checkMapZoom({ evalJS, waitFor, ok, touch, sleep }) {
  const finger = (x, y) => [{ x, y, radiusX: 5, radiusY: 5, force: 1, id: 1 }];
  const zoom = async () => Number(await evalJS('MTE_GAME.zoom()'));
  const player = () => evalJS('JSON.stringify(MTE_GAME.getState().player)');
  // A tap, then a second press there that drags by dy in steps.
  async function doubleTapDrag(x, y, dy) {
    await Promise.all([touch('touchStart', finger(x, y)), touch('touchEnd', [])]);
    await touch('touchStart', finger(x, y));
    for (let s = 1; s <= 8; s++) await touch('touchMove', finger(x, y + (dy * s) / 8));
    await touch('touchEnd', []);
    await sleep(100);
  }

  await sleep(800); // the map button's glide out has settled
  // A spot on the open map, clear of the HUD and the message log.
  const x = Math.round(await evalJS('innerWidth/2')),
    y = Math.round(await evalJS('innerHeight*0.3'));
  ok(
    await evalJS('document.elementFromPoint(' + x + ',' + y + ').id==="game"'),
    'the test spot is open map'
  );
  const you = await player();
  let was = await zoom();
  await doubleTapDrag(x, y, 80);
  let now = await zoom();
  ok(
    now / was > 1.7 && now / was < 2.3,
    'double tap and drag down 80 px zooms the map in about 2x (' + was + ' -> ' + now + ')'
  );
  was = now;
  await doubleTapDrag(x, y, -160);
  now = await zoom();
  ok(
    was / now > 3.4 && was / now < 4.6,
    'double tap and drag up 160 px zooms it out about 4x (' + was + ' -> ' + now + ')'
  );
  ok(await evalJS('MTE_GAME.mapOn()'), 'and it is still the map');
  ok((await player()) === you, 'one-hand zoom leaves you where you are');

  was = now;
  await Promise.all([touch('touchStart', finger(x, y)), touch('touchEnd', [])]);
  await Promise.all([touch('touchStart', finger(x + 2, y + 2)), touch('touchEnd', [])]);
  await sleep(100);
  now = await zoom();
  ok(Math.abs(now / was - 2) < 0.05, 'a plain double tap zooms the map in 2x');

  // Zoomed all the way out, dragging further up stays at the limit, and
  // turning back zooms in again at once.
  await evalJS('MTE_GAME.setZoom(0.0001)');
  const min = await zoom();
  await Promise.all([touch('touchStart', finger(x, y)), touch('touchEnd', [])]);
  await touch('touchStart', finger(x, y));
  for (let s = 1; s <= 8; s++) await touch('touchMove', finger(x, y - s * 15));
  ok((await zoom()) === min, 'dragging past the furthest zoom stays there');
  for (let s = 1; s <= 8; s++) await touch('touchMove', finger(x, y - 120 + s * 10));
  await touch('touchEnd', []);
  now = await zoom();
  ok(Math.abs(now / min - 2) < 0.1, 'and turning back zooms in at once (' + now / min + 'x)');

  // A tap, then a drag a while later, is a pan: no zoom.
  was = await zoom();
  await Promise.all([touch('touchStart', finger(x, y)), touch('touchEnd', [])]);
  await sleep(450);
  await touch('touchStart', finger(x, y));
  for (let s = 1; s <= 8; s++) await touch('touchMove', finger(x, y + s * 10));
  await touch('touchEnd', []);
  ok((await zoom()) === was, 'a tap and a drag later pans the map, without zooming');

  // Off the map a quick tap and drag still walks: no zoom there.
  await evalJS('MTE_GAME.setZoom(1)');
  await waitFor('!MTE_GAME.mapOn()', 2000);
  was = await zoom();
  await doubleTapDrag(x, y, 90);
  ok((await zoom()) === was, 'in the game a double tap and drag does not zoom');
}
