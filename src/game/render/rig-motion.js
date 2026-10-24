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
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{const t=clamp(x);return t*t*(3-2*t);};
// Anticipation -> contact -> recovery. Distinct performances share action
// timing with gameplay; they never determine when a resource is earned.
export function actionPose(action,progress){
 const t=clamp(progress),envelope=Math.sin(Math.PI*t)**2;
 const p={bow:0,twist:0,crouch:0,left:0,right:0,leftElbow:0,rightElbow:0,spread:0};
 if(action==='pick'){
  p.bow=.38*envelope;p.crouch=.055*envelope;
  p.right=-.85*envelope;p.rightElbow=-.5*envelope;p.left=-.25*envelope;
 }else if(action==='collect'){
  p.bow=.16*envelope;p.twist=-.12*envelope;
  p.right=-1.1*envelope;p.rightElbow=-.3*envelope;p.left=-.35*envelope;
 }else if(action==='swing'||action==='build'){
  const q=action==='build'?(t*2)%1:t;
  const wind=ease(q/.38)*(1-ease((q-.38)/.18));
  const strike=ease((q-.38)/.18)*(1-ease((q-.56)/.44));
  const gate=action==='build'?envelope:1;
  p.bow=gate*(-.10*wind+.26*strike);p.twist=gate*(.13*wind-.10*strike);
  p.crouch=.025*strike*gate;p.right=gate*(-1.65*wind-.85*strike);
  p.left=gate*(-.8*wind-.45*strike);p.rightElbow=-.6*wind*gate;p.leftElbow=-.35*wind*gate;
 }else if(action==='cheer'){
  p.spread=.9*envelope;p.left=p.right=-2.4*envelope;p.leftElbow=p.rightElbow=-.35*envelope;
 }else if(action==='up'){
  p.left=-envelope*(1.3+.5*Math.sin(TAU*t*3));p.right=-envelope*(1.3-.5*Math.sin(TAU*t*3));
  p.leftElbow=p.rightElbow=-.45*envelope;p.bow=.12*envelope;
 }else if(action==='down'){
  p.spread=.18*envelope;p.left=p.right=-.55*envelope;p.crouch=.045*Math.sin(Math.PI*clamp((t-.55)/.45))**2;
  p.bow=.15*envelope;
 }
 return p;
}
export function rigPose({phase=0,walking=false,blend=null,action=null,progress=0,time=0,steady=false}={}){
 const p=((phase%1)+1)%1,w=TAU*p,weight=clamp(blend??(walking?1:0));
 const work=actionPose(action,progress),idle=(1-weight)*(steady?0:1);
 const hipY=.619+weight*(.59-.012*Math.cos(w*2)-.619)-work.crouch;
 const target=phase=>{if(!weight)return {y:.09,z:0,pitch:0};const raw=legTarget(phase),pitch=raw.pitch*weight;return {y:Math.max(ankleY(pitch),.09+(raw.y-.09)*weight),z:raw.z*weight,pitch};};
 const left=target(p),right=target(p+.5),swing=weight*(.36*Math.cos(w)+.045*Math.sin(w*3));
 const roll=weight*.055*Math.sin(w),twist=weight*.085*Math.sin(w+.3);
 const pose={hipY,left:solveLeg(hipY,left),right:solveLeg(hipY,right),
  leftArm:swing+work.left,rightArm:-swing+work.right,armSpread:work.spread,
  leftElbow:-.15-weight*.16*(1+Math.sin(w-.4))+work.leftElbow,
  rightElbow:-.15-weight*.16*(1-Math.sin(w-.4))+work.rightElbow,
  leftWrist:weight*.09*Math.sin(w-.7),rightWrist:-weight*.09*Math.sin(w-.7),
  lean:work.bow+weight*(.045+.025*Math.sin(w*2-.4)),roll,twist:twist+work.twist,
  breath:idle*.006*Math.sin(time*2.1),
  headPitch:-work.bow*.45+weight*.025*Math.sin(w*2-.8),
  headRoll:-roll*.7+weight*.018*Math.sin(w-.7),
  headYaw:-twist*.6+idle*.035*Math.sin(time*.7),
  clothFront:weight*(.035+.055*Math.sin(w*2-.85))+work.bow*.16,
  clothBack:weight*(-.045+.065*Math.sin(w*2-1.3))-work.bow*.12,
  clothLeft:weight*.075*Math.sin(w-.9),clothRight:-weight*.075*Math.sin(w-.9)};
 // Normalize signed zero so a fully settled pose is phase-independent.
 for(const k of Object.keys(pose))if(pose[k]===0)pose[k]=0;
 return pose;
}
