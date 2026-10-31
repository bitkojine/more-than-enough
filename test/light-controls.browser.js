/* Funded presentation/charging fixture, not a fresh-world win or fair bot run. */
export async function checkLightControls({ evalJS, waitFor, ok, cdp, session, tap, rect, shot }) {
  const tapControl = async (selector) => {
    const hit = await waitFor(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.hidden)return false;const r=e.getBoundingClientRect(),at=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&r.height>0&&!!at?.closest(${JSON.stringify(selector)});})()`,
      2000
    );
    ok(hit, 'light control has an unobstructed pointer target: ' + selector);
    if (hit) {
      const b = await rect(selector);
      await tap(b.x, b.y);
    }
  };
  await evalJS(
    'if(MTE_GAME.core.flareLit(MTE_GAME.getState()))document.getElementById("btnFlare").click()'
  );
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    session
  );
  await evalJS(`(()=>{
  const s=MTE_GAME.getState(),C=MTE_GAME.core;s.cultivation.completed=false;s.cultivation.gear.lantern=true;s.cultivation.lantern=false;s.flare=0;s.tools.boots=2;
  s.player.z=0;MTE_GAME.setPlayer(.5,-10.5);for(const r of C.RESOURCES)s.inv[r]=1000;
  window.__chargingSite=C.nearestTile(.5,-10.5,80,(x,y)=>C.tileAt(s.world,x,y,0)===C.T.WATER&&!s.world.props.has(C.packKey(x,y,0)));
 })()`);
  await evalJS(
    'document.getElementById("btnClose").click();document.getElementById("btnBuild").click()'
  );
  ok(
    await waitFor(
      '!!document.querySelector("#sheetBody [data-kind=prop][data-id=solar]")&&!!document.querySelector("#sheetBody [data-kind=prop][data-id=wheel]")',
      1500
    ),
    'unfinished new worlds offer both charging structures'
  );
  ok(
    await evalJS('document.querySelector("#sheetBody [data-id=solar]").disabled'),
    'a charger cannot be built remotely from dry land'
  );
  await evalJS('MTE_GAME.setPlayer(__chargingSite.x+.5,__chargingSite.y+.5)');
  // The progression fixture pauses animation frames; use the canonical engine
  // to refresh UI and advance charge, without simulating a long world.
  await evalJS(
    'MTE_GAME.playtest.ticks(20);document.getElementById("btnClose").click();document.getElementById("btnBuild").click()'
  );
  ok(
    await waitFor('!document.querySelector("#sheetBody [data-id=solar]").disabled', 1500),
    'standing on water enables canonical charger placement'
  );
  await evalJS('document.querySelector("#sheetBody [data-id=solar]").click()');
  ok(
    await evalJS(
      'MTE_GAME.getState().world.props.get(MTE_GAME.core.packKey(__chargingSite.x,__chargingSite.y,0))==="solar"'
    ),
    'Build constructs a real solar panel in the world'
  );
  await evalJS('const s=MTE_GAME.getState();s.battery=0;s.time=0;MTE_GAME.playtest.ticks(600)');
  ok(
    await evalJS('MTE_GAME.getState().battery>.99&&!MTE_GAME.getState().cultivation.completed'),
    'the restored charger fills an unfinished world’s lantern in ten game seconds'
  );
  await evalJS(
    'document.getElementById("btnClose").click();MTE_GAME.getState().cultivation.completed=true;MTE_GAME.playtest.present()'
  );
  await new Promise((r) => setTimeout(r, 350));
  await evalJS('document.getElementById("btnUpgrade").click()');
  ok(
    await waitFor('!document.getElementById("equipmentTray").hidden', 1500),
    'Equipment stays open for light switching'
  );
  for (const z of [0, -1, -2, -8]) {
    await evalJS(
      `(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core;s.player.z=${z};const x=Math.floor(s.player.x),y=Math.floor(s.player.y);C.tileAt(s.world,x,y,${z});if(${z}<0)s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.TUNNEL;C.markExplored(s.world,x,y,${z});s.cultivation.lantern=false;s.flare=0;MTE_GAME.playtest.ticks(1);MTE_GAME.playtest.present();})()`
    );
    ok(
      await evalJS(
        '!document.getElementById("btnFlare").hidden&&!document.getElementById("btnFlare").disabled'
      ),
      'flare control is available on layer ' + z
    );
    await tapControl('#btnLantern');
    ok(
      await evalJS('MTE_GAME.core.activeCarriedLight(MTE_GAME.getState())==="lantern"'),
      'lantern lights on layer ' + z
    );
    await tapControl('#btnFlare');
    ok(
      await evalJS(
        'MTE_GAME.core.activeCarriedLight(MTE_GAME.getState())==="flare"&&!MTE_GAME.getState().cultivation.lantern&&document.getElementById("btnLantern").getAttribute("aria-pressed")==="false"'
      ),
      'flare replaces lantern in simulation and controls on layer ' + z
    );
    await tapControl('#btnLantern');
    ok(
      await evalJS(
        'MTE_GAME.getState().flare===0&&MTE_GAME.getState().cultivation.lantern&&document.getElementById("btnFlare").getAttribute("aria-pressed")==="false"'
      ),
      'switching back extinguishes the flare on layer ' + z
    );
  }
  await shot('one-carried-light.png');
}
