/* Production packaging of the first bare eight-direction character. Masters
 * are preserved. Root/scale proposals are written explicitly for visual review.
 * No directional mirroring, generated in-betweens or duplicated walk frames. */
import fs from'node:fs';import {execFileSync as run}from'node:child_process';
import {createHash}from'node:crypto';import {fileURLToPath}from'node:url';
import {join}from'node:path';import {tmpdir}from'node:os';
const root=fileURLToPath(new URL('../',import.meta.url)),out=root+'packs/directional/';
const temp=fs.mkdtempSync(join(tmpdir(),'mte-directions-'));
const directions=['n','ne','e','se','s','sw','w','nw'];
const magick=a=>run('magick',a,{maxBuffer:30e6});
const sha=b=>createHash('sha256').update(b).digest('hex');
function figures(source,count,cols){
 const info=magick([source,'-alpha','extract','-threshold','70%','-define','connected-components:verbose=true','-connected-components','8','null:']).toString();
 const list=info.split('\n').flatMap(line=>{
  const m=line.match(/^\s*(\d+): (\d+)x(\d+)\+(\d+)\+(\d+) ([\d.]+),([\d.]+) ([\de+.]+) .*\(255,255,255\)/);
  if(!m||Number(m[8])<2500)return [];const[id,w,h,x,y,cx,cy]=m.slice(1,8).map(Number);return[{id,w,h,x,y,cx,cy}];
 }).sort((a,b)=>a.cy-b.cy);
 if(list.length!==count)throw Error(source+': expected '+count+' figures, got '+list.length);
 const ordered=[];for(let i=0;i<count;i+=cols)ordered.push(...list.slice(i,i+cols).sort((a,b)=>a.cx-b.cx));return ordered;
}
function normalize(source,figure,scale,target){
 const cut=join(temp,'cut.png'),masked=join(temp,'masked.rgba');
 const w=figure.w+8,h=figure.h+8;
 magick([source,'-crop',`${w}x${h}+${figure.x-4}+${figure.y-4}`,'+repage',cut]);
 // Keep only the complete figure's alpha component. Neighbouring sheet cells
 // can intrude into its bounding rectangle; their fragments are not artwork.
 const pixels=magick([cut,'-depth','8','rgba:-']),seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
 let largest=[];
 for(let start=0;start<w*h;start++){
  if(seen[start]||pixels[start*4+3]<179)continue;
  let head=0,tail=1;queue[0]=start;seen[start]=1;
  while(head<tail){const at=queue[head++],x=at%w,y=Math.floor(at/w);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;
    const next=(y+dy)*w+x+dx;
    if(!seen[next]&&pixels[next*4+3]>=179){seen[next]=1;queue[tail++]=next;}
   }
  }
  if(tail>largest.length)largest=queue.slice(0,tail);
 }
 if(largest.length<2500)throw Error('Missing complete figure '+source);
 const keep=new Uint8Array(w*h);
 for(const at of largest){const x=at%w,y=Math.floor(at/w);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)keep[(y+dy)*w+x+dx]=1;
 }
 for(let i=0;i<keep.length;i++)if(!keep[i])pixels[i*4+3]=0;
 fs.writeFileSync(masked,pixels);
 const x=Math.round(160-(figure.w/2+4)*scale),y=Math.round(284-(figure.h+4)*scale);
 magick(['-size','320x320','canvas:none','(','-size',`${w}x${h}`,'-depth','8','rgba:'+masked,'-resize',(scale*100)+'%',')','-geometry',`${x>=0?'+':''}${x}${y>=0?'+':''}${y}`,'-compose','Over','-composite',target]);
 const rgba=magick([target,'-depth','8','rgba:-']);
 if([0,319].some(x=>Array.from({length:320},(_,y)=>rgba[(y*320+x)*4+3]).some(a=>a>128))||[0,319].some(y=>Array.from({length:320},(_,x)=>rgba[(y*320+x)*4+3]).some(a=>a>128)))throw Error('Clipped figure '+target);
}
try{
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(root+'art/characters/directional/frames',{recursive:true});
 const index={format:1,scope:'first bare character: sixteen-frame walks and separate static rest poses',clips:{}};
 const records=[];
 for(const direction of directions){
  const relative=`art/characters/directional/sources/bare-walk-${direction}.png`,source=root+relative;
  const list=figures(source,16,4),heights=list.map(f=>f.h).sort((a,b)=>a-b),scale=240/heights[8];
  const frames=[],tiles=[],hashes=new Set();
  for(let i=0;i<16;i++){
   const file=`art/characters/directional/frames/walk-${direction}-${i}.png`,target=root+file;
   normalize(source,list[i],scale,target);tiles.push(target);
   const digest=sha(fs.readFileSync(target));if(hashes.has(digest))throw Error('Duplicated drawing '+file);hashes.add(digest);
   frames.push({file,sha256:digest,ms:60,bodyHeight:60,anchors:{root:[160,284],head:[160,64],leftHand:[112,200],rightHand:[208,200]},rect:[i%4*320,Math.floor(i/4)*320,320,320],root:[160,284],head:[160,64]});
  }
  const atlas=`walk-${direction}.webp`;
  magick(['montage',...tiles,'-background','none','-geometry','320x320+0+0','-tile','4x4','-define','webp:method=4','-quality','82',out+atlas]);
  const key=`bare/walk/${direction}`;index.clips[key]=`walk-${direction}.json`;
  fs.writeFileSync(out+`walk-${direction}.json`,JSON.stringify({key,atlas,scale:4,frames:frames.map(({rect,root,head,ms})=>({rect,root,head,ms}))})+'\n');
  records.push({variant:'bare',action:'walk',direction,source:relative,sourceSha:sha(fs.readFileSync(source)),canvas:[320,320],frames:frames.map(({file,sha256,ms,bodyHeight,anchors})=>({file,sha256,ms,bodyHeight,anchors}))});
  console.log(direction+': packed 16 distinct walk frames');
 }
 const source=root+'art/characters/turnaround-v2.png',rest=figures(source,8,4);
 fs.mkdirSync(root+'packs/default/characters/directions',{recursive:true});
 const pack=JSON.parse(fs.readFileSync(root+'packs/default/pack.json'));
 for(let i=0;i<8;i++){
  const png=join(temp,'rest.png');normalize(source,rest[i],240/rest[i].h,png);
  const bytes=magick([png,'-define','webp:method=4','-quality','82','webp:-']);
  const file=`characters/directions/${directions[i]}.svg`;
  fs.writeFileSync(root+'packs/default/'+file,`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><image width="80" height="80" href="data:image/webp;base64,${bytes.toString('base64')}"/></svg>\n`);
  pack.looks['character.direction'+directions[i].toUpperCase()]={image:file};
 }
 fs.writeFileSync(root+'packs/default/pack.json',JSON.stringify(pack,null,1)+'\n');
 fs.writeFileSync(out+'index.json',JSON.stringify(index)+'\n');
 fs.writeFileSync(root+'art/characters/directional/clips.json',JSON.stringify(records,null,2)+'\n');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
