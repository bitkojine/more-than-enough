/* Art production contracts, not game rules. No image decoding or generation in
 * the quick gate. Visual consistency still requires playback review. */
import {createHash} from 'node:crypto';
export function clipFingerprint({model,modelSha,variant,action,direction,canvas,contactFrame,frames}) {
 return createHash('sha256').update(JSON.stringify({model,modelSha,variant,action,direction,canvas,contactFrame,frames})).digest('hex');
}
export const DIRECTIONS=Object.freeze(['n','ne','e','se','s','sw','w','nw']);
export const keyOf=({variant,action,direction})=>`${variant}/${action}/${direction}`;
export function requiredClips(spec){
 return spec.variants.flatMap(v=>v.actions.flatMap(action=>DIRECTIONS.map(direction=>({variant:v.id,action,direction}))));
}
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
export function auditProduction(spec,{exists=()=>true,digest=()=>null}={}){
 const errors=[],seen=new Set(),accepted=new Set(),drawingOwners=new Map();
 if(spec.format!==1)errors.push('Unsupported production manifest format');
 if(!spec.model?.id||!spec.model.reference||!spec.model.sha256)errors.push('Missing versioned model reference');
 else if(!exists(spec.model.reference)||digest(spec.model.reference)!==spec.model.sha256)errors.push('Model reference is missing or its checksum changed');
 if(!Array.isArray(spec.variants)||new Set(spec.variants.map(v=>v.id)).size!==spec.variants.length)errors.push('Duplicate or missing loadout variants');
 const required=new Set(requiredClips(spec).map(keyOf));
 for(const clip of spec.clips||[]){
  const key=keyOf(clip),start=errors.length;
  if(spec.model.review?.status!=='accepted'||!spec.model.review.by||spec.model.review.sourceSha!==spec.model.sha256)errors.push(`${key}: model reference has not been accepted`);
  if(clip.mirrorOf||clip.mirrored)errors.push(`${key}: mirrored substitutions are not accepted`);
  if(seen.has(key))errors.push(`${key}: duplicate clip`);seen.add(key);
  if(!required.has(key))errors.push(`${key}: undeclared variant/action/direction`);
  if(clip.model!==spec.model.id||clip.modelSha!==spec.model.sha256)errors.push(`${key}: model revision mismatch`);
  const rule=spec.actions[clip.action];
  if(!rule)errors.push(`${key}: unknown action`);
  if(!Array.isArray(clip.canvas)||clip.canvas.length!==2||!clip.canvas.every(n=>Number.isInteger(n)&&n>0))errors.push(`${key}: invalid canvas`);
  const hashes=new Set(),frames=Array.isArray(clip.frames)?clip.frames:[];
  if(frames.length<(rule?.minFrames||1))errors.push(`${key}: too few drawn frames`);
  for(const [i,f]of frames.entries()){
   const label=`${key} frame ${i}`;
   if(!exists(f.file)||!f.sha256||digest(f.file)!==f.sha256)errors.push(`${label}: missing or changed source`);
   if(drawingOwners.has(f.sha256)&&drawingOwners.get(f.sha256)!==key)errors.push(`${label}: drawing reused from ${drawingOwners.get(f.sha256)}`);
   drawingOwners.set(f.sha256,key);
   if(hashes.has(f.sha256))errors.push(`${label}: duplicated drawing`);hashes.add(f.sha256);
   if(!(f.ms>0&&Number.isFinite(f.ms)))errors.push(`${label}: invalid duration`);
   for(const anchor of ['root','leftHand','rightHand','head']){
    const p=f.anchors?.[anchor];
    if(!point(p)||!clip.canvas||p.some((n,j)=>n<0||n>clip.canvas[j]))errors.push(`${label}: invalid ${anchor} anchor`);
   }
   if(!(f.bodyHeight>0)||Math.abs(f.bodyHeight-spec.model.bodyHeight)>spec.model.heightTolerance)errors.push(`${label}: inconsistent body scale`);
  }
  if(rule?.contact&&!Number.isInteger(clip.contactFrame))errors.push(`${key}: missing contact frame`);
  if(clip.contactFrame!=null&&!(clip.contactFrame>=0&&clip.contactFrame<frames.length))errors.push(`${key}: invalid contact frame`);
  if(clip.review?.status!=='accepted'||!clip.review.by||!clip.review.playback||!exists(clip.review.playback)||!clip.review.sourceDigest)errors.push(`${key}: missing accepted playback review`);
  else if(clip.review.sourceDigest!==clipFingerprint(clip))errors.push(`${key}: playback review is stale`);
  if(errors.length===start)accepted.add(key);
 }
 return {errors,accepted:accepted.size,required:required.size,missing:[...required].filter(k=>!accepted.has(k))};
}
export function productionPrompt(spec,{variant,action,direction}){
 const v=spec.variants.find(v=>v.id===variant),a=spec.actions[action];
 if(!v||!v.actions.includes(action)||!DIRECTIONS.includes(direction)||!a)throw Error('Unknown production clip');
 return {
  ready:spec.model.review?.status==='accepted',key:keyOf({variant,action,direction}),references:[spec.model.reference],model:spec.model.id,
  prompt:[`Draw ${a.minFrames} distinct sequential full-figure frames for ${variant}/${action}/${direction}.`,
   `Match the attached ${spec.model.id} turnaround exactly: ${spec.model.identity}`,
   `Camera: ${spec.model.camera}. Direction is world ${direction}; north faces away, south toward the viewer.`,
   `Physical loadout: ${v.description}. ${a.brief}`,
   `Handedness: ${spec.model.handedness}`,
   `Body height ${spec.model.bodyHeight} logical pixels, consistent throughout; intentional crouch/recoil is documented rather than rescaled away.`,
   'Complete painted figures, not detachable inventory icons. Preserve equipment handedness, straps, shape and material in every frame.',
   'Transparent background, generous separate gutters, no ground/shadows/text. Use the same camera and light direction for every frame.',
   'Draw actual in-betweens, contact and recovery. Do not duplicate frames or substitute a mirrored different direction.',
   'After extraction, record source checksums, foot/root, hand and head anchors and playback timing; review all frames at game scale before acceptance.'
  ].join('\n')
 };
}
