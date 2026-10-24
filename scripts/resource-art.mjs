/* Bake the resource models without a GPU, network or game simulation. */
import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';
import {createResourceModel,resourceSVG,createResourcePile,resourcePileSVG,RESOURCE_MODEL_KEYS}from'../src/game/render/resource-models.js';
const root=path.resolve(import.meta.dirname,'..'),outputs=[],pileSizes=JSON.parse(fs.readFileSync(path.join(root,'art/resources/pile-sizes.json'),'utf8'));
function write(key,file,options={},size={}){const asset=createResourceModel(key,options);const svg=resourceSVG(asset,size);asset.dispose();fs.writeFileSync(path.join(root,file),svg);outputs.push({resource:key,file,options,size,sha256:createHash('sha256').update(svg).digest('hex')});}
for(const key of RESOURCE_MODEL_KEYS)write(key,'packs/default/icons/'+key+'.svg',{form:'icon'},{view:'icon'});
for(const [key,file,options,w,h]of [
 ['stone','boulder',{},52,40],['stone','boulders',{variant:1},62,42],['stone','pebbles',{depleted:true},42,22],
 ['ore','ore-rock',{form:'deposit'},52,44],['ore','ore-rock-cut',{depleted:true},44,24],
 ['crystal','crystals',{},48,58],['crystal','crystals-2',{variant:1},52,60],['crystal','crystal-cut',{depleted:true},42,25]
])write(key,'packs/default/props/'+file+'.svg',options,{width:w,height:h,grounded:true});
// Small material piles use the new models. Larger illustrated stockpile
// landmarks remain their own art family; preserve saved-world progression.
for(const key of RESOURCE_MODEL_KEYS)for(let tier=0;tier<=3;tier++){
 const file='packs/default/piles/'+key+'-'+tier+'.svg';
 const size={width:pileSizes[key][tier][0],height:pileSizes[key][tier][1]},asset=createResourcePile(key,tier),svg=resourcePileSVG(asset,size);asset.dispose();fs.writeFileSync(path.join(root,file),svg);outputs.push({resource:key,tier,file,size,sha256:createHash('sha256').update(svg).digest('hex')});
}
const source='src/game/render/resource-models.js';const hash=file=>createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
fs.mkdirSync(path.join(root,'art/resources'),{recursive:true});fs.writeFileSync(path.join(root,'art/resources/models.json'),JSON.stringify({format:1,source,sourceSha256:hash(source),finish:'3D-authored faces and curves projected into flat outlined SVGs; no per-resource WebGL runtime',assets:outputs},null,2)+'\n');console.log('Baked '+outputs.length+' resource views from four 3D models.');
