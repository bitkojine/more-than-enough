import fs from 'node:fs';import {createHash} from 'node:crypto';
import {test}from'node:test';import assert from'node:assert/strict';
import {auditProduction,clipFingerprint,productionPrompt,requiredClips}from'../../scripts/lib/character-production.mjs';
const spec=()=>({format:1,model:{id:'wanderer-1',review:{status:'accepted',by:'art review',sourceSha:'model-hash'},reference:'model.png',sha256:'model-hash',bodyHeight:60,heightTolerance:2,identity:'orange hood',camera:'fixed game camera'},variants:[{id:'bare',description:'no equipment',actions:['walk']}],actions:{walk:{minFrames:2}},clips:[]});
const io={exists:()=>true,digest:p=>p==='model.png'?'model-hash':p};
function clip(s){const c={variant:'bare',action:'walk',direction:'n',model:s.model.id,modelSha:s.model.sha256,canvas:[96,96],frames:['one','two'].map(file=>({file,sha256:file,ms:80,bodyHeight:60,anchors:{root:[48,71],leftHand:[42,40],rightHand:[54,40],head:[48,18]}}))};c.review={status:'accepted',by:'art review',playback:'review.mp4',sourceDigest:clipFingerprint(c)};return c;}
test('production coverage never counts a single direction or mirrored fallback as eight',()=>{
 const s=spec();assert.equal(requiredClips(s).length,8);s.clips=[clip(s)];let a=auditProduction(s,io);assert.deepEqual(a.errors,[]);assert.equal(a.accepted,1);assert.equal(a.missing.length,7);
 s.clips.push({...s.clips[0],direction:'mirrored-n'});assert.match(auditProduction(s,io).errors.join('\n'),/undeclared/);
});
test('source, timing, anchors, scale and reference changes invalidate the reviewed clip',()=>{
 for(const change of [c=>c.frames[0].ms++,c=>c.frames[0].anchors.root[0]++,c=>c.frames[0].sha256='changed',c=>c.modelSha='old']){
  const s=spec(),c=clip(s);change(c);s.clips=[c];assert.ok(auditProduction(s,io).errors.length);
 }
 const s=spec(),c=clip(s);c.frames[1]={...c.frames[0]};c.frames[0].anchors.root=[-1,200];c.frames[0].bodyHeight=90;s.clips=[c];const e=auditProduction(s,io).errors.join('\n');assert.match(e,/duplicated drawing/);assert.match(e,/root anchor/);assert.match(e,/body scale/);
});
test('production prompt always carries the canonical model, loadout and actual direction',()=>{
 const s=spec(),p=productionPrompt(s,{variant:'bare',action:'walk',direction:'ne'});assert.deepEqual(p.references,['model.png']);assert.match(p.prompt,/orange hood/);assert.match(p.prompt,/world ne/);assert.match(p.prompt,/no equipment/);assert.throws(()=>productionPrompt(s,{variant:'bare',action:'mine',direction:'ne'}));
});

test('a copied east clip cannot claim northeast coverage under another name',()=>{
 const s=spec(),east=clip(s);east.direction='e';east.review.sourceDigest=clipFingerprint(east);
 const ne=structuredClone(east);ne.direction='ne';ne.review.sourceDigest=clipFingerprint(ne);s.clips=[east,ne];
 const result=auditProduction(s,io);assert.match(result.errors.join('\n'),/drawing reused/);assert.equal(result.accepted,1);
});

test('the checked-in production manifest has intact source references and honest missing coverage',()=>{
 const s=JSON.parse(fs.readFileSync(new URL('../../art/characters/production.json',import.meta.url)));
 const root=new URL('../../',import.meta.url);
 const result=auditProduction(s,{exists:p=>fs.existsSync(new URL(p,root)),digest:p=>createHash('sha256').update(fs.readFileSync(new URL(p,root))).digest('hex')});
 assert.deepEqual(result.errors,[]);assert.ok(result.required>=8);assert.equal(result.accepted+result.missing.length,result.required);
});
