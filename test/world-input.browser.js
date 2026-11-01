/* Controlled presentation/input fixtures, never fair-play or win evidence.
 * Keep pixel geometry separate from real pointer behavior: random terrain,
 * animated scenery and a previous test's Wiki line are not preconditions. */
export async function checkWorldInput({ evalJS, ok, cdp, session, tap, touch }) {
  // A bounded observation, not a fixed delay or a retry of the input. Broken
  // probe expressions propagate immediately; timeouts print the actual state.
  async function expectState(expression, label, budget = 2000) {
    const started = Date.now();
    let observed;
    do {
      observed = await evalJS(expression);
      if (observed.ready) {
        ok(true, label);
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (Date.now() - started < budget);
    ok(false, label + ' ' + JSON.stringify({ budget, observed }));
    return false;
  }
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false },
    session
  );
  await evalJS(`(()=>{
    const G=MTE_GAME,s=G.getState(),C=G.core;
    G.wiki.setMode('off');s.cultivation=null;s.extractors=[];s.tools.pickaxe=2;
    G.setZoom(1);G.setPlayer(.5,.5);s.player.z=0;
    window.__worldInput={
      terrain(z,wall){
        for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){
          C.tileAt(s.world,x,y,z);s.world.hotChunk.type[C.chunkIndex(x,y)]=z===0?C.T.GRASS:C.T.TUNNEL;
          C.markExplored(s.world,x,y,z);
        }
        C.tileAt(s.world,wall.x,wall.y,z);s.world.hotChunk.type[C.chunkIndex(wall.x,wall.y)]=z===0?C.T.STONE:C.T.SOIL;
        C.setRichness(s.world,wall.x,wall.y,z,1);s.player.z=z;G.setPlayer(.5,.5);
      },
      point(x,y){const z=s.player.z;return G.project(x+.5,y+.5,z+C.tileHeight(s.world,x,y,z));},
      snapshot(){return JSON.stringify({player:s.player,inv:s.inv});}
    };
    __worldInput.terrain(0,{x:1,y:0});
  })()`);
  const cameraReady =
    '(()=>{const G=MTE_GAME,p=G.getState().player,v=G.project(p.x,p.y,p.z);return {ready:Math.abs(v.x-innerWidth/2)<.1&&Math.abs(v.y-innerHeight/2)<.1,player:p,projected:v};})()';
  if (!(await expectState(cameraReady, 'controlled scene reaches the real camera'))) return;

  // Clear any earlier dialogue, then use real touch input. A previous line
  // cannot satisfy the assertion, and quiet mode prevents unsolicited speech.
  await evalJS("MTE_GAME.wiki.setMode('quiet')");
  const point = await evalJS('__worldInput.point(1,0)'),
    before = await evalJS('__worldInput.snapshot()');
  await touch('touchStart', [{ ...point, radiusX: 5, radiusY: 5, force: 1, id: 1 }]);
  const inspected = await expectState(
    '(()=>{const f=MTE_GAME.wiki.focus;return {ready:!!MTE_GAME.wiki.line&&f?.x===1&&f?.y===0&&f?.z===0,focus:f,line:MTE_GAME.wiki.line};})()',
    'long press inspects the exact known world tile',
    3000
  );
  await touch('touchEnd', []);
  if (!inspected) return;
  ok(before === (await evalJS('__worldInput.snapshot()')), 'inspection neither walks nor gathers');
  await evalJS("MTE_GAME.wiki.setMode('off')");

  // All four adjacent directions, not whichever wall a random seed happens
  // to supply. The camera/picker round trip is part of each assertion.
  for (const [x, y] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1]
  ]) {
    await evalJS('__worldInput.terrain(-1,' + JSON.stringify({ x, y }) + ')');
    if (!(await expectState(cameraReady, `mine camera is ready for wall ${x},${y}`))) return;
    const p = await evalJS(`__worldInput.point(${x},${y})`);
    ok(
      await evalJS(
        `(()=>{const w=MTE_GAME.unproject(${p.x},${p.y});return Math.floor(w.x)===${x}&&Math.floor(w.y)===${y};})()`
      ),
      `projection picks the actual wall ${x},${y}`
    );
    await tap(p.x, p.y);
    if (
      !(await expectState(
        `(()=>{const s=MTE_GAME.getState(),C=MTE_GAME.core,tile=C.tileAt(s.world,${x},${y},-1);return {ready:tile===C.T.TUNNEL,tile,player:s.player,canHarvest:C.canHarvest(s,${x},${y})};})()`,
        `a real tap digs the selected wall ${x},${y}`
      ))
    )
      return;
  }
  await checkOutline(evalJS, ok);
}

async function checkOutline(evalJS, ok) {
  // Component rendering uses a transparent, isolated canvas, known geometry
  // and explicit alpha. It never samples a changing game screenshot or
  // requires a particular number of exact RGB pixels on someone's GPU.
  const outline = await evalJS(`(async()=>{
    const {drawRing}=await import('./src/game/render/focus.js'),results=[];
    for(const dpr of [1,2])for(const tilePx of [24,48,96]){
      const c=document.createElement('canvas');c.width=c.height=256*dpr;
      const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);
      const cam={dpr,tilePx,depthPx:tilePx,risePx:tilePx/3};
      const alpha=(x,y)=>g.getImageData(x*dpr,y*dpr,1,1).data[3];
      const box={x:40,y:40,w:40,h:40},paint=(ctx)=>ctx.fillRect(40,40,40,40);
      drawRing(g,cam,box,'solid-fixture',paint,1);
      const hollow=alpha(60,60)===0,edge=alpha(39,60)>0,clear=alpha(10,10)===0;
      g.clearRect(0,0,256,256);
      drawRing(g,cam,{...box,x:120,y:100},'solid-fixture',(ctx)=>ctx.fillRect(120,100,40,40),1);
      const moved=alpha(119,120)>0&&alpha(139,120)===0&&alpha(39,60)===0;
      g.clearRect(0,0,256,256);drawRing(g,cam,box,'solid-fixture',paint,0);
      const hidden=alpha(39,60)===0;
      g.clearRect(0,0,256,256);drawRing(g,cam,box,'empty-fixture',()=>{},1);
      const empty=!g.getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v);
      results.push({dpr,tilePx,hollow,edge,clear,moved,hidden,empty});
    }
    return results;
  })()`);
  for (const sample of outline)
    ok(
      ['hollow', 'edge', 'clear', 'moved', 'hidden', 'empty'].every((key) => sample[key]),
      'isolated outline geometry, movement and negative controls ' + JSON.stringify(sample)
    );
}
