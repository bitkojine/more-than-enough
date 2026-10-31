/* Exercise the real map toggle and pointer input with live HUD updates. */
export async function checkMapEquipment({ evalJS, waitFor, ok, cdp, session, tap, rect, shot }) {
  await evalJS('MTE_GAME.core.markExplored(MTE_GAME.getState().world,0,0,-1)');
  for (const [width, height] of [
    [320, 568],
    [568, 320],
    [1366, 768]
  ]) {
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: width < 1000 },
      session
    );
    await new Promise((r) => setTimeout(r, 200));
    await evalJS('document.getElementById("btnClose").click();MTE_GAME.setZoom(1)');
    let b = await rect('#btnMap');
    await tap(b.x, b.y);
    ok(
      await waitFor('MTE_GAME.mapOn()&&document.body.classList.contains("mapping")', 2500),
      'real world map opens with layer navigation at ' + width
    );
    const before = await evalJS(
      'JSON.stringify({player:MTE_GAME.getState().player,tools:MTE_GAME.getState().tools})'
    );
    b = await rect('#btnUpgrade');
    await tap(b.x, b.y);
    await new Promise((r) => setTimeout(r, 400));
    const opened = await evalJS(
      '!document.getElementById("equipmentTray").hidden&&MTE_GAME.hudLayout.open'
    );
    ok(opened, 'Equipment mini-menu stays open across live map HUD updates at ' + width);
    if (opened) {
      b = await rect('#btnEquipmentCraft');
      await tap(b.x, b.y);
    }
    ok(
      opened &&
        (await waitFor(
          'document.getElementById("sheet").classList.contains("open")&&document.getElementById("sheet").dataset.tab==="upgrades"&&!!document.querySelector("#sheetBody [data-id=pickaxe]")',
          1500
        )),
      'Craft opens the full Equipment menu from the map at ' + width
    );
    ok(
      await evalJS('MTE_GAME.mapOn()&&document.body.classList.contains("mapping")'),
      'Equipment leaves the map view active at ' + width
    );
    ok(
      (await evalJS(
        'JSON.stringify({player:MTE_GAME.getState().player,tools:MTE_GAME.getState().tools})'
      )) === before,
      'opening map Equipment does not move Mica or change equipment at ' + width
    );
    if (opened) await shot('map-equipment-' + width + '.png');
    await evalJS(
      'document.getElementById("btnClose").click();document.getElementById("btnMap").click()'
    );
    ok(
      await waitFor('!MTE_GAME.mapOn()&&!document.body.classList.contains("mapping")', 2500),
      'the map still closes normally at ' + width
    );
  }
}
