/* One reusable WebGL surface, composited into the existing 2D world renderer.
 * Geometry is authored once. Bones/IK own motion; there is no frame atlas. */
import * as T from '../../vendor/three/three.module.js';
import {rigPose,LEG_LENGTH} from './rig-motion.js';
const DOWN=new T.Vector3(0,-1,0);
export function createRiggedCharacter(){
 const canvas=document.createElement('canvas');
 const context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power'});
 if(!context)return null;
 const renderer=new T.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setSize(320,384,false);renderer.setPixelRatio(1);renderer.setClearColor(0,0);
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
 const scene=new T.Scene(),model=new T.Group();scene.add(model);
 const camera=new T.OrthographicCamera(-1.146,1.146,1.375,-1.375,.1,30);
 camera.position.set(0,2.8,7);camera.lookAt(0,1.0,0);camera.updateMatrixWorld();
 scene.add(new T.HemisphereLight(0xfff0d8,0x586b72,1.7));
 const key=new T.DirectionalLight(0xffebd5,2.4);key.position.set(-3,5,6);scene.add(key);
 const rim=new T.DirectionalLight(0xd9e7ff,.9);rim.position.set(4,2,-3);scene.add(rim);
 const material=(color,roughness=.85)=>new T.MeshStandardMaterial({color,roughness,metalness:0});
 const orange=material(0xe95b0f),inner=material(0x30231c),black=material(0x282723),cream=material(0xefe1bc),linen=material(0xded4b7),thread=material(0xf5e3b8),eye=material(0x120f0c,.45);
 const bones=[],bone=(name,parent,x=0,y=0,z=0)=>{const b=new T.Bone();b.name=name;b.position.set(x,y,z);parent.add(b);bones.push(b);return b;};
 const root=bone('root',model),hips=bone('hips',root,0,.58),spine=bone('spine',hips,0,.45),neck=bone('neck',spine,0,.25),head=bone('head',neck,0,.32);
 const mesh=(g,m,parent,x=0,y=0,z=0)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;};
 const ellipsoid=(parent,m,x,y,z,rx,ry,rz)=>{const o=mesh(new T.SphereGeometry(1,32,24),m,parent,x,y,z);o.scale.set(rx,ry,rz);return o;};
 function hoodGeometry(){
  const controls=[[.30,.40,.26,0],[.36,.45,.20,0],[.43,.47,.02,0],[.45,.43,-.20,0],[.34,.31,-.40,.13],[.12,.14,-.50,.23],[.001,.001,-.53,.25]],pos=[],idx=[],segments=64;
  const interpolate=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
  const rings=Array.from({length:33},(_,i)=>{const f=i/32*(controls.length-1),k=Math.min(controls.length-2,Math.floor(f)),t=f-k;return controls[k].map((_,j)=>interpolate(controls[Math.max(0,k-1)][j],controls[k][j],controls[k+1][j],controls[Math.min(controls.length-1,k+2)][j],t));});
  for(const [rx,ry,z,cy]of rings)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;pos.push(rx*Math.cos(a),cy+ry*Math.sin(a),z);}
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;idx.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
 }
 const hood=hoodGeometry();mesh(hood,orange,head);
 const outlineMaterial=new T.MeshBasicMaterial({color:0x302017,side:T.BackSide});
 const hoodOutline=hood.clone(),hp=hoodOutline.attributes.position,hn=hoodOutline.attributes.normal;for(let i=0;i<hp.count;i++)hp.setXYZ(i,hp.getX(i)+hn.getX(i)*.012,hp.getY(i)+hn.getY(i)*.012,hp.getZ(i)+hn.getZ(i)*.012);mesh(hoodOutline,outlineMaterial,head);
 const inside=inner.clone();inside.side=T.BackSide;mesh(hood,inside,head);
 const lip=mesh(new T.TorusGeometry(1,.10,12,64),inner,head,0,0,.275);lip.scale.set(.30,.40,.30);
 ellipsoid(head,cream,0,0,.26,.275,.355,.22);
 for(const x of [-.09,.09])ellipsoid(head,eye,x,.06,.477,.024,.042,.014);
 // Soft collar joins hood and cloak rather than adding a floating costume icon.
 const collar=mesh(new T.TorusGeometry(.235,.065,12,48),orange,neck,0,-.025,0);collar.rotation.x=Math.PI/2;
 const bodyMat=orange.clone();bodyMat.side=T.DoubleSide;
 const positions=[],indices=[],skinIndices=[],skinWeights=[],segments=64,rows=16;
 for(let j=0;j<=rows;j++){
  const t=j/rows,y=.59+t*.66,r=.425-.20*t+.015*Math.sin(t*Math.PI);
  for(let i=0;i<=segments;i++){
   const a=i/segments*Math.PI*2,x=Math.sin(a)*r,z=Math.cos(a)*r*.76;
   positions.push(x,y,z);
   const upper=Math.min(1,Math.max(0,(t-.25)/.6));skinIndices.push(bones.indexOf(hips),bones.indexOf(spine),0,0);skinWeights.push(1-upper,upper,0,0);
  }
 }
 for(let j=0;j<rows;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+segments+1;indices.push(a,a+1,b,a+1,b+1,b);}
 const coatGeometry=new T.BufferGeometry();coatGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));coatGeometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndices,4));coatGeometry.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeights,4));coatGeometry.setIndex(indices);coatGeometry.computeVertexNormals();
 const coat=new T.SkinnedMesh(coatGeometry,bodyMat);model.add(coat);
 const seamMat=material(0xb34c15);
 const frontSeam=mesh(new T.CylinderGeometry(.004,.004,.62,8),seamMat,hips,0,.32,.268);frontSeam.rotation.x=-.15;
 const hem=new T.InstancedMesh(new T.CylinderGeometry(.0025,.0025,.028,6),thread,44);hips.add(hem);
 const dummy=new T.Object3D();
 for(let i=0;i<44;i++){const a=i/44*Math.PI*2;dummy.position.set(.416*Math.sin(a),.04,.316*Math.cos(a));dummy.rotation.set(0,0,Math.PI/2);dummy.updateMatrix();hem.setMatrixAt(i,dummy.matrix);}
 function arm(side){
  const upper=bone(side>0?'leftUpperArm':'rightUpperArm',spine,side*.295,.13,0),lower=bone(side>0?'leftForearm':'rightForearm',upper,0,-.20,0),hand=bone(side>0?'leftHand':'rightHand',lower,0,-.16,0);
  upper.rotation.z=side*.36;
  const sleeve=mesh(new T.CylinderGeometry(.10,.125,.27,32,6),orange,upper,0,-.12,0);sleeve.scale.z=.95;
  const cuff=mesh(new T.TorusGeometry(.118,.006,8,32),thread,upper,0,-.255,0);cuff.rotation.x=Math.PI/2;
  mesh(new T.CylinderGeometry(.052,.055,.12,16),black,lower,0,-.10,0);
  ellipsoid(hand,black,0,-.02,0,.085,.10,.07);ellipsoid(hand,black,-side*.061,-.005,.036,.034,.055,.034);
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
  mesh(shoeGeometry(.20,.30,.024),cream,foot,0,-.078,0);
  mesh(shoeGeometry(.19,.285,.050),black,foot,0,-.049,0);
  return {upper,lower,foot};
 }
 const leftArm=arm(1),rightArm=arm(-1),leftLeg=leg(1),rightLeg=leg(-1);
 model.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);coat.bind(skeleton);
 const anchor=new T.Vector3(0,0,0).project(camera);
 const ax=(anchor.x+1)*.5*320,ay=(1-anchor.y)*.5*384;
 let lost=false,renders=0;canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;});canvas.addEventListener('webglcontextrestored',()=>{lost=false;});
 function poseLeg(target,rig,hipY){
  const knee=new T.Vector3(0,target.knee.y-hipY,target.knee.z),ankle=new T.Vector3(0,target.foot.y-target.knee.y,target.foot.z-target.knee.z);
  const q1=new T.Quaternion().setFromUnitVectors(DOWN,knee.normalize()),q2=new T.Quaternion().setFromUnitVectors(DOWN,ankle.normalize());
  rig.upper.quaternion.copy(q1);rig.lower.quaternion.copy(q1).invert().multiply(q2);
  rig.foot.quaternion.copy(q2).invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),target.foot.pitch));
 }
 return {
  draw(ctx,x,y,u,{facing={x:0,y:1},phase=0,walking=false,blend=null,action=null,progress=0}={}){
   if(lost)return null;
   const p=rigPose({phase,walking,blend,action,progress});hips.position.y=p.hipY;spine.rotation.x=p.lean;
   model.rotation.y=Math.atan2(facing.x,facing.y);poseLeg(p.left,leftLeg,p.hipY);poseLeg(p.right,rightLeg,p.hipY);
   leftArm.upper.rotation.x=p.leftArm;rightArm.upper.rotation.x=p.rightArm+p.reach;leftArm.lower.rotation.x=-.10;rightArm.lower.rotation.x=-.10;
   scene.updateMatrixWorld(true);renderer.render(scene,camera);renders++;
   const scale=u*1.22/384;ctx.drawImage(canvas,x-ax*scale,y-ay*scale,320*scale,384*scale);
   const project=b=>{const p=b.project(camera);return {x:x+((p.x+1)*.5*320-ax)*scale,y:y+((1-p.y)*.5*384-ay)*scale};};
   const h=project(new T.Vector3(0,.48,0).applyMatrix4(head.matrixWorld)),hand=project(rightArm.hand.getWorldPosition(new T.Vector3()));
   return {x:h.x,top:h.y,foot:y,handsX:hand.x,hands:hand.y};
  },
  inspect(){const at=b=>b.getWorldPosition(new T.Vector3()).toArray();return {leftFoot:at(leftLeg.foot),rightFoot:at(rightLeg.foot),leftKnee:at(leftLeg.lower),rightKnee:at(rightLeg.lower),hipY:hips.position.y};},
  get stats(){return {renders,bones:bones.length,skinnedMeshes:1,triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,lost};},
  dispose(){renderer.dispose();scene.traverse(o=>{o.geometry?.dispose();if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});}
 };
}
