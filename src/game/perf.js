/* Opt-in diagnostics; bounded measurements and slow, independent HUD updates. */
import {t,addStrings} from '../i18n/i18n.js';
import en from '../i18n/perf/en.js';
import lt from '../i18n/perf/lt.js';
addStrings({en,lt});
import {VERSION} from '../version.js';
import {createPerfMonitor} from './perf-monitor.js';
const PREF='mte.performance.enabled'; // i18n-ok: local preference key.
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export function createPerf(el,canvas,audio,quality) {
  const monitor=createPerfMonitor();let refresh=0,tiles=0,logicMs=0,drawMs=0,context={},open=false,world=null;
  el.perf.replaceChildren();
  document.getElementById('perfWarning')?.remove();
  const pill=node('button','perfPill'),card=node('section','perfCard'),heading=node('strong'),summary=node('p'),graph=node('canvas','perfGraph');
  graph.width=280;graph.height=52;graph.setAttribute('role','img');
  const actions=node('div','perfActions'),inspect=node('button','',t('perf.inspect')),collapse=node('button','',t('perf.collapse'));
  actions.append(inspect,collapse);card.append(heading,summary,graph,actions);el.perf.append(pill);card.id='perfWarning';document.body.append(card);card.hidden=true;
  pill.type=inspect.type=collapse.type='button';
  pill.setAttribute('aria-controls','perfWarning');heading.id='perfWarningTitle';card.setAttribute('aria-labelledby',heading.id);
  const details=el.performanceDetails;details.replaceChildren();
  const intro=node('p','',t('perf.cpuNote')),copy=node('button','perfCopy',t('perf.copy')),body=node('div');details.append(intro,copy,body);
  const label=key=>t('perf.'+key),ms=n=>n.toFixed(2)+' ms';
  const perf={
    visible:false,
    frame(interval,logic,draw,drawn,meta={}) {
      tiles=drawn;logicMs=logic;drawMs=draw;context=meta.context||context;
      if(!perf.visible)return;
      if(world!==context.seed){world=context.seed;monitor.reset();}
      const issue=monitor.sample(interval,{simulation:meta.simulation||0,presentation:Math.max(0,logic-(meta.simulation||0)),...meta.phases},meta.target||60,context);
      if(issue){open=true;card.hidden=false;refresh=0;}
    },
    suspend(){monitor.reset();},
    snapshot(){const m=monitor.snapshot();return {...m,logicMs,drawMs,tiles,screen:`${innerWidth}×${innerHeight}`,canvas:`${canvas.width}×${canvas.height}`,quality:quality.level,dpr:devicePixelRatio||1,cores:navigator.hardwareConcurrency||null,memoryGb:navigator.deviceMemory||null,heapMb:performance.memory?performance.memory.usedJSHeapSize/1048576:null,sound:audio.state(),soundTrace:audio.trace(),context};},
    toggle(show=!perf.visible){perf.visible=show;el.perf.hidden=!show;el.perfState.textContent=t(show?'settings.on':'settings.off');el.perfBtn.setAttribute('aria-pressed',String(show));monitor.reset();open=false;card.hidden=true;refresh=0;try{localStorage.setItem(PREF,String(show));}catch{/* Optional diagnostics preference. */}},
    enabled(){try{return localStorage.getItem(PREF)==='true';}catch{return false;}},
    expand(){open=true;card.hidden=false;render();},
    collapse(){open=false;card.hidden=true;monitor.acknowledge();render();},
    details(){render();},
    tick(dt){if(!perf.visible||(refresh-=dt)>0)return;refresh=.25;const start=performance.now();render();perf.overheadMs=performance.now()-start;}
  };
  pill.addEventListener('click',()=>open?perf.collapse():perf.expand());
  collapse.addEventListener('click',()=>perf.collapse());
  inspect.addEventListener('click',()=>{perf.collapse();el.perf.dispatchEvent(new CustomEvent('perfdetails'));});
  copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify({version:VERSION,build:new URL(import.meta.url).searchParams.get('v')||null,at:new Date().toISOString(),userAgent:navigator.userAgent,measurement:'CPU timings; browser/GPU delays are not directly measured',...perf.snapshot()},null,2));copy.textContent=t('perf.copied');}catch{copy.textContent=t('perf.copyFailed');}}); // i18n-ok: machine-readable developer report.
  function render(){
    const m=perf.snapshot(),issue=m.latest,warning=issue?.warning;
    el.perf.dataset.grade=warning?'bad':issue?'ok':'good';pill.textContent=`${warning?'⚠ '+m.incidents.filter(i=>i.warning).length+' · ':''}${t('nerds.perf')} · FPS ${m.fps.toFixed(0)} / ${m.target}`;
    pill.setAttribute('aria-expanded',String(open));
    heading.textContent=t(warning?'perf.slow':issue?'perf.watch':'perf.healthy');
    summary.textContent=issue?`${label(issue.cause)} · ${ms(issue.cause==='unattributed'?Math.max(0,issue.frameMs-issue.cpuMs):issue.phases[0].ms)} · ${t('perf.target')} ${m.target} FPS`:t('perf.pacing',{n:m.target});
    graph.setAttribute('aria-label',t('perf.graph'));
    const g=graph.getContext('2d'),h=m.history,max=Math.max(m.budget*2,...h.map(x=>x.ms));g.clearRect(0,0,280,52);g.fillStyle='#90d37f';
    h.forEach((v,i)=>g.fillRect(i*280/60,52-v.ms/max*50,3,v.ms/max*50));g.strokeStyle='#f3c56a';g.beginPath();g.moveTo(0,52-m.budget/max*50);g.lineTo(280,52-m.budget/max*50);g.stroke();
    // The full sheet is live, but rebuilding its rows while closed is unnecessary.
    if(!details.closest('[hidden], [aria-hidden="true"]')){
      const frag=document.createDocumentFragment();
      const stats=node('dl','perfStats');
      const row=(key,value)=>{stats.append(node('dt','',label(key)),node('dd','',value));};
      row('frame',ms(m.frameMs));row('p95',ms(m.p95));row('worst',ms(m.worstMs));row('target',`${m.target} FPS · ${ms(m.budget)}`);
      row('tiles',String(tiles));row('screen',m.screen);row('canvas',`${m.canvas} · ${m.dpr}×`);row('quality',String(m.quality));row('diagnostics',ms(perf.overheadMs||0));if(m.cores)row('cores',String(m.cores));if(m.memoryGb)row('memory',m.memoryGb+' GB');row('sound',`${m.sound} · ${m.soundTrace.wakes}`);
      if(m.heapMb!==null)row('heap',m.heapMb.toFixed(1)+' MB');frag.append(stats,node('h3','',t('perf.breakdown')));
      for(const p of m.phases){const r=node('div','perfPhase');r.append(node('span','',label(p.key)),node('b','',ms(p.ms)),node('small','',`${t('perf.worst')} ${ms(p.worst)}`));r.style.setProperty('--cost',Math.min(100,p.ms/m.budget*100)+'%');frag.append(r);}
      frag.append(node('h3','',t('perf.context')),node('dl','perfStats'),node('h3','',t('perf.incidents')));
      const contextRows=frag.querySelectorAll('dl')[1];for(const [key,value] of Object.entries(context))contextRows.append(node('dt','',label(key)),node('dd','',typeof value==='number'?String(+value.toFixed(2)):typeof value==='boolean'?t(value?'settings.on':'settings.off'):String(value)));
      for(const e of [...m.incidents].reverse()){frag.append(node('p','perfIncident',`${e.warning?'⚠':'•'} ${new Date(e.at).toLocaleTimeString()} · ${label(e.cause)} · ${ms(e.frameMs)} · ${t('perf.worst')} ${ms(e.worstMs)} · ×${e.occurrences||1}`));}
      if(!m.incidents.length)frag.append(node('p','',t('perf.none')));body.replaceChildren(frag);
    }
  }
  return perf;
}
