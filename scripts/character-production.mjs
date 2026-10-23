import fs from 'node:fs';import {createHash}from'node:crypto';import {resolve,relative}from'node:path';import {fileURLToPath}from'node:url';
import {auditProduction,productionPrompt}from'./lib/character-production.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const spec=JSON.parse(fs.readFileSync(root+'art/characters/production.json'));
const safe=p=>{if(typeof p!=='string')return null;const f=resolve(root,p);return relative(root,f).startsWith('..')?null:f;};
const exists=p=>!!safe(p)&&fs.existsSync(safe(p));
const digest=p=>exists(p)?createHash('sha256').update(fs.readFileSync(safe(p))).digest('hex'):null;
if(process.argv[2]==='prompt'){
 const [variant,action,direction]=process.argv.slice(3);console.log(JSON.stringify(productionPrompt(spec,{variant,action,direction}),null,2));
}else{
 const result=auditProduction(spec,{exists,digest});
 console.log(`${result.accepted}/${result.required} directional production clips accepted; ${result.missing.length} missing.`);
 if(process.argv.includes('--coverage'))console.log(result.missing.join('\n'));
 result.errors.forEach(e=>console.error(e));
 process.exitCode=result.errors.length||process.argv.includes('--complete')&&result.missing.length?1:0;
}
