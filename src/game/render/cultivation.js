/* New machinery uses the existing texture pack and projection, with physical
 * shutters, cooling fans and condition marks added to the familiar buildings. */
import * as Core from '../../core/index.js';
import {chalkLine} from './chalk.js';
export function cultivationRows(s,z){
 const rows=new Map();for(const b of s.cultivation?.facilities||[])if(b.z===z&&Core.isExplored(s.world,b.x,b.y,z)){if(!rows.has(b.y))rows.set(b.y,[]);rows.get(b.y).push(b);}return rows;
}
export function drawCultivation(ctx,cam,s,look,b){
 const u=cam.tilePx,p=cam.project(b.x+.5,b.y+.65,b.z);
 if(p.x< -u*2||p.x>cam.width+u*2||p.y< -u||p.y>cam.height+u*3)return;
 const id=Core.CULTIVATION_LOOK[b.kind];
 const phase=b.kind==='machine'?(s.cultivation.completed?4:Core.machineSections(b)):
  b.kind==='chamber'?(!b.closed?2:b.health>0?1:0):b.buffer>0?1:0;
 const pic=look.level(id,phase),h=look.stand(ctx,pic,p.x,p.y,u);
 ctx.save();ctx.strokeStyle='#eee9dc';ctx.lineWidth=Math.max(1,u*.025);
 if(b.kind==='chamber'&&b.health!==undefined&&b.health<60){
  ctx.strokeStyle='#ffc09c';const x=p.x-u*.18,y=p.y-h*.45;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+u*.1,y+u*.12);ctx.lineTo(x-u*.03,y+u*.22);ctx.stroke();
 }
 // Unsealed vault/machine doors retain an unmistakable open-hatch mark.
 if(!b.closed&&['vault','machine'].includes(b.kind)){
  ctx.strokeStyle='#eee9dc';ctx.strokeRect(p.x-u*.12,p.y-h*.42,u*.24,u*.18);
  ctx.beginPath();ctx.moveTo(p.x+u*.12,p.y-h*.42);ctx.lineTo(p.x+u*.24,p.y-h*.48);ctx.lineTo(p.x+u*.24,p.y-h*.27);ctx.stroke();
 }
 if(b.reinforced){ctx.strokeRect(p.x-u*.3,p.y-h*.2,u*.6,u*.12);}
 const danger=b.temperature>22||b.needsTend||b.health===0;
 if(danger){ctx.fillStyle='#ffc09c';ctx.beginPath();ctx.moveTo(p.x+u*.3,p.y-h-u*.15);ctx.lineTo(p.x+u*.42,p.y-h+u*.08);ctx.lineTo(p.x+u*.18,p.y-h+u*.08);ctx.closePath();ctx.fill();}
 ctx.restore();
 if(b.kind==='conduit')for(const id of [b.from,b.to]){const other=s.cultivation.facilities.find(a=>a.id===id);if(other&&Core.isExplored(s.world,other.x,other.y,other.z))chalkLine(ctx,p,cam.project(other.x+.5,other.y+.5,other.z));}
}
// Condition feedback follows the same posed head anchor as the figure.
// The capsule/crystal itself is painted into the selected carrying pose.
export function drawCrystalCargo(ctx,cam,s,look,character){
 const c=s.cultivation;if(!c||!character||(!c.starter&&s.inv.crystal<=0))return;
 const quality=c.starter?.health??c.quality,u=cam.tilePx,x=character.x-u*.2,y=character.top-u*.12;
 ctx.fillStyle='#172328';ctx.fillRect(x,y,u*.4,u*.06);
 ctx.fillStyle=quality<35?'#ffc09c':'#c1cef5';ctx.fillRect(x,y,u*.4*quality/100,u*.06);
}
