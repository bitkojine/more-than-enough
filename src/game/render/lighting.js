/* The core decides physical light; rendering applies it to each visible face
 * and each standing object, never to a flat screen grid over the whole scene.
 * Awareness is display-only: it changes neither exposure nor discovery. */
import * as Core from '../../core/index.js';

const DARK=.95;
let scratch=null;
export const lightBrightness=level=>Math.min(1,Math.sqrt(Math.max(0,level)/4));

export function lightVisibility(cam,s,x,y,z=cam.z) {
 const ambient=z===Core.SURFACE?.1:0;
 if(!Core.isExplored(s.world,Math.floor(x),Math.floor(y),z))return ambient;
 const brightness=lightBrightness(Core.illuminationAt(s,Math.floor(x),Math.floor(y),z).level);
 const d=z===s.player.z?Math.hypot(x-s.player.x,y-s.player.y):Infinity;
 return Math.max(ambient,brightness,.35*Math.max(0,1-d/2));
}

// Both artwork and tint use the same device-pixel boundaries. Antialiased
// edges painted separately can otherwise create bright subpixel seams.
export function faceRect(ctx,x,y,width,height) {
 const scale=ctx.getTransform?.().a||1,round=v=>Math.round(v*scale)/scale;
 const left=round(x),top=round(y);
 return {x:left,y:top,width:round(x+width)-left,height:round(y+height)-top};
}

// Paint once, immediately after the face's artwork, in the same painter order.
// A neighboring face replaces its own pixels instead of erasing darkness twice.
export function shadeFace(ctx,cam,s,x,y,bounds) {
 const opacity=DARK*(1-lightVisibility(cam,s,x+.5,y+.5));
 if(opacity<=0)return;
 ctx.fillStyle=`rgba(4,8,16,${opacity})`;
 ctx.fillRect(bounds.x,bounds.y,bounds.width,bounds.height);
}

// One reusable, viewport-clipped patch. Only translucent object pixels receive
// the tint, so the background and ground shadows are never painted twice.
// The callback draws into its supplied context and returns its usual anchors.
export function lightObject(ctx,cam,s,x,y,draw,{width=2,height=4}={}) {
 const opacity=DARK*(1-lightVisibility(cam,s,x,y));
 if(opacity<=0)return draw(ctx);
 const h=Core.tileHeight(s.world,Math.floor(x),Math.floor(y),cam.z);
 const p=cam.project(x,y,cam.z+h),u=cam.tilePx;
 const dpr=ctx.getTransform?.().a||1;
 const leftPx=Math.max(0,Math.floor((p.x-width*u)*dpr)),topPx=Math.max(0,Math.floor((p.y-height*u)*dpr));
 const rightPx=Math.min(Math.floor(cam.width*dpr),Math.ceil((p.x+width*u)*dpr));
 const bottomPx=Math.min(Math.floor(cam.height*dpr),Math.ceil((p.y+u)*dpr));
 if(rightPx<=leftPx||bottomPx<=topPx)return null;
 const left=leftPx/dpr,top=topPx/dpr,w=(rightPx-leftPx)/dpr,hpx=(bottomPx-topPx)/dpr;
 if(!scratch)scratch=document.createElement('canvas');
 const sw=rightPx-leftPx,sh=bottomPx-topPx;
 if(scratch.width!==sw||scratch.height!==sh){scratch.width=sw;scratch.height=sh;}
 const g=scratch.getContext('2d');
 if(g.reset)g.reset();else scratch.width=sw;
 g.setTransform(dpr,0,0,dpr,-left*dpr,-top*dpr);
 const result=draw(g);
 g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-atop';
 g.fillStyle=`rgba(4,8,16,${opacity})`;g.fillRect(0,0,sw,sh);
 ctx.drawImage(scratch,0,0,sw,sh,left,top,w,hpx);
 return result;
}

// The warm surface wash is decorative. Darkness has already been applied to
// geometry and objects; a final screen-space mask would cut across them again.
export function drawLighting(ctx,cam,s) {
 if(cam.z!==Core.SURFACE)return;
 const glow=Math.max(0,(Core.daylight(s.time)-.25)/.75)*.16;
 if(glow>.001){ctx.globalCompositeOperation='screen';ctx.fillStyle=`rgba(255,236,205,${glow.toFixed(3)})`;ctx.fillRect(0,0,cam.width,cam.height);ctx.globalCompositeOperation='source-over';}
}
