import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import * as C from '../../src/core/index.js';
import {cardAt} from '../../src/game/building-card.js';
const pack=JSON.parse(readFileSync(new URL('../../packs/default/pack.json',import.meta.url),'utf8'));
function check(card){
 assert.ok(card);const slot=card.slot||'image';
 assert.ok(slot in C.LOOK[card.look].slots,`${card.look} does not declare ${slot}`);
 const pictures=C.pictures(pack.looks[card.look]?.[slot]);assert.ok(pictures.length&&pictures.every(Boolean),`${card.look}/${slot} is empty`);
 for(const picture of pictures)assert.ok(existsSync(new URL('../../packs/default/'+picture,import.meta.url)),picture);
}

test('all facility, wild-colony and light cards request real catalog pictures',()=>{
 for(const kind of [...C.BUILT_FACILITIES,'machine']){
  const s=C.createState(11,{cultivation:true});s.player.z=-2;C.markExplored(s.world,0,0,-2);
  s.cultivation.facilities.push({kind,id:1,x:0,y:0,z:-2,temperature:12,buffer:0,quality:100,closed:true,sections:0});
  check(cardAt(s,0,0));
 }
 const wild=C.createState(11,{cultivation:true});wild.player.z=-2;C.markExplored(wild.world,0,0,-2);C.tileAt(wild.world,0,0,-2);wild.world.hotChunk.type[C.chunkIndex(0,0)]=C.T.GEODE;C.setRichness(wild.world,0,0,-2,10);
 const colony=cardAt(wild,0,0);assert.equal(colony.slot,'top');check(colony);
 const home=C.createState(11,{cultivation:true}),hide=C.hidingPlace(home.world.seed);C.markExplored(home.world,hide.x,hide.y,0);check(cardAt(home,hide.x,hide.y));
 for(const [kind,def]of Object.entries(C.PROPS))if(def.light){home.world.props.set(C.packKey(0,0,0),kind);check(cardAt(home,0,0));}
 // Producer cards use the same required 'image' convention as the catalog.
 for(const key of Object.keys(C.EXTRACTORS))check({look:'building.'+key});
});
