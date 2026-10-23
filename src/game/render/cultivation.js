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
 const id=Core.CULTIVATION_LOOK[b.kind],pic=look.stage(id,b.buffer?Math.min(1,b.buffer/20):0);
 const h=look.stand(ctx,pic,p.x,p.y,u);
 ctx.save();ctx.strokeStyle='#f5f2e9';ctx.lineWidth=Math.max(1,u*.025);
 if(b.kind==='cooler'){
  const cx=p.x,cy=p.y-h*.45,r=u*.2;
  ctx.fillStyle='#28484d';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.stroke();
  for(let i=0;i<4;i++){const a=i*Math.PI/2+.3;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.stroke();}
 }else if(['chamber','vault','machine'].includes(b.kind)){
  const x=p.x-u*.18,y=p.y-h*.35;ctx.fillStyle=b.closed?'#192629':'#bcc6f4';ctx.fillRect(x,y,u*.36,u*.28);ctx.strokeRect(x,y,u*.36,u*.28);
  if(b.closed){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+u*.36,y+u*.28);ctx.stroke();}
  if(b.health!==undefined&&b.health<60){ctx.strokeStyle='#ffc09c';ctx.beginPath();ctx.moveTo(x+u*.12,y);ctx.lineTo(x+u*.06,y+u*.14);ctx.lineTo(x+u*.22,y+u*.25);ctx.stroke();}
 }
 if(b.kind==='machine'){
  for(let i=0;i<Core.MACHINE_REPAIRS.length;i++){
   const x=p.x-u*.28+i*u*.2,y=p.y-h*.6;ctx.strokeRect(x,y,u*.14,u*.12);
   if(i<Core.machineSections(b)){ctx.fillStyle=s.cultivation.completed?'#f5f2e9':'#bcc6f4';ctx.fillRect(x+u*.025,y+u*.025,u*.09,u*.07);}
  }
 }
 if(b.reinforced){ctx.strokeRect(p.x-u*.3,p.y-h*.2,u*.6,u*.12);}
 const danger=b.temperature>22||b.needsTend||b.health===0;
 if(danger){ctx.fillStyle='#ffc09c';ctx.beginPath();ctx.moveTo(p.x+u*.3,p.y-h-u*.15);ctx.lineTo(p.x+u*.42,p.y-h+u*.08);ctx.lineTo(p.x+u*.18,p.y-h+u*.08);ctx.closePath();ctx.fill();}
 ctx.restore();
 if(b.kind==='conduit')for(const id of [b.from,b.to]){const other=s.cultivation.facilities.find(a=>a.id===id);if(other&&Core.isExplored(s.world,other.x,other.y,other.z))chalkLine(ctx,p,cam.project(other.x+.5,other.y+.5,other.z));}
}
export function drawCrystalCargo(ctx,cam,s,look){
 const c=s.cultivation;if(!c)return;const p=cam.project(s.player.x,s.player.y,s.player.z),u=cam.tilePx;
 if(c.gear.lantern)look.stand(ctx,look.pick('mark.lamp','image'),p.x+u*.3,p.y-u*.15,u*.28);
 if(c.starter||s.inv.crystal>0){
  const quality=c.starter?.health??c.quality;
  const id=c.gear.carrier?'building.depot':'resource.crystal',slot=c.gear.carrier?'image':'icon';
  look.stand(ctx,look.pick(id,slot),p.x-u*.3,p.y-u*.15,u*.3);
  ctx.fillStyle='#172328';ctx.fillRect(p.x-u*.5,p.y-u*.65,u*.4,u*.06);ctx.fillStyle=quality<35?'#ffc09c':'#c1cef5';ctx.fillRect(p.x-u*.5,p.y-u*.65,u*.4*quality/100,u*.06);
 }
}
