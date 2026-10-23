// World axes, independent of camera scale: north is -Y and east is +X.
export const CHARACTER_DIRECTIONS=Object.freeze(['e','se','s','sw','w','nw','n','ne']);
export function characterDirection(vector,previous='s'){
 const x=vector?.x??0,y=vector?.y??0;
 if(!Number.isFinite(x)||!Number.isFinite(y)||Math.hypot(x,y)<1e-6)return previous;
 return CHARACTER_DIRECTIONS[(Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8];
}
