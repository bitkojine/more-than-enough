/* Display the canonical tile light. Readability in darkness is an explicitly
 * non-physical overlay: it never changes exposure, fog, or source reach. */
import * as Core from '../../core/index.js';

const MASK_SCALE=.25, DARK=.95;
let mask=null;
// Lift low light for readable flat artwork; physical level zero stays zero.
export const lightBrightness=level=>Math.min(1,Math.sqrt(Math.max(0,level)/4));

export function drawLighting(ctx,cam,s,look) {
 const {width:W,height:H}=cam, dl=Core.daylight(s.time);
 if(cam.z===Core.SURFACE){
  const glow=Math.max(0,(dl-.25)/.75)*.16;
  if(glow>.001){ctx.globalCompositeOperation='screen';ctx.fillStyle=`rgba(255,236,205,${glow.toFixed(3)})`;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='source-over';}
 }
 const mw=Math.max(1,Math.ceil(W*MASK_SCALE)),mh=Math.max(1,Math.ceil(H*MASK_SCALE));
 if(!mask)mask=document.createElement('canvas');
 if(mask.width!==mw||mask.height!==mh){mask.width=mw;mask.height=mh;}
 const m=mask.getContext('2d');m.globalCompositeOperation='source-over';m.clearRect(0,0,mw,mh);
 // A tiny ambient floor keeps the surface playable at night. It is awareness,
 // not a source: the same distinction applies to Mica's nearby unlit sight.
 const ambient=cam.z===Core.SURFACE?.1:0;
 m.fillStyle=`rgba(4,8,16,${DARK*(1-ambient)})`;m.fillRect(0,0,mw,mh);
 m.globalCompositeOperation='destination-out';
 const v=cam.visibleTiles();
 for(let y=v.y0;y<=v.y1;y++)for(let x=v.x0;x<=v.x1;x++){
  if(!Core.isExplored(s.world,x,y,cam.z))continue;
  const physical=Core.illuminationAt(s,x,y,cam.z),brightness=lightBrightness(physical.level);
  const d=cam.z===s.player.z?Math.hypot(x+.5-s.player.x,y+.5-s.player.y):Infinity;
  const awareness=.35*Math.max(0,1-d/2);
  const visible=Math.max(ambient,brightness,awareness);
  if(visible<=ambient)continue;
  const p=cam.project(x,y),r=(visible-ambient)/(1-ambient);
  m.fillStyle=`rgba(0,0,0,${r.toFixed(3)})`;
  m.fillRect(p.x*MASK_SCALE,p.y*MASK_SCALE,cam.tilePx*MASK_SCALE+.3,cam.depthPx*MASK_SCALE+.3);
 }
 m.globalCompositeOperation='source-over';
 ctx.drawImage(mask,0,0,W,H);
}
