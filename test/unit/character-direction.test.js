import {test}from'node:test';import assert from'node:assert/strict';
import {characterDirection}from'../../src/game/render/character-direction.js';
import {createDirectionalArt,directionalFrame}from'../../src/game/render/directional-art.js';
test('all eight world directions and zero movement retain the intended facing',()=>{
 for(const [x,y,d]of [[0,-1,'n'],[1,-1,'ne'],[1,0,'e'],[1,1,'se'],[0,1,'s'],[-1,1,'sw'],[-1,0,'w'],[-1,-1,'nw']])assert.equal(characterDirection({x,y}),d);
 assert.equal(characterDirection({x:0,y:0},'nw'),'nw');assert.equal(characterDirection({x:NaN,y:0},'e'),'e');
});
const record=key=>({key,atlas:key+'.webp',scale:3,frames:[0,1].map(i=>({rect:[i*10,0,10,10],root:[5,9],head:[5,1],ms:50}))});
test('atlas loading deduplicates concurrent requests, selects timed frames and evicts old decoded assets',async()=>{
 const counts=new Map();let active=0,peak=0;
 const fetcher=async url=>{const p=new URL(url).pathname;counts.set(p,(counts.get(p)||0)+1);if(p.endsWith('index.json'))return {ok:true,json:async()=>({format:1,clips:{'bare/walk/n':'n.json','bare/walk/s':'s.json'}})};
  active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {ok:true,json:async()=>record(p.endsWith('n.json')?'bare/walk/n':'bare/walk/s')};};
 const art=createDirectionalArt({manifestUrl:'https://example.org/art/index.json?v=1',fetcher,decode:async()=>({width:20,height:10,close(){}}),maxBytes:1000,concurrency:1});
 const [a,b]=await Promise.all([art.load('bare','walk','n'),art.load('bare','walk','n')]);assert.equal(a,b);assert.equal(counts.get('/art/n.json'),1);assert.equal(directionalFrame(a,.75),a.pics[1]);
 await art.load('bare','walk','s');assert.equal(art.stats.loaded,1);assert.equal(art.stats.bytes,800);assert.equal(peak,1);
 assert.equal(await art.load('bare','mine','n'),null);assert.deepEqual(art.stats.missing,['bare/mine/n']);
});
test('failed atlas requests do not retry every rendered frame',async()=>{
 let calls=0;const art=createDirectionalArt({manifestUrl:'https://example.org/index.json',fetcher:async url=>{calls++;return url.includes('index')?{ok:true,json:async()=>({format:1,clips:{'bare/walk/n':'bad.json'}})}:{ok:false,status:404};},decode:()=>assert.fail()});
 assert.equal(await art.load('bare','walk','n'),null);for(let i=0;i<100;i++)art.get('bare','walk','n');assert.equal(calls,2);assert.equal(art.stats.errors.length,1);
});
