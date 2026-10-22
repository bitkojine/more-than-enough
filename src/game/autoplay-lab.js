/* Live developer spectator: the real renderer observes the same AUTO session
 * used in headless evaluation. Only the host's rate of execution changes. */
import './autoplay-text.js';
import * as Core from '../core/index.js';
import { TICK_HZ } from '../engine/clock.js';
import { createAutoplaySession } from './autoplay-session.js';
import { openAutoplayStore } from './autoplay-store.js';
import { createCamera } from './camera.js';
import { createHud } from './hud.js';
import { createEffects } from './effects.js';
import { createYard } from './yard.js';
import { createActor } from './render/motion.js';
import { groundHeight } from './render/terrain.js';
import { render } from './render/renderer.js';
import { fmtDuration } from './format.js';
import { t } from '../i18n/i18n.js';
import { VERSION } from '../version.js';

export async function startAutoplayLab({ el, look }) {
  const style = document.createElement('link'); style.rel = 'stylesheet';
  const url = new URL('../../autoplay-lab.css', import.meta.url); url.search = new URL(import.meta.url).search;
  style.href = url.href;
  await new Promise((resolve, reject) => {
    style.onload = resolve; style.onerror = () => reject(new Error(t('lab.error'))); document.head.append(style);
  });
  document.body.classList.add('autoplay-lab');
  const panel = document.createElement('section');
  panel.id = 'autoplayLab';
  panel.setAttribute('aria-label', t('lab.title'));
  const heading = document.createElement('strong'); heading.textContent = t('lab.title');
  const status = document.createElement('p'); status.id = 'labStatus';
  const controls = document.createElement('div'); controls.className = 'labControls';
  const button = (id, key) => {
    const node = document.createElement('button'); node.id = id; node.type = 'button'; node.textContent = t(key); controls.append(node); return node;
  };
  const pause = button('labPause', 'lab.pause');
  const label = document.createElement('label'); label.textContent = t('lab.speed');
  const speed = document.createElement('select'); speed.id = 'labSpeed';
  for (const value of ['1', '100', '1000', '10000', 'max']) {
    const option = document.createElement('option'); option.value = value; option.textContent = value === 'max' ? t('lab.max') : value + '×'; speed.append(option);
  }
  speed.value = 'max'; label.append(speed); controls.append(label);
  const fresh = button('labFresh', 'lab.fresh');
  const download = button('labDownload', 'lab.download');
  const historyLabel = document.createElement('label'); historyLabel.textContent = t('lab.archive');
  const history = document.createElement('select'); history.id = 'labHistory'; historyLabel.append(history); controls.append(historyLabel);
  const back = document.createElement('a'); back.href = './'; back.textContent = t('lab.back'); controls.append(back);
  panel.append(heading, status, controls); document.body.append(panel);
  const cam = createCamera(el.canvas), hud = createHud(el, look);
  const fx = createEffects(look), yard = createYard({ fx, look }), actor = createActor();
  cam.maxDpr = 1; cam.setZoom(0.6);
  function resize() { cam.resize(); hud.view(cam); hud.fit(); }
  addEventListener('resize', resize); resize(); hud.repaint();
  let session = null, store, paused = true, won = false, reserved = 0, pending = 0;
  let last = 0, savedAt = 0, rateStart = 0, rateTicks = 0, measured = 0;
  let refused = 0, records = [], busy = false, failure = '';
  const record = () => ({ seed: session.state.seed, reserved, version: VERSION, driver: 'shipped AUTO', // i18n-ok: archive provenance, not UI text
    played: session.state.stats.playedMs / 1000, won, refused, saved: Date.now(), save: Core.serialize(session.state) });
  async function refreshHistory() {
    records = (await store.list()).sort((a,b) => b.reserved - a.reserved);
    history.replaceChildren();
    for (const r of records) {
      const o = document.createElement('option'); o.value = r.seed;
      o.textContent = `${r.seed} · ${fmtDuration(r.played || 0)}${r.won ? ' ✓' : ''}`; history.append(o);
    }
    if (session) history.value = String(session.state.seed);
  }
  async function save() {
    if (!session) return;
    try { savedAt = performance.now(); await store.save(record()); }
    catch (err) { paused = true; failure = t('lab.storageError'); console.error(err); }
  }
  async function newWorld() {
    if (busy) return;
    busy = true; paused = true;
    try {
      if (session) { await save(); if (failure) return; session.release(); }
      const seed = await store.reserve(); reserved = Date.now(); refused = 0;
      session = createAutoplaySession(seed, (_intent, result) => { if (result === false) refused++; });
      won = false; pending = 0; measured = 0; rateTicks = 0; rateStart = performance.now();
      cam.relief = (x,y) => groundHeight(session.state.world,x,y,cam.z);
      await save(); if (failure) return;
      await refreshHistory(); session.press(); paused = false;
    } catch (err) { failure = t('lab.storageError'); console.error(err); }
    finally { busy = false; }
  }
  pause.onclick = async () => {
    if (!session || won || failure || busy) return;
    paused = !paused; pending = 0;
    if (paused) { session.release(); await save(); } else session.press();
  };
  speed.onchange = () => { pending = 0; };
  fresh.onclick = newWorld;
  download.onclick = async () => {
    if (!session) return;
    const selected = history.value;
    await save(); await refreshHistory();
    const chosen = records.find(r => String(r.seed) === selected) || record();
    if (!chosen.save) return;
    const url = URL.createObjectURL(new Blob([chosen.save], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = `autoplay-${chosen.seed}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  document.addEventListener('visibilitychange', () => { pending = 0; last = 0; if (document.hidden) save(); });
  addEventListener('pagehide', () => save());
  try { store = await openAutoplayStore(); await newWorld(); }
  catch (err) { failure = t('lab.storageError'); console.error(err); }
  function frame(now) {
    try {
      const elapsed = last ? Math.min(0.1,(now-last)/1000) : 0;
      if (last && now-last < 33) { requestAnimationFrame(frame); return; }
      last = now;
      if (session && !paused && !won && !failure && !document.hidden) {
        if (speed.value !== 'max') pending += elapsed * Number(speed.value) * TICK_HZ;
        const deadline = performance.now()+20;
        let count = 0;
        do {
          const limit = speed.value === 'max' ? 900 : Math.floor(pending);
          if (limit < 1) break;
          const advanced = session.advanceChunk(limit); count += advanced;
          if (speed.value !== 'max') pending -= advanced;
          if (Core.canEmbark(session.state)) { won = true; paused = true; session.release(); save().then(refreshHistory); break; }
        } while (performance.now() < deadline);
        rateTicks += count;
        if (now-rateStart >= 500) { measured = rateTicks/TICK_HZ/((now-rateStart)/1000); rateTicks=0; rateStart=now; }
        if (now-savedAt > 3000) save();
      } else { pending=0; rateStart=now; rateTicks=0; }
      pause.textContent = t(paused ? 'lab.resume' : 'lab.pause'); pause.disabled = won || !!failure || busy;
      fresh.disabled = busy || !!failure; download.disabled = !session;
      if (session) {
        const s = session.state;
        hud.update(s); hud.updateButtons(s); hud.tick(elapsed); yard.update(s,elapsed);
        render(cam,s,fx,{facing:{x:0,y:1},moving:!paused,actor:actor.view(!paused),yard,
          harvestTarget:null,auto:paused?'':t('button.perfect'),buildTargets:[],trail:null,trailTargets:[],underground:Core.isUnderground(s),
          joy:{active:false},friends:[],graves:[],me:null,sign:0,device:'laptop'},look);
        status.textContent = failure || t('lab.status',{ seed:s.seed, time:fmtDuration(s.stats.playedMs/1000), speed:Math.round(measured),
          buildings:s.extractors.length, state:t(won?'lab.won':paused?'lab.paused':'lab.running') });
      } else status.textContent = failure;
    } catch (err) { paused=true; failure=t('lab.error'); status.textContent=failure; console.error(err); return; }
    requestAnimationFrame(frame);
  }
  // Read-only inspection for browser tests; no resource/position mutation API.
  window.MTE_LAB = { getState:()=>session?.state, get paused(){return paused;}, get won(){return won;}, get refused(){return refused;} };
  requestAnimationFrame(frame);
}
