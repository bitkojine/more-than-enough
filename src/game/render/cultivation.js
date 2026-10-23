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
export function drawCrystalCargo(ctx,cam,s,look){
 const c=s.cultivation;if(!c)return;const p=cam.project(s.player.x,s.player.y,s.player.z),u=cam.tilePx;
 if(c.gear.lantern)look.stand(ctx,look.level(Core.CULTIVATION_LOOK.lantern,c.lantern?1:0),p.x+u*.3,p.y-u*.15,u*.28);
 if(c.gear.carrier||c.starter||s.inv.crystal>0){
  const quality=c.starter?.health??c.quality;
  const id=c.gear.carrier?Core.CULTIVATION_LOOK.carrier:'resource.crystal',slot=c.gear.carrier?'image':'icon';
  const pic=c.gear.carrier?look.level(id,c.starter||s.inv.crystal>0?1:0):look.pick(id,slot);
  look.stand(ctx,pic,p.x-u*.3,p.y-u*.15,u*.3);
  if(c.starter||s.inv.crystal>0){ctx.fillStyle='#172328';ctx.fillRect(p.x-u*.5,p.y-u*.65,u*.4,u*.06);ctx.fillStyle=quality<35?'#ffc09c':'#c1cef5';ctx.fillRect(p.x-u*.5,p.y-u*.65,u*.4*quality/100,u*.06);}
 }
}
