/* Bounded presentation fixtures, not a gameplay/win claim. The real renderer
 * must draw subject pictures beside its words in both languages. */
export async function checkTimerIcons({ evalJS, waitFor, ok, cdp, session, shot }) {
  for (const lang of ['en', 'lt']) {
    await cdp.send(
      'Page.navigate',
      { url: await evalJS(`location.origin+location.pathname+'?lang=${lang}'`) },
      session
    );
    await waitFor('!!window.MTE_GAME', 15000);
    await evalJS(`(async()=>{
      const [{cargoClock,facilityClock,clockIcon},{drawClock}]=await Promise.all([import('./src/game/cargo-clock.js'),import('./src/game/render/cultivation.js')]);
      const C=MTE_GAME.core,s=MTE_GAME.getState();s.cultivation||=C.newCultivation();
      const c=s.cultivation;c.gear.carrier=true;c.gear.lantern=true;c.carrierWarmth=0;c.starter=null;c.heart={where:'station',health:100};
      s.time=C.DAY_LENGTH/2;C.earn(s,'crystal',8,'hand');c.quality=80;s.battery=.23;
      MTE_GAME.hud.update(s);MTE_GAME.hud.updateButtons(s);
      window.__timer={cargoClock,facilityClock,clockIcon,drawClock,texts:[],expected:cargoClock(s).text};
      const original=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){__timer.texts.push(String(text));if(__timer.texts.length>100)__timer.texts.shift();return original.call(this,text,...args);};
      __timer.original=original;
    })()`);
    ok(
      await waitFor('__timer.texts.includes(__timer.expected)', 8000),
      lang + ': real world renderer paints the explicit crystal-quality caption'
    );
    // A picture is decoded the first time it is asked for (look.js).
    await waitFor(
      "['heart','starter','crystal'].every(s=>MTE_GAME.look.bitmap(__timer.clockIcon(MTE_GAME.look,s),18))",
      5000
    );
    const assetCheck = await evalJS(`(()=>{
      const look=MTE_GAME.look,results={};
      for(const subject of ['heart','starter','crystal']){
        const pic=__timer.clockIcon(look,subject),bitmap=look.bitmap(pic,18),g=bitmap.getContext('2d');
        const pixels=g.getImageData(0,0,bitmap.width,bitmap.height).data;
        results[subject]=pixels.some((v,i)=>i%4===3&&v>0)&&bitmap===look.bitmap(__timer.clockIcon(look,subject),18);
      }
      return results;
    })()`);
    ok(
      Object.values(assetCheck).every(Boolean),
      lang +
        ': heart, colony and crystal use nonempty cached world pictures ' +
        JSON.stringify(assetCheck)
    );
    for (const [width, height] of [
      [320, 568],
      [568, 320],
      [1366, 768]
    ]) {
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { width, height, deviceScaleFactor: 2, mobile: width < 600 },
        session
      );
      await evalJS(
        'if(document.getElementById("equipmentTray").hidden)document.getElementById("btnUpgrade").click()'
      );
      ok(
        await waitFor(
          '(()=>{const img=document.querySelector("#battery img");return img&&img.naturalWidth>0&&!document.getElementById("equipmentTray").hidden;})()',
          5000
        ),
        `${lang}: lantern picture accompanies its timer at ${width}×${height}`
      );
      ok(
        await evalJS(
          '(()=>{const b=document.getElementById("battery"),r=b.getBoundingClientRect(),img=b.querySelector("img").getBoundingClientRect();return r.width>=img.width&&b.scrollWidth<=b.clientWidth+1&&r.left>=0&&r.right<=innerWidth;})()'
        ),
        `${lang}: lantern timer fits without horizontal clipping at ${width}×${height}`
      );
      ok(
        await evalJS(
          '!!document.querySelector("#sunTime svg circle")&&!!document.querySelector("#sunTime svg path")&&document.querySelector("#btnFlare img").naturalWidth>0'
        ),
        `${lang}: daylight and flare timers have recognizable subjects`
      );
      await shot(`timer-world-${lang}-${width}.png`);
    }
    const captionCheck = await evalJS(`(()=>{
      const {drawClock,clockIcon}=__timer,look=MTE_GAME.look,C=MTE_GAME.core,s=MTE_GAME.getState(),before=C.serialize(s);
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=120;const g=canvas.getContext('2d'),taken=[];
      const rows=[{icon:'heart',text:'1:20',tone:'warn'},{icon:'starter',text:'0:40',tone:'danger'},{icon:'crystal',text:__timer.expected,tone:'calm'}];
      rows.forEach((row,i)=>drawClock(g,look,{...row,x:160,y:20+i*38},taken));
      return {count:taken.length,bounds:taken.every(b=>b.l>=0&&b.r<=320&&b.t>=0&&b.b<=120),sameSave:before===C.serialize(s)};
    })()`);
    ok(
      captionCheck.count === 3 && captionCheck.bounds,
      lang + ': all three subject tags retain complete icon/text bounds'
    );
    ok(captionCheck.sameSave, lang + ': reading and drawing subject tags preserves the exact save');
    await evalJS('CanvasRenderingContext2D.prototype.fillText=__timer.original');
  }
}
