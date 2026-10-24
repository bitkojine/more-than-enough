/* One reusable WebGL surface, composited into the existing 2D world renderer.
 * Geometry is authored once. Bones/IK own motion; there is no frame atlas. */
import * as T from '../../vendor/three/three.module.js';
import {rigPose,LEG_LENGTH} from './rig-motion.js';
import {createPickaxeModel,pickaxeTier} from './pickaxe-model.js';
import {characterDirection,CHARACTER_DIRECTIONS} from './character-direction.js';
const DOWN=new T.Vector3(0,-1,0);
export function createRiggedCharacter(){
 const canvas=document.createElement('canvas');
 const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
 if(!context)return null;
 const renderer=new T.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setSize(320,384,false);renderer.setPixelRatio(1);renderer.setClearColor(0,0);
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;
 const scene=new T.Scene(),model=new T.Group();scene.add(model);
 const camera=new T.OrthographicCamera(-1.146,1.146,1.375,-1.375,.1,30);
 camera.position.set(0,2.8,7);camera.lookAt(0,1.0,0);camera.updateMatrixWorld();
 // Match the default world's painted SVGs: authored flat fills, not light
 // responses to curved surfaces. The world's day/night overlay still applies
 // to the composited character together with trees, rocks and buildings.
 const material=color=>new T.MeshBasicMaterial({color,toneMapped:false});
 const outlineMaterial=new T.MeshBasicMaterial({color:0x1d1712,side:T.BackSide,toneMapped:false});
 // Expand in local space before Three applies skinning: cloak outlines follow
 // the same bone weights as the cloth, including during turns and actions.
 outlineMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed = position + normal * 0.026;');};
 outlineMaterial.customProgramCacheKey=()=> 'wanderer-flat-outline-v2';
 const orange=material(0xc8743a),inner=material(0x1d1712),black=material(0x3a2a1c),cream=material(0xeeeadf),linen=material(0xded4b7),thread=material(0xefe1bc);
 const bones=[],bone=(name,parent,x=0,y=0,z=0)=>{const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);bones.push(b);return b;};
 const root=bone('root',model),hips=bone('hips',root,0,.51),spine=bone('spine',hips,0,.38),neck=bone('neck',spine,0,.18),head=bone('head',neck,0,.30);
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
 const ink=(g,parent,x=0,y=0,z=0)=>mesh(g,outlineMaterial,parent,x,y,z);
 const hood=hoodGeometry();mesh(hood,orange,head);
 ink(hood,head);
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
  const t=j/rows,y=.48+t*.55,r=.44-.20*t+.015*Math.sin(t*Math.PI);
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
 const patchPoints=[],patchIndices=[];for(let j=0;j<=4;j++){const y=.62+j*.027,t=(y-.48)/.55,r=.446-.20*t+.015*Math.sin(t*Math.PI);for(let i=0;i<=6;i++){const a=-.63+i*.35/6;patchPoints.push(Math.sin(a)*r,y,Math.cos(a)*r*.76);}if(j<4)for(let i=0;i<6;i++){const q=j*7+i;patchIndices.push(q,q+7,q+1,q+1,q+7,q+8);}}
 const patchGeometry=new T.BufferGeometry();patchGeometry.setAttribute('position',new T.Float32BufferAttribute(patchPoints,3));patchGeometry.setIndex(patchIndices);patchGeometry.computeVertexNormals();clothGeometry(patchGeometry);
 const patch=new T.SkinnedMesh(patchGeometry,material(0xd18b54));patch.material.side=T.DoubleSide;model.add(patch);
 function arm(side){
  const upper=bone(side>0?'leftUpperArm':'rightUpperArm',spine,side*.295,.13,0),lower=bone(side>0?'leftForearm':'rightForearm',upper,0,-.20,0),hand=bone(side>0?'leftHand':'rightHand',lower,0,-.16,0);
  upper.rotation.z=side*.36;
  const sleeve=mesh(new T.CylinderGeometry(.10,.125,.27,32,6),orange,upper,0,-.12,0);sleeve.scale.z=.95;ink(sleeve.geometry,upper,0,-.12,0).scale.copy(sleeve.scale);
  const cuff=mesh(new T.TorusGeometry(.118,.006,8,32),thread,upper,0,-.255,0);cuff.rotation.x=Math.PI/2;
  mesh(new T.CylinderGeometry(.052,.055,.12,16),black,lower,0,-.10,0);
  ellipsoid(hand,black,0,-.02,0,.108,.115,.087);ellipsoid(hand,black,-side*.076,-.005,.040,.040,.060,.040);
  return {upper,lower,hand};
 }
 function shoeGeometry(width,length,depth){
  const x=-width/2,y=-length*.67,r=.04,shape=new T.Shape();
  shape.moveTo(x+r,y);shape.lineTo(x+width-r,y);shape.quadraticCurveTo(x+width,y,x+width,y+r);shape.lineTo(x+width,y+length-r);shape.quadraticCurveTo(x+width,y+length,x+width-r,y+length);shape.lineTo(x+r,y+length);shape.quadraticCurveTo(x,y+length,x,y+length-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);
  const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.009,bevelThickness:.008,curveSegments:12});g.rotateX(-Math.PI/2);g.computeVertexNormals();return g;
 }
 function leg(side){
  const upper=bone(side>0?'leftThigh':'rightThigh',hips,side*.125,0,0),lower=bone(side>0?'leftShin':'rightShin',upper,0,-LEG_LENGTH,0),foot=bone(side>0?'leftFoot':'rightFoot',lower,0,-LEG_LENGTH,0);
  mesh(new T.CylinderGeometry(.083,.074,LEG_LENGTH,24),black,upper,0,-LEG_LENGTH/2,0);
  mesh(new T.CylinderGeometry(.074,.066,LEG_LENGTH-.025,24),linen,lower,0,-LEG_LENGTH/2,0);
  for(let i=0;i<4;i++){const band=mesh(new T.TorusGeometry(.073-i*.0015,.0035,6,32),cream,lower,0,-.045-i*.05,0);band.rotation.x=Math.PI/2+.04;}
  mesh(shoeGeometry(.24,.30,.024),cream,foot,0,-.078,0);
  const shoe=mesh(shoeGeometry(.23,.285,.050),black,foot,0,-.049,0);ink(shoe.geometry,foot,0,-.049,0);
  return {upper,lower,foot};
 }
 const leftArm=arm(1),rightArm=arm(-1),leftLeg=leg(1),rightLeg=leg(-1);
 const toolGrip=new T.Group();toolGrip.position.set(0,-.02,.025);toolGrip.rotation.set(Math.PI+.08,0,.22);rightArm.hand.add(toolGrip);
 const toolBack=new T.Group();toolBack.position.set(0,-.05,-.26);toolBack.rotation.z=-.8;spine.add(toolBack);toolBack.visible=false;
 const holster=mesh(new T.TorusGeometry(.052,.012,6,16),black,toolBack);holster.rotation.x=Math.PI/2;
 // Cargo represents only a real starter or harvested crystal already carried
 // by the player. Both objects are cached, non-emissive presentation geometry.
 const cargoRoot=new T.Group();cargoRoot.position.set(0,-.045,.29);spine.add(cargoRoot);cargoRoot.visible=false;
 const specimen=new T.Group(),sealed=new T.Group();cargoRoot.add(specimen,sealed);
 const crystalMaterial=material(0xdf69ab);
 const shard=mesh(new T.ConeGeometry(.078,.22,5),crystalMaterial,specimen,0,0,0);shard.rotation.z=-.15;
 const fork=mesh(new T.ConeGeometry(.045,.13,5),crystalMaterial,specimen,.065,-.015,0);fork.rotation.z=-.65;
 mesh(new T.CylinderGeometry(.13,.12,.20,10),black,sealed);
 mesh(new T.CylinderGeometry(.14,.14,.035,10),linen,sealed,0,.105,0);
 mesh(new T.CylinderGeometry(.133,.133,.018,10),linen,sealed,0,-.10,0);
 const pickaxes=new Map();let equippedPickaxe=null;let cargoKind=null;
 function equipPickaxe(level,action,steady,carrying=false){
  const tier=pickaxeTier(level);
  if(equippedPickaxe&&equippedPickaxe.tier!==tier){equippedPickaxe.root.removeFromParent();equippedPickaxe=null;}
  if(!tier){toolBack.visible=false;return;}
  if(!pickaxes.has(tier))pickaxes.set(tier,createPickaxeModel(tier));
  equippedPickaxe=pickaxes.get(tier);
  const stowed=steady||carrying||['pick','collect','up','down','cheer'].includes(action),socket=stowed?toolBack:toolGrip;toolBack.visible=stowed;
  if(equippedPickaxe.root.parent!==socket)socket.add(equippedPickaxe.root);
 }
 model.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);coat.bind(skeleton);hem.bind(skeleton);patch.bind(skeleton);
 const coatInk=new T.SkinnedMesh(coatGeometry,outlineMaterial);model.add(coatInk);coatInk.bind(skeleton);
 const anchor=new T.Vector3(0,0,0).project(camera);
 const ax=(anchor.x+1)*.5*320,ay=(1-anchor.y)*.5*384;
 let lost=false,renders=0,direction='s';canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;});canvas.addEventListener('webglcontextrestored',()=>{lost=false;});
 function poseLeg(target,rig,hipY){
  const knee=new T.Vector3(0,target.knee.y-hipY,target.knee.z),ankle=new T.Vector3(0,target.foot.y-target.knee.y,target.foot.z-target.knee.z);
  const q1=new T.Quaternion().setFromUnitVectors(DOWN,knee.normalize()),q2=new T.Quaternion().setFromUnitVectors(DOWN,ankle.normalize());
  rig.upper.quaternion.copy(q1);rig.lower.quaternion.copy(q1).invert().multiply(q2);
  rig.foot.quaternion.copy(q2).invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),target.foot.pitch));
 }
 return {
  draw(ctx,x,y,u,{facing={x:0,y:1},phase=0,walking=false,blend=null,action=null,progress=0,time=0,steady=false,pickaxe=0,cargo=null}={}){
   if(lost)return null;
   cargoKind=!steady&&!action&&['specimen','sealed'].includes(cargo)?cargo:null;
   cargoRoot.visible=!!cargoKind;specimen.visible=cargoKind==='specimen';sealed.visible=cargoKind==='sealed';
   const p=rigPose({phase,walking,blend,action,progress,time,steady,carrying:!!cargoKind});hips.position.y=p.hipY;
   spine.rotation.set(p.lean,p.twist,p.roll);spine.position.y=.38+p.breath;
   head.rotation.set(p.headPitch,p.headYaw,p.headRoll);for(const eye of eyes)eye.scale.y=.046*p.blink;
   clothFront.rotation.x=p.clothFront;clothBack.rotation.x=p.clothBack;
   clothLeft.rotation.z=p.clothLeft;clothRight.rotation.z=p.clothRight;
   // Use the same eight world sectors as directional sprite art. Only the
   // displayed heading snaps; movement and action targeting keep their vectors.
   direction=characterDirection(facing,direction);
   model.rotation.y=Math.PI/2-CHARACTER_DIRECTIONS.indexOf(direction)*Math.PI/4;poseLeg(p.left,leftLeg,p.hipY);poseLeg(p.right,rightLeg,p.hipY);
   leftArm.upper.rotation.z=.36+p.armSpread;rightArm.upper.rotation.z=-.36-p.armSpread;
   leftArm.upper.rotation.x=p.leftArm;rightArm.upper.rotation.x=p.rightArm;leftArm.lower.rotation.x=p.leftElbow;rightArm.lower.rotation.x=p.rightElbow;leftArm.hand.rotation.x=p.leftWrist;rightArm.hand.rotation.x=p.rightWrist;
   equipPickaxe(pickaxe,action,steady,!!cargoKind);
   scene.updateMatrixWorld(true);renderer.render(scene,camera);renders++;
   const scale=u*1.22/384;ctx.drawImage(canvas,x-ax*scale,y-ay*scale,320*scale,384*scale);
   const project=b=>{const p=b.project(camera);return {x:x+((p.x+1)*.5*320-ax)*scale,y:y+((1-p.y)*.5*384-ay)*scale};};
   const h=project(new T.Vector3(0,.48,0).applyMatrix4(head.matrixWorld)),hand=project(rightArm.hand.getWorldPosition(new T.Vector3()));
   return {x:h.x,top:h.y,foot:y,handsX:hand.x,hands:hand.y};
  },
  inspect(){const at=b=>b.getWorldPosition(new T.Vector3()).toArray();return {leftFoot:at(leftLeg.foot),rightFoot:at(rightLeg.foot),leftKnee:at(leftLeg.lower),rightKnee:at(rightLeg.lower),pickaxe:equippedPickaxe?{tier:equippedPickaxe.tier,stowed:equippedPickaxe.root.parent===toolBack,grip:at(equippedPickaxe.root),socket:at(equippedPickaxe.root.parent),hand:at(rightArm.hand)}:null,cargo:cargoKind,blink:eyes[0].scale.y/.046,leftHand:at(leftArm.hand),rightHand:at(rightArm.hand),hipY:hips.position.y,yaw:model.rotation.y,head:head.rotation.toArray().slice(0,3),spine:spine.rotation.toArray().slice(0,3),cloak:[clothFront.rotation.x,clothBack.rotation.x,clothLeft.rotation.z,clothRight.rotation.z]};},
  get stats(){return {renders,bones:bones.length,skinnedMeshes:4,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,lost};},
  dispose(){for(const asset of pickaxes.values()){asset.root.removeFromParent();asset.dispose();}renderer.dispose();scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
 };
}
