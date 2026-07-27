/* One-way RAD-TOX launcher: Begin, load to 100%, then reveal the running game. */
(function () {
  'use strict';
  var PREFIX = '[MUZIKAZ GAME]';
  var state = 'booting'; var queued = false; var watchdog = 0; var progressTimer = 0; var progressValue = 0; var engineRequested = false; var modernSupport;
  // Some devices need extra time to load the 3D engine and its environment assets.
  var ENGINE_STARTUP_TIMEOUT_MS = 120000;
  var GAME_DEPLOY_TIMEOUT_MS = 120000;
  function log(message, detail) { if (window.console && console.info) console.info(PREFIX, message, detail || ''); }
  function status(message) { var nodes = [document.getElementById('house-status'), document.getElementById('house-game-load-status')]; for (var i=0;i<nodes.length;i+=1) if(nodes[i]) nodes[i].textContent=message; }
  function buttons() { return document.querySelectorAll('[data-house-start]'); }
  function setButtons(disabled, label) { var controls=buttons(); for(var i=0;i<controls.length;i+=1){ controls[i].disabled=disabled; if(label) controls[i].textContent=label; } }
  function updateProgress(value, message){var loader=document.getElementById('house-level-loader'),fill=loader&&loader.querySelector('[data-level-loader-fill]'),percent=loader&&loader.querySelector('[data-level-loader-percent]'),scale=loader&&loader.querySelector('.house-level-loader__scale');progressValue=Math.max(progressValue,Math.min(100,Math.round(value)));if(fill)fill.style.width=progressValue+'%';if(percent)percent.textContent=progressValue+'%';if(scale)scale.setAttribute('aria-valuenow',String(progressValue));if(message){var copy=loader&&loader.querySelector('[data-level-loader-message]');if(copy)copy.textContent=message;}}
  function stopProgress(){if(progressTimer){window.clearInterval(progressTimer);progressTimer=0;}}
  function startProgress(){stopProgress();progressValue=0;updateProgress(4,'Loading the 3D engine…');progressTimer=window.setInterval(function(){if(progressValue<38)updateProgress(progressValue+2);},700);}
  function showLoading(show){var loader=document.getElementById('house-level-loader');if(loader)loader.hidden=!show;}
  function publish(next, message) { document.dispatchEvent(makeEvent('muzikaz:rad-tox-app-update', { stage: next, message: message || '' })); }
  function setState(next, message) { state = next; document.documentElement.setAttribute('data-radtox-state', next); log('stage '+next); if(message) status(message); publish(next, message); }
  function supportsModern() { if(modernSupport !== undefined)return modernSupport; var s=document.createElement('script'), c=document.createElement('canvas'), gl; try{gl=c.getContext&&((window.WebGL2RenderingContext&&c.getContext('webgl2'))||c.getContext('webgl')||c.getContext('experimental-webgl'));}catch(ignore){gl=null;} modernSupport='noModule' in s && !!(window.Promise && window.fetch && window.URL && window.CustomEvent && gl); return modernSupport; }
  function clearWatchdog(){ if(watchdog){window.clearTimeout(watchdog);watchdog=0;} }
  function armWatchdog(delay){ clearWatchdog(); watchdog=window.setTimeout(function(){ if(state==='booting' || state==='loading-game') fail('3D engine','The game could not finish loading.'); },delay || ENGINE_STARTUP_TIMEOUT_MS); }
  function fail(stage, message){ clearWatchdog(); stopProgress(); queued=false; engineRequested=false; showLoading(false); setState('error', stage+': '+message+' Press Begin to try again.'); setButtons(false,'Begin'); }
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

  function begin() {
    if (started) return;
    started = true;

    var start = document.getElementById('house-game-start');
    var loader = document.getElementById('house-level-loader');
    var button = document.querySelector('[data-house-start]');
    if (button) button.disabled = true;
    if (start) start.hidden = true;
    if (loader) loader.hidden = false;

    updateProgress(4, 'Loading the game…');
    progressTimer = window.setInterval(function () {
      if (progress < 90) updateProgress(progress + 2);
    }, 500);

    var module = document.createElement('script');
    module.type = 'module';
    module.src = 'public/js/house-explorer-glb.js';
    document.body.appendChild(module);
  }

  document.addEventListener('click', function (click) {
    var target = click.target;
    while (target && (!target.getAttribute || target.getAttribute('data-house-start') === null)) target = target.parentNode;
    if (!target) return;
    click.preventDefault();
    begin();
  }, true);

  document.addEventListener('muzikaz:rad-tox-engine-ready', function () {
    updateProgress(50, 'Loading level 1…');
    document.dispatchEvent(event('muzikaz:rad-tox-request'));
  });

  document.addEventListener('muzikaz:rad-tox-stage', function (stageEvent) {
    var detail = stageEvent.detail || {};
    if (detail.stage === 'loading-game') updateProgress(60, detail.message);
    if (detail.stage !== 'game-active') return;

    window.clearInterval(progressTimer);
    updateProgress(100, detail.message || 'Game ready.');
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        var loader = document.getElementById('house-level-loader');
        if (loader) loader.hidden = true;
      });
    });
  });
}());
