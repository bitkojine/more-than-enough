/* Mica's rigged model: bones, meshes and carried gear, posed without a
 * renderer. rigged-character.js draws it; rig-clips.js proves no two solid
 * parts pass through each other, in tests and in the dev viewer.
 * Model faces +Z; +X is its anatomical left. */
import * as T from '../../vendor/three/three.module.js';
import {rigPose,LEG_LENGTH} from './rig-motion.js';
import {createPickaxeModel,pickaxeTier} from './pickaxe-model.js';
import {characterDirection,CHARACTER_DIRECTIONS} from './character-direction.js';
import {UPPER_ARM,FOREARM,solveArm,miningStroke,workHands,workWeight,WORK_HANDS} from './work-motion.js';
import {createBasketModel,createLanternModel,createFlareModel} from './work-equipment.js';
import {createWikiModel} from './wiki-model.js';
import {wrapAngle} from './wiki-motion.js';
const DOWN=new T.Vector3(0,-1,0);
// The coat's radius from hem (t=0) to collar (t=1). It narrows under the hood
// so the sleeves hang outside it rather than through it.
export const coatRadius=t=>.44-.20*t+.015*Math.sin(t*Math.PI)-COAT_TAPER*t**3;
const COAT_TAPER=.16;
// A point just outside the coat, hips-local: around the body by `angle`
// (0 = front, +PI/2 = Mica's left) at height `y` above the hips, `gap` out
// from the cloth along the coat's horizontal normal. Below the hem the hem counts.
const HIPS_REST=.51;
export function besideCoat(angle,y,gap){
 const t=Math.max(0,Math.min(1,(y+HIPS_REST-.48)/.55)),r=coatRadius(t),s=Math.sin(angle),c=Math.cos(angle);
 const n=new T.Vector3(s/r,0,c/(.76*r)).normalize();
 return new T.Vector3(s*r,y,c*.76*r).addScaledVector(n,gap);
}
// The lantern's ring sits this high on the hip; its widest part hangs this far
// below the ring; the skirt sways about this much while walking.
// The flare: where it sits in the left mitten and how it leans out of it,
// and where it tucks into the belt while that hand is busy.
const FLARE_SIZE=.7,FLARE_GRIP=[0,-.03,.02],FLARE_TILT=[.8,0,-1.2],FLARE_BELT_SIDE=-1.55,FLARE_BELT_Y=.05,FLARE_BELT_GAP=.11,FLARE_BELT_TILT=[0,0,0];
const LANTERN_SIDE=2.2,LANTERN_RING=.16,LANTERN_DROP=.22,LANTERN_RADIUS=.09,SKIRT_SWAY=.045;
// The sleeve meets the coat within this distance of the shoulder joint.
// Arms hang this far out (radians) so sleeves and mittens clear the coat.
const REST_SPREAD=.76;
const WIKI_ROOT=.13,WIKI_NECK=.10,SHOULDER=.17,COWL=.21,ELBOW=.13,KNEE=.11,ANKLE=.11,NECK=.30;
export function createRigModel(){
 const scene=new T.Scene(),model=new T.Group();scene.add(model);
 // Match the default world's painted SVGs: authored flat fills, not light
 // responses to curved surfaces. The world's day/night overlay still applies
 // to the composited character together with trees, rocks and buildings.
 const material=color=>new T.MeshBasicMaterial({color,toneMapped:false});
 const orange=material(0xc8743a),inner=material(0x1d1712),black=material(0x3a2a1c),cream=material(0xeeeadf),linen=material(0xded4b7),thread=material(0xefe1bc);
 const bones=[],bone=(name,parent,x=0,y=0,z=0)=>{const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);bones.push(b);return b;};
 const root=bone('root',model),hips=bone('hips',root,0,HIPS_REST),spine=bone('spine',hips,0,.38),neck=bone('neck',spine,0,.18),head=bone('head',neck,0,.30);
 const clothFront=bone('cloakFront',hips,0,.32),clothBack=bone('cloakBack',hips,0,.32),clothLeft=bone('cloakLeft',hips,0,.32),clothRight=bone('cloakRight',hips,0,.32);
 const mesh=(g,m,parent,x=0,y=0,z=0)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;};
 const ellipsoid=(parent,m,x,y,z,rx,ry,rz)=>{const o=mesh(new T.SphereGeometry(1,32,24),m,parent,x,y,z);o.scale.set(rx,ry,rz);return o;};
 function hoodGeometry(){
  const controls=[[.30,.390,.17,0],[.33,.42,.12,0],[.43,.47,.02,0],[.45,.43,-.20,0],[.34,.31,-.40,.13],[.12,.14,-.50,.23],[.001,.001,-.53,.25]],pos=[],idx=[],segments=64;
  const interpolate=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
  const rings=Array.from({length:33},(_,i)=>{const f=i/32*(controls.length-1),k=Math.min(controls.length-2,Math.floor(f)),t=f-k;return controls[k].map((_,j)=>interpolate(controls[Math.max(0,k-1)][j],controls[k][j],controls[k+1][j],controls[Math.min(controls.length-1,k+2)][j],t));});
  for(const [j,[rx,ry,z,cy]]of rings.entries())for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,pear=1-.22*Math.sin(a)*Math.max(0,1-j/12);pos.push(rx*1.10*Math.cos(a)*pear+.045*(j/32)**2,cy+ry*Math.sin(a)+.018*Math.cos(a)*Math.min(1,rx/.12),z);}
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;idx.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
 }
 const hood=hoodGeometry();mesh(hood,orange,head);
 const inside=inner.clone();inside.side=T.BackSide;mesh(hood,inside,head);
 // The original art has a pointed arch, broad lower cheeks and flat oval
 // eyes. A shallow pear-shaped mask avoids the former protruding egg shape.
 function faceGeometry(size=1,depth=.16,rows=12){
  const positions=[],uv=[],indices=[],segments=64;
  for(let j=0;j<=rows;j++)for(let i=0;i<=segments;i++){
   const r=j/rows,a=i/segments*Math.PI*2,x=size*r*.27*Math.cos(a)*(1-.22*Math.sin(a)),y=size*r*.32*Math.sin(a);
   positions.push(x,y,.18+depth*(1-r*r));uv.push((x+.3)/.6,(y+.4)/.8);
  }
  for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
 }
 const faceMaterial=material(0xefe1bc);
 mesh(faceGeometry(1.22,0,1),inner,head,0,0,-.012);
 mesh(faceGeometry(),faceMaterial,head);
 // Simple facial marks remain attached to the shallow face. Eye scale supplies
 // blinking without repainting/uploading a canvas texture every frame.
 const eyes=[-.094,.094].map(x=>ellipsoid(head,inner,x,.043,.324,.034,.046,.008));
 const arch=[];for(let i=0;i<64;i++){const a=i/64*Math.PI*2;arch.push(new T.Vector3(1.22*.27*Math.cos(a)*(1-.22*Math.sin(a)),1.22*.32*Math.sin(a),.176));}
 mesh(new T.TubeGeometry(new T.CatmullRomCurve3(arch,true),128,.014,8,true),inner,head);
 // Soft collar joins hood and cloak rather than adding a floating costume icon.
 const collarPath=[[-.24,0,0],[-.17,-.015,.16],[0,-.10,.23],[.17,-.015,.16],[.24,0,0],[.17,.02,-.15],[0,.025,-.21],[-.17,.02,-.15]].map(p=>new T.Vector3(...p));
 mesh(new T.TubeGeometry(new T.CatmullRomCurve3(collarPath,true),64,.038,10,true),orange,neck);
 const bodyMat=orange.clone();bodyMat.side=T.DoubleSide;
 const positions=[],indices=[],segments=64,rows=16;
 for(let j=0;j<=rows;j++){
  const t=j/rows,y=.48+t*.55,r=coatRadius(t);
  for(let i=0;i<=segments;i++){
   const a=i/segments*Math.PI*2,x=Math.sin(a)*r,z=Math.cos(a)*r*.76;
   // A front V opens the overlapping hem instead of forming a rigid bell.
   const notch=Math.cos(a)>.6?.13*Math.max(0,1-Math.abs(Math.sin(a))/.32)*Math.max(0,1-t/.28):0;
   positions.push(x,y+notch,z);
  }
 }
 for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
 // Four weighted skirt panels lag behind the torso. Outline and hem use
 // exactly the same weights, so decoration cannot float above moving cloth.
 function clothGeometry(g){
  const skinIndices=[],skinWeights=[],v=g.attributes.position;
  for(let i=0;i<v.count;i++){
   const t=Math.max(0,Math.min(1,(v.getY(i)-.48)/.55)),a=Math.atan2(v.getX(i),v.getZ(i)/.76);
   const upper=Math.min(1,Math.max(0,(t-.25)/.6)),cloth=(1-upper)*Math.max(0,1-t/.7);
   const side=Math.abs(Math.sin(a)),front=Math.abs(Math.cos(a)),sum=side+front||1;
   skinIndices.push(bones.indexOf(hips),bones.indexOf(spine),bones.indexOf(Math.sin(a)>=0?clothLeft:clothRight),bones.indexOf(Math.cos(a)>=0?clothFront:clothBack));
   skinWeights.push(1-upper-cloth,upper,cloth*side/sum,cloth*front/sum);
  }
  g.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndices,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeights,4));return g;
 }
 const coatGeometry=new T.BufferGeometry();coatGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));coatGeometry.setIndex(indices);coatGeometry.computeVertexNormals();clothGeometry(coatGeometry);
 const coat=new T.SkinnedMesh(coatGeometry,bodyMat);model.add(coat);
 // A narrow skinned ribbon follows the split hem exactly, including its notch.
 const hemPoints=[],hemIndices=[];for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2,n=Math.cos(a)>.6?.13*Math.max(0,1-Math.abs(Math.sin(a))/.32):0;for(const dy of [0,.009])hemPoints.push(Math.sin(a)*.441,.484+n+dy,Math.cos(a)*.441*.76);if(i<segments){const q=i*2;hemIndices.push(q,q+1,q+2,q+1,q+3,q+2);}}
 const hemGeometry=new T.BufferGeometry();hemGeometry.setAttribute('position',new T.Float32BufferAttribute(hemPoints,3));hemGeometry.setIndex(hemIndices);hemGeometry.computeVertexNormals();clothGeometry(hemGeometry);
 const hem=new T.SkinnedMesh(hemGeometry,thread);model.add(hem);
 // Broad, cloth-bound repair patch. Its geometry follows the coat surface and
 // uses the same skeleton; it is not a floating inventory badge.
 const patchPoints=[],patchIndices=[];for(let j=0;j<=4;j++){const y=.62+j*.027,t=(y-.48)/.55,r=coatRadius(t)+.006;for(let i=0;i<=6;i++){const a=-.63+i*.35/6;patchPoints.push(Math.sin(a)*r,y,Math.cos(a)*r*.76);}if(j<4)for(let i=0;i<6;i++){const q=j*7+i;patchIndices.push(q,q+7,q+1,q+1,q+7,q+8);}}
 const patchGeometry=new T.BufferGeometry();patchGeometry.setAttribute('position',new T.Float32BufferAttribute(patchPoints,3));patchGeometry.setIndex(patchIndices);patchGeometry.computeVertexNormals();clothGeometry(patchGeometry);
 const patch=new T.SkinnedMesh(patchGeometry,material(0xd18b54));patch.material.side=T.DoubleSide;model.add(patch);
 function arm(side){
  const upper=bone(side>0?'leftUpperArm':'rightUpperArm',spine,side*.26,.13,0),lower=bone(side>0?'leftForearm':'rightForearm',upper,0,-UPPER_ARM,0),hand=bone(side>0?'leftHand':'rightHand',lower,0,-FOREARM,0);
  upper.rotation.z=side*REST_SPREAD;
  const sleeve=mesh(new T.CylinderGeometry(.095,.105,UPPER_ARM+.03,32,6),orange,upper,0,.015-(UPPER_ARM+.03)/2,0);sleeve.scale.z=.95;
  const cuff=mesh(new T.TorusGeometry(.099,.006,8,32),thread,upper,0,-UPPER_ARM-.015,0);cuff.rotation.x=Math.PI/2;
  mesh(new T.CylinderGeometry(.052,.055,FOREARM-.11,16),black,lower,0,-.04-(FOREARM-.11)/2,0);
  ellipsoid(hand,black,0,-.02,0,.108,.115,.087);ellipsoid(hand,black,-side*.076,-.005,.040,.040,.060,.040);
  return {upper,lower,hand};
 }
 // Rounded boot lasts: broad toe, narrower heel and a curved instep. Rings
 // replace the old extruded rectangle; all points stay inside the existing
 // conservative ankle/sole clearance envelope used by the walk solver.
 function shoeGeometry(width,length,height,{sole=false}={}){
  const rings=sole?[[.96,0,0],[1,.35,0],[.99,.8,0],[.96,1,0]]:[[1,0,0],[.99,.32,-.005],[.88,.68,-.03],[.63,.91,-.09],[.31,1,-.12]];
  const points=[],indices=[],segments=32;
  for(const [scale,h,shift]of rings)for(let i=0;i<=segments;i++){
   const a=i/segments*Math.PI*2,c=Math.cos(a),heel=.78+.22*(c+1)/2;
   const x=Math.sin(a)*width*.5*heel*scale,z=length*(.17+shift)+c*length*.5*scale;
   points.push(x,h*height+(sole?.006*Math.max(0,c)**2:0),z);
  }
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
  const bottom=points.length/3;points.push(0,0,length*.17);const top=points.length/3;points.push(0,height,length*.05);
  for(let i=0;i<segments;i++){indices.push(bottom,i+1,i);const a=(rings.length-1)*(segments+1)+i;indices.push(top,a,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return g;
 }
 const soleMaterial=material(0x66503c);
 function leg(side){
  const upper=bone(side>0?'leftThigh':'rightThigh',hips,side*.125,0,0),lower=bone(side>0?'leftShin':'rightShin',upper,0,-LEG_LENGTH,0),foot=bone(side>0?'leftFoot':'rightFoot',lower,0,-LEG_LENGTH,0);
  mesh(new T.CylinderGeometry(.083,.074,LEG_LENGTH,24),black,upper,0,-LEG_LENGTH/2,0);
  mesh(new T.CylinderGeometry(.074,.066,LEG_LENGTH-.025,24),linen,lower,0,-LEG_LENGTH/2,0);
  for(let i=0;i<4;i++){const band=mesh(new T.TorusGeometry(.073-i*.0015,.0035,6,32),cream,lower,0,-.045-i*.05,0);band.rotation.x=Math.PI/2+.04;}
  mesh(shoeGeometry(.205,.30,.022,{sole:true}),soleMaterial,foot,0,-.086,0);
  mesh(shoeGeometry(.19,.25,.062),black,foot,0,-.055,0);
  return {upper,lower,foot};
 }
 const leftArm=arm(1),rightArm=arm(-1),leftLeg=leg(1),rightLeg=leg(-1);
 const toolGrip=new T.Group();toolGrip.position.set(0,-.02,.025);toolGrip.rotation.set(1.9,0,.12);rightArm.hand.add(toolGrip);
 const toolBack=new T.Group();toolBack.name='toolBack';toolBack.position.set(-.186,-.30,-.426);toolBack.rotation.set(-.346,.219,.722);spine.add(toolBack);toolBack.visible=false;
 const holster=mesh(new T.TorusGeometry(.052,.012,6,16),black,toolBack);holster.rotation.x=Math.PI/2;
 // Cargo represents only a real starter or harvested crystal already carried
 // by the player. Both objects are cached, non-emissive presentation geometry.
 const cargoRoot=new T.Group();cargoRoot.name='cargo';cargoRoot.position.set(.01,-.06,.41);spine.add(cargoRoot);cargoRoot.visible=false;
 const specimen=new T.Group(),sealed=new T.Group();cargoRoot.add(specimen,sealed);
 const crystalMaterial=material(0xdf69ab);
 const shard=mesh(new T.ConeGeometry(.078,.22,5),crystalMaterial,specimen,0,0,0);shard.rotation.z=-.15;
 const fork=mesh(new T.ConeGeometry(.045,.13,5),crystalMaterial,specimen,.065,-.015,0);fork.rotation.z=-.65;
 mesh(new T.CylinderGeometry(.13,.12,.20,10),black,sealed);
 mesh(new T.CylinderGeometry(.14,.14,.035,10),linen,sealed,0,.105,0);
 mesh(new T.CylinderGeometry(.133,.133,.018,10),linen,sealed,0,-.10,0);
 const pickaxes=new Map();let equippedPickaxe=null;let cargoKind=null,drivingGrip=0;
 function equipPickaxe(level,action,steady,carrying=false){
  const tier=pickaxeTier(level);
  if(equippedPickaxe&&equippedPickaxe.tier!==tier){equippedPickaxe.root.removeFromParent();equippedPickaxe=null;}
  if(!tier){toolBack.visible=false;return;}
  if(!pickaxes.has(tier)){
   // The complete-figure pass supplies the tool's outer ink.
   pickaxes.set(tier,createPickaxeModel(tier));
  }
  equippedPickaxe=pickaxes.get(tier);
  const stowed=steady||carrying||['build','pick','collect','up','down','cheer'].includes(action),socket=stowed?toolBack:toolGrip;toolBack.visible=stowed;
  if(equippedPickaxe.root.parent!==socket)socket.add(equippedPickaxe.root);
 }
 const basketGrip=new T.Group();basketGrip.position.set(0,-.015,.02);leftArm.hand.add(basketGrip);
 const basketBack=new T.Group();basketBack.name='basketBack';basketBack.position.set(.061,.126,-.354);basketBack.rotation.set(.239,0,.07);spine.add(basketBack);
 // The lantern hangs at the back of the left hip, just clear of the coat's
 // skirt where it flares widest beside it, so it never swings into the cloth.
 const lanternHip=new T.Group();lanternHip.name='lanternHip';lanternHip.position.copy(besideCoat(LANTERN_SIDE,LANTERN_RING-LANTERN_DROP,LANTERN_RADIUS+SKIRT_SWAY)).setY(LANTERN_RING);hips.add(lanternHip);
 const baskets=new Map();let equippedBasket=null,basketHeld=false;
 // Wiki sits on top of the hood and turns with Mica's head.
 const wiki=createWikiModel();wiki.root.position.set(.05,.48,0);wiki.root.rotation.set(-.12,0,-.10);wiki.root.scale.setScalar(1.75);head.add(wiki.root);wiki.root.visible=false;
 const lanternModel=createLanternModel();lanternModel.root.name='lantern';lanternHip.add(lanternModel.root);lanternModel.root.visible=false;
 // A burning flare is held in the left hand. While that hand works the
 // lantern the right one takes it; while it holds the basket or the cargo,
 // it rides tucked in the belt instead.
 const flareGrip=new T.Group();flareGrip.name='flareGrip';flareGrip.position.set(...FLARE_GRIP);flareGrip.rotation.set(...FLARE_TILT);flareGrip.scale.setScalar(FLARE_SIZE);leftArm.hand.add(flareGrip);
 const flareRight=new T.Group();flareRight.name='flareRight';flareRight.position.set(-FLARE_GRIP[0],FLARE_GRIP[1],FLARE_GRIP[2]);flareRight.rotation.set(FLARE_TILT[0],-FLARE_TILT[1],-FLARE_TILT[2]);flareRight.scale.setScalar(FLARE_SIZE);rightArm.hand.add(flareRight);
 const flareBelt=new T.Group();flareBelt.name='flareBelt';flareBelt.position.copy(besideCoat(FLARE_BELT_SIDE,FLARE_BELT_Y,FLARE_BELT_GAP));flareBelt.rotation.set(...FLARE_BELT_TILT);flareBelt.scale.setScalar(FLARE_SIZE);hips.add(flareBelt);
 const flareModel=createFlareModel();flareModel.root.name='flare';flareGrip.add(flareModel.root);flareModel.root.visible=false;let flareHand=null;
 // `where`: 'left', 'right' or 'belt'.
 function equipFlare(lit,time,where){
  flareModel.root.visible=!!lit;flareHand=lit&&where!=='belt'?where:null;if(!lit)return;
  const parent=where==='left'?flareGrip:where==='right'?flareRight:flareBelt;if(flareModel.root.parent!==parent)parent.add(flareModel.root);flareModel.setBurn(time);
 }
 function equipBasket(level,held){
  const tier=Math.max(0,Math.min(5,Math.floor(Number(level)||0)));basketHeld=!!(tier&&held);
  if(equippedBasket&&equippedBasket.tier!==tier){equippedBasket.root.removeFromParent();equippedBasket=null;}
  if(!tier)return;
  if(!baskets.has(tier))baskets.set(tier,createBasketModel(tier));equippedBasket=baskets.get(tier);
  const parent=held?basketGrip:basketBack;if(equippedBasket.root.parent!==parent)parent.add(equippedBasket.root);
 }
 function poseArm(rig,side,target,orientation,weight=1){
  const shoulder=rig.upper.position.toArray(),solution=solveArm(shoulder,target,side);
  const q1=new T.Quaternion().setFromUnitVectors(DOWN,solution.elbow.clone().sub(solution.shoulder).normalize());
  const q2=new T.Quaternion().setFromUnitVectors(DOWN,solution.hand.clone().sub(solution.elbow).normalize());
  const qHand=q2.clone().invert().multiply(orientation);
  rig.upper.quaternion.slerp(q1,weight);rig.lower.quaternion.slerp(q1.clone().invert().multiply(q2),weight);rig.hand.quaternion.slerp(qHand,weight);
 }
 function constrainWork(action,progress,{basket=false,work=null,carrying=false,flow=null}={}){
  model.updateMatrixWorld(true);
  if(action==='swing'&&equippedPickaxe){
   const plan=miningStroke(progress,flow),spineWorld=spine.getWorldQuaternion(new T.Quaternion()),inverse=spineWorld.clone().invert();
   const basePosition=spine.worldToLocal(toolGrip.getWorldPosition(new T.Vector3()));
   const baseQ=inverse.clone().multiply(toolGrip.getWorldQuaternion(new T.Quaternion()));
   const position=basePosition.lerp(plan.position,plan.weight),rotation=baseQ.slerp(plan.quaternion,plan.weight);
   const gripQ=toolGrip.quaternion.clone(),handQ=rotation.clone().multiply(gripQ.clone().invert());
   drivingGrip=plan.grip*plan.weight;
   const offset=new T.Vector3(0,-.02,.025);
   const right=position.clone().add(new T.Vector3(0,drivingGrip,0).applyQuaternion(rotation)).sub(offset.clone().applyQuaternion(handQ));
   toolGrip.position.copy(offset).sub(new T.Vector3(0,drivingGrip,0).applyQuaternion(gripQ));
   // One-handed: two mittens on the short shaft would always crush together.
   poseArm(rightArm,-1,right.toArray(),handQ);
   return;
  }
  const hands=carrying?{weight:1,...WORK_HANDS.carry}:workHands(action,progress,{basket,work,flow,lantern:spine.worldToLocal(lanternModel.root.getWorldPosition(new T.Vector3())).toArray()});
  if(hands){const orientation=new T.Quaternion(),leftOrientation=basket?spine.quaternion.clone().invert():orientation;poseArm(leftArm,1,hands.left,leftOrientation,hands.weight);poseArm(rightArm,-1,hands.right,orientation,hands.weight);}
 }
 model.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);coat.bind(skeleton);hem.bind(skeleton);patch.bind(skeleton);
 let direction='s',renderedAction=null,renderedProgress=0,renderedWork=null;
 function poseLeg(target,rig,hipY){
  const knee=new T.Vector3(0,target.knee.y-hipY,target.knee.z),ankle=new T.Vector3(0,target.foot.y-target.knee.y,target.foot.z-target.knee.z);
  const q1=new T.Quaternion().setFromUnitVectors(DOWN,knee.normalize()),q2=new T.Quaternion().setFromUnitVectors(DOWN,ankle.normalize());
  rig.upper.quaternion.copy(q1);rig.lower.quaternion.copy(q1).invert().multiply(q2);
  rig.foot.quaternion.copy(q2).invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),target.foot.pitch));
 }

 return {
  scene,model,
  // Poses every bone and carried thing for one frame; the same options as draw().
  pose({facing={x:0,y:1},phase=0,walking=false,blend=null,action=null,progress=0,flow=null,time=0,steady=false,pickaxe=0,basket=0,work=null,lantern=false,lanternOn=false,flare=false,cargo=null,wiki:wikiState=null}={}){
   renderedAction=action;renderedProgress=progress;renderedWork=work;
   cargoKind=!steady&&!action&&['specimen','sealed'].includes(cargo)?cargo:null;
   cargoRoot.visible=!!cargoKind;specimen.visible=cargoKind==='specimen';sealed.visible=cargoKind==='sealed';
   const forage=action==='pick'&&!['plant','tend','starter'].includes(work);
   // The basket is in hand only while the arm is out in front: hanging low
   // from a hand at Mica's side it would sweep through the flared skirt.
   equipBasket(basket,forage&&!steady&&workWeight(progress,flow)>.5);lanternModel.root.visible=!!lantern;lanternModel.setOn(lanternOn);
   const p=rigPose({phase,walking,blend,action,progress,time,steady,carrying:!!cargoKind});hips.position.y=p.hipY;
   spine.rotation.set(p.lean,p.twist,p.roll);spine.position.y=.38*Math.cos(p.lean)+p.breath;spine.position.z=.38*Math.sin(p.lean);
   if(action&&Math.hypot(facing.x,facing.y)>1e-6){const yaw=Math.atan2(facing.x,facing.y),snap=Math.PI/2-CHARACTER_DIRECTIONS.indexOf(characterDirection(facing,direction))*Math.PI/4;spine.rotation.y+=Math.atan2(Math.sin(yaw-snap),Math.cos(yaw-snap))*Math.sin(Math.PI*progress)**2;}
   head.rotation.set(p.headPitch,p.headYaw,p.headRoll);for(const eye of eyes)eye.scale.y=.046*p.blink;
   clothFront.rotation.x=p.clothFront;clothBack.rotation.x=p.clothBack;
   clothLeft.rotation.z=p.clothLeft;clothRight.rotation.z=p.clothRight;
   // Use the same eight world sectors as directional sprite art. Only the
   // displayed heading snaps; movement and action targeting keep their vectors.
   direction=characterDirection(facing,direction);
   model.rotation.y=Math.PI/2-CHARACTER_DIRECTIONS.indexOf(direction)*Math.PI/4;poseLeg(p.left,leftLeg,p.hipY);poseLeg(p.right,rightLeg,p.hipY);
   leftArm.upper.rotation.set(p.leftArm,0,REST_SPREAD+p.armSpread);rightArm.upper.rotation.set(p.rightArm,0,-REST_SPREAD-p.armSpread);
   leftArm.lower.rotation.set(p.leftElbow,0,0);rightArm.lower.rotation.set(p.rightElbow,0,0);leftArm.hand.rotation.set(p.leftWrist,0,0);rightArm.hand.rotation.set(p.rightWrist,0,0);
   // Wiki looks toward a world direction; turn it into hood-relative yaw.
   wiki.root.visible=!!wikiState;
   if(wikiState){const look=wikiState.look&&Math.hypot(wikiState.look.x,wikiState.look.y)>1e-6?wrapAngle(Math.atan2(wikiState.look.x,wikiState.look.y)-model.rotation.y-spine.rotation.y-head.rotation.y):null;wiki.pose({time,look,fold:wikiState.fold||0,talk:wikiState.talk??null,rest:!!wikiState.rest});}
   drivingGrip=0;toolGrip.position.set(0,-.02,.025);
   equipPickaxe(pickaxe,action,steady,!!cargoKind);
   equipFlare(flare,time,basketHeld||cargoKind?'belt':action==='collect'&&work==='lantern'?'right':'left');
   if(!steady)constrainWork(action,progress,{basket:basketHeld,work,flow,carrying:!!cargoKind});
   scene.updateMatrixWorld(true);basketGrip.quaternion.copy(leftArm.hand.getWorldQuaternion(new T.Quaternion())).invert().multiply(model.getWorldQuaternion(new T.Quaternion()));
   scene.updateMatrixWorld(true);
  },
  // World points the 2D world needs: the top of the hood, the tool hand, Wiki's cap.
  marks(){return {head:new T.Vector3(0,.48,0).applyMatrix4(head.matrixWorld),hand:rightArm.hand.getWorldPosition(new T.Vector3()),wiki:wiki.root.visible?wiki.top():null};},
  inspect(){const at=b=>b.getWorldPosition(new T.Vector3()).toArray();return {work:{action:renderedAction,progress:renderedProgress},leftFoot:at(leftLeg.foot),rightFoot:at(rightLeg.foot),leftKnee:at(leftLeg.lower),rightKnee:at(rightLeg.lower),pickaxe:equippedPickaxe?{tier:equippedPickaxe.tier,stowed:equippedPickaxe.root.parent===toolBack,grip:equippedPickaxe.root.localToWorld(new T.Vector3(0,drivingGrip,0)).toArray(),socket:equippedPickaxe.root.parent===toolBack?at(toolBack):rightArm.hand.localToWorld(new T.Vector3(0,-.02,.025)).toArray(),hand:at(rightArm.hand),head:equippedPickaxe.root.localToWorld(new T.Vector3(0,.50,0)).toArray()}:null,basket:equippedBasket?{tier:equippedBasket.tier,held:basketHeld,grip:at(equippedBasket.root)}:null,lantern:lanternModel.root.visible,flare:flareModel.root.visible?{held:!!flareHand,hand:flareHand,tip:flareModel.root.localToWorld(new T.Vector3(0,.38,0)).toArray()}:null,wiki:wiki.root.visible?wiki.inspect():null,lanternPosition:at(lanternModel.root),cargo:cargoKind,blink:eyes[0].scale.y/.046,leftHand:at(leftArm.hand),rightHand:at(rightArm.hand),hipY:hips.position.y,yaw:model.rotation.y,head:head.rotation.toArray().slice(0,3),spine:spine.rotation.toArray().slice(0,3),cloak:[clothFront.rotation.x,clothBack.rotation.x,clothLeft.rotation.z,clothRight.rotation.z]};},
  // Every visible mesh, grouped into the solid things that must never pass
  // through one another (rig-clips.js). A group is one rigid or jointed piece.
  solids(){
   const owner=new Map([[coat,'coat'],[hem,'coat'],[patch,'coat'],[neck,'collar'],[head,'head'],[wiki.root,'wiki'],[wiki.body,'wiki'],[wiki.base,'wikiFeet'],[leftArm.upper,'leftArm'],[rightArm.upper,'rightArm'],[leftArm.hand,'leftHand'],[rightArm.hand,'rightHand'],[leftLeg.upper,'leftLeg'],[rightLeg.upper,'rightLeg'],[toolGrip,'pickaxe'],[toolBack,'pickaxe'],[basketGrip,'basket'],[basketBack,'basket'],[lanternModel.root,'lantern'],[flareModel.root,'flare'],[cargoRoot,'cargo']]);
   const groups=new Map();
   scene.traverseVisible(o=>{if(!o.isMesh)return;let a=o;while(a&&!owner.has(a))a=a.parent;if(!a)return;const name=owner.get(a);if(!groups.has(name))groups.set(name,[]);groups.get(name).push(o);});
   return [...groups].map(([name,meshes])=>({name,meshes}));
  },
  // Where two solids are meant to meet: a joint (the whole pair) or a seam
  // near one point. A hand only meets the gear it is holding right now.
  contacts(){
   const at=b=>b.getWorldPosition(new T.Vector3()),list=[['leftArm','leftHand'],['rightArm','rightHand'],['collar','coat'],['collar','head']].map(([a,b])=>({a,b}));
   // The coat and collar close over the shoulder, and the hood's cowl drapes
   // a little further down over it.
   for(const [side,arm]of [['left',leftArm],['right',rightArm]])for(const [b,r]of [['coat',SHOULDER],['collar',SHOULDER],['head',COWL]])list.push({a:side+'Arm',b,at:at(arm.upper),r}); // i18n-ok: solid names for the clip test.
   // Bending joints: elbows, knees and ankles, where a limb's two segments meet.
   for(const [side,arm]of [['left',leftArm],['right',rightArm]])list.push({a:side+'Arm',b:side+'Arm',at:at(arm.lower),r:ELBOW}); // i18n-ok: solid names for the clip test.
   for(const [side,leg]of [['left',leftLeg],['right',rightLeg]])list.push({a:side+'Leg',b:side+'Leg',at:at(leg.lower),r:KNEE},{a:side+'Leg',b:side+'Leg',at:at(leg.foot),r:ANKLE}); // i18n-ok: solid names for the clip test.
   // The hood's rim tucks into the coat around the neck.
   list.push({a:'head',b:'coat',at:at(neck),r:NECK});
   // Wiki's fibre feet grow out of its stalk and hold onto the hood.
   list.push({a:'wikiFeet',b:'head'},{a:'wikiFeet',b:'wiki',at:at(wiki.base),r:WIKI_ROOT},{a:'wiki',b:'wiki',at:at(wiki.cap),r:WIKI_NECK});
   const held=equippedPickaxe&&equippedPickaxe.root.parent===toolGrip;
   if(held)list.push({a:'rightHand',b:'pickaxe'});
   if(basketHeld)list.push({a:'leftHand',b:'basket'});
   if(cargoKind)list.push({a:'leftHand',b:'cargo'},{a:'rightHand',b:'cargo'});
   if(renderedAction==='collect'&&renderedWork==='lantern')list.push({a:'leftHand',b:'lantern'});
   if(flareHand&&flareModel.root.visible)list.push({a:flareHand+'Hand',b:'flare'}); // i18n-ok: solid names for the clip test.
   return list;
  },
  bones:bones.length+wiki.bones,
  dispose(){for(const asset of baskets.values()){asset.root.removeFromParent();asset.dispose();}lanternModel.root.removeFromParent();lanternModel.dispose();flareModel.root.removeFromParent();flareModel.dispose();wiki.root.removeFromParent();wiki.dispose();for(const asset of pickaxes.values()){asset.root.removeFromParent();asset.dispose();}scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
 };
}
