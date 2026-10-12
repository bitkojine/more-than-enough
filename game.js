/* DEEPER — mobile-first expedition interface. */
(function () {
  'use strict';
  var C = window.DEEP, key = 'deeper-save-v1', state;
  var canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  var hud = document.getElementById('stats'), prompt = document.getElementById('prompt');
  var hub = document.getElementById('hub'), tutorial = document.getElementById('tutorial'), toast = document.getElementById('toast');
  var joyEl = document.getElementById('joystick'), joyDot = joyEl.querySelector('i');
  var w = 0, h = 0, dpr = 1, tile = 42, held = false, digPath = [], digIndex = 0, digClock = 0, saveClock = 0;
  var chargeAim = false, joy = null, last = performance.now(), toastTimer = 0;
  try { state = C.deserialize(localStorage.getItem(key)) || C.createState(); } catch (_) { state = C.createState(); }
  document.getElementById('version').textContent = window.MTE_VERSION || '';

  function save() { try { localStorage.setItem(key, C.serialize(state)); } catch (_) {} }
  function say(text) { toast.textContent = text; toast.classList.add('show'); toastTimer = 2.8; }
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); w = innerWidth; h = innerHeight; canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); tile = Math.max(31, Math.min(48, w/9)); }
  window.addEventListener('resize', resize); resize();
  function screen(x,y) { return { x:w/2+(x-state.run.x)*tile, y:h*.51+(y-state.run.y)*tile }; }
  function world(px,py) { return { x:Math.floor((px-w/2)/tile+state.run.x), y:Math.floor((py-h*.51)/tile+state.run.y) }; }
  function roundRect(x,y,ww,hh,r) { ctx.beginPath(); ctx.roundRect(x,y,ww,hh,r); }
  function paintTile(x,y) {
    var p=screen(x,y), t=C.tileAt(state,x,y), layer=t.layer||C.layerAt(state.run,y), s=tile;
    if (p.x < -s || p.x>w || p.y < -s || p.y>h) return;
    if (t.kind==='open') {
      ctx.fillStyle=t.wet?'#174453':'#17252a'; ctx.fillRect(p.x,p.y,s-1,s-1);
      if (t.wet) { ctx.fillStyle='rgba(104,222,221,.2)'; ctx.fillRect(p.x,p.y+s*.55,s-1,s*.18); }
      return;
    }
    var color=layer.color;
    if(t.kind==='hard') color='#343e46'; if(t.kind==='vein') color='#39434a'; if(t.kind==='gas') color='#514039'; if(t.kind==='water') color='#24596a'; if(t.kind==='ruin') color='#56496a';
    ctx.fillStyle=color; ctx.fillRect(p.x,p.y,s-1,s-1);
    var n=(Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^state.run.seed)>>>0;
    ctx.fillStyle=layer.accent+'22';
    if(t.kind==='hard') { ctx.beginPath(); ctx.moveTo(p.x+6,p.y+s-7); ctx.lineTo(p.x+s*.48,p.y+8+(n%9)); ctx.lineTo(p.x+s-5,p.y+s*.62); ctx.strokeStyle=layer.accent+'55'; ctx.lineWidth=1.2; ctx.stroke(); }
    else { for(var speck=0;speck<3;speck++){ctx.fillRect(p.x+5+((n>>>(speck*5))%(s-12)),p.y+5+((n>>>(speck*4+9))%(s-12)),2,2);} }
    if(t.kind==='vein' && state.run.known[x+','+y]) { ctx.fillStyle=(C.RESOURCES[t.resource]||{}).color||layer.accent; ctx.font='bold 15px system-ui'; ctx.textAlign='center'; ctx.fillText((C.RESOURCES[t.resource]||{}).mark||'◆',p.x+s/2,p.y+s*.67); }
    else if(t.kind==='gas' && state.run.known[x+','+y]) { ctx.fillStyle='#ffb16d'; ctx.font='bold 15px system-ui'; ctx.textAlign='center'; ctx.fillText('!',p.x+s/2,p.y+s*.68); }
    else if(t.kind==='water' && state.run.known[x+','+y]) { ctx.fillStyle='#7de6ef'; ctx.font='bold 15px system-ui'; ctx.textAlign='center'; ctx.fillText('≈',p.x+s/2,p.y+s*.66); }
    else if(t.kind==='ruin') { ctx.fillStyle='#dbbdff'; ctx.font='bold 17px system-ui'; ctx.textAlign='center'; ctx.fillText('✦',p.x+s/2,p.y+s*.67); }
    else if(t.kind==='vein') { ctx.fillStyle=(C.RESOURCES[t.resource]||{}).color||layer.accent; ctx.globalAlpha=.2; ctx.beginPath();ctx.arc(p.x+s/2,p.y+s/2,s*.27,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1; }
  }
  function render() {
    ctx.clearRect(0,0,w,h);
    var layer=C.layerAt(state.run,state.run.y), minX=Math.floor(state.run.x-w/tile/2)-1,maxX=Math.ceil(state.run.x+w/tile/2)+1,minY=Math.floor(state.run.y-h/tile/2)-1,maxY=Math.ceil(state.run.y+h/tile/2)+1;
    for(var y=minY;y<=maxY;y++) for(var x=minX;x<=maxX;x++) paintTile(x,y);
    if(digPath.length) {
      ctx.lineWidth=tile*.12; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='rgba(126,238,190,.88)'; ctx.beginPath();
      var start=screen(state.run.x,state.run.y); ctx.moveTo(start.x,start.y);
      digPath.forEach(function(p,i){ var q=screen(p.x+.5,p.y+.5); if(i===digIndex && !held) return; ctx.lineTo(q.x,q.y); }); ctx.stroke();
      digPath.forEach(function(p){ var q=screen(p.x,p.y), known=!!state.run.known[p.x+','+p.y], t=C.tileAt(state,p.x,p.y); ctx.lineWidth=2; ctx.strokeStyle=t.kind==='gas'&&known?'#ff806d':t.kind==='vein'&&known?'#ffd66f':'#93f2c5'; ctx.strokeRect(q.x+4,q.y+4,tile-9,tile-9); });
    }
    var p=screen(state.run.x,state.run.y);
    ctx.save(); ctx.translate(p.x+tile/2,p.y+tile/2);
    ctx.fillStyle='#d8f4e9'; ctx.strokeStyle='#63d8bd'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(0,-tile*.32); ctx.lineTo(tile*.25,tile*.22); ctx.lineTo(0,tile*.13); ctx.lineTo(-tile*.25,tile*.22); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    updateHud(layer);
    requestAnimationFrame(render);
  }
  function updateHud(layer) {
    var r=state.run, entries=[['DEPTH',Math.floor(r.y)+' m'],['LAYER',layer.name],['HULL',Math.ceil(r.hull)+'%'],['PRESSURE',r.pressure+'%'],['CARGO',C.cargoWeight(r)+' · '+Math.round(C.cargoSpeed(state)*100)+'%'],['FUEL',r.cargo.fuel]];
    hud.innerHTML=entries.map(function(e){return '<div class="stat"><small>'+e[0]+'</small><b>'+e[1]+'</b></div>';}).join('');
    document.getElementById('fuel').textContent=r.cargo.fuel+' fuel'; document.getElementById('charges').textContent=r.charges+' packed';
    prompt.textContent=r.status==='diving' ? (r.cargo.fuel?'Fuel powers both hard-rock drilling and your beacon.':'Find fuel to power the beacon.') : r.status==='destroyed'?'Ship lost · loose cargo is gone':r.status==='extracted'?'Extracted · 20% of cargo banked':'';
  }
  function persistOutcome() { save(); if(state.run.status!=='diving' && hub.hidden) openHub(); }
  function openHub() {
    var outcome=state.hub.lastOutcome||''; document.getElementById('hubTitle').textContent=state.hub.dives?'Back at the surface':'Prepare to dive'; document.getElementById('outcome').textContent=outcome;
    document.getElementById('bank').innerHTML='BANKED <b>'+Object.keys(state.hub.bank).filter(function(k){return state.hub.bank[k]>0;}).map(function(k){return state.hub.bank[k]+' '+k;}).join(' · ')+'</b>';
    var rooms=document.getElementById('hubRooms');
    rooms.innerHTML='<div class="room-label">STATION SERVICES · '+(state.hub.rooms.workshop?'Workshop online':'')+'</div>'+[['archive','ARCHIVE · 24 SCRAP'],['habitat','HABITAT · 30 SCRAP'],['quarters','CREW QUARTERS · 20 SCRAP']].filter(function(v){return !state.hub.rooms[v[0]];}).map(function(v){return '<button class="room" data-room="'+v[0]+'">BUILD '+v[1]+'</button>';}).join('')+(Object.keys(state.hub.records).length?'<div class="room-label">FIELD NOTES · '+Object.keys(state.hub.records).length+' persistent discoveries</div>':'');
    rooms.querySelectorAll('[data-room]').forEach(function(button){button.addEventListener('click',function(){var result=C.buildRoom(state,button.dataset.room);say(result.message);openHub();save();});});
    var costs={hull:14,engine:12,cargo:10,salvage:18};
    var upgradeNames={hull:'HULL PLATING',engine:'THRUSTER',cargo:'CARGO WINCH',salvage:'SALVAGE RIG'};
    hub.querySelectorAll('[data-upgrade]').forEach(function(button){var id=button.dataset.upgrade, level=state.hub.upgrades[id], cost=costs[id]*(level+1);button.textContent=upgradeNames[id]+' · '+(level>=4?'MAX':cost+' SCRAP · LV '+level);button.disabled=level>=4;button.onclick=function(){var result=C.buyUpgrade(state,id);say(result.message);save();openHub();};});
    hub.hidden=false;
  }
  function drillStart(e) {
    if(state.run.status!=='diving'||e.target!==canvas) return;
    var p=world(e.clientX,e.clientY); digPath=C.planDrill(state,p.x,p.y)||[]; digIndex=0; held=true; digClock=0;
    if(!digPath.length) say('Choose a tile beside your tunnel.'); else { canvas.setPointerCapture(e.pointerId); var known=digPath.filter(function(q){return q.known;}); if(known.length){var t=known[0]; say(t.kind==='vein'?'Route preview · '+C.RESOURCES[t.resource].name:t.kind==='gas'?'Route preview · pressure hazard':'Route preview · known terrain');} }
  }
  function stopDrill() { held=false; digPath=[]; digIndex=0; }
  function tick(now) {
    var dt=Math.min(.1,(now-last)/1000); last=now; C.step(state,dt);
    saveClock+=dt; if(saveClock>=2){saveClock=0;save();}
    if(joy && state.run.status==='diving') C.move(state,joy.dx,joy.dy,dt);
    if(held && digPath.length) { digClock+=dt; if(digClock>.22) {digClock=0; var res=C.drillStep(state,digPath,digIndex); if(res.message) say(res.message); if(res.blocked||res.done){stopDrill();} else {digIndex++;} save(); } }
    if(state.run.status!=='diving') persistOutcome();
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.classList.remove('show');}
    requestAnimationFrame(tick);
  }
  canvas.addEventListener('pointerdown',drillStart);
  window.addEventListener('pointerup',function(e){ if(held) stopDrill(); if(chargeAim){var p=world(e.clientX,e.clientY); chargeAim=false; var r=C.blast(state,p.x,p.y); say(r.message); save(); } });
  window.addEventListener('pointercancel',function(){stopDrill();chargeAim=false;});
  joyEl.addEventListener('pointerdown',function(e){e.preventDefault();joy={id:e.pointerId,dx:0,dy:0};joyEl.setPointerCapture(e.pointerId);joyEl.classList.add('active');});
  joyEl.addEventListener('pointermove',function(e){if(!joy||joy.id!==e.pointerId)return;var r=joyEl.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),m=Math.hypot(dx,dy),lim=r.width*.36;if(m>lim){dx*=lim/m;dy*=lim/m;}joy.dx=dx/lim;joy.dy=dy/lim;joyDot.style.transform='translate('+dx+'px,'+dy+'px)';});
  function releaseJoy(){joy=null;joyEl.classList.remove('active');joyDot.style.transform='';} joyEl.addEventListener('pointerup',releaseJoy);joyEl.addEventListener('pointercancel',releaseJoy);
  document.getElementById('beacon').addEventListener('click',function(){var r=C.extract(state);say(r.message);save();persistOutcome();});
  document.getElementById('charge').addEventListener('pointerdown',function(){if(state.run.status!=='diving'||state.run.charges<1){say('No charges. Craft one at the Workshop.');return;}chargeAim=true;say('Drag your thumb to aim the charge, then release.');});
  document.getElementById('hubButton').addEventListener('click',function(){if(state.run.status==='diving')say('Extract or lose the ship before returning to the surface.');else openHub();});
  document.getElementById('dive').addEventListener('click',function(){C.startDive(state);hub.hidden=true;save();});
  document.getElementById('craft').addEventListener('click',function(){var r=C.craftCharge(state);say(r.message);save();});
  document.getElementById('help').addEventListener('click',function(){hub.hidden=true;tutorial.hidden=false;});
  document.getElementById('tutorialDone').addEventListener('click',function(){tutorial.hidden=true;localStorage.setItem('deeper-tutorial-v1','1');if(state.run.status!=='diving'||!state.hub.dives)C.startDive(state);save();});
  if(!localStorage.getItem('deeper-tutorial-v1')) { tutorial.hidden=false; hub.hidden=true; }
  else if(state.run.status!=='diving') openHub(); else hub.hidden=true;
  window.DEEPER_GAME={core:C,getState:function(){return state;},summary:function(){return C.stateSummary(state);},drill:function(x,y){var p=C.planDrill(state,x,y)||[];return p.reduce(function(result,_,i){return C.drillStep(state,p,i);},{done:false});}};
  requestAnimationFrame(render); requestAnimationFrame(tick);
})();
