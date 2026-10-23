import { ACT_TIME } from './motion.js';

/* Whole-figure artwork owns the silhouette and the grip. Inventory pictures
 * never become costume layers. The original body remains a compatibility
 * fallback for existing custom characters and device-holding legacy worlds. */
export function characterSprite({equipment=null,actor={},device=null,cargo=null,crystal=0,look}) {
  const base='character.wanderer';
  if(device)return {id:look.overrides(base)?base:'character.legacyWanderer',composed:false};
  let id=base,actionFrame=null;
  // Authored anticipation/contact/recovery. Two build taps share the same
  // normalized timeline; the final fifth settles back into the held outfit.
  const progress=ACT_TIME[actor.act]?Math.max(0,actor.t/ACT_TIME[actor.act]):1;
  const working=progress<.8;
  if(equipment?.pickaxe>0&&working&&['swing','build'].includes(actor.act)){
    id='character.miner';
    const tap=actor.act==='build'?(progress*2)%1:progress;
    actionFrame=tap<.4?0:1;
  }else if(actor.act==='pick'&&working)id=equipment?.basket>0?'character.forager':'character.bareForager';
  else if(cargo&&(cargo.starter||crystal>0))id=cargo.gear.carrier?'character.courier':'character.specimen';
  else if(cargo?.gear.lantern&&cargo.lantern)id='character.lamplighter';
  else if(equipment?.basket>0&&equipment?.pickaxe>0)id='character.worker';
  if(look.overrides(base)&&(id===base||!look.overrides(id)))return {id:base,composed:false};
  return {id,composed:true,actionFrame};
}

// A discrete authored pose, never a dissolve of two silhouettes. The actor
// owns stride phase, so rendering the same state twice cannot advance it.
export function characterFrame(appearance, clip, actor, {moving=false,water=false,time=0}={}) {
  if(appearance.actionFrame!=null)return Math.min(appearance.actionFrame,clip.pics.length-1);
  if(!moving||water||actor.walking===false||clip.pics.length<2)return 0;
  if(actor.stride!=null)return Math.floor(actor.stride*clip.pics.length)%clip.pics.length;
  return appearance.composed?Math.floor(time*(clip.fps||8))%clip.pics.length:
    1+Math.floor(time*(clip.fps||6))%(clip.pics.length-1);
}
