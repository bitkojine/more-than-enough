/* Whole-figure artwork owns the silhouette and the grip. Inventory pictures
 * never become costume layers. The original body remains a compatibility
 * fallback for existing custom characters and device-holding legacy worlds. */
export function characterSprite({equipment=null,actor={},device=null,cargo=null,crystal=0,look}) {
  const base='character.wanderer';
  if(device)return {id:look.overrides(base)?base:'character.legacyWanderer',composed:false};
  let id=base,actionFrame=null;
  if(equipment?.pickaxe>0&&['swing','build'].includes(actor.act)){
    id='character.miner';const duration=actor.act==='build'?.7:.3;
    actionFrame=actor.t/duration<.4?0:1;
  }else if(actor.act==='pick')id=equipment?.basket>0?'character.forager':'character.bareForager';
  else if(cargo&&(cargo.starter||crystal>0))id=cargo.gear.carrier?'character.courier':'character.specimen';
  else if(cargo?.gear.lantern&&cargo.lantern)id='character.lamplighter';
  else if(equipment?.basket>0&&equipment?.pickaxe>0)id='character.worker';
  if(look.overrides(base)&&(id===base||!look.overrides(id)))return {id:base,composed:false};
  return {id,composed:true,actionFrame};
}
