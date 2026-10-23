import fs from 'node:fs';import {execFileSync as run}from'node:child_process';
import {fileURLToPath}from'node:url';import {tmpdir}from'node:os';import {join,resolve}from'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=(process.env.MTE_ART_WORKSPACE?resolve(process.env.MTE_ART_WORKSPACE):fs.mkdtempSync(join(tmpdir(),'mte-character-art-')) )+'/';
fs.mkdirSync(temp,{recursive:true});
fs.mkdirSync(root+'packs/default/characters/painted',{recursive:true});
const sources=[[root+'art/characters/fieldwork-source.png','fieldwork',{'idle':3,'walk-a':1,'walk-b':2,'worker-idle':4,'worker-walk-a':5,'worker-walk-b':6,'mine-windup':7,'mine-strike':8,'gather':9}],[root+'art/characters/carrying-source.png','carrying',{'courier-idle':3,'courier-walk-a':2,'courier-walk-b':1,'starter-idle':8,'starter-walk-a':6,'starter-walk-b':7,'lantern-idle':10,'lantern-walk-a':12,'lantern-walk-b':11}],[root+'art/characters/bare-gather-source.png','bare-gather',{'gather-bare':1}]];
const report=[];
for(const [source,label,names]of sources){
 const info=run('magick',[source,'-alpha','extract','-threshold','70%','-define','connected-components:verbose=true','-connected-components','8','null:'],{encoding:'utf8'});
 for(const [name,id]of Object.entries(names)){
  const row=info.split('\n').find(s=>new RegExp('^\\s*'+id+':').test(s));const m=row.match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);let[w,h,x,y]=m.slice(1).map(Number);
  const mask=temp+name+'-mask.png';run('magick',[source,'-alpha','extract','-threshold','70%','-define','connected-components:keep='+id,'-define','connected-components:mean-color=true','-connected-components','8','-threshold','50%','-morphology','Dilate','Disk:1',mask]);
  const pixels=run('magick',[mask,'-crop',`${w}x20+${x}+${y+h-20}`,'-depth','8','gray:-'],{maxBuffer:20e6});let sum=0,mass=0;for(let i=0;i<pixels.length;i++){sum+=(i%w)*pixels[i];mass+=pixels[i];}
  const foot=x+sum/mass;const crop=`${w+8}x${h+8}+${x-4}+${y-4}`;const rgba=run('magick',[source,'(',mask,'-alpha','copy',')','-compose','DstIn','-composite','-crop',crop,'+repage','-depth','8','rgba:-'],{maxBuffer:20e6});let hood=0;
  for(let row=0;row<h+8;row++){let n=0;for(let col=0;col<w+8;col++){const i=(row*(w+8)+col)*4,r=rgba[i],g=rgba[i+1],b=rgba[i+2],a=rgba[i+3];if(a>200&&r>120&&g>40&&g<180&&b<130&&r>g*1.18)n++;}if(n>=5){hood=row;break;}}
  const scale=name==='gather-bare'?200/h:/mine-|gather/.test(name)?240/333:240/(h+4-hood);
  const cut=temp+name+'.png';
  run('magick',[source,'(',mask,'-alpha','copy',')','-compose','DstIn','-composite','-crop',crop,'+repage','-resize',(scale*100)+'%',cut]);
  const left=Math.round(192-(foot-x+4)*scale),top=Math.round(284-(h+4)*scale);
  const webp=temp+name+'.webp';run('magick',['-size','384x288','canvas:none',cut,'-geometry',`${left>=0?'+':''}${left}${top>=0?'+':''}${top}`,'-compose','Over','-composite','-define','webp:method=6','-quality','82',webp]);
  const bytes=fs.readFileSync(webp);const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="72" viewBox="0 0 96 72"><image width="96" height="72" href="data:image/webp;base64,${bytes.toString('base64')}"/></svg>\n`;
  fs.writeFileSync(root+'packs/default/characters/painted/'+name+'.svg',svg);report.push({name,bytes:bytes.length,component:id,source:label});
 }
}
fs.writeFileSync(root+'art/characters/source.json',JSON.stringify({description:'Generated raster production artwork; SVG files in the pack are size-preserving WebP containers, not vector redraws.',generator:'image_gen',logicalCanvas:[96,72],rasterCanvas:[384,288],bodyHeight:60,feetBaseline:71,processing:'Connected alpha component extraction, common scale, foot registration, WebP quality 82. No painting or icon compositing.',frames:report},null,2)+'\n');console.log(report,report.reduce((n,r)=>n+r.bytes,0));

if(!process.env.MTE_ART_WORKSPACE)fs.rmSync(temp,{recursive:true,force:true});
