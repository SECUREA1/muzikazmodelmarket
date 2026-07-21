/* ES5-only compatibility launcher. It must parse in IE11 and old WebViews. */
(function () {
  'use strict';
  var PREFIX = '[MUZIKAZ GAME]';
  var state = 'booting'; var queued = false; var watchdog = 0; var engineRequested = false; var modernSupport;
  // Some devices need extra time to load the 3D engine and its environment assets.
  var ENGINE_STARTUP_TIMEOUT_MS = 90000;
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
  function startCompatibility(){ clearWatchdog(); setState('compatibility-mode','Compatibility Mode active. Clear every toxic bubble.'); var stage=document.querySelector('.house-stage'), screen=document.getElementById('house-game-start'); if(!stage || stage.querySelector('.rad-tox-compat-game'))return; safeScrollIntoView(stage); var game=document.createElement('section'); game.className='rad-tox-compat-game'; game.innerHTML='<div class="rad-tox-compat-head"><strong>☢ RAD-TOX — Compatibility Mode</strong><span data-score>Clear 0 / 12</span></div><p>Fast 2D mission for browsers without the 3D engine.</p><div class="rad-tox-compat-field"></div><button type="button" data-start-mission>Start mission</button>'; stage.appendChild(game);if(screen)screen.className+=' is-hidden';var score=0,field=game.querySelector('.rad-tox-compat-field'),label=game.querySelector('[data-score]'),audio;function sound(kind){var A=window.AudioContext||window.webkitAudioContext,now,o,g;if(!A)return;try{audio=audio||new A();if(audio.state==='suspended')audio.resume();now=audio.currentTime;o=audio.createOscillator();g=audio.createGain();o.type=kind==='clear'?'triangle':'square';o.frequency.setValueAtTime(kind==='clear'?660:210+score*18,now);o.frequency.exponentialRampToValueAtTime(kind==='clear'?1320:420+score*22,now+(kind==='clear'?.2:.07));g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.07,now+.01);g.gain.exponentialRampToValueAtTime(.0001,now+(kind==='clear'?.24:.1));o.connect(g);g.connect(audio.destination);o.start(now);o.stop(now+.28);}catch(ignore){}}function populate(){score=0;field.innerHTML='';label.innerHTML='Clear 0 / 12';for(var i=0;i<12;i+=1){var x=document.createElement('button');x.type='button';x.className='rad-tox-compat-bubble';x.style.left=(5+(i*29)%84)+'%';x.style.top=(10+(i*37)%70)+'%';x.innerHTML='☢';x.onclick=function(){if(this.disabled)return;this.disabled=true;this.setAttribute('data-popped','');this.innerHTML='✓';score+=1;sound(score===12?'clear':'pop');label.innerHTML=score===12?'Floor cleared!':'Clear '+score+' / 12';status(score===12?'RAD-TOX complete!':'Toxic bubble cleared. '+(12-score)+' remain.');};field.appendChild(x);}} game.querySelector('[data-start-mission]').onclick=populate;populate();}
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
    if(state==='booting' || state==='loading-game') return;
    queued=true;
    setButtons(true,'Loading RAD-TOX: 0%');
    if(!supportsModern()){startCompatibility();return;}
    if(state==='engine-ready'){ document.dispatchEvent(makeEvent('muzikaz:rad-tox-request')); }
    else {setState('booting','Loading RAD-TOX: 0%'); startEngine(); armWatchdog();}
  }
  document.addEventListener('muzikaz:rad-tox-engine-ready',function(){clearWatchdog();setState('engine-ready','3D engine ready.');if(queued)document.dispatchEvent(makeEvent('muzikaz:rad-tox-request'));});
  document.addEventListener('muzikaz:rad-tox-stage',function(e){var d=e.detail||{};setState(d.stage||'loading-manifest',d.message);});
  document.addEventListener('muzikaz:rad-tox-native-error',function(e){var d=e.detail||{}; fail(d.stage||'3D game',d.message||'The environment could not be started.'); status('The 3D environment could not start. Compatibility Mode is opening so the mission remains playable.'); startCompatibility();});
  function isStartControl(t){while(t&&t.id!=='house-start-game'&&(!t.getAttribute||t.getAttribute('data-house-start')===null))t=t.parentNode;return t;}
  // Start fetching on press so mobile browsers can establish the module connection
  // before the following click handler asks the game to begin.
  document.addEventListener('pointerdown',function(e){if(isStartControl(e.target)&&supportsModern())startEngine();},true);
  document.addEventListener('touchstart',function(e){if(isStartControl(e.target)&&supportsModern())startEngine();},true);
  document.addEventListener('click',function(e){var t=isStartControl(e.target);if(!t)return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();request();},true);
  // Engage RAD-TOX as soon as the page is ready. Modern WebGL browsers load the
  // complete 3D mission, while IE11 and other legacy browsers immediately receive
  // the playable ES5 compatibility mission instead of a non-responsive launch UI.
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
