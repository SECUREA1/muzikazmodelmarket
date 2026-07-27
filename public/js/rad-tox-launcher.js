/* Lightweight 3D launcher. It stays ES5-compatible so unsupported browsers can show a useful error. */
(function () {
  'use strict';
  var PREFIX = '[MUZIKAZ GAME]';
  var state = 'booting'; var queued = false; var watchdog = 0; var engineRequested = false; var engineReady = false; var modernSupport;
  // Some devices need extra time to load the 3D engine and its environment assets.
  var ENGINE_STARTUP_TIMEOUT_MS = 90000;
  var GAME_DEPLOY_TIMEOUT_MS = 20000;
  function log(message, detail) { if (window.console && console.info) console.info(PREFIX, message, detail || ''); }
  function status(message) { var nodes = [document.getElementById('house-status'), document.getElementById('house-game-load-status')]; for (var i=0;i<nodes.length;i+=1) if(nodes[i]) nodes[i].textContent=message; }
  function buttons() { return document.querySelectorAll('#house-start-game, [data-house-start]'); }
  function setButtonLabel(control, label) { var labelNode=control.querySelector&&control.querySelector('span'); if(labelNode)labelNode.textContent=label;else control.textContent=label; }
  function setButtons(disabled, label) { var controls=buttons(); for(var i=0;i<controls.length;i+=1){ controls[i].disabled=disabled; controls[i].setAttribute('aria-busy',disabled?'true':'false'); if(label)setButtonLabel(controls[i],label); } }
  function publish(next, message) { document.dispatchEvent(makeEvent('muzikaz:rad-tox-app-update', { stage: next, message: message || '' })); }
  function setState(next, message) { state = next; document.documentElement.setAttribute('data-radtox-state', next); log('stage '+next); if(message) status(message); publish(next, message); }
  function supportsModern() { if(modernSupport !== undefined)return modernSupport; var s=document.createElement('script'), c=document.createElement('canvas'), gl; try{gl=c.getContext&&((window.WebGL2RenderingContext&&c.getContext('webgl2'))||c.getContext('webgl')||c.getContext('experimental-webgl'));}catch(ignore){gl=null;} modernSupport='noModule' in s && !!(window.Promise && window.fetch && window.URL && window.CustomEvent && gl); return modernSupport; }
  function clearWatchdog(){ if(watchdog){window.clearTimeout(watchdog);watchdog=0;} }
  function armWatchdog(delay){ clearWatchdog(); watchdog=window.setTimeout(function(){ if(state==='booting' || state==='loading-game') fail('3D engine','The game is taking longer than expected. Retry the 3D game.'); },delay || ENGINE_STARTUP_TIMEOUT_MS); }
  function addRecovery(){ var host=document.getElementById('house-game-start'); if(!host || host.querySelector('[data-radtox-recovery]')) return; var box=document.createElement('p'); box.setAttribute('data-radtox-recovery',''); box.innerHTML='<button type="button" data-radtox-retry>Retry 3D Game</button>'; host.appendChild(box); box.onclick=function(e){var t=e.target; if(t.getAttribute('data-radtox-retry')!==null){e.preventDefault(); queued=true; setState('booting','Retrying 3D engine…'); if(engineReady)document.dispatchEvent(makeEvent('muzikaz:rad-tox-request'));else startEngine(true); armWatchdog();}}; }
  function fail(stage, message){ clearWatchdog(); setState('error', stage+': '+message); setButtons(false,'BEGIN NOW!'); addRecovery(); }
  function makeEvent(name, detail){ var e; try {e=new window.CustomEvent(name,{detail:detail||{}});} catch(ignore){ e=document.createEvent('Event');e.initEvent(name,true,true);e.detail=detail||{};} return e; }
  function startEngine(){
    var retry=arguments[0]===true;
    if(engineRequested&&!retry)return;
    engineRequested=true;
    var module=document.createElement('script');
    module.type='module';
    module.src='public/js/house-explorer-glb.js';
    if(retry)module.src+='?retry='+new Date().getTime();
    module.onerror=function(){ engineRequested=false; fail('3D engine','The game files could not be loaded.'); };
    document.body.appendChild(module);
  }
  function request(){
    if(state==='booting' || state==='loading-game') return;
    queued=true;
    setButtons(true,'Preparing RAD-TOX…');
    if(!supportsModern()){fail('3D engine','This browser does not support the WebGL features required by RAD-TOX.');return;}
    if(state==='engine-ready'){ document.dispatchEvent(makeEvent('muzikaz:rad-tox-request')); }
    else {setState('booting','Loading the 3D engine. Your game will begin automatically…'); startEngine(); armWatchdog();}
  }
  document.addEventListener('muzikaz:rad-tox-engine-ready',function(){clearWatchdog();engineReady=true;setState('engine-ready','3D engine ready.');if(queued)window.setTimeout(function(){document.dispatchEvent(makeEvent('muzikaz:rad-tox-request'));},0);});
  document.addEventListener('muzikaz:rad-tox-stage',function(e){var d=e.detail||{},next=d.stage||'loading-manifest';setState(next,d.message);if(next==='loading-game')armWatchdog(GAME_DEPLOY_TIMEOUT_MS);else if(next==='game-active')clearWatchdog();});
  document.addEventListener('muzikaz:rad-tox-native-error',function(e){var d=e.detail||{}; fail(d.stage||'3D game',d.message||'The 3D environment could not be started.');});
  function isStartControl(t){while(t&&t.id!=='house-start-game'&&(!t.getAttribute||t.getAttribute('data-house-start')===null))t=t.parentNode;return t;}
  // Start fetching on press so mobile browsers can establish the module connection
  // before the following click handler asks the game to begin.
  document.addEventListener('pointerdown',function(e){if(isStartControl(e.target)&&supportsModern())startEngine();},true);
  document.addEventListener('touchstart',function(e){if(isStartControl(e.target)&&supportsModern())startEngine();},true);
  document.addEventListener('click',function(e){var t=isStartControl(e.target);if(!t)return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();request();},true);
  // Keyboard activation is normally followed by click, but handling it directly
  // also covers older WebViews and assistive browser modes that omit that click.
  document.addEventListener('keydown',function(e){var key=e.key||e.keyCode;if(isStartControl(e.target)&&(key==='Enter'||key===' '||key===13||key===32)){e.preventDefault();request();}},true);
  // Do not download or decode Three.js/GLB assets until the player opts in. This
  // leaves scrolling and first paint responsive on memory-constrained phones.
  if(!supportsModern()) window.setTimeout(function(){fail('3D engine','This browser does not support the WebGL features required by RAD-TOX.');},0); else setState('idle','Ready to start RAD-TOX.');
}());
