'use strict';
var assert = require('node:assert/strict');
var C = require('../core.js');
var s = C.createState(123456);
var r = s.run;

assert.equal(C.layerAt(r, 0).start, 0, 'first layer starts at surface');
assert.equal(C.layerAt(r, 5000).index > 100, true, 'layers generate indefinitely');
var layerProbe = C.layerAt(r, 5000);
assert.equal(C.layerAt(r, 5000).index, layerProbe.index, 'layer lookup is stable');
assert.equal(C.isOpen(r, 0, 0), true, 'dive starts in open airlock');

var path = C.planDrill(s, 0, 5);
assert.ok(path && path.length, 'visible target has a connecting drill route');
for (var i = 0; i < path.length; i++) {
  var result = C.drillStep(s, path, i);
  if (result.blocked) break;
  if (result.done) break;
}
assert.equal(C.isOpen(r, 0, 1), true, 'initial airlock path stays connected');
assert.ok(C.cargoSpeed(s) <= 1, 'cargo never improves movement speed');

var rich = C.createState(99);
var layer = C.layerAt(rich.run, 0);
rich.run.x = layer.veinX + .5; rich.run.y = layer.start + layer.length - 2.5;
var veinPath = C.planDrill(rich, layer.veinX, layer.start + layer.length - 2);
assert.equal(veinPath[0].kind, C.TILE.VEIN, 'each layer guarantees its resource vein');
C.drillStep(rich, veinPath, 0);
assert.ok(C.cargoWeight(rich.run) >= 1, 'mining auto-loads cargo');
assert.ok(C.cargoSpeed(rich) < 1, 'cargo weight slows the ship');
var salvage= C.createState(99), salvageLayer=C.layerAt(salvage.run,0);
salvage.hub.upgrades.salvage=2;salvage.run.x=salvageLayer.veinX+.5;salvage.run.y=salvageLayer.start+salvageLayer.length-2.5;
var salvagePath=C.planDrill(salvage,salvageLayer.veinX,salvageLayer.start+salvageLayer.length-2);C.drillStep(salvage,salvagePath,0);
assert.ok(C.cargoWeight(salvage.run)>C.cargoWeight(rich.run),'salvage upgrade improves resource yields');

var hard = C.createState(4); hard.run.cargo.fuel = 0;
var hardTile;
for (var y = 1; y < 30 && !hardTile; y++) for (var x = -15; x < 16; x++) if (C.tileAt(hard,x,y).kind === C.TILE.HARD) { hardTile={x:x,y:y}; break; }
hard.run.x = hardTile.x - .5; hard.run.y = hardTile.y + .5;
var hardRoute = C.planDrill(hard, hardTile.x, hardTile.y);
var blocked = C.drillStep(hard, hardRoute, 0);
assert.equal(blocked.blocked, true, 'hard terrain needs shared fuel or a charge');

var flood = C.createState(3); flood.run.dug['1,1']=true; flood.run.dug['2,1']=true;
var water;
for (var wy=1;wy<80&&!water;wy++) for(var wx=-20;wx<21;wx++) if(C.tileAt(flood,wx,wy).kind===C.TILE.WATER){water={x:wx,y:wy};break;}
if(water){ flood.run.x=water.x+.5;flood.run.y=water.y-.5;var wp=C.planDrill(flood,water.x,water.y);for(var wi=0;wi<wp.length;wi++){var wr=C.drillStep(flood,wp,wi);if(wr.done||wr.blocked)break;} }
assert.ok(water, 'procedural pressure-water pockets exist');
assert.equal(flood.run.wet[water.x+','+water.y],true,'opening a water pocket floods its tile');

var blast = C.createState(10); blast.run.charges=1;
var b=C.blast(blast,2,2); assert.equal(b.ok,true,'charges reshape terrain'); assert.equal(blast.run.charges,0,'charge consumed');
var saved = C.createState(11); saved.run.cargo.fuel=1; saved.run.cargo.scrap=10;
var ext=C.extract(saved); assert.equal(ext.ok,true,'fuel enables beacon extraction'); assert.equal(saved.hub.bank.scrap,14,'extraction banks one fifth of haul');
assert.equal(saved.run.status,'extracted','successful extraction ends dive');
var failed=C.createState(12); C.failRun(failed); assert.equal(failed.hub.bank.scrap,12,'failure preserves permanent upgrades only');
failed.hub.bank.scrap=14;
assert.equal(C.buyUpgrade(failed,'hull').ok,true,'banked resources buy permanent upgrades');
assert.equal(C.deserialize(C.serialize(failed)).hub.upgrades.hull,1,'save data round trips');
console.log('Core checks passed: layers, connected digging, cargo, hard rock, water, explosives, extraction, failure, upgrades, saves.');
