/* Bounded presentation-only fixtures. No whole-world simulation or gameplay
 * win claims. Resource-work limits are deterministic; timings are also saved. */
import fs from 'node:fs';
import path from 'node:path';
// A fixed biome-boundary world, independent of random startup terrain and discovery.
export async function runRenderPerformance({ evalJS, ok, cdp, session, shotDir }) {
  const seed = Number(process.env.MTE_RENDER_PERF_SEED || 33);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('MTE_RENDER_PERF_SEED must be an unsigned 32-bit integer');
  await evalJS(`(async()=>{
  const [{createCamera},{render},{drawTerrain}]=await Promise.all([import('./src/game/camera.js'),import('./src/game/render/renderer.js'),import('./src/game/render/terrain.js')]);await MTE_GAME.look.rigReady;
  const C=MTE_GAME.core,s=C.createState(${seed},{cultivation:true});s.extractors=[];s.world.props.clear();s.world.holes.clear();s.cultivation.facilities=[];s.cultivation.lantern=false;s.flare=0;
  for(const z of [0,-1,-4,-512])for(let y=-12;y<=12;y++)for(let x=-12;x<=12;x++){C.tileAt(s.world,x,y,z);const i=C.chunkIndex(x,y);s.world.hotChunk.type[i]=z===0?C.T.FOREST:C.T.TUNNEL;s.world.hotChunk.rich[i]=30;C.markExplored(s.world,x,y,z);if(z<0&&(x+y)%7===0)s.world.props.set(C.packKey(x,y,z),'glowcap');}
  for(const z of [0,-1,-4,-512])for(const x of [-4,0,4])for(const y of [-4,0,4])s.cultivation.facilities.push({id:100+s.cultivation.facilities.length,kind:z===0?'shelter':['chamber','cooler','vault'][Math.abs(x+y)%3],x,y,z,temperature:18,buffer:0,quality:100,health:100,reinforced:true});
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),cam=createCamera(canvas);
  const fx={particles:[],floats:[],flyers:[],shake:()=>0},view={facing:{x:0,y:1},moving:false,actor:{act:null,t:0,clock:0,rigStride:0,walkBlend:0},yard:{piles:new Map(),covered:new Set(),merging:()=>[]},sign:0,joy:{active:false},friends:[],graves:[],buildTargets:[],trailTargets:[]};
  const width=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width'),draw=CanvasRenderingContext2D.prototype.drawImage;let work=null;
  Object.defineProperty(HTMLCanvasElement.prototype,'width',{...width,set(v){if(work){work.resizes++;if(work.resizeSites.length<2)work.resizeSites.push({width:v,stack:new Error().stack.slice(0,500)});}return width.set.call(this,v);}});
  CanvasRenderingContext2D.prototype.drawImage=function(...args){if(work&&args[0] instanceof HTMLCanvasElement){work.copies++;}return draw.apply(this,args);};
  window.__renderPerformance={s,cam,ctx,view,fx,render,drawTerrain,C,
   size(w,h,dpr){Object.assign(cam,{width:w,height:h,baseTilePx:48,dpr});canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);},
   sample(z,time,zoom,moving=false){s.player={x:.5,y:.5,z};s.time=time;cam.setZoom(zoom);render(cam,s,fx,view,MTE_GAME.look);ctx.getImageData(0,0,1,1);
    // Warm the exact trajectory: its first visit may legitimately create
    // different light-bucket pictures. drift() separately budgets cold work.
    for(let i=0;i<2;i++){if(moving){s.player.x+=.07;s.player.y+=.03;}render(cam,s,fx,view,MTE_GAME.look);ctx.getImageData(0,0,1,1);}
    s.player.x=.5;s.player.y=.5;
    const before=MTE_GAME.look.lightingWork();work={resizes:0,copies:0,resizeSites:[]};const start=performance.now();for(let i=0;i<2;i++){if(moving){s.player.x+=.07;s.player.y+=.03;}render(cam,s,fx,view,MTE_GAME.look);ctx.getImageData(0,0,1,1);}const result={seed:s.world.seed,z,time,zoom,moving,ms:(performance.now()-start)/2,...work};work=null;const after=MTE_GAME.look.lightingWork();return {...result,...after,tintBuilds:after.tintBuilds-before.tintBuilds};},
   drift(){s.player={x:.5,y:.5,z:0};cam.setZoom(1);const rows=[];for(let i=0;i<12;i++){s.time=62+i*2;s.player.x+=.03;const before=MTE_GAME.look.lightingWork();work={resizes:0,copies:0,resizeSites:[]};const start=performance.now();render(cam,s,fx,view,MTE_GAME.look);ctx.getImageData(0,0,1,1);const row={time:s.time,ms:performance.now()-start,...work,tints:MTE_GAME.look.lightingWork().tintBuilds-before.tintBuilds};work=null;rows.push(row);}return rows;}
  };
 })()`);
  const rows = [];
  for (const [label, w, h, dpr, zooms] of [
    ['phone', 430, 700, 2, [0.75, 3.9]],
    ['desktop', 1280, 720, 1, [1]]
  ]) {
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: dpr, mobile: label === 'phone' },
      session
    );
    await evalJS('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await evalJS(`__renderPerformance.size(${w},${h},${dpr})`);
    for (const z of [0, -1, -4, -512])
      for (const time of z === 0 ? [0, 60, 72, 84, 120, 156, 168, 180] : [0, 72, 120, 180])
        for (const zoom of zooms) {
          const row = {
            label,
            ...(await evalJS(`__renderPerformance.sample(${z},${time},${zoom},true)`))
          };
          rows.push(row);
          ok(
            row.resizes <= 8,
            `${label} z=${z} time=${time} zoom=${zoom}: warm drawing avoids per-object canvas resize (${row.resizes}; ${row.ms.toFixed(1)} ms/frame; seed ${row.seed}; ${JSON.stringify(row.resizeSites)})`
          );
          ok(
            row.tintPixels <= 8 * 1024 * 1024 && row.tintEntries <= 128,
            'shaded-art cache stays within its pixel and entry budget'
          );
          if (label === 'phone' && z === 0)
            ok(
              row.copies <= (zoom < 1 ? 2200 : 300),
              `phone surface zoom=${zoom}: scenery outside the viewport avoids image submissions (${row.copies} over two frames)`
            );
        }
  }
  // Exercise the changing fade, not only frozen noon/midnight screenshots.
  const drift = await evalJS('__renderPerformance.drift()');
  ok(
    drift.every((r) => r.resizes <= 64 && r.tints <= 64),
    'changing sunset allocates by distinct artwork, not by every object'
  );
  // Every supported layer gets projected terrain at noon, dusk, midnight and
  // dawn. Tiny sealed fixtures keep this exhaustive depth sweep inexpensive.
  const layers = [];
  for (let first = 0; first >= -512; first -= 32) {
    const last = Math.max(-512, first - 31);
    const r =
      await evalJS(`(()=>{const {C,drawTerrain}=__renderPerformance,s=C.createState(919),c=document.createElement('canvas');c.width=96;c.height=96;const g=c.getContext('2d'),times=[0,72,120,180],ground={built:new Set(),yard:{piles:new Map(),covered:new Set()},shake:()=>0};let count=0;
   for(let z=${first};z>=${last};z--){for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++){C.tileAt(s.world,x,y,z);const i=C.chunkIndex(x,y);s.world.hotChunk.type[i]=z===0?C.T.GRASS:C.T.SOIL;s.world.hotChunk.rich[i]=1;C.markExplored(s.world,x,y,z);}s.player={x:20,y:20,z};
    const cam={width:96,height:96,z,tilePx:24,depthPx:23,risePx:8,visibleTiles:()=>({x0:-1,x1:1,y0:-1,y1:1}),project:(x,y,h=z)=>({x:36+x*24,y:36+y*23-(h-z)*8})};for(const time of times){s.time=time;drawTerrain(g,cam,s,MTE_GAME.look,ground);count++;}}
   g.getImageData(0,0,1,1);return count;})()`);
    layers.push(r);
  }
  ok(
    layers.reduce((a, b) => a + b, 0) === 513 * 4,
    'all 513 supported surface/underground depths render across four day phases'
  );
  ok(
    rows.every((r) => r.ms < 1000) && drift.every((r) => r.ms < 1500),
    'bounded scenes avoid multi-second frame stalls'
  );
  fs.writeFileSync(
    path.join(shotDir, 'render-performance.json'),
    JSON.stringify(
      { seed, rows, drift, depthPhaseChecks: layers.reduce((a, b) => a + b, 0) },
      null,
      2
    )
  );
}
