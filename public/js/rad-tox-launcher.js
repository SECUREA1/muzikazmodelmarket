/* ES5-only compatibility launcher. It must parse in IE11 and old WebViews. */
(function () {
  'use strict';
  var PREFIX = '[MUZIKAZ GAME]';
  // Start the complete mission as soon as the page is ready. The launcher owns
  // the one startup request so a second Start control interaction cannot begin
  // a competing engine or compatibility game.
  var state = 'booting'; var queued = false; var watchdog = 0; var engineRequested = false; var modernSupport;
  // Do not leave touch devices behind a non-responsive launch screen while a
  // WebGL module, CDN, or world asset is unavailable. The compact mission is
  // already in this file, so it can be ready within one short loading window.
  var ENGINE_STARTUP_TIMEOUT_MS = 12000;
  function log(message, detail) { if (window.console && console.info) console.info(PREFIX, message, detail || ''); }
  function status(message) { var nodes = [document.getElementById('house-status'), document.getElementById('house-game-load-status')]; for (var i=0;i<nodes.length;i+=1) if(nodes[i]) nodes[i].textContent=message; }
  function buttons() { return document.querySelectorAll('#house-start-game, [data-house-start]'); }
  function setButtons(disabled, label) { var controls=buttons(); for(var i=0;i<controls.length;i+=1){ controls[i].disabled=disabled; if(label) controls[i].textContent=label; } }
  function publish(next, message) { document.dispatchEvent(makeEvent('muzikaz:rad-tox-app-update', { stage: next, message: message || '' })); }
  function setState(next, message) { state = next; document.documentElement.setAttribute('data-radtox-state', next); log('stage '+next); if(message) status(message); publish(next, message); }
  function supportsModern() { if(modernSupport !== undefined)return modernSupport; var s=document.createElement('script'), c=document.createElement('canvas'), gl; try{gl=c.getContext&&((window.WebGL2RenderingContext&&c.getContext('webgl2'))||c.getContext('webgl')||c.getContext('experimental-webgl'));}catch(ignore){gl=null;} modernSupport='noModule' in s && !!(window.Promise && window.fetch && window.URL && window.CustomEvent && gl); return modernSupport; }
  function clearWatchdog(){ if(watchdog){window.clearTimeout(watchdog);watchdog=0;} }
  function armWatchdog(){ clearWatchdog(); watchdog=window.setTimeout(function(){ if(state==='booting'){ status('The 3D view is taking longer than expected. Compatibility Mode is starting so you can play now.'); startCompatibility(); } },ENGINE_STARTUP_TIMEOUT_MS); }
  function addRecovery(){ var host=document.getElementById('house-game-start'); if(!host || host.querySelector('[data-radtox-recovery]')) return; var box=document.createElement('p'); box.setAttribute('data-radtox-recovery',''); box.innerHTML='<button type="button" data-radtox-retry>Retry 3D Game</button> <button type="button" data-radtox-compat>Start Compatibility Mode</button>'; host.appendChild(box); box.onclick=function(e){var t=e.target; if(t.getAttribute('data-radtox-retry')!==null){e.preventDefault(); queued=true; setState('booting','Retrying 3D engine…'); armWatchdog(); document.dispatchEvent(makeEvent('muzikaz:rad-tox-retry'));} if(t.getAttribute('data-radtox-compat')!==null){e.preventDefault(); startCompatibility();}}; }
  function fail(stage, message){ clearWatchdog(); setState('error', stage+': '+message); var controls=buttons(); for(var i=0;i<controls.length;i+=1){controls[i].disabled=false; controls[i].textContent=controls[i].id==='house-start-game'?'Begin':'Start RAD-TOX';} addRecovery(); }
  function makeEvent(name, detail){ var e; try {e=new window.CustomEvent(name,{detail:detail||{}});} catch(ignore){ e=document.createEvent('Event');e.initEvent(name,true,true);e.detail=detail||{};} return e; }
  function safeScrollIntoView(node){try{node.scrollIntoView({ behavior:'smooth', block:'start' });}catch(ignore){node.scrollIntoView(true);}}
  function startCompatibility(){
    clearWatchdog();
    var stage=document.querySelector('.house-stage'), screen=document.getElementById('house-game-start');
    if(!stage || stage.querySelector('.rad-tox-compat-game') || stage.querySelector('.rad-tox-compat-loader'))return;
    // IE11 and older mobile WebViews do not need to wait for a module, WebGL,
    // or a world file. Build their complete ES5 mission during startup so
    // it is playable immediately rather than showing a simulated load screen.
    setState('compatibility-mode','Level 1 active. Clear every toxic bubble.');
    safeScrollIntoView(stage);
    var game=document.createElement('section'); game.className='rad-tox-compat-game';
    game.innerHTML='<div class="rad-tox-compat-head"><strong>☢ RAD-TOX — Full Compatibility Mission</strong><span data-score>Level 1 · Clear 0 / 12</span></div><p data-mission>Mission active now — clear every toxic bubble.</p><div class="rad-tox-compat-field"></div>';
    stage.appendChild(game);if(screen)screen.className+=' is-hidden';
    var score=0,level=1,totalLevels=3,field=game.querySelector('.rad-tox-compat-field'),label=game.querySelector('[data-score]'),mission=game.querySelector('[data-mission]'),audio;
    function sound(kind){var A=window.AudioContext||window.webkitAudioContext,now,o,g,clear=kind==='clear';if(!A)return;try{audio=audio||new A();if(audio.state==='suspended')audio.resume();now=audio.currentTime;o=audio.createOscillator();g=audio.createGain();o.type=clear?'triangle':'square';o.frequency.setValueAtTime(clear?660:210+score*18,now);o.frequency.exponentialRampToValueAtTime(clear?1320:420+score*22,now+(clear ? .2 : .07));g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.07,now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+(clear ? .24 : .1));o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+.28);}catch(ignore){}}
    function populate(){score=0;field.innerHTML='';label.innerHTML='Level '+level+' · Clear 0 / 12';mission.innerHTML='Level '+level+' active — clear every toxic bubble.';for(var i=0;i<12;i+=1){var x=document.createElement('button');x.type='button';x.className='rad-tox-compat-bubble';x.style.left=(5+(i*29+level*7)%84)+'%';x.style.top=(10+(i*37+level*11)%70)+'%';x.innerHTML=level===2?'♆':'☢';x.onclick=function(){if(this.disabled)return;this.disabled=true;this.setAttribute('data-popped','');this.innerHTML='✓';score+=1;sound(score===12?'clear':'pop');label.innerHTML='Level '+level+' · Clear '+score+' / 12';status('Level '+level+': toxic bubble cleared. '+(12-score)+' remain.');if(score===12){if(level<totalLevels){level+=1;mission.innerHTML='Level clear. Loading level '+level+'…';setState('loading-game','Loading compatibility level '+level+'…');window.setTimeout(function(){setState('compatibility-mode','Level '+level+' active. Clear every toxic bubble.');populate();},500);}else{label.innerHTML='Full mission complete!';mission.innerHTML='All three compatibility levels cleared.';status('RAD-TOX full compatibility mission complete!');}}};field.appendChild(x);}}
    populate();
  }

  function startEngine(){
    if(engineRequested)return;
    engineRequested=true;
    var module=document.createElement('script');
    module.type='module';
    module.src='public/js/house-explorer-glb.js';
    module.onerror=function(){ engineRequested=false; fail('3D engine','The game files could not be loaded.'); startCompatibility(); };
    document.body.appendChild(module);
  }
  function request(){
    if(state==='loading-game') return;
    queued=true;
    setButtons(true,'Loading RAD-TOX: 0%');
    if(!supportsModern()){startCompatibility();return;}
    if(state==='engine-ready'){ document.dispatchEvent(makeEvent('muzikaz:rad-tox-request')); }
    else if(state==='booting'){ armWatchdog(); }
    else {setState('booting','Loading RAD-TOX: 0%'); startEngine(); armWatchdog();}
  }
  document.addEventListener('muzikaz:rad-tox-engine-ready',function(){clearWatchdog();setState('engine-ready','3D engine ready.');if(queued)document.dispatchEvent(makeEvent('muzikaz:rad-tox-request'));});
  document.addEventListener('muzikaz:rad-tox-stage',function(e){var d=e.detail||{};setState(d.stage||'loading-manifest',d.message);});
  document.addEventListener('muzikaz:rad-tox-native-error',function(e){var d=e.detail||{}; fail(d.stage||'3D game',d.message||'The environment could not be started.'); status('The 3D environment could not start. Compatibility Mode is opening so the mission remains playable.'); startCompatibility();});
  function isStartControl(t){while(t&&t.id!=='house-start-game'&&(!t.getAttribute||t.getAttribute('data-house-start')===null))t=t.parentNode;return t;}
  // The Begin control remains available for restarting the request if needed.
  document.addEventListener('pointerdown',function(e){if(isStartControl(e.target)&&supportsModern())startEngine();},true);
  document.addEventListener('touchstart',function(e){if(isStartControl(e.target)&&supportsModern())startEngine();},true);
  document.addEventListener('click',function(e){var t=isStartControl(e.target);if(!t)return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();request();},true);
  // Start once on page startup. Modern WebGL browsers receive the full 3D
  // mission; IE11 and other legacy browsers immediately receive the complete
  // ES5 mission without waiting for unavailable module or WebGL resources.
  function autoStart(){
    queued=true;
    setButtons(true,'Loading RAD-TOX: 0%');
    if(!supportsModern()){ startCompatibility(); return; }
    setState('booting','Loading RAD-TOX: 0%');
    startEngine();
    armWatchdog();
  }
  window.setTimeout(autoStart,0);
}());
