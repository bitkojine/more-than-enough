/* One delegated, read-only inspection layer. Catalog text is shared with the
 * wiki/content tables; unexplored world cells are rejected before any lookup. */
import * as Core from '../core/index.js';
import {t} from '../i18n/i18n.js';

export function describeLook(id){
 const item=Core.LOOK[id];if(!item)return null;
 const resource=id.startsWith('resource.')&&Core.RESOURCES.includes(item.key);
 return {name:item.name,description:resource?t('help.resource.'+item.key):item.does};
}
export function describeWorld(s,x,y,z){
 if(!Core.isExplored(s.world,x,y,z))return null;
 const facility=Core.cultivationAt(s,x,y,z),building=Core.extractorAt(s,x,y,z);
 if(facility||building)return describeLook(facility?Core.CULTIVATION_LOOK[facility.kind]:'building.'+building.key);
 // Ground only speaks up when there is something to it: a deposit with some
 // left, a find, or a way between layers. Plain ground and dug tunnels stay quiet.
 const type=Core.tileAt(s.world,x,y,z),info=Core.TILE_INFO[type],hint=Core.tileHint(type);
 if(!hint||info.harvest&&Core.richness(s.world,x,y,z)<=0)return null;
 const gear=Core.gearFor(s,x,y,z),short=gear&&(s.tools[gear.tool]||0)<gear.level;
 return {name:Core.TILE_NAME[type],description:short?hint+' '+t('tileDoes.needs',{tool:Core.TOOLS[gear.tool].name,lv:gear.level}):hint};
}
export function createTooltips({canvas,cam,state}){
 const box=document.createElement('div');box.id='inspectTooltip';box.role='tooltip';box.hidden=true;
 const name=document.createElement('strong'),description=document.createElement('span');box.append(name,description);document.body.append(box);
 let timer=0,anchor=null,previousDescription=null,lastKey='',usingTouch=false;
 function hide(){clearTimeout(timer);timer=0;box.hidden=true;lastKey='';if(anchor){if(previousDescription===null)anchor.removeAttribute('aria-describedby');else anchor.setAttribute('aria-describedby',previousDescription);}anchor=null;}
 function position(x,y){const r=box.getBoundingClientRect();box.style.left=Math.max(8,Math.min(innerWidth-r.width-8,x+14))+'px';box.style.top=Math.max(8,Math.min(innerHeight-r.height-8,y+18))+'px';}
 function show(info,x,y,target){if(!info)return;name.textContent=info.name;description.textContent=info.description||'';box.hidden=false;position(x,y);if(target){anchor=target;previousDescription=target.getAttribute('aria-describedby');target.setAttribute('aria-describedby',[previousDescription,box.id].filter(Boolean).join(' '));}}
 function uiInfo(target){
  const picture=target.closest('[data-help], [data-look]')||target.closest('button, a, [role="button"]')?.querySelector('[data-help], [data-look]');
  const id=picture?.dataset.help||picture?.dataset.look;if(id)return describeLook(id);
  const control=target.closest('button, a, [role="button"]');if(!control)return null;
  const row=control.closest('.row,.setRow'),label=control.getAttribute('aria-label')||row?.querySelector('.name')?.textContent||control.textContent.trim();
  return label?{name:label,description:row?.querySelector('.sub,.desc')?.textContent||''}:null;
 }
 function inspect(e,immediate=false){
  if(e.buttons||e.pointerType==='touch')return;
  let info,key,x=e.clientX,y=e.clientY,target=null;
  if(e.target===canvas){
   const r=canvas.getBoundingClientRect(),s=state(),player=s.player,px=x-r.left,py=y-r.top;
   const known=Core.isExplored(s.world,Math.floor(player.x),Math.floor(player.y),player.z);
   const foot=known?cam.project(player.x,player.y,player.z+Core.tileHeight(s.world,Math.floor(player.x),Math.floor(player.y),player.z)):null;
   if(foot&&Math.abs(px-foot.x)<cam.tilePx*.23&&py<foot.y&&py>foot.y-cam.tilePx*.90){key='character';info=describeLook('character.wanderer');}
   else{const p=cam.unproject(px,py),tx=Math.floor(p.x),ty=Math.floor(p.y);key='world:'+tx+','+ty+','+player.z;info=key===lastKey?null:describeWorld(s,tx,ty,player.z);}
   if(key===lastKey)return;
  }
  else{target=e.target.closest('button,a,[role="button"],[data-help],[data-look]');if(target===anchor&&!box.hidden)return;info=uiInfo(e.target);key=target;}
  hide();if(!info)return;lastKey=key;
  timer=setTimeout(()=>{if(e.target.isConnected)show(info,x,y,target);},immediate?0:400);
 }
 document.addEventListener('pointermove',inspect,{passive:true});
 document.addEventListener('focusin',e=>{if(usingTouch)return;const r=e.target.getBoundingClientRect();inspect({target:e.target,clientX:r.left,clientY:r.bottom},true);});
 document.addEventListener('focusout',hide);
 let touch=null,suppressClick=false;
 document.addEventListener('pointerdown',e=>{
  hide();suppressClick=false;touch=null;usingTouch=e.pointerType==='touch';
  if(e.pointerType!=='touch')return;
  // Only passive information targets: holding an action button or the world
  // retains its existing gameplay meaning, never starts an inspect gesture.
  const target=e.target.closest('.chip[data-res],.row img[data-help]'); // i18n-ok: CSS selectors for passive inspection targets.
  if(!target||target.closest('.buy'))return;
  const info=uiInfo(target);if(!info)return;
  touch={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{show(info,e.clientX,e.clientY,target);suppressClick=true;},550);
 },{capture:true,passive:true});
 document.addEventListener('pointermove',e=>{if(touch&&Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>8){touch=null;hide();}},{passive:true});
 document.addEventListener('pointerup',()=>{clearTimeout(timer);touch=null;},{passive:true});
 document.addEventListener('pointercancel',()=>{touch=null;hide();},{passive:true});
 document.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 document.addEventListener('keydown',e=>{usingTouch=false;if(e.key==='Escape')hide();}); // i18n-ok: keyboard key name.
 document.addEventListener('scroll',hide,{capture:true,passive:true});
 document.addEventListener('pointerout',e=>{if(!e.relatedTarget)hide();});
 window.addEventListener('resize',hide);window.addEventListener('blur',hide);
 return {hide};
}
