import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../../src/core/index.js';
import {createBackup,backupText} from '../../src/game/backup.js';

test('normal backup UI imports either collection model and preserves the outgoing world first',async()=>{
 const old=Core.createState(81),current=Core.createState(82,{cultivation:true});
 const previousDocument=globalThis.document,previousTimeout=globalThis.setTimeout;
 let downloads=0;
 globalThis.document={createElement:()=>({click(){downloads++;},remove(){}}),body:{appendChild(){}}};
 globalThis.setTimeout=fn=>{fn();return 0;};
 try{
  for(const [from,to] of [[old,current],[current,old]]){
   const element=()=>({listeners:{},addEventListener(k,fn){this.listeners[k]=fn;}});
   const el={backupSave:element(),backupLoad:element(),backupFile:element()};
   el.backupFile.files=[{text:async()=>backupText(to,0,'test')}];
   let asked=0,replaced=false;const before=downloads;
   const game={state:from,saveNow(){},replace(next){assert.equal(downloads,before+1,'old world downloaded before replacement');assert.equal(next.seed,to.seed);assert.equal(!!next.cultivation,!!to.cultivation);this.state=next;replaced=true;}};
   createBackup({el,game,ask:async()=>{asked++;return true;},toast(){},version:'test'});
   await el.backupFile.listeners.change();assert.equal(asked,1);assert.ok(replaced);
  }
 }finally{globalThis.document=previousDocument;globalThis.setTimeout=previousTimeout;}
});
