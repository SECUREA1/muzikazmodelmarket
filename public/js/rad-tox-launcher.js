/* Lightweight 3D launcher. It stays ES5-compatible so unsupported browsers can show a useful error. */
(function () {
  'use strict';
  var PREFIX = '[MUZIKAZ GAME]';
  var state = 'booting'; var queued = false; var watchdog = 0; var engineRequested = false; var modernSupport;
  // Some devices need extra time to load the 3D engine and its environment assets.
  var ENGINE_STARTUP_TIMEOUT_MS = 120000;
  var GAME_DEPLOY_TIMEOUT_MS = 120000;
  function log(message, detail) { if (window.console && console.info) console.info(PREFIX, message, detail || ''); }
  function status(message) { var nodes = [document.getElementById('house-status'), document.getElementById('house-game-load-status')]; for (var i=0;i<nodes.length;i+=1) if(nodes[i]) nodes[i].textContent=message; }
  function buttons() { return document.querySelectorAll('[data-house-start]'); }
  function setButtons(disabled, label) { var controls=buttons(); for(var i=0;i<controls.length;i+=1){ controls[i].disabled=disabled; if(label) controls[i].textContent=label; } }
  function showLoading(show){var start=document.getElementById('house-game-start'),loader=document.getElementById('house-level-loader');if(start)start.classList.toggle('is-hidden',show);if(loader)loader.hidden=!show;}
  function publish(next, message) { document.dispatchEvent(makeEvent('muzikaz:rad-tox-app-update', { stage: next, message: message || '' })); }
  function setState(next, message) { state = next; document.documentElement.setAttribute('data-radtox-state', next); log('stage '+next); if(message) status(message); publish(next, message); }
  function supportsModern() { if(modernSupport !== undefined)return modernSupport; var s=document.createElement('script'), c=document.createElement('canvas'), gl; try{gl=c.getContext&&((window.WebGL2RenderingContext&&c.getContext('webgl2'))||c.getContext('webgl')||c.getContext('experimental-webgl'));}catch(ignore){gl=null;} modernSupport='noModule' in s && !!(window.Promise && window.fetch && window.URL && window.CustomEvent && gl); return modernSupport; }
  function clearWatchdog(){ if(watchdog){window.clearTimeout(watchdog);watchdog=0;} }
  function armWatchdog(delay){ clearWatchdog(); watchdog=window.setTimeout(function(){ if(state==='booting' || state==='loading-game') fail('3D engine','The game could not finish loading.'); },delay || ENGINE_STARTUP_TIMEOUT_MS); }
  function fail(stage, message){ clearWatchdog(); queued=false; showLoading(true); setState('error', stage+': '+message); setButtons(true,'Loading unavailable'); }
  function makeEvent(name, detail){ var e; try {e=new window.CustomEvent(name,{detail:detail||{}});} catch(ignore){ e=document.createEvent('Event');e.initEvent(name,true,true);e.detail=detail||{};} return e; }
  function startEngine(){
    if(engineRequested)return;
    engineRequested=true;
    var module=document.createElement('script');
    module.type='module';
    module.src='public/js/house-explorer-glb.js';
    module.onerror=function(){ engineRequested=false; fail('3D engine','The game files could not be loaded.'); };
    document.body.appendChild(module);
  }
  function request(){
    if(state==='booting' || state==='loading-game') return;
    queued=true;
    setButtons(true,'Loading…');
    showLoading(true);
    if(!supportsModern()){fail('3D engine','This browser does not support the WebGL features required by RAD-TOX.');return;}
    if(state==='engine-ready'){ document.dispatchEvent(makeEvent('muzikaz:rad-tox-request')); }
    else {setState('booting','Loading the 3D engine. Your game will begin automatically…'); startEngine(); armWatchdog();}
  }
  document.addEventListener('muzikaz:rad-tox-engine-ready',function(){clearWatchdog();setState('engine-ready','3D engine ready.');if(queued)document.dispatchEvent(makeEvent('muzikaz:rad-tox-request'));});
  document.addEventListener('muzikaz:rad-tox-stage',function(e){var d=e.detail||{},next=d.stage||'loading-manifest';setState(next,d.message);if(next==='loading-game')armWatchdog(GAME_DEPLOY_TIMEOUT_MS);else if(next==='game-active')clearWatchdog();});
  document.addEventListener('muzikaz:rad-tox-native-error',function(e){var d=e.detail||{}; fail(d.stage||'3D game',d.message||'The 3D environment could not be started.');});
  function isStartControl(t){while(t&&(!t.getAttribute||t.getAttribute('data-house-start')===null))t=t.parentNode;return t;}
  // Start fetching on press so mobile browsers can establish the module connection
  // before the following click handler asks the game to begin.
  document.addEventListener('pointerdown',function(e){if(isStartControl(e.target)&&supportsModern())startEngine();},true);
  document.addEventListener('touchstart',function(e){if(isStartControl(e.target)&&supportsModern())startEngine();},true);
  document.addEventListener('click',function(e){var t=isStartControl(e.target);if(!t)return;e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation();request();},true);
  // Do not download or decode Three.js/GLB assets until the player opts in. This
  // leaves scrolling and first paint responsive on memory-constrained phones.
  if(!supportsModern()) window.setTimeout(function(){fail('3D engine','This browser does not support the WebGL features required by RAD-TOX.');},0); else setState('idle','Ready to begin.');
}());
