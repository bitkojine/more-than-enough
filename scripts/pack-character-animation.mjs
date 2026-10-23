/* Manual art production tool. Extracts complete generated sequential drawings,
 * never invents in-betweens or repeats a still to meet a frame-count target. */
import fs from 'node:fs';
import {execFileSync as run} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(fs.readFileSync(root+'art/characters/animation.json'));
const temp=fs.mkdtempSync(join(tmpdir(),'mte-animation-'));
const magick=args=>run('magick',args,{maxBuffer:30e6});
try{
 for(const sheet of config.sheets){
  if(process.argv[2]&&!sheet.clips.includes(process.argv[2]))continue;
  const source=root+'art/characters/'+sheet.file;
  const info=magick([source,'-alpha','extract','-threshold','70%','-define','connected-components:verbose=true','-connected-components','8','null:']).toString();
  const figures=info.split('\n').flatMap(line=>{
   const m=line.match(/^\s*(\d+): (\d+)x(\d+)\+(\d+)\+(\d+) ([\d.]+),([\d.]+) ([\de+.]+) .*\(255,255,255\)/);
   if(!m||Number(m[8])<5000)return [];
   const [id,w,h,x,y,cx,cy]=m.slice(1,8).map(Number);return [{id,w,h,x,y,cx,cy}];
  }).sort((a,b)=>a.cy-b.cy);
  if(figures.length!==16)throw Error(sheet.file+': expected 16 complete figures, found '+figures.length);
  const ordered=[];
  for(let row=0;row<4;row++)ordered.push(...figures.slice(row*4,row*4+4).sort((a,b)=>a.cx-b.cx));
  const cells=[];
  for(let i=0;i<16;i++){
   const figure=ordered[i],cell=join(temp,'cell-'+i+'.png'),cut=join(temp,'cut.png'),mask=join(temp,'mask.png');
   const cw=figure.w+8,ch=figure.h+8;
   // Component bounds follow the actual figure, not a nominal grid. Mask the
   // small crop, avoiding a full-sheet components pass for each output frame.
   magick([source,'-crop',`${cw}x${ch}+${figure.x-4}+${figure.y-4}`,'+repage',cut]);
   magick([cut,'-alpha','extract','-threshold','70%','-morphology','Dilate','Disk:1',mask]);
   magick([cut,'(',mask,'-alpha','copy',')','-compose','DstIn','-composite',cell]);
   const rgba=magick([cell,'-depth','8','rgba:-']);
   let bottom=0,hood=ch;const orangePixels=[],coat=[];
   for(let y=0;y<ch;y++){
    let orange=0;
    for(let x=0;x<cw;x++){
     const j=(y*cw+x)*4,r=rgba[j],g=rgba[j+1],b=rgba[j+2],a=rgba[j+3];
     if(a<180)continue;
     bottom=Math.max(bottom,y);
     if(r>120&&g>40&&g<180&&b<130&&r>g*1.18){orange++;orangePixels.push([x,y]);if(r>g*1.6&&b<g*.45)coat.push([x,y]);}
    }
    if(orange>=6)hood=Math.min(hood,y);
   }
   if(bottom<=hood)throw Error('Unrecognized pose '+sheet.file+' cell '+i);
   const band=orangePixels.filter(([,y])=>y>=hood+18&&y<=hood+48);
   const headX=band.reduce((n,p)=>n+p[0],0)/band.length;
   const action=/mine|gather/.test(sheet.clips[Math.floor(i/8)]);
   if(action){
    // The tool can extend below or far ahead of the boots. Locate the pelvis
    // from orange cloth, then find support only in the corridor below it.
    const coatBottom=Math.max(...coat.map(p=>p[1]));
    const hips=coat.filter(([,y])=>y>=coatBottom-20);
    const hipX=hips.reduce((n,p)=>n+p[0],0)/hips.length;
    const x0=Math.max(0,Math.floor(hipX-95)),x1=Math.min(cw-1,Math.ceil(hipX+95));
    bottom=0;
    for(let y=Math.floor(ch*.5);y<ch;y++)for(let x=x0;x<=x1;x++)if(rgba[(y*cw+x)*4+3]>180)bottom=Math.max(bottom,y);
    let footSum=0,footMass=0;
    for(let y=bottom-10;y<=bottom;y++)for(let x=x0;x<=x1;x++)if(rgba[(y*cw+x)*4+3]>180){footSum+=x;footMass++;}
    cells.push({cell,cw,ch,bottom,hood,headX,hipX,footX:footSum/footMass});
   }else cells.push({cell,cw,ch,bottom,hood,headX});
  }
  if(process.env.MTE_ART_INSPECT){console.log(cells.map(({cw,ch,bottom,hood,headX,hipX,footX})=>({cw,ch,bottom,hood,headX,hipX,footX})));continue;}
  // One scale per sheet preserves authored crouch, recoil and rise. Actions
  // register at the feet; walking registers at the head to avoid lateral jitter.
  const reference=cells.slice(0,sheet.referenceFrames||8).map(c=>c.bottom-c.hood).sort((a,b)=>a-b);
  const scale=240/reference[Math.floor(reference.length/2)];
  let packed=0;
  for(let i=0;i<16;i++){
   if(process.argv[2]&&sheet.clips[Math.floor(i/8)]!==process.argv[2])continue;
   const c=cells[i],name=sheet.clips[Math.floor(i/8)]+'-'+i%8;
   const action=/mine|gather/.test(name),clip=sheet.clips[Math.floor(i/8)];
   const canvasWidth=clip==='mine'?512:384;
   const left=Math.round((action?canvasWidth/2:config.headAnchors[clip])-(action?c.footX:c.headX)*scale),top=Math.round(284-c.bottom*scale);
   const canvasHeight=action?384:288;
   const bytes=magick(['-size',canvasWidth+'x'+canvasHeight,'canvas:none','(',c.cell,'-resize',(scale*100)+'%',')','-geometry',`${left>=0?'+':''}${left}${top>=0?'+':''}${top}`,'-compose','Over','-composite','-define','webp:method=6','-quality','78','webp:-']);
   fs.writeFileSync(root+'packs/default/characters/painted/'+name+'.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth/4}" height="${canvasHeight/4}" viewBox="0 0 ${canvasWidth/4} ${canvasHeight/4}"><image width="${canvasWidth/4}" height="${canvasHeight/4}" href="data:image/webp;base64,${bytes.toString('base64')}"/></svg>\n`);
   packed++;
  }
  console.log(sheet.file+': packed '+packed+' complete poses');
 }
}finally{fs.rmSync(temp,{recursive:true,force:true});}
