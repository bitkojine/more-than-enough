/* Demand-loaded full-figure atlases. Rendering only performs a map lookup and
 * frame selection; network/decode work is bounded and never enters core ticks. */
export function createDirectionalArt({manifestUrl,fetcher=(url)=>fetch(url),decode=loadImage,maxBytes=64*1024*1024,concurrency=2}={}){
 let manifest=null,indexPromise=null,active=0,bytes=0;
 const clips=new Map(),requests=new Map(),queue=[],errors=new Map(),missing=new Set();
 const keyOf=(variant,action,direction)=>`${variant}/${action}/${direction}`;
 function index(){
  if(!indexPromise)indexPromise=fetcher(manifestUrl).then(async r=>{
   if(!r.ok)throw Error('Directional art index HTTP '+r.status); // i18n-ok: internal atlas diagnostic, never shown to players
   const data=await r.json();if(data.format!==1||!data.clips)throw Error('Invalid directional art index');manifest=data;return data; // i18n-ok: internal atlas diagnostic, never shown to players
  }).catch(e=>{errors.set('index',String(e));return null;});
  return indexPromise;
 }
 const urlFor=path=>{const url=new URL(path,manifestUrl);url.search=new URL(manifestUrl).search;return url.href;};
 function trim(){
  while(bytes>maxBytes&&clips.size>1){
   const [key,clip]=clips.entries().next().value;clips.delete(key);bytes-=clip.bytes;
   for(const f of clip.pics)f.cache.clear();clip.img.close?.();
  }
 }
 function pump(){
  while(active<concurrency&&queue.length){
   const {key,resolve}=queue.shift(),path=manifest.clips[key];active++;
   (async()=>{
    const response=await fetcher(urlFor(path));if(!response.ok)throw Error('Directional clip HTTP '+response.status); // i18n-ok: internal atlas diagnostic, never shown to players
    const data=await response.json(),img=await decode(urlFor(data.atlas));
    const width=img.naturalWidth??img.width,height=img.naturalHeight??img.height,cost=width*height*4;
    if(cost>maxBytes){img.close?.();throw Error('Directional atlas exceeds memory budget');} // i18n-ok: internal atlas diagnostic, never shown to players
    if(data.key!==key||!data.frames?.length||!(data.scale>0))throw Error('Invalid directional clip '+key); // i18n-ok: internal atlas diagnostic, never shown to players
    let total=0;const ends=[];
    const pics=data.frames.map(f=>{
     const [x,y,w,h]=f.rect;
     if(!(w>0&&h>0&&x>=0&&y>=0&&x+w<=width&&y+h<=height&&f.ms>0))throw Error('Invalid atlas rectangle/timing '+key); // i18n-ok: internal atlas diagnostic, never shown to players
     if(!f.root||f.root.some((n,i)=>!Number.isFinite(n)||n<0||n>[w,h][i]))throw Error('Invalid atlas root '+key); // i18n-ok: internal atlas diagnostic, never shown to players
     total+=f.ms;ends.push(total);
     return {img,rect:f.rect,units:w/(data.scale*64),aspect:h/w,root:f.root,head:f.head,scale:data.scale,pixelated:false,cache:new Map()};
    });
    const clip={pics,ends,total,img,bytes:cost,key};clips.set(key,clip);bytes+=cost;trim();return clip;
   })().then(resolve).catch(e=>{errors.set(key,String(e));resolve(null);}).finally(()=>{requests.delete(key);active--;pump();});
  }
 }
 async function load(key){
  if(!await index())return null;
  if(clips.has(key)){const clip=clips.get(key);clips.delete(key);clips.set(key,clip);return clip;}
  if(!manifest.clips[key]){missing.add(key);return null;}
  if(errors.has(key))return null;
  if(!requests.has(key)){
   let resolve;const promise=new Promise(r=>{resolve=r;});requests.set(key,promise);queue.push({key,resolve});pump();
  }
  return requests.get(key);
 }
 return {
  get(variant,action,direction){
   const key=keyOf(variant,action,direction),clip=clips.get(key);
   if(clip){clips.delete(key);clips.set(key,clip);return clip;}
   if(!errors.has('index')&&!errors.has(key)&&!missing.has(key))void load(key);return null;
  },
  load:(variant,action,direction)=>load(keyOf(variant,action,direction)),
  get stats(){return {loaded:clips.size,bytes,active,queued:queue.length,errors:[...errors],missing:[...missing]};}
 };
}
function loadImage(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Directional atlas decode failed'));img.src=url;});} // i18n-ok: internal atlas diagnostic, never shown to players
export function directionalFrame(clip,phase){
 const time=((phase%1)+1)%1*clip.total;
 let lo=0,hi=clip.ends.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(time<clip.ends[mid])hi=mid;else lo=mid+1;}
 return clip.pics[lo];
}
