import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../src/core/index.js';
import {createWikiMemory,UNPROMPTED_GAP_S,WIKI_MODES} from '../../src/game/wiki-memory.js';
import {wikiPose,wrapAngle} from '../../src/game/render/wiki-motion.js';
import {describeWorld} from '../../src/game/tooltips.js';
import {createWiki} from '../../src/game/wiki.js';

test('Wiki says a thing once, then only glances, unless asked',()=>{
 const m=createWikiMemory();
 assert.equal(m.mode,'chatty');
 assert.equal(m.decide('tile.stone','pointed',0),'speak');
 m.told('tile.stone','pointed',0);
 assert.equal(m.decide('tile.stone','pointed',1),'glance');
 assert.equal(m.decide('tile.stone','nearby',1),'glance');
 assert.equal(m.decide('tile.stone','asked',1),'speak','asking always gets an answer');
 assert.equal(m.decide(null,'asked',1),'glance','nothing to say about nothing');
});
test('remarks nobody asked for are spaced out; pointing is not limited',()=>{
 const m=createWikiMemory();
 m.told('tile.forest','nearby',10);
 assert.equal(m.decide('tile.stone','nearby',10+UNPROMPTED_GAP_S-1),'glance');
 assert.equal(m.decide('tile.stone','pointed',11),'speak');
 assert.equal(m.decide('tile.stone','nearby',10+UNPROMPTED_GAP_S),'speak');
});
test('quiet Wiki only answers when asked, and off Wiki says nothing',()=>{
 const quiet=createWikiMemory({mode:'quiet'});
 assert.equal(quiet.decide('tile.stone','pointed',0),'glance');
 assert.equal(quiet.decide('tile.stone','nearby',0),'glance');
 assert.equal(quiet.decide('tile.stone','asked',0),'speak');
 const off=createWikiMemory({mode:'off'});
 assert.equal(off.decide('tile.stone','asked',0),'glance');
 assert.deepEqual(WIKI_MODES,['chatty','quiet','off']);
});
test('what Wiki told survives a reload, and a broken saved copy starts fresh',()=>{
 const m=createWikiMemory();m.mode='quiet';m.told('tile.stone','pointed',0);m.told('wiki.hello','pointed',0);
 const again=createWikiMemory(JSON.parse(JSON.stringify(m.save())));
 assert.equal(again.mode,'quiet');assert.ok(again.known.has('tile.stone'));assert.ok(again.known.has('wiki.hello'));
 for(const junk of [null,{},{mode:'loud',known:'x'},{known:[1,null,'tile.forest']}]){const j=createWikiMemory(junk);assert.equal(j.mode,'chatty');assert.ok([...j.known].every(k=>typeof k==='string'));}
 const many=createWikiMemory();for(let i=0;i<800;i++)many.told('k'+i,'pointed',0);
 assert.equal(many.save().known.length,500,'the saved list stays bounded');assert.ok(many.save().known.includes('k799'));
});
test('Wiki’s pose: looks where asked, folds its cap, talks briefly, and is deterministic',()=>{
 const open=wikiPose({time:1}),shut=wikiPose({time:1,fold:1});
 assert.equal(open.rimScale,1);assert.ok(shut.rimScale<.7&&shut.rimDrop>0,'the cap closes down and in');
 const looking=wikiPose({time:1,look:Math.PI*3});
 assert.ok(Math.abs(looking.turn-wrapAngle(Math.PI*3))<1e-12);assert.ok(Math.abs(looking.turn)<=Math.PI);
 assert.ok(looking.lean>open.lean,'leans toward what it looks at');
 assert.equal(wikiPose({time:1,look:1,fold:1}).lean,0,'a shut cap does not lean out');
 assert.ok(wikiPose({time:1,talk:.1}).mouth>0);assert.equal(wikiPose({time:1,talk:3}).mouth,0,'a line is short');
 assert.ok(wikiPose({time:1,rest:true}).blink<.2,'resting, eyes closed');
 assert.deepEqual(wikiPose({time:2.5,look:.4,talk:.2}),wikiPose({time:2.5,look:.4,talk:.2}));
 for(const bad of [{look:NaN},{talk:NaN},{fold:-3},{fold:9}]){const p=wikiPose({time:1,...bad});for(const v of Object.values(p))assert.ok(Number.isFinite(v));}
});
test('every world answer carries a kind for Wiki to remember',()=>{
 const s=C.createState(72631),x=Math.floor(s.player.x),y=Math.floor(s.player.y),z=s.player.z;
 let found=0;
 for(let dx=-30;dx<=30;dx++)for(let dy=-30;dy<=30;dy++){C.markExplored(s.world,x+dx,y+dy,z);const info=describeWorld(s,x+dx,y+dy,z);if(info){found++;assert.match(info.kind,/^(tile|building)\./);}}
 assert.ok(found>0);
});


test('Wiki has no character pointer surface and inspects world contents on Mica’s tile',()=>{
 const s=C.createState(11,{cultivation:true}),x=Math.floor(s.player.x),y=Math.floor(s.player.y),said=[];
 C.tileAt(s.world,x,y,0);s.world.hotChunk.type[C.chunkIndex(x,y)]=C.T.STONE;C.setRichness(s.world,x,y,0,10);
 // No document or canvas is supplied: character-specific DOM listeners and
 // hit regions must never be installed by Wiki.
 const wiki=createWiki({cam:{unproject:(x,y)=>({x,y})},state:()=>s,saved:{mode:'quiet'},keep(){},messages:{add:line=>said.push(line)}});
 assert.equal(wiki.place,undefined);assert.equal(wiki.asking,undefined);
 assert.ok(wiki.longPress(s.player.x,s.player.y));assert.equal(wiki.line.kind,'tile.stone');
 assert.deepEqual([wiki.focus.x,wiki.focus.y,wiki.focus.z],[x,y,0]);assert.equal(wiki.focus.mica,undefined);
 wiki.longPressEnd();assert.ok(said.length>0);
 s.cultivation.starter={health:100};wiki.update(.5);wiki.update(.5);assert.ok(wiki.pose().fold>0,'automatic crystal awareness still works');
});
