/* Pure presentation constraints. Arms reach a real grip rather than rotating
 * independently of it. Coordinates are local to the chest; +Z is forward. */
import * as T from '../../vendor/three/three.module.js';
export const UPPER_ARM=.27,FOREARM=.25;
const V=p=>new T.Vector3(...p),clamp=x=>Math.max(0,Math.min(1,x));
export const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
// How far the hands are at the work. A stroke eases in from rest and back
// out, except where it runs straight on from or into another of the same
// (Gather held): there the hands stay at the work, so a tool in hand is never
// put away between strokes. `flow`: {joined, onward}, from the actor.
export const workWeight=(t,flow=null)=>(flow?.joined&&t<.5?1:smooth(t/.14))*(flow?.onward&&t>=.5?1:1-smooth((t-.84)/.16));
export function solveArm(shoulder,target,side){
 const s=V(shoulder),want=V(target),delta=want.clone().sub(s),distance=delta.length();
 const reach=Math.max(Math.abs(UPPER_ARM-FOREARM)+1e-6,Math.min(UPPER_ARM+FOREARM-1e-6,distance));
 const direction=distance>1e-8?delta.multiplyScalar(1/distance):new T.Vector3(0,-1,0);
 const along=(UPPER_ARM**2-FOREARM**2+reach**2)/(2*reach),height=Math.sqrt(Math.max(0,UPPER_ARM**2-along**2));
 const pole=new T.Vector3(side*1.5,-.3,0);pole.addScaledVector(direction,-pole.dot(direction));
 if(pole.lengthSq()<1e-8)pole.set(0,0,1).addScaledVector(direction,-direction.z);
 const elbow=s.clone().addScaledVector(direction,along).addScaledVector(pole.normalize(),height),hand=s.clone().addScaledVector(direction,reach);
 return {shoulder:s,elbow,hand,error:hand.distanceTo(want)};
}
function orientation(direction,edge){
 const y=V(direction).normalize(),x=V(edge);x.addScaledVector(y,-x.dot(y)).normalize();const z=new T.Vector3().crossVectors(x,y);
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
}
export const STROKE=[
 {at:0,p:[-.198,-.019,.515],d:[.10,-.10,.99],edge:[0,-1,-.10],grip:-.13},
 {at:.32,p:[-.351,.124,.422],d:[-.8,.55,.25],edge:[0,.4,-.9],grip:-.13},
 {at:.56,p:[-.200,-.001,.575],d:[.10,-.10,.99],edge:[0,-1,-.10],grip:-.13},
 {at:.70,p:[-.195,-.094,.473],d:[.10,-.28,.95],edge:[0,-.96,-.28],grip:-.13},
 {at:1,p:[-.198,-.019,.515],d:[.10,-.10,.99],edge:[0,-1,-.10],grip:-.13}
].map(k=>({...k,q:orientation(k.d,k.edge)}));
export function miningStroke(progress,flow=null){
 const t=clamp(progress);let i=0;while(i<STROKE.length-2&&t>STROKE[i+1].at)i++;
 const a=STROKE[i],b=STROKE[i+1],f=smooth((t-a.at)/(b.at-a.at));
 return {position:V(a.p).lerp(V(b.p),f),quaternion:a.q.clone().slerp(b.q,f),weight:workWeight(t,flow),grip:a.grip+(b.grip-a.grip)*f};
}
// Where each hand works, chest-local. Hands stay in front of the coat and
// clear of each other, the hood and the collar (rig-clips.js checks it).
export const WORK_HANDS={
 tend:{left:[.22,-.089,.351],right:[-.207,-.098,.378]},
 forage:{left:[.276,-.082,.386],reach:[-.144,-.04,.323],pocket:[-.299,-.045,.385],basketLeft:[.26,.05,.42],drop:[-.083,.025,.347]},
 build:{left:[.2,-.048,.409],right:[-.218,-.028,.359],press:.10},
 collect:{left:[.213,-.075,.426],right:[-.182,-.011,.361],reach:.058},
 // The left hand meets the lantern's ring from outside, so the arm stays clear of the coat.
 lantern:{right:[-.192,-.075,.342],reach:[.16,.06,0]},
 carry:{left:[.17,-.043,.365],right:[-.151,-.088,.416]}
};
export function workHands(action,progress,{basket=false,work=null,lantern=null,flow=null}={}){
 const t=clamp(progress),weight=workWeight(t,flow),beat=Math.sin(Math.PI*t)**2,H=WORK_HANDS;
 if(action==='pick'){
  if(['plant','tend','starter'].includes(work))return {weight,left:H.tend.left,right:H.tend.right};
  const f=H.forage,deposit=basket?smooth((t-.42)/.20)*(1-smooth((t-.82)/.18)):0;
  const right=V(f.reach).lerp(V(basket?f.drop:f.pocket),basket?deposit:smooth((t-.5)/.3));
  return {weight,left:basket?f.basketLeft:f.left,right:right.toArray()};
 }
 if(action==='build'){
  const press=Math.sin(Math.PI*((t*2)%1))**2,b=H.build;
  return {weight,left:b.left,right:[b.right[0],b.right[1],b.right[2]+b.press*press]};
 }
 if(action==='collect'){
  const c=H.collect;
  return work==='lantern'&&lantern?{weight,left:lantern.map((n,i)=>n+H.lantern.reach[i]),right:H.lantern.right}:{weight,left:c.left,right:[c.right[0],c.right[1],c.right[2]+c.reach*beat]};
 }
 return null;
}
