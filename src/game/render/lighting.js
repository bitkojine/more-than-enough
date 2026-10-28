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

// Static art is tinted once per source image and display-light bucket. Objects
// sharing art share the bitmap, independently of world position and camera pan.
// Bound retained GPU/CPU pixels as well as entry count; never cache per tile.
const SPRITE_LIGHT=Symbol.for('mte.sprite-light');
const tinted=new Map(),imageIds=new WeakMap();
const TINT_STEPS=63,TINT_PIXELS=8*1024*1024,TINT_ENTRIES=128;
let imageId=0,tintPixels=0,tintBuilds=0,tintHits=0;
export function spriteLight(ctx,cam,s,x,y,draw) {
 const previous=ctx[SPRITE_LIGHT],bucket=Math.round(DARK*(1-lightVisibility(cam,s,x,y))*TINT_STEPS);
 if(bucket)ctx[SPRITE_LIGHT]=bucket;else delete ctx[SPRITE_LIGHT];
 try{return draw(ctx);}finally{if(previous)ctx[SPRITE_LIGHT]=previous;else delete ctx[SPRITE_LIGHT];}
}
export const hasSpriteLight=ctx=>!!ctx[SPRITE_LIGHT];
// Physical vector details (door frames and covers) use the same tint as art.
export function litInk(ctx,hex){
 const bucket=ctx[SPRITE_LIGHT];if(!bucket)return hex;
 const a=bucket/TINT_STEPS;
 return 'rgb('+[4,8,16].map((dark,i)=>Math.round(parseInt(hex.slice(1+i*2,3+i*2),16)*(1-a)+dark*a)).join(',')+')';
}
export function litPicture(ctx,source) {
 const bucket=ctx[SPRITE_LIGHT];if(!bucket)return source;
 let id=imageIds.get(source);if(!id){id=++imageId;imageIds.set(source,id);}
 const key=id+':'+bucket;
 let hit=tinted.get(key);
 if(hit){tinted.delete(key);tinted.set(key,hit);tintHits++;return hit.image;}
 const image=document.createElement('canvas');image.width=source.width;image.height=source.height;
 const g=image.getContext('2d');g.drawImage(source,0,0);g.globalCompositeOperation='source-atop';
 g.fillStyle=`rgba(4,8,16,${bucket/TINT_STEPS})`;g.fillRect(0,0,image.width,image.height);
 const pixels=image.width*image.height;tintBuilds++;
 if(pixels<=TINT_PIXELS){
  while(tinted.size&&(tintPixels+pixels>TINT_PIXELS||tinted.size>=TINT_ENTRIES)){const oldest=tinted.keys().next().value;tintPixels-=tinted.get(oldest).pixels;tinted.delete(oldest);}
  tinted.set(key,{image,pixels});tintPixels+=pixels;
 }
 return image;
}
export function lightingWork(){return {tintBuilds,tintHits,tintPixels,tintEntries:tinted.size};}

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

// One reusable, viewport-clipped patch. Only covered object pixels receive
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
 if(scratch.width<sw)scratch.width=sw;
 if(scratch.height<sh)scratch.height=sh;
 const g=scratch.getContext('2d');
 g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.clearRect(0,0,sw,sh);
 g.save();g.setTransform(dpr,0,0,dpr,-left*dpr,-top*dpr);
 let result;
 try{result=draw(g);}catch(error){scratch.width=scratch.width;throw error;}finally{g.restore();}
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
