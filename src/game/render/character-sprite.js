import { ACT_TIME, WALK_ANIMATION_RATE } from './motion.js';

/* Whole-figure artwork owns the silhouette and the grip. Inventory pictures
 * never become costume layers. The original body remains a compatibility
 * fallback for existing custom characters and device-holding legacy worlds. */
export function characterSprite({equipment=null,actor={},device=null,cargo=null,crystal=0,look}) {
  const base='character.wanderer';
  if(device)return {id:look.overrides(base)?base:'character.legacyWanderer',composed:false};
  let id=base,actionProgress=null;
  const progress=ACT_TIME[actor.act]?Math.max(0,Math.min(1,actor.t/ACT_TIME[actor.act])):1;
  if(equipment?.pickaxe>0&&actor.act==='swing'){
    id='character.miner';
    actionProgress=progress;
  }else if(actor.act==='pick'){
    id=equipment?.basket>0?'character.forager':'character.bareForager';
    actionProgress=progress;
  }
  else if(actor.act==='build'){id=base;}
  else if(cargo&&(cargo.starter||crystal>0))id=cargo.gear.carrier?'character.courier':'character.specimen';
  else if(cargo?.gear.lantern&&cargo.lantern)id='character.lamplighter';
  else if(equipment?.basket>0&&equipment?.pickaxe>0)id='character.worker';
  if(look.overrides(base)&&(id===base||!look.overrides(id)))return {id:base,composed:false};
  return {id,composed:true,actionProgress};
}

// A discrete authored pose, never a dissolve of two silhouettes. The actor
// owns stride phase, so rendering the same state twice cannot advance it.
export function characterFrame(appearance, clip, actor, {moving=false,water=false,time=0}={}) {
  if(appearance.actionProgress!=null)return Math.min(clip.pics.length-1,Math.floor(appearance.actionProgress*clip.pics.length));
  if(!moving||water||actor.walking===false||clip.pics.length<2)return 0;
  if(actor.stride!=null)return Math.floor(actor.stride*clip.pics.length)%clip.pics.length;
  return appearance.composed?Math.floor(time*(clip.fps||8)*WALK_ANIMATION_RATE)%clip.pics.length:
    1+Math.floor(time*(clip.fps||6)*WALK_ANIMATION_RATE)%(clip.pics.length-1);
}
