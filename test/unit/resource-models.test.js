import {test}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import * as T from'../../src/vendor/three/three.module.js';
import{createResourceModel,createResourcePile,resourceSVG,resourcePileSVG,RESOURCE_MODEL_KEYS}from'../../src/game/render/resource-models.js';
const file=p=>readFileSync(new URL('../../'+p,import.meta.url));
test('all four material models have real finite volume and explicit collection anchors',()=>{
 assert.deepEqual(RESOURCE_MODEL_KEYS,['mycelium','stone','ore','crystal']);
 for(const key of RESOURCE_MODEL_KEYS){const a=createResourceModel(key),size=new T.Box3().setFromObject(a.root).getSize(new T.Vector3());assert.ok(size.x>.2&&size.y>.2&&size.z>.1,key+' must be a volume');
  let vertices=0;a.root.traverse(o=>{if(o.geometry){const p=o.geometry.attributes.position;vertices+=p.count;assert.ok([...p.array].every(Number.isFinite));}if(o.material)assert.ok(o.material.isMeshBasicMaterial,'authored flat colour, not emissive illumination');});assert.ok(vertices<6000);assert.deepEqual(a.anchors.base.toArray(),[0,0,0]);a.dispose();}
 assert.throws(()=>createResourceModel('wood'));
});
test('resource vector exports are deterministic, readable geometry in all eight fixed views',()=>{
 for(const key of RESOURCE_MODEL_KEYS)for(let heading=0;heading<8;heading++){
  const a=createResourceModel(key),svg=resourceSVG(a,{heading});assert.equal(svg,resourceSVG(a,{heading}));assert.ok(svg.includes('<path'));assert.doesNotMatch(svg,/NaN|Infinity|<script|<image|https?:\/\/(?!www.w3.org)/);a.dispose();
 }
 const a=createResourceModel('crystal'),b=createResourceModel('crystal',{variant:1});assert.notEqual(resourceSVG(a),resourceSVG(b));a.dispose();b.dispose();
});
test('small stockpiles instance shared geometry and preserve their declared footprints',()=>{
 const sizes=JSON.parse(file('art/resources/pile-sizes.json'));
 for(const key of RESOURCE_MODEL_KEYS)for(let tier=0;tier<=3;tier++){
  const a=createResourcePile(key,tier);assert.equal(a.instances.length,1+tier*2);assert.ok(a.instances.length<=7);assert.ok(a.root.children.every(n=>n.children[0].geometry===a.unit.root.children[0].geometry));
  const [width,height]=sizes[key][tier],svg=resourcePileSVG(a,{width,height});assert.ok(svg.includes(`width="${width}" height="${height}"`));assert.equal((svg.match(/<use /g)||[]).length,a.instances.length);a.dispose();
 }
 assert.throws(()=>createResourcePile('stone',4));
});
test('every baked resource asset is reproducible from the recorded canonical source',()=>{
 const manifest=JSON.parse(file('art/resources/models.json')),sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(file(manifest.source)),manifest.sourceSha256);assert.equal(manifest.assets.length,28);
 for(const r of manifest.assets){const a=r.tier===undefined?createResourceModel(r.resource,r.options):createResourcePile(r.resource,r.tier);const svg=r.tier===undefined?resourceSVG(a,r.size):resourcePileSVG(a,r.size);assert.equal(svg,file(r.file).toString(),r.file);assert.equal(sha(file(r.file)),r.sha256);a.dispose();}
});

test('inventory forms remove small branches while retaining real shared-model volume',()=>{
 for(const key of ['crystal']){const world=createResourceModel(key),icon=createResourceModel(key,{form:'icon'});assert.ok(icon.faces.length+icon.curves.length<world.faces.length+world.curves.length);world.dispose();icon.dispose();}
 const a=createResourceModel('stone'),b=createResourceModel('stone',{form:'icon'});assert.ok(new T.Box3().setFromObject(b.root).max.y<new T.Box3().setFromObject(a.root).max.y);a.dispose();b.dispose();
});
test('stone values follow a coherent baked light direction instead of face ordering',()=>{
 const a=createResourceModel('stone'),light=new T.Vector3(-.5,.85,.6).normalize(),rank=a.faces.map(f=>({f,d:new T.Vector3().crossVectors(f.points[1].clone().sub(f.points[0]),f.points[2].clone().sub(f.points[0])).normalize().dot(light)})).sort((a,b)=>a.d-b.d);
 const luminance=hex=>{const c=new T.Color(hex);return c.r*.2126+c.g*.7152+c.b*.0722;};assert.ok(luminance(rank.at(-1).f.color)>luminance(rank[0].f.color)*1.3);a.dispose();
});

test('mycelium material views show mushroom caps and stems without root curves',()=>{
 for(const form of ['specimen','icon']){const a=createResourceModel('mycelium',{form});assert.equal(a.curves.length,0);assert.ok(a.faces.length>0);a.dispose();}
});

// Watch, 2026-10-24: 3D models read as flat 2D cel art. Ink only ever traces
// the whole object's silhouette; no face, part or mesh edge is drawn inside it.
test('baked resource art draws no wireframe: ink only as the whole-object silhouette',()=>{
 const manifest=JSON.parse(file('art/resources/models.json'));
 for(const r of manifest.assets){
  const svg=file(r.file).toString(),body=svg.replace(/<g><path[^]*?<\/g>/,'');
  assert.match(svg,/<g><path d="[^"]+" fill="#1d1712" stroke="#1d1712"/,r.file+' has one ink silhouette layer under the fills');
  for(const [,fill,stroke]of body.matchAll(/<path d="[^"]+" fill="([^"]+)" stroke="([^"]+)"/g))assert.equal(stroke,fill,r.file+': a fill may only be stroked in its own colour, never ink');
 }
 for(const key of RESOURCE_MODEL_KEYS){const a=createResourceModel(key);a.root.traverse(o=>{assert.ok(!o.isLine&&!o.isLineSegments,key+' has no edge lines');if(o.material)assert.ok(!o.material.wireframe,key+' is not wireframe');});a.dispose();}
});
