import {test}from'node:test';import assert from'node:assert/strict';
import {characterDirection}from'../../src/game/render/character-direction.js';
test('all eight world directions and zero movement retain the intended facing',()=>{
 for(const [x,y,d]of [[0,-1,'n'],[1,-1,'ne'],[1,0,'e'],[1,1,'se'],[0,1,'s'],[-1,1,'sw'],[-1,0,'w'],[-1,-1,'nw']])assert.equal(characterDirection({x,y}),d);
 assert.equal(characterDirection({x:0,y:0},'nw'),'nw');assert.equal(characterDirection({x:NaN,y:0},'e'),'e');
});
