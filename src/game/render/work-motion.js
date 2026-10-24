/* Pure presentation constraints. Arms reach a real grip rather than rotating
 * independently of it. Coordinates are local to the chest; +Z is forward. */
import * as T from '../../vendor/three/three.module.js';
export const UPPER_ARM=.24,FOREARM=.22,GUIDE_GRIP=-.14;
const V=p=>new T.Vector3(...p),clamp=x=>Math.max(0,Math.min(1,x));
export const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
export const workWeight=t=>smooth(t/.14)*(1-smooth((t-.84)/.16));
export function solveArm(shoulder,target,side){
 const s=V(shoulder),want=V(target),delta=want.clone().sub(s),distance=delta.length();
 const reach=Math.max(Math.abs(UPPER_ARM-FOREARM)+1e-6,Math.min(UPPER_ARM+FOREARM-1e-6,distance));
 const direction=distance>1e-8?delta.multiplyScalar(1/distance):new T.Vector3(0,-1,0);
 const along=(UPPER_ARM**2-FOREARM**2+reach**2)/(2*reach),height=Math.sqrt(Math.max(0,UPPER_ARM**2-along**2));
 const pole=new T.Vector3(side,-.3,-.65);pole.addScaledVector(direction,-pole.dot(direction));
 if(pole.lengthSq()<1e-8)pole.set(0,0,1).addScaledVector(direction,-direction.z);
 const elbow=s.clone().addScaledVector(direction,along).addScaledVector(pole.normalize(),height),hand=s.clone().addScaledVector(direction,reach);
 return {shoulder:s,elbow,hand,error:hand.distanceTo(want)};
}
function orientation(direction,edge){
 const y=V(direction).normalize(),x=V(edge);x.addScaledVector(y,-x.dot(y)).normalize();const z=new T.Vector3().crossVectors(x,y);
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
}
const STROKE=[
 {at:0,p:[-.05,.08,.28],d:[.10,-.10,.99],edge:[0,-1,-.10],grip:0},
 {at:.32,p:[-.208,.068,.280],d:[-.8,.55,.25],edge:[0,.4,-.9],grip:.24},
 {at:.56,p:[-.05,.10,.38],d:[.10,-.10,.99],edge:[0,-1,-.10],grip:0},
 {at:.70,p:[-.05,.08,.34],d:[.10,-.28,.95],edge:[0,-.96,-.28],grip:0},
 {at:1,p:[-.05,.08,.28],d:[.10,-.10,.99],edge:[0,-1,-.10],grip:0}
].map(k=>({...k,q:orientation(k.d,k.edge)}));
export function miningStroke(progress){
 const t=clamp(progress);let i=0;while(i<STROKE.length-2&&t>STROKE[i+1].at)i++;
 const a=STROKE[i],b=STROKE[i+1],f=smooth((t-a.at)/(b.at-a.at));
 return {position:V(a.p).lerp(V(b.p),f),quaternion:a.q.clone().slerp(b.q,f),weight:workWeight(t),grip:a.grip+(b.grip-a.grip)*f};
}
export function workHands(action,progress,{basket=false,work=null}={}){
 const t=clamp(progress),weight=workWeight(t),beat=Math.sin(Math.PI*t)**2;
 if(action==='pick'){
  if(['plant','tend','starter'].includes(work))return {weight,left:[.10,-.12,.28],right:[-.10,-.12,.28]};
  const deposit=basket?smooth((t-.42)/.20)*(1-smooth((t-.82)/.18)):0;
  const right=V([-.13,-.23,.28]).lerp(V(basket?[-.04,.02,.34]:[-.17,-.10,.17]),basket?deposit:smooth((t-.5)/.3));
  return {weight,left:basket?[.05,.20,.40]:[.19,-.16,.15],right:right.toArray()};
 }
 if(action==='build'){
  const press=Math.sin(Math.PI*((t*2)%1))**2;
  return {weight,left:[.12,-.08,.25],right:[-.12,-.08,.22+.10*press]};
 }
 if(action==='collect')return work==='lantern'?{weight,left:[.42,-.08,.13],right:[-.27,-.20,.04]}:{weight,left:[.16,-.06,.24],right:[-.11,-.10,.20+.13*beat]};
 return null;
}
