/* Presentation only. Model faces +Z; +X is its anatomical left. */
export const LEG_LENGTH=.265;
const TAU=Math.PI*2;
const ankleY=pitch=>Math.max(.09,.086*Math.cos(pitch)+Math.max(.211*Math.sin(pitch),-.109*Math.sin(pitch)));
export function legTarget(phase){
 const p=((phase%1)+1)%1;
 if(p<.5){const pitch=-.12*Math.cos(TAU*p);return {y:ankleY(pitch),z:.16*(1-4*p),pitch};}
 const t=(p-.5)*2;
 const pitch=.12*Math.cos(Math.PI*t)+.08*Math.sin(Math.PI*t);
 return {y:ankleY(pitch)+.09*Math.sin(Math.PI*t)**2,z:.16*(-1-2*t+12*t*t-8*t*t*t),pitch};
}
export function solveLeg(hipY,foot){
 const dy=foot.y-hipY,dz=foot.z,d=Math.hypot(dy,dz);
 const reach=Math.min(LEG_LENGTH*2-1e-7,Math.max(1e-7,d));
 const a=reach/2,h=Math.sqrt(Math.max(0,LEG_LENGTH**2-a*a));
 const uy=dy/(d||1),uz=dz/(d||1);
 return {knee:{y:hipY+a*uy+h*uz,z:a*uz-h*uy},foot:{...foot,y:hipY+uy*reach,z:uz*reach}};
}
export function rigPose({phase=0,walking=false,blend=null,action=null,progress=0}={}){
 const p=((phase%1)+1)%1,weight=Math.max(0,Math.min(1,blend??(walking?1:0)));
 const hipY=.619+weight*(.59-.012*Math.cos(TAU*p*2)-.619);
 const target=phase=>{if(!weight)return {y:.09,z:0,pitch:0};const raw=legTarget(phase),pitch=raw.pitch*weight;return {y:Math.max(ankleY(pitch),.09+(raw.y-.09)*weight),z:raw.z*weight,pitch};};
 const left=target(p),right=target(p+.5);
 const work=Math.sin(Math.PI*Math.max(0,Math.min(1,progress)));
 return {hipY,left:solveLeg(hipY,left),right:solveLeg(hipY,right),
  leftArm:weight?weight*.28*Math.cos(TAU*p):0,rightArm:weight?-weight*.28*Math.cos(TAU*p):0,
  lean:['pick','collect','build','swing'].includes(action)?.12*work:0,
  reach:['pick','collect','build','swing'].includes(action)?-.65*work:0};
}
