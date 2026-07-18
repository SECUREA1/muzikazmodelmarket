import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { Capsule } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/math/Capsule.js/+esm';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js/+esm';
import { EnvironmentRegistry } from './environments/environment-registry.js';
import { EnvironmentLoader } from './environments/environment-loader.js';
import { configureRenderer } from './environments/environment-quality.js';
import { logEnvironment } from './environments/environment-api.js';
import { FLOOR_ENTRY_OFFSET, alignPointAboveFloor } from './environments/environment-collision.js';

const legacyCanvas = document.querySelector('#house-explorer-canvas');
const stage = legacyCanvas?.closest('.house-stage');
const hud = document.querySelector('.house-hud');
const houseModal = document.querySelector('#house-game-modal');

if (legacyCanvas instanceof HTMLCanvasElement && stage && hud) {
  const oldStatus = document.querySelector('#house-status');
  const status = oldStatus?.cloneNode(true); if (oldStatus && status) oldStatus.replaceWith(status);
  const canvas = legacyCanvas.cloneNode(false); canvas.width = 1280; canvas.height = 720; canvas.setAttribute('aria-label', 'Walkable MUZIKAZ GLB environment'); canvas.tabIndex = 0; legacyCanvas.replaceWith(canvas);
  const resetButton = document.querySelector('#house-reset')?.cloneNode(true); document.querySelector('#house-reset')?.replaceWith(resetButton);
  // This explorer owns the canvas, so it must also own every control that
  // affects it.  The previous canvas controls are replaced below instead of
  // leaving buttons wired to the retired renderer.
  const handButton = document.querySelector('#hand-toggle')?.cloneNode(true); document.querySelector('#hand-toggle')?.replaceWith(handButton);
  const handPreviewPanel = document.querySelector('.camera-preview-panel');
  const handPreview = document.querySelector('#hand-preview'); const handStatus = document.querySelector('#hand-status');
  hud.querySelector('.hud-pill-grid').innerHTML = '<span>WASD / arrows: walk</span><span>Space: 1.8x jump / climb</span><span>Click: pointer-lock look</span><span>Drag/touch: look</span><span>Mobile buttons: side-step, move, reverse, zoom, jump, reset</span><span>Wheel or zoom buttons: zoom in/out</span><span>Scroll toggle: page vs view</span><span>Q / E: eye height</span><span>Scale starts at 2.5x</span><span>VR: left stick move, right stick snap-turn</span>';

  const MOBILE_CONTROLLER_BUTTONS = [
    { area: 'forward', action: 'forward', icon: '▲', label: 'Forward', type: 'move' },
    { area: 'side-right', action: 'right', icon: '▶', label: 'Side right', type: 'move' },
    { area: 'avatar', action: 'avatar', icon: '👤', label: 'Avatar', type: 'action' },
    { area: 'environment', action: 'environment', icon: '▤', label: 'Environment', type: 'action' },
    { area: 'zoom-toggle', action: 'out', icon: '−', label: 'Zoom out', type: 'zoom-toggle' },
    { area: 'reverse', action: 'back', icon: '▼', label: 'Reverse', type: 'move' },
    { area: 'jump', action: 'jump', icon: '⤴', label: 'Jump', type: 'move' }
  ];

  function rebuildMobileController() {
    const mobilePad = document.querySelector('.mobile-move-pad');
    if (!mobilePad) return;
    mobilePad.replaceChildren();
    mobilePad.className = 'mobile-move-pad mobile-move-pad-glb';
    mobilePad.setAttribute('aria-label', 'Mobile game controls');
    MOBILE_CONTROLLER_BUTTONS.forEach(({ area, action, icon, label, type }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `mobile-control mobile-control-${area}`;
      button.dataset.mobileArea = area;
      if (type === 'zoom') button.dataset.mobileZoom = action;
      else if (type === 'zoom-toggle') { button.dataset.mobileZoomToggle = action; button.setAttribute('aria-pressed', 'false'); }
      else if (type === 'action') button.dataset.mobileAction = action;
      else button.dataset.mobileMove = action;
      button.setAttribute('aria-label', label);
      button.innerHTML = `<b aria-hidden="true">${icon}</b><span>${label}</span>`;
      mobilePad.append(button);
    });
  }

  rebuildMobileController();

  const style = document.createElement('style');
  style.textContent = `
    .house-explorer-shell{width:min(96%,1400px);max-width:100%;box-sizing:border-box;align-items:start}
    .house-stage{grid-column:1;grid-row:1;height:clamp(420px,calc(100svh - 240px),720px);max-height:calc(100svh - 240px);overflow:hidden}
    .house-hud{grid-column:2;grid-row:1 / span 3}
    .house-stage #house-explorer-canvas{display:block;width:100%;height:100%;min-height:420px;background:#050807;touch-action:none;cursor:grab}
    .house-picker-panel,.environment-upload-panel{display:grid;gap:.55rem;padding:.7rem;border:1px solid rgba(156,255,0,.25);border-radius:.85rem;background:rgba(0,0,0,.34)}
    .house-picker-panel{grid-column:1;grid-row:2;position:relative;z-index:9;width:100%;box-sizing:border-box;margin:.7rem 0 0;box-shadow:0 14px 34px rgba(0,0,0,.42);backdrop-filter:blur(14px)}.house-picker-panel.is-collapsed{display:none}
    .house-picker-row{display:grid;grid-template-columns:1fr auto;gap:.45rem;align-items:end}.house-picker-label{display:grid;gap:.25rem;color:rgba(255,255,255,.74);font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.house-picker-panel select{min-width:0;width:100%;height:2.45rem;border:1px solid rgba(156,255,0,.35);border-radius:.65rem;background:rgba(4,8,6,.92);color:#fff;padding:0 .65rem;font:inherit}.house-picker-panel button,.environment-upload-panel button{border:0;border-radius:999px;padding:.62rem .8rem;font-weight:900;background:#9cff00;color:#111;white-space:nowrap}.house-picker-panel small{color:rgba(255,255,255,.72);line-height:1.25}.house-picker-title{display:flex;align-items:center;justify-content:space-between;gap:.5rem;color:#fff}.house-picker-title strong{color:#9cff00}.house-picker-panel .danger{background:#ff5470;color:#fff}.house-stage.is-avatar-drop-target #house-explorer-canvas{outline:2px dashed #9cff00;outline-offset:-8px}
    .environment-upload-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}.environment-upload-grid label{display:grid;gap:.25rem;font-size:.78rem}
    .environment-upload-grid textarea,.environment-upload-grid input,.environment-upload-grid select{width:100%;border-radius:.5rem;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.35);color:#fff;padding:.45rem}
    .environment-upload-grid textarea,.environment-upload-grid progress,.environment-upload-grid button,.environment-upload-grid p{grid-column:1/-1}.environment-upload-grid .check{display:flex;align-items:center;gap:.4rem}
    .house-loading-meter{position:absolute;left:12px;right:12px;bottom:12px;height:5px;z-index:7;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.15)}.house-loading-meter>span{display:block;width:0;height:100%;background:#9cff00;transition:width .18s ease}
    .house-space-scale,.house-view-controls{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.5rem;padding:.75rem;border:1px solid rgba(156,255,0,.25);border-radius:.85rem;background:rgba(0,0,0,.28)}
    .house-space-scale strong,.house-space-scale output,.house-view-controls strong,.house-view-controls output{color:#fff}.house-space-scale strong,.house-view-controls strong{grid-column:1/-1}.house-space-scale input{width:100%;accent-color:#9cff00}
    .house-space-scale button,.house-view-controls button{border:0;border-radius:999px;min-width:2.35rem;height:2.35rem;padding:0 .75rem;font-size:1rem;font-weight:900;background:#9cff00;color:#111;cursor:pointer}.house-view-controls .toggle-active{background:#fff;color:#111}
    .house-hud.house-display-hidden{display:block;padding:.65rem;min-width:min(100%,14rem)}.house-hud.house-display-hidden>*:not(#house-display-toggle){display:none}.house-hud #house-display-toggle{width:100%}
    .radtox-launch-toggle{display:inline-flex;align-items:center;gap:.55rem;margin-top:.9rem;color:#fff;font-weight:800;cursor:pointer}.radtox-launch-toggle input{width:1.1rem;height:1.1rem;accent-color:#9cff00}
    .mobile-move-pad.mobile-move-pad-glb{width:100%;max-width:920px;margin:0 auto;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));grid-template-areas:'forward side-right . avatar environment' '. zoom-toggle reverse jump .';gap:clamp(8px,1.8vw,14px);padding:clamp(10px,2vw,16px);border:1px solid rgba(156,255,0,.42);border-radius:24px;background:linear-gradient(180deg,rgba(6,10,5,.96),rgba(0,0,0,.88));box-shadow:0 18px 42px rgba(0,0,0,.45),0 0 28px rgba(156,255,0,.12);box-sizing:border-box;backdrop-filter:blur(14px)}
    .mobile-move-pad.mobile-move-pad-glb [data-mobile-area=forward]{grid-area:forward}.mobile-move-pad.mobile-move-pad-glb [data-mobile-area=side-right]{grid-area:side-right}.mobile-move-pad.mobile-move-pad-glb [data-mobile-area=avatar]{grid-area:avatar}.mobile-move-pad.mobile-move-pad-glb [data-mobile-area=environment]{grid-area:environment}
    .mobile-move-pad.mobile-move-pad-glb [data-mobile-area=zoom-toggle]{grid-area:zoom-toggle}.mobile-move-pad.mobile-move-pad-glb [data-mobile-area=reverse]{grid-area:reverse}.mobile-move-pad.mobile-move-pad-glb [data-mobile-area=jump]{grid-area:jump}
    .mobile-move-pad.mobile-move-pad-glb button{touch-action:none;user-select:none;min-width:0;min-height:clamp(56px,12vw,96px);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;border:0;border-radius:clamp(16px,3vw,28px);padding:clamp(7px,1.6vw,14px) clamp(4px,1.2vw,10px);font-weight:1000;text-align:center;letter-spacing:.02em;background:linear-gradient(180deg,#9cff00,#6dba00);color:#071007;box-shadow:0 8px 22px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.38)}
    .mobile-move-pad.mobile-move-pad-glb button b{display:block;font-size:clamp(1.05rem,5vw,1.55rem);line-height:1}.mobile-move-pad.mobile-move-pad-glb button span{display:block;margin-top:.18rem;font-size:clamp(.54rem,2.4vw,.78rem);line-height:.98;text-transform:uppercase;letter-spacing:.04em}
    .mobile-move-pad.mobile-move-pad-glb [data-mobile-area=jump],.mobile-move-pad.mobile-move-pad-glb [data-mobile-area=avatar],.mobile-move-pad.mobile-move-pad-glb [data-mobile-area=environment]{background:linear-gradient(180deg,#fff,#e7e7e7);color:#071007}.mobile-move-pad.mobile-move-pad-glb [data-mobile-zoom-toggle="in"]{background:linear-gradient(180deg,#fff,#e7e7e7);color:#071007}
    .mobile-move-pad.mobile-move-pad-glb button.is-active{transform:translateY(1px);filter:brightness(1.12)}
    .house-stage .house-vr-button{position:absolute!important;right:14px!important;bottom:14px!important;left:auto!important;z-index:8!important}
    @media(max-width:760px){.mobile-move-pad.mobile-move-pad-glb{grid-template-columns:repeat(5,minmax(0,1fr));grid-template-areas:'forward side-right . avatar environment' '. zoom-toggle reverse jump .'}.house-explorer-shell{width:100%;display:flex;flex-direction:column;gap:12px}.house-explorer{padding-left:10px!important;padding-right:10px!important;padding-bottom:max(12px,env(safe-area-inset-bottom))!important}.house-stage{min-height:52vh;height:min(58vh,540px);max-height:calc(100svh - 230px)}.house-stage #house-explorer-canvas{min-height:100%;height:100%}.house-hud{padding:12px;gap:10px}.house-hud h3{font-size:32px}.hud-pill-grid,.house-space-scale,.house-view-controls,.environment-upload-panel{display:none}.house-picker-panel{width:100%;padding:.55rem;gap:.45rem;margin:0}.house-picker-row{grid-template-columns:1fr auto}.house-picker-panel select{height:2.25rem;font-size:.82rem}.house-picker-panel button{padding:.55rem .65rem;font-size:.72rem}.house-picker-title small{display:none}.mobile-move-pad.mobile-move-pad-glb{position:sticky;bottom:max(8px,env(safe-area-inset-bottom));z-index:20;border-top:0;border-radius:0 0 22px 22px}.house-status{font-size:12px;left:10px;right:10px;bottom:10px}.environment-upload-grid{grid-template-columns:1fr}}
    @media(max-width:380px){.mobile-move-pad.mobile-move-pad-glb{gap:6px;padding:8px}.mobile-move-pad.mobile-move-pad-glb button span{font-size:.5rem;letter-spacing:.01em}}
  `;
  document.head.append(style);

  const setStatus = (message) => { if (status) status.textContent = message; };
  const environmentSelect = document.querySelector('#house-environment-select');
  const library = document.createElement('div'); library.className = 'house-picker-panel is-collapsed'; library.innerHTML = '<div class="house-picker-title"><strong>GLB Select</strong><small>Choose worlds and avatars</small></div><small>Loading GLB options…</small>';
  stage.before(library);
  const loadingMeter = document.createElement('div'); loadingMeter.className = 'house-loading-meter'; loadingMeter.hidden = true; const loadingFill = document.createElement('span'); loadingMeter.append(loadingFill); stage.append(loadingMeter);
  const avatarMenu = document.createElement('div'); avatarMenu.className = 'glb-avatar-menu'; avatarMenu.hidden = true; avatarMenu.setAttribute('role', 'dialog'); avatarMenu.setAttribute('aria-label', 'Avatar transform menu'); stage.append(avatarMenu);
  const walkButton = document.createElement('button'); walkButton.type = 'button'; walkButton.id = 'house-walk-mode'; walkButton.textContent = 'Enter house'; walkButton.setAttribute('aria-pressed', 'false'); resetButton?.after(walkButton);
  // The canvas is replaced by this GLB experience, so hide controls belonging to the
  // retired canvas implementation and expose one authoritative RAD-TOX control set.
  document.querySelector('.house-hud > .house-game-status')?.setAttribute('hidden', '');
  ['#toxic-bubble-toggle', '#radtox-run-toggle', '#radtox-sound-toggle', '#radtox-restart', '#radtox-difficulty'].forEach((selector) => document.querySelector(selector)?.closest('button, label')?.setAttribute('hidden', ''));
  document.querySelector('.radtox-settings')?.setAttribute('hidden', '');
  const radToxEnabledToggle = document.createElement('button'); radToxEnabledToggle.type = 'button'; radToxEnabledToggle.id = 'radtox-enabled-toggle'; radToxEnabledToggle.setAttribute('aria-pressed', 'true'); walkButton.after(radToxEnabledToggle);
  const radToxButton = document.createElement('button'); radToxButton.type = 'button'; radToxButton.id = 'radtox-activate'; radToxButton.textContent = 'Start RAD-TOX game'; radToxButton.setAttribute('aria-pressed', 'false'); radToxEnabledToggle.after(radToxButton);
  const radToxStatus = document.createElement('div'); radToxStatus.className = 'house-game-status radtox-game-status'; radToxStatus.setAttribute('aria-live', 'polite'); radToxStatus.innerHTML = '<span class="house-game-pill">RAD-TOX <b data-radtox-state>OFF</b></span><span class="house-game-hp">HP <span class="house-game-hp-track"><span data-radtox-hp-fill></span></span><b data-radtox-hp>100</b></span><span class="house-game-pill">Score <b data-radtox-score>0</b></span><span class="house-game-pill">Targets <b data-radtox-count>0</b></span><span class="house-game-pill">Hits <b data-radtox-hits>0</b></span>'; radToxButton.after(radToxStatus);
  const radToxSettings = document.createElement('details'); radToxSettings.className = 'radtox-settings radtox-game-settings'; radToxSettings.innerHTML = '<summary>RAD-TOX gameplay settings</summary><p>Set every slider, then start or restart a full 3D pop run.</p><div class="radtox-settings-grid"><label>Target count <input data-radtox-setting="targetCount" type="range" min="6" max="40" step="1" value="26"><output data-radtox-output="targetCount">26</output></label><label>Bubble speed <input data-radtox-setting="speed" type="range" min="0" max="2.5" step="0.1" value="1"><output data-radtox-output="speed">1.0x</output></label><label>Bubble health / hits <input data-radtox-setting="bubbleHealth" type="range" min="1" max="8" step="1" value="4"><output data-radtox-output="bubbleHealth">4</output></label><label>Contact damage <input data-radtox-setting="contactDamage" type="range" min="0" max="30" step="1" value="6"><output data-radtox-output="contactDamage">6</output></label><label>Player max health <input data-radtox-setting="maxHp" type="range" min="50" max="200" step="10" value="100"><output data-radtox-output="maxHp">100</output></label><label>Points per pop <input data-radtox-setting="points" type="range" min="1" max="10" step="1" value="1"><output data-radtox-output="points">1</output></label><label class="radtox-toggle-row">Sound <input data-radtox-setting="sound" type="checkbox" checked></label><label class="radtox-toggle-row">Contact damage <input data-radtox-setting="damageEnabled" type="checkbox" checked></label><button type="button" data-radtox-restart>Restart with settings</button></div>'; radToxStatus.after(radToxSettings);
  const displayToggle = document.createElement('button'); displayToggle.type = 'button'; displayToggle.id = 'house-display-toggle'; displayToggle.setAttribute('aria-pressed', 'true'); displayToggle.textContent = 'Display: Shown'; radToxSettings.after(displayToggle);
  const scaleControl = document.createElement('div'); scaleControl.className = 'house-space-scale'; scaleControl.innerHTML = '<strong>Space size <output>2.5x</output></strong><button type="button" data-space-scale="down" aria-label="Shrink space by 0.1x">−</button><input type="range" min="0.1" max="10" step="0.1" value="2.5" aria-label="House space size scale"><button type="button" data-space-scale="up" aria-label="Grow space by 0.1x">+</button>';
  const viewControls = document.createElement('div'); viewControls.className = 'house-view-controls'; viewControls.innerHTML = '<strong>View controls <output>Zoom 40%</output></strong><button type="button" data-zoom="in" aria-label="Zoom in">Zoom +</button><button type="button" data-zoom="out" aria-label="Zoom out">Zoom −</button>';
  library.before(scaleControl); scaleControl.after(viewControls);

  const isCoarsePointer = matchMedia('(pointer: coarse)').matches;
  const mobileQualityMode = isCoarsePointer || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x050807); scene.fog = new THREE.Fog(0x050807, 36, mobileQualityMode ? 95 : 180);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobileQualityMode, alpha: false, powerPreference: mobileQualityMode ? 'low-power' : 'high-performance' }); renderer.xr.enabled = !mobileQualityMode; let quality = configureRenderer(renderer, 'auto');
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.05, 700); const playerRig = new THREE.Group(); playerRig.name = 'MUZIKAZ_PLAYER_RIG'; playerRig.add(camera); scene.add(playerRig);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x15170d, 1.1); scene.add(hemi); const sun = new THREE.DirectionalLight(0xffffff, mobileQualityMode ? 1.25 : 1.8); sun.position.set(12, 18, 8); sun.castShadow = quality.shadows; sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize); sun.shadow.camera.near = .5; sun.shadow.camera.far = 120; sun.shadow.camera.left = -45; sun.shadow.camera.right = 45; sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45; scene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new THREE.Scene(), 0.04).texture;
  const clock = new THREE.Clock(); const registry = new EnvironmentRegistry(); const envLoader = new EnvironmentLoader({ scene, renderer, onProgress: (p) => { loadingFill.style.width = `${Math.max(4, Math.min(100, p))}%`; } });
  const avatarLoader = new GLTFLoader(); const avatarRaycaster = new THREE.Raycaster(); const avatarPointer = new THREE.Vector2(); const placedAvatars = new THREE.Group(); placedAvatars.name = 'MUZIKAZ_PLACED_AVATARS'; scene.add(placedAvatars);
  const landingFrame = new THREE.Group(); landingFrame.name = 'MUZIKAZ_LANDING_FLOOR_FRAME'; scene.add(landingFrame);
  const dropInPeople = new THREE.Group(); dropInPeople.name = 'MUZIKAZ_DROP_IN_PEOPLE'; scene.add(dropInPeople);
  const toxicBubbleGroup = new THREE.Group(); toxicBubbleGroup.name = 'MUZIKAZ_TOXIC_BUBBLES'; scene.add(toxicBubbleGroup);
  const toxicBubbleRaycaster = new THREE.Raycaster(); const toxicBubblePointer = new THREE.Vector2();
  const toxicBubbles = []; const toxicBursts = []; const bubbleGeometry = new THREE.SphereGeometry(1, mobileQualityMode ? 16 : 24, mobileQualityMode ? 12 : 18);
  const bubbleCoreGeometry = new THREE.SphereGeometry(.7, mobileQualityMode ? 12 : 18, mobileQualityMode ? 9 : 14);
  const RADTOX_SETTINGS_KEY = 'muzikaz-radtox-glb-settings';
  const RADTOX_ENABLED_KEY = 'muzikaz-radtox-glb-enabled';
  const readRadToxEnabled = () => { try { return localStorage.getItem(RADTOX_ENABLED_KEY) !== 'false'; } catch (_) { return true; } };
  const radTox = { enabled: readRadToxEnabled(), active: false, score: 0, hp: 100, maxHp: 100, hits: 0, audioContext: null, audioReady: false, spawnSeed: 0, hurtCooldownUntil: 0, completed: false, settings: { targetCount: mobileQualityMode ? 16 : 26, speed: 1, bubbleHealth: 4, contactDamage: 6, maxHp: 100, points: 1, sound: true, damageEnabled: true } };
  let activeAvatar = null;
  const player = { height: 1.65, radius: .34, speed: 3.2, jumpVelocity: 9.9, yaw: 0, pitch: 0, eyeHeight: 1.65, zoom: 68, velocity: new THREE.Vector3(), onGround: false, spawn: new THREE.Vector3(0, 1, 2) };
  let currentSpaceScale = 2.5; let scrollZoomEnabled = false; const mapSizeScale = mobileQualityMode ? 0.82 : 1; const mapHeightScale = mobileQualityMode ? 0.88 : 1;
  let viewActive = true; let lastFrameTime = 0; const targetFrameMs = mobileQualityMode || reducedMotion ? 1000 / 30 : 0;
  let playerCollider = new Capsule(new THREE.Vector3(0, player.radius, 2), new THREE.Vector3(0, player.height, 2), player.radius); let dragPointer = null; let avatarDrag = null; let turnReady = true; let activeEnvironment = null;
  let handEnabled = false; let handStream = null; let handsProcessor = null; let handSending = false;
  const keys = new Set(); const mobile = new Set(); const forward = new THREE.Vector3(); const right = new THREE.Vector3(); const move = new THREE.Vector3(); const teleportRay = new THREE.Raycaster();

  function zoomPercent() { return Math.round(((92 - player.zoom) / 60) * 100); }
  try { Object.assign(radTox.settings, JSON.parse(localStorage.getItem(RADTOX_SETTINGS_KEY) || '{}')); } catch (_) { /* Use safe game defaults when storage is unavailable. */ }
  function saveRadToxSettings() { localStorage.setItem(RADTOX_SETTINGS_KEY, JSON.stringify(radTox.settings)); }
  function syncRadToxSettings() { Object.entries(radTox.settings).forEach(([key, value]) => { const control = radToxSettings.querySelector(`[data-radtox-setting="${key}"]`); const output = radToxSettings.querySelector(`[data-radtox-output="${key}"]`); if (control) control.type === 'checkbox' ? control.checked = Boolean(value) : control.value = value; if (output) output.textContent = key === 'speed' ? `${Number(value).toFixed(1)}x` : String(value); }); }
  function setRadToxEnabled(enabled, { announce = true } = {}) { radTox.enabled = Boolean(enabled); try { localStorage.setItem(RADTOX_ENABLED_KEY, String(radTox.enabled)); } catch (_) { /* Keep the current-page setting when storage is unavailable. */ } if (!radTox.enabled) { radTox.active = false; clearToxicBubbles(); } radToxEnabledToggle.textContent = `RAD-TOX functions: ${radTox.enabled ? 'On' : 'Off'}`; radToxEnabledToggle.setAttribute('aria-pressed', String(radTox.enabled)); document.querySelectorAll('[data-radtox-enabled-control]').forEach((control) => { control.checked = radTox.enabled; }); radToxButton.hidden = !radTox.enabled; radToxSettings.hidden = !radTox.enabled; updateRadToxHud(); if (announce) setStatus(radTox.enabled ? 'RAD-TOX functions are on and ready to start.' : 'RAD-TOX functions are off. The populated 3D map remains available to explore.'); }
  function updateRadToxHud() { const remaining = toxicBubbles.filter((bubble) => !bubble.userData.popped).length; const hpPercent = Math.max(0, radTox.hp / radTox.maxHp * 100); radToxStatus.querySelector('[data-radtox-state]').textContent = !radTox.enabled ? 'DISABLED' : !radTox.active ? 'OFF' : !radTox.hp ? 'DOWN' : radTox.completed ? 'CLEARED' : 'LIVE'; radToxStatus.querySelector('[data-radtox-count]').textContent = String(remaining); radToxStatus.querySelector('[data-radtox-score]').textContent = String(radTox.score); radToxStatus.querySelector('[data-radtox-hp]').textContent = `${Math.ceil(radTox.hp)}/${radTox.maxHp}`; radToxStatus.querySelector('[data-radtox-hp-fill]').style.width = `${hpPercent}%`; radToxStatus.querySelector('[data-radtox-hits]').textContent = String(radTox.hits); radToxButton.textContent = radTox.active ? 'End RAD-TOX game' : 'Start RAD-TOX game'; radToxButton.setAttribute('aria-pressed', String(radTox.active)); }
  function unlockRadToxAudio() { if (!radTox.settings.sound) return; if (!radTox.audioContext) radTox.audioContext = new AudioContext(); if (radTox.audioContext.state === 'suspended') radTox.audioContext.resume(); radTox.audioReady = true; }
  function playPopSound() { if (!radTox.audioReady || !radTox.audioContext) return; const now = radTox.audioContext.currentTime; const oscillator = radTox.audioContext.createOscillator(); const gain = radTox.audioContext.createGain(); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(220, now); oscillator.frequency.exponentialRampToValueAtTime(720, now + .07); gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.13, now + .012); gain.gain.exponentialRampToValueAtTime(.0001, now + .18); oscillator.connect(gain).connect(radTox.audioContext.destination); oscillator.start(now); oscillator.stop(now + .19); }
  function clearToxicBubbles() { toxicBubbles.splice(0).forEach((bubble) => { toxicBubbleGroup.remove(bubble); bubble.traverse((child) => child.material?.dispose?.(); }); toxicBursts.splice(0).forEach((burst) => toxicBubbleGroup.remove(burst)); }
  function createToxicBubbles() { clearToxicBubbles(); const bounds = envLoader.bounds; if (!Number.isFinite(bounds.min.x)) return; const count = Math.round(radTox.settings.targetCount); const spanX = Math.max(8, bounds.max.x - bounds.min.x); const spanZ = Math.max(8, bounds.max.z - bounds.min.z); for (let index = 0; index < count; index += 1) { const shell = new THREE.Mesh(bubbleGeometry, new THREE.MeshPhysicalMaterial({ color: 0x84ff16, emissive: 0x2b8b04, emissiveIntensity: 1.35, transparent: true, opacity: .46, roughness: .18, metalness: .08, transmission: .12, side: THREE.DoubleSide })); const core = new THREE.Mesh(bubbleCoreGeometry, new THREE.MeshBasicMaterial({ color: 0xd6ff67, transparent: true, opacity: .34 })); const ring = new THREE.Mesh(new THREE.TorusGeometry(.76, .045, 8, 24), new THREE.MeshBasicMaterial({ color: 0x73ff32, transparent: true, opacity: .78 })); const bubble = new THREE.Group(); const radius = .34 + ((index * 17) % 24) / 100; bubble.add(shell, core, ring); bubble.position.set(bounds.min.x + ((index * 37 + radTox.spawnSeed * 13) % 100) / 100 * spanX, bounds.min.y + .9 + ((index * 19) % 100) / 100 * Math.min(4, Math.max(1.4, bounds.max.y - bounds.min.y - 1)), bounds.min.z + ((index * 61 + radTox.spawnSeed * 7) % 100) / 100 * spanZ); bubble.scale.setScalar(radius); bubble.userData = { toxicBubble: true, popped: false, health: radTox.settings.bubbleHealth, maxHealth: radTox.settings.bubbleHealth, phase: index * .73, anchorY: bubble.position.y, driftX: .16 + (index % 4) * .035, driftZ: .12 + (index % 5) * .025 }; toxicBubbles.push(bubble); toxicBubbleGroup.add(bubble); } updateRadToxHud(); }
  function popToxicBubble(bubble) { if (!radTox.active || !radTox.hp || !bubble || bubble.userData.popped) return false; radTox.hits += 1; bubble.userData.health -= 1; if (bubble.userData.health > 0) { bubble.children.forEach((child) => { if (child.material?.emissive) child.material.emissiveIntensity = 2.4; }); window.setTimeout(() => bubble.children.forEach((child) => { if (child.material?.emissive) child.material.emissiveIntensity = 1.35; }), 90); playPopSound(); updateRadToxHud(); return true; } bubble.userData.popped = true; radTox.score += Number(radTox.settings.points); playPopSound(); const burst = new THREE.Points(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 32 }, (_, index) => new THREE.Vector3(Math.sin(index * 2.4) * .32, Math.cos(index * 1.7) * .32, Math.cos(index * 3.1) * .32))), new THREE.PointsMaterial({ color: 0xc8ff4a, size: .1, transparent: true })); burst.position.copy(bubble.position); burst.userData.life = .62; toxicBubbleGroup.add(burst); toxicBursts.push(burst); toxicBubbleGroup.remove(bubble); updateRadToxHud(); if (!toxicBubbles.some((item) => !item.userData.popped)) { radTox.completed = true; setStatus(`Map cleared — ${radTox.score} points secured. Restart with settings to play again.`); } return true; }
  function activateRadTox({ unlockAudio = true } = {}) { if (!radTox.enabled) return; if (unlockAudio) unlockRadToxAudio(); radTox.active = true; radTox.score = 0; radTox.hits = 0; radTox.maxHp = Number(radTox.settings.maxHp); radTox.hp = radTox.maxHp; radTox.completed = false; radTox.spawnSeed += 1; createToxicBubbles(); setStatus('RAD-TOX is live: pop each fully 3D toxic bubble until its health reaches zero. Keep clear of targets to protect HP.'); }
  function popBubbleFromEvent(event) { if (!radTox.active) return false; const rect = canvas.getBoundingClientRect(); toxicBubblePointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; toxicBubblePointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; toxicBubbleRaycaster.setFromCamera(toxicBubblePointer, camera); const hit = toxicBubbleRaycaster.intersectObjects(toxicBubbleGroup.children, true).find((item) => item.object.parent); if (!hit) return false; let root = hit.object; while (root.parent && root.parent !== toxicBubbleGroup) root = root.parent; return popToxicBubble(root); }
  function updateToxicBubbles(delta, elapsed) { if (!radTox.active) return; const speed = Number(radTox.settings.speed); toxicBubbles.forEach((bubble) => { if (bubble.userData.popped) return; const { phase, anchorY, driftX, driftZ } = bubble.userData; bubble.position.y = anchorY + Math.sin(elapsed * 1.45 * speed + phase) * .24; bubble.position.x += Math.sin(elapsed + phase) * driftX * delta * speed; bubble.position.z += Math.cos(elapsed * .8 + phase) * driftZ * delta * speed; bubble.rotation.y += delta * .7 * speed; }); if (radTox.settings.damageEnabled && radTox.hp > 0 && performance.now() > radTox.hurtCooldownUntil) { const touching = toxicBubbles.some((bubble) => !bubble.userData.popped && bubble.position.distanceTo(playerRig.position) < .95); if (touching) { radTox.hp = Math.max(0, radTox.hp - Number(radTox.settings.contactDamage)); radTox.hurtCooldownUntil = performance.now() + 700; if (!radTox.hp) setStatus('RAD-TOX field down. Restart with settings to restore your health and refill the arena.'); updateRadToxHud(); } } for (let i = toxicBursts.length - 1; i >= 0; i -= 1) { const burst = toxicBursts[i]; burst.userData.life -= delta; burst.scale.addScalar(delta * 3); burst.material.opacity = Math.max(0, burst.userData.life / .62); if (burst.userData.life <= 0) { toxicBubbleGroup.remove(burst); burst.geometry.dispose(); burst.material.dispose(); toxicBursts.splice(i, 1); } } }
  function syncZoomControls() { viewControls.querySelector('output').textContent = `Zoom ${zoomPercent()}%`; }
  function applyZoom(deltaY) { player.zoom = THREE.MathUtils.clamp(player.zoom + Math.sign(deltaY) * 2, 32, 92); camera.fov = player.zoom; camera.updateProjectionMatrix(); syncZoomControls(); setStatus(`Zoom ${zoomPercent()}% · ${scrollZoomEnabled ? 'scroll wheel zooms' : 'scroll wheel passes through'} the GLB house view.`); }
  function applySpaceScale(scale, { keepPlayer = true } = {}) { const next = THREE.MathUtils.clamp(Math.round((Number(scale) || 1) * 10) / 10, 0.1, 10); if (!envLoader.world) return; const previous = currentSpaceScale || 1; const ratio = next / previous; const base = playerCollider.end.clone(); base.y -= player.height; const result = envLoader.setSpaceScale(next); if (!result) return; currentSpaceScale = result.scale; if (keepPlayer) { const nextBase = base.multiplyScalar(ratio); playerCollider.translate(nextBase.sub(playerRig.position)); playerRig.position.copy(nextBase.add(new THREE.Vector3(0, 0, 0))); } scaleControl.querySelector('input').value = currentSpaceScale.toFixed(1); scaleControl.querySelector('output').textContent = `${currentSpaceScale.toFixed(1)}x`; setStatus(`Space size set to ${currentSpaceScale.toFixed(1)}x. Use +/− for 0.1x steps, up to 10x.`); }
  function alignSpawnToCurrentFloor(spawn) { return envLoader.meshes.length ? alignPointAboveFloor(spawn.clone(), envLoader.meshes, envLoader.bounds, player.height, FLOOR_ENTRY_OFFSET) : spawn.clone(); }
  function updateLandingFrame(spawn) { const alignedSpawn = alignSpawnToCurrentFloor(spawn); landingFrame.clear(); const ring = new THREE.Mesh(new THREE.RingGeometry(.52, .72, 48), new THREE.MeshBasicMaterial({ color: 0x9cff00, side: THREE.DoubleSide, transparent: true, opacity: .88 })); ring.rotation.x = -Math.PI / 2; ring.position.set(alignedSpawn.x, alignedSpawn.y + .018, alignedSpawn.z); const grid = new THREE.GridHelper(1.55, 4, 0x9cff00, 0x477400); grid.position.set(alignedSpawn.x, alignedSpawn.y + .022, alignedSpawn.z); grid.material.transparent = true; grid.material.opacity = .62; landingFrame.add(ring, grid); }
  function resetPlayer(spawn = player.spawn, rotationY = player.yaw) { const alignedSpawn = alignSpawnToCurrentFloor(spawn); player.spawn.copy(alignedSpawn); player.velocity.set(0,0,0); player.yaw = rotationY || 0; player.pitch = 0; player.eyeHeight = player.height; player.onGround = false; playerCollider = new Capsule(new THREE.Vector3(alignedSpawn.x, alignedSpawn.y + player.radius, alignedSpawn.z), new THREE.Vector3(alignedSpawn.x, alignedSpawn.y + player.height, alignedSpawn.z), player.radius); playerRig.position.copy(alignedSpawn); playerRig.rotation.set(0, player.yaw, 0); camera.position.set(0, player.eyeHeight, 0); camera.rotation.set(0,0,0); updateLandingFrame(alignedSpawn); }
  async function loadById(id, { fallback = true } = {}) { const env = registry.find(id) || registry.all()[0]; if (!env) return false; env.spaceScale = currentSpaceScale; activeEnvironment = env; loadingMeter.hidden = false; setStatus(`Loading ${env.name} as a complete GLB world…`); try { const result = await envLoader.load(env); if (!result) throw new Error(`The ${env.name} map did not return a playable world.`); scaleControl.querySelector('input').value = currentSpaceScale.toFixed(1); scaleControl.querySelector('output').textContent = `${currentSpaceScale.toFixed(1)}x`; loadingMeter.hidden = true; resetPlayer(result.spawn.position, result.spawn.rotationY || 0); if (radTox.active) createToxicBubbles(); walkButton.textContent = 'House open'; walkButton.setAttribute('aria-pressed', 'true'); setStatus(`Ready: ${env.name}. The house is open — drag, touch, or use movement controls to explore.`); const url = new URL(location.href); url.searchParams.set('environment', env.id); url.searchParams.set('house', env.id); history.replaceState({}, '', url); renderLibrary(); logEnvironment('Loaded world', { id: env.id, source: env.source }); return true; } catch (error) { console.error('[MUZIKAZ Environment]', error); loadingMeter.hidden = true; const fallbackEnv = fallback && env.id !== 'muzikaz-main' ? registry.find('muzikaz-main') : null; if (fallbackEnv) { setStatus(`${env.name} could not load; opening the main floor fallback…`); return loadById(fallbackEnv.id, { fallback: false }); } setStatus(error.message || `Unable to load ${env.name}.`); return false; } }
  let cachedAvatars = [];
  function syncEnvironmentSelect(worlds) { if (!environmentSelect) return; const selectedId = activeEnvironment?.id || environmentSelect.value || ''; environmentSelect.replaceChildren(...worlds.map((env) => new Option(env.name || env.id || 'House environment', env.id, false, env.id === selectedId))); environmentSelect.disabled = !worlds.length; }
  function renderPicker() { const worlds = registry.all(); syncEnvironmentSelect(worlds); const envOptions = worlds.map((env) => { const size = env.fileSize ? `${(env.fileSize / 1048576).toFixed(1)} MB` : 'repo GLB'; return `<option value="${env.id}" ${activeEnvironment?.id === env.id ? 'selected' : ''}>${env.name} · ${size}</option>`; }).join(''); const avatarOptions = cachedAvatars.map((avatar) => `<option value="${avatar.id}">${avatar.name} · ${avatar.owner}</option>`).join(''); library.innerHTML = `<div class="house-picker-title"><strong>GLB Select</strong><small>${worlds.length} worlds · ${cachedAvatars.length} avatars</small></div><div class="house-picker-row"><label class="house-picker-label">World<select data-world-select>${envOptions || '<option>No worlds found</option>'}</select></label><button type="button" data-load-world>Open</button></div><div class="house-picker-row"><label class="house-picker-label">Avatar<select data-avatar-select>${avatarOptions || '<option>No active GLB avatars</option>'}</select></label><button type="button" data-add-selected-avatar>Add</button></div>`; library.querySelector('[data-load-world]')?.addEventListener('click', () => { const id = library.querySelector('[data-world-select]')?.value; if (id) loadById(id); }); library.querySelector('[data-world-select]')?.addEventListener('change', (event) => loadById(event.target.value)); library.querySelector('[data-add-selected-avatar]')?.addEventListener('click', () => { const avatar = cachedAvatars.find(a => a.id === library.querySelector('[data-avatar-select]')?.value); if (avatar) { activeAvatar = avatar; addAvatarToScene(avatar).catch(error => setStatus(error.message || `Unable to add ${avatar.name}.`)); } }); }
  function renderLibrary() { renderPicker(); }
  async function refreshLibrary() { try { await registry.refresh(); renderPicker(); } catch (error) { setStatus(error.message); library.innerHTML = `<div class="house-picker-title"><strong>GLB Select</strong></div><small>${error.message}</small>`; } }

  function normalizeAvatarRecord(raw = {}) { const modelUrl = raw.modelUrl || raw.model_url || raw.fileUrl || raw.file_url || raw.assetUrl || raw.asset_url || raw.avatarUrl || raw.publicUrl || ''; const id = raw.id || raw.avatarId || raw.modelId || btoa(unescape(encodeURIComponent(modelUrl || raw.name || Date.now()))).replace(/=+$/,''); return { id, name: raw.name || raw.avatarName || raw.title || 'GLB Avatar', owner: raw.owner || raw.creatorName || raw.creator || raw.username || 'MUZIKAZ', modelUrl: new URL(modelUrl, window.location.origin).href, format: String(raw.format || raw.fileType || raw.type || modelUrl.split('?')[0].split('.').pop() || '').toLowerCase(), visibility: raw.visibility || 'public', status: raw.status || 'active', scale: Number(raw.scale) || 1, rotation: raw.rotation }; }
  function isActiveGlbAvatar(avatar) { return avatar.modelUrl && ['glb','gltf'].includes(avatar.format) && avatar.visibility !== 'private' && !['archived','rejected','disabled','inactive'].includes(String(avatar.status).toLowerCase()); }
  async function fetchActiveAvatarModels() { const sources = [fetch(new URL('public/models/glb-models.json', window.location.origin), { cache:'no-store' }).then(r => r.ok ? r.json() : null).then(j => Array.isArray(j) ? j : (j?.models || [])), fetch('/api/models', { cache:'no-store' }).then(r => r.ok ? r.json() : null).then(j => Array.isArray(j) ? j : (j?.data || j?.models || [])).catch(() => [])]; const lists = await Promise.all(sources.map(p => p.catch(() => []))); const byId = new Map(); lists.flat().map(normalizeAvatarRecord).filter(isActiveGlbAvatar).forEach(a => byId.set(a.id, a)); return [...byId.values()]; }
  function setAvatarPointerFromEvent(event) { const rect = canvas.getBoundingClientRect(); avatarPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; avatarPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; avatarRaycaster.setFromCamera(avatarPointer, camera); return avatarRaycaster.intersectObjects(envLoader.meshes, true)[0]?.point || playerRig.position.clone().add(forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).multiplyScalar(2)); }
  function floorPointAt(point) { const bounds = envLoader.bounds; const rayOriginY = Number.isFinite(bounds.max.y) ? bounds.max.y + player.height + 8 : point.y + player.height + 8; avatarRaycaster.set(new THREE.Vector3(point.x, rayOriginY, point.z), new THREE.Vector3(0, -1, 0)); return avatarRaycaster.intersectObjects(envLoader.meshes, true).find((item) => item.object.visible !== false)?.point || point; }
  function floorPointFromPointer(event) { return setAvatarPointerFromEvent(event).clone(); }
  function liftObjectAboveFloor(root, floorPoint = root.position) { root.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(root); const floorY = floorPoint.y + FLOOR_ENTRY_OFFSET; root.position.y += floorY - box.min.y; root.userData.floorLiftOffset = root.position.y - floorPoint.y; }
  function closeAvatarMenu() { avatarMenu.hidden = true; avatarMenu.replaceChildren(); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
  function avatarDisplayName(root) { const id = root?.userData?.avatar?.id || root?.name?.replace(/^Avatar_/, '') || 'avatar'; return root?.userData?.avatar?.name || id; }
  function openAvatarMenu(root) { if (!root) return; avatarMenu.innerHTML = `<strong>${escapeHtml(avatarDisplayName(root))}</strong><small>Double-clicked avatar menu. Use these controls to size, rotate, raise, lower, or remove this GLB avatar.</small><div class="glb-avatar-menu-grid"><button type="button" data-avatar-action="scale" data-amount="0.1">Bigger</button><button type="button" data-avatar-action="scale" data-amount="-0.1">Smaller</button><button type="button" data-avatar-action="rotate" data-amount="-0.2">Rotate Left</button><button type="button" data-avatar-action="rotate" data-amount="0.2">Rotate Right</button><button type="button" data-avatar-action="height" data-amount="0.12">Raise</button><button type="button" data-avatar-action="height" data-amount="-0.12">Lower</button></div><button type="button" class="secondary" data-avatar-action="remove">Remove avatar</button><button type="button" class="secondary" data-avatar-action="close">Close menu</button>`; avatarMenu.hidden = false; avatarMenu.onclick = (event) => { const button = event.target.closest('button[data-avatar-action]'); if (!button) return; const amount = Number(button.dataset.amount) || 0; if (button.dataset.avatarAction === 'scale') root.scale.multiplyScalar(THREE.MathUtils.clamp(1 + amount, .1, 3)); if (button.dataset.avatarAction === 'rotate') root.rotation.y += amount; if (button.dataset.avatarAction === 'height') { root.position.y += amount; root.userData.floorLiftOffset = (root.userData.floorLiftOffset || FLOOR_ENTRY_OFFSET) + amount; } if (button.dataset.avatarAction === 'remove') { placedAvatars.remove(root); closeAvatarMenu(); } if (button.dataset.avatarAction === 'close') closeAvatarMenu(); }; setStatus(`${avatarDisplayName(root)} menu open. Adjust it or close the menu to keep walking.`); }
  function findPlacedAvatarFromEvent(event) { setAvatarPointerFromEvent(event); const hit = avatarRaycaster.intersectObjects(placedAvatars.children, true)[0]; if (!hit) return null; let root = hit.object; while (root?.parent && root.parent !== placedAvatars) root = root.parent; return root?.parent === placedAvatars ? { root, point: hit.point } : null; }
  async function addAvatarToScene(avatar, position = floorPointAt(playerRig.position.clone().add(forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).multiplyScalar(2)))) { setStatus(`Adding ${avatar.name} to the GLB house…`); const floorPoint = floorPointAt(position.clone()); const gltf = await avatarLoader.loadAsync(avatar.modelUrl); const root = gltf.scene; root.name = `Avatar_${avatar.id}`; root.position.copy(floorPoint); root.scale.setScalar(avatar.scale); root.rotation.y = Number(avatar.rotation?.y ?? avatar.rotation ?? 0); root.userData.avatar = avatar; const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()); const maxAxis = Math.max(size.x, size.y, size.z) || 1; if (maxAxis > 2.2) root.scale.multiplyScalar(2.2 / maxAxis); liftObjectAboveFloor(root, floorPoint); root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); placedAvatars.add(root); setStatus(`${avatar.name} is in the house. Drag it on screen to reposition it above the floor.`); return root; }
  function renderAvatarLibrary(avatars) { cachedAvatars = avatars; renderPicker(); }
  async function refreshAvatarLibrary() { const avatars = await fetchActiveAvatarModels(); window.MuzikazActiveHouseAvatars = avatars; renderAvatarLibrary(avatars); return avatars; }
  function addDropInPerson() {
    if (!envLoader.world) { setStatus('The map is still loading. The person drop-in will be ready as soon as the GLB opens.'); return; }
    const point = floorPointAt(playerRig.position.clone().add(forward.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).multiplyScalar(2)));
    const person = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: 0x9cff00, emissive: 0x1c4800, emissiveIntensity: .5, roughness: .52 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(.18, 16, 12), material); head.position.y = 1.48;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .68, 6, 12), material); body.position.y = .87;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .05, 20), new THREE.MeshBasicMaterial({ color: 0xd7ff68 })); base.position.y = .025;
    person.add(head, body, base); person.position.copy(point); person.userData.dropInPerson = true; dropInPeople.add(person);
    setStatus('Person drop-in placed on the GLB floor. Drag or look around to continue exploring.');
  }

  function getInput() { const input = new THREE.Vector2(); if (keys.has('w')||keys.has('arrowup')||mobile.has('forward')) input.y += 1; if (keys.has('s')||keys.has('arrowdown')||mobile.has('back')) input.y -= 1; if (keys.has('a')||keys.has('arrowleft')||mobile.has('left')) input.x -= 1; if (keys.has('d')||keys.has('arrowright')||mobile.has('right')) input.x += 1; const session = renderer.xr.getSession(); if (session) for (const source of session.inputSources) { const axes = source.gamepad?.axes || []; const ax = Number(axes[2] ?? axes[0] ?? 0), ay = Number(axes[3] ?? axes[1] ?? 0); if (source.handedness === 'left') { input.x += Math.abs(ax) > .15 ? ax : 0; input.y += Math.abs(ay) > .15 ? -ay : 0; } if (source.handedness === 'right') { if (Math.abs(ax) > .72 && turnReady) { player.yaw -= Math.sign(ax) * Math.PI / 6; turnReady = false; } else if (Math.abs(ax) < .25) turnReady = true; } } return input.lengthSq() > 1 ? input.normalize() : input; }
  function loadHandScript(url) { return new Promise((resolve, reject) => { const existing = document.querySelector(`script[src="${url}"]`); if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); if (window.Hands) resolve(); return; } const script = document.createElement('script'); script.src = url; script.async = true; script.onload = resolve; script.onerror = () => reject(new Error('MediaPipe could not be downloaded.')); document.head.append(script); }); }
  function stopHandControl() { handEnabled = false; handsProcessor?.close?.(); handsProcessor = null; handStream?.getTracks().forEach((track) => track.stop()); handStream = null; if (handPreview) handPreview.srcObject = null; handPreviewPanel?.setAttribute('hidden', ''); if (handButton) { handButton.textContent = 'Enable hand control'; handButton.setAttribute('aria-pressed', 'false'); } if (handStatus) handStatus.textContent = 'Camera preview inactive. MediaPipe Hands loads only when enabled.'; }
  async function startHandControl() { if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is not available in this browser.'); handPreviewPanel?.removeAttribute('hidden'); if (handStatus) handStatus.textContent = 'Requesting camera access for MediaPipe Hands…'; handStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 180 } }, audio: false }); if (handPreview) { handPreview.srcObject = handStream; await handPreview.play(); }
    await loadHandScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js'); if (!window.Hands || !handPreview) throw new Error('MediaPipe Hands is unavailable.'); handsProcessor = new window.Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` }); handsProcessor.setOptions({ maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: .6, minTrackingConfidence: .55 }); handsProcessor.onResults((results) => { const tip = results.multiHandLandmarks?.[0]?.[8]; if (!handEnabled || !tip) return; player.yaw -= (tip.x - .5) * .055; player.pitch = THREE.MathUtils.clamp(player.pitch - (tip.y - .5) * .04, -1.25, 1.15); });
    const sendFrame = async () => { if (!handEnabled || !handPreview || !handsProcessor) return; if (!handSending && handPreview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) { handSending = true; await handsProcessor.send({ image: handPreview }).catch(() => {}); handSending = false; } requestAnimationFrame(sendFrame); }; requestAnimationFrame(sendFrame); handEnabled = true; if (handButton) { handButton.textContent = 'Disable hand control'; handButton.setAttribute('aria-pressed', 'true'); } if (handStatus) handStatus.textContent = 'MediaPipe Hands active: move your index finger to steer the 3D camera.'; }
  function updatePlayer(delta) { const input = getInput(); forward.set(-Math.sin(player.yaw),0,-Math.cos(player.yaw)); right.set(Math.cos(player.yaw),0,-Math.sin(player.yaw)); move.copy(forward).multiplyScalar(input.y).addScaledVector(right,input.x); if (move.lengthSq()) move.normalize().multiplyScalar(player.speed * delta); playerCollider.translate(move); if (!player.onGround) player.velocity.y -= 18 * delta; playerCollider.translate(new THREE.Vector3(0, player.velocity.y * delta, 0)); const collision = envLoader.octree.capsuleIntersect(playerCollider); player.onGround = false; if (collision) { player.onGround = collision.normal.y > 0; if (player.onGround) player.velocity.y = 0; playerCollider.translate(collision.normal.multiplyScalar(collision.depth)); } const base = playerCollider.end.clone(); base.y -= player.height; playerRig.position.copy(base); playerRig.rotation.y = player.yaw; if (!renderer.xr.isPresenting) { camera.position.set(0, player.eyeHeight, 0); camera.rotation.order = 'YXZ'; camera.rotation.set(player.pitch,0,0); } if (playerRig.position.y < (envLoader.bounds.min.y || -30) - 20) resetPlayer(); }

  window.addEventListener('keydown', (e) => { const key = e.key.toLowerCase(); keys.add(key); if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) e.preventDefault(); if (key === ' ' && player.onGround) { player.velocity.y = player.jumpVelocity; player.onGround = false; e.preventDefault(); } if (key === 'q') player.eyeHeight = Math.max(1.1, player.eyeHeight - .08); if (key === 'e') player.eyeHeight = Math.min(2.25, player.eyeHeight + .08); if (key === 'r') resetPlayer(); }); window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase())); window.addEventListener('blur', () => keys.clear());
  const pointerLockSupported = Boolean(canvas.requestPointerLock);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    walkButton.textContent = locked ? 'Exit mouse look' : (envLoader.world ? 'Enter house' : 'Loading house…');
    walkButton.setAttribute('aria-pressed', String(locked || !pointerLockSupported));
  });
  document.addEventListener('mousemove', (e) => { if (document.pointerLockElement !== canvas) return; player.yaw -= e.movementX * .0025; player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * .002, -1.25, 1.15); });
  scaleControl.querySelector('input').addEventListener('input', (e) => applySpaceScale(e.target.value)); scaleControl.querySelectorAll('[data-space-scale]').forEach((button) => button.addEventListener('click', () => applySpaceScale(currentSpaceScale + (button.dataset.spaceScale === 'up' ? .1 : -.1)))); viewControls.querySelectorAll('[data-zoom]').forEach((button) => button.addEventListener('click', () => applyZoom(button.dataset.zoom === 'in' ? -1 : 1))); syncZoomControls();
  environmentSelect?.addEventListener('change', (event) => { if (event.target.value) loadById(event.target.value); });
  canvas.addEventListener('dragover', (e) => { if (!activeAvatar && !e.dataTransfer?.types?.includes('application/x-muzikaz-avatar')) return; e.preventDefault(); stage.classList.add('is-avatar-drop-target'); }); canvas.addEventListener('dragleave', () => stage.classList.remove('is-avatar-drop-target')); canvas.addEventListener('drop', async (e) => { e.preventDefault(); stage.classList.remove('is-avatar-drop-target'); const avatars = window.MuzikazActiveHouseAvatars || []; const avatar = avatars.find(a => a.id === e.dataTransfer.getData('application/x-muzikaz-avatar')) || activeAvatar; if (avatar) addAvatarToScene(avatar, setAvatarPointerFromEvent(e)).catch(error => setStatus(error.message || `Unable to add ${avatar.name}.`)); });
  canvas.addEventListener('pointerdown', (e) => { unlockRadToxAudio(); if (popBubbleFromEvent(e)) { e.preventDefault(); return; } if (document.pointerLockElement === canvas) return; e.preventDefault(); const avatarHit = findPlacedAvatarFromEvent(e); if (avatarHit) { avatarDrag = { id:e.pointerId, root:avatarHit.root }; dragPointer = null; setStatus(`Dragging ${avatarDisplayName(avatarHit.root)}. Release to place it just above the floor. Double-click to open its menu.`); } else dragPointer = { id:e.pointerId, x:e.clientX, y:e.clientY }; canvas.setPointerCapture?.(e.pointerId); }); canvas.addEventListener('pointermove', (e) => { if (document.pointerLockElement === canvas) return; if (avatarDrag?.id === e.pointerId) { e.preventDefault(); const floorPoint = floorPointFromPointer(e); avatarDrag.root.position.x = floorPoint.x; avatarDrag.root.position.z = floorPoint.z; avatarDrag.root.position.y = floorPoint.y + (avatarDrag.root.userData.floorLiftOffset ?? FLOOR_ENTRY_OFFSET); return; } if (!dragPointer || dragPointer.id !== e.pointerId) return; e.preventDefault(); player.yaw -= (e.clientX - dragPointer.x) * .006; player.pitch = THREE.MathUtils.clamp(player.pitch - (e.clientY - dragPointer.y) * .005, -1.25, 1.15); dragPointer.x = e.clientX; dragPointer.y = e.clientY; }); const release = (e) => { if (avatarDrag?.id === e.pointerId) { liftObjectAboveFloor(avatarDrag.root, floorPointFromPointer(e)); avatarDrag = null; } if (dragPointer?.id === e.pointerId) dragPointer = null; }; canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('dblclick', (e) => { if (document.pointerLockElement === canvas) return; e.preventDefault(); const avatarHit = findPlacedAvatarFromEvent(e); if (avatarHit) { avatarDrag = null; dragPointer = null; openAvatarMenu(avatarHit.root); } }); canvas.addEventListener('wheel', (e) => { if (!scrollZoomEnabled) return; e.preventDefault(); applyZoom(e.deltaY); }, { passive:false }); document.addEventListener('wheel', (e) => { if (document.pointerLockElement !== canvas || !scrollZoomEnabled) return; e.preventDefault(); applyZoom(e.deltaY); }, { passive:false });
  resetButton?.addEventListener('click', () => resetPlayer());
  handButton?.addEventListener('click', async () => { if (handEnabled) { stopHandControl(); return; } try { await startHandControl(); } catch (error) { stopHandControl(); setStatus(error.message || 'Unable to start hand control. Mouse, keyboard, and touch controls remain available.'); } });
  // Rebind action buttons that originally belonged to the retired canvas.
  // Cloning discards legacy listeners and prevents a second renderer from
  // receiving the same action.
  const placePersonButton = document.querySelector('#house-place-person');
  if (placePersonButton) { const button = placePersonButton.cloneNode(true); placePersonButton.replaceWith(button); button.addEventListener('click', addDropInPerson); }
  const addAvatarButton = document.querySelector('#add-avatar');
  if (addAvatarButton) { const button = addAvatarButton.cloneNode(true); addAvatarButton.replaceWith(button); button.addEventListener('click', () => { library.classList.remove('is-collapsed'); const select = library.querySelector('[data-avatar-select]'); select?.focus(); setStatus(cachedAvatars.length ? 'Choose a GLB avatar in the selector, then press Add.' : 'Loading GLB avatars. Choose one in the selector when it appears.'); }); }
  function setExplorerDisplay(visible, { announce = true } = {}) {
    hud.classList.toggle('house-display-hidden', !visible);
    library.classList.toggle('is-collapsed', !visible);
    scaleControl.hidden = !visible; viewControls.hidden = !visible;
    displayToggle.textContent = `Display: ${visible ? 'Shown' : 'Hidden'}`;
    displayToggle.setAttribute('aria-pressed', String(visible));
    // Keep the toggle reachable while the rest of the display is hidden.
    displayToggle.hidden = false;
    if (announce) setStatus(visible ? 'Explorer display shown.' : 'Explorer display hidden. Use the Display button to show controls again.');
  }
  displayToggle.addEventListener('click', () => setExplorerDisplay(displayToggle.getAttribute('aria-pressed') !== 'true'));
  radToxSettings.querySelectorAll('[data-radtox-setting]').forEach((control) => control.addEventListener('input', () => { const key = control.dataset.radtoxSetting; radTox.settings[key] = control.type === 'checkbox' ? control.checked : Number(control.value); syncRadToxSettings(); saveRadToxSettings(); }));
  radToxSettings.querySelector('[data-radtox-restart]')?.addEventListener('click', () => startRadToxRun().catch((error) => setStatus(error.message)));
  radToxEnabledToggle.addEventListener('click', async () => { setRadToxEnabled(!radTox.enabled); if (radTox.enabled) await startRadToxRun().catch((error) => setStatus(error.message)); });
  document.querySelectorAll('[data-radtox-enabled-control]').forEach((control) => control.addEventListener('change', () => setRadToxEnabled(control.checked)));
  radToxButton.addEventListener('click', async () => { if (!radTox.enabled) return; if (radTox.active) { radTox.active = false; clearToxicBubbles(); updateRadToxHud(); setStatus('RAD-TOX gameplay is off. Start RAD-TOX game to restore the full 3D arena.'); return; } await startRadToxRun().catch((error) => setStatus(error.message)); });
  syncRadToxSettings();
  setRadToxEnabled(radTox.enabled, { announce: false });
  updateRadToxHud();
  document.querySelectorAll('[data-mobile-move]').forEach((oldButton) => { const button = oldButton.cloneNode(true); oldButton.replaceWith(button); const direction = button.dataset.mobileMove; const mobileLabel = { forward: '▲ Forward', back: '▼ Reverse', left: '◀ Side left', right: 'Side right ▶', jump: '⤴ Jump' }[direction]; if (mobileLabel) button.setAttribute('aria-label', mobileLabel); const begin = (e) => { e.preventDefault(); if (direction === 'jump') { if (player.onGround) { player.velocity.y = player.jumpVelocity; player.onGround = false; } button.classList.add('is-active'); return; } mobile.add(direction); button.classList.add('is-active'); }; const end = (e) => { e.preventDefault(); if (direction !== 'jump') mobile.delete(direction); button.classList.remove('is-active'); }; button.addEventListener('pointerdown', begin); button.addEventListener('pointerup', end); button.addEventListener('pointercancel', end); button.addEventListener('pointerleave', end); });
  document.querySelectorAll('[data-mobile-zoom]').forEach((oldButton) => { const button = oldButton.cloneNode(true); oldButton.replaceWith(button); button.addEventListener('click', (e) => { e.preventDefault(); applyZoom(button.dataset.mobileZoom === 'in' ? -1 : 1); }); });
  document.querySelectorAll('[data-mobile-zoom-toggle]').forEach((oldButton) => { const button = oldButton.cloneNode(true); oldButton.replaceWith(button); let zoomHold = 0; const setDirection = (direction) => { button.dataset.mobileZoomToggle = direction; button.setAttribute('aria-pressed', String(direction === 'in')); button.querySelector('b').textContent = direction === 'in' ? '+' : '−'; button.querySelector('span').textContent = direction === 'in' ? 'Zoom in' : 'Zoom out'; button.setAttribute('aria-label', direction === 'in' ? 'Zoom in' : 'Zoom out'); }; const step = () => applyZoom(button.dataset.mobileZoomToggle === 'in' ? -1 : 1); const stop = () => { clearInterval(zoomHold); zoomHold = 0; button.classList.remove('is-active'); }; button.addEventListener('pointerdown', (e) => { e.preventDefault(); step(); button.classList.add('is-active'); zoomHold = window.setInterval(step, 120); }); button.addEventListener('pointerup', stop); button.addEventListener('pointercancel', stop); button.addEventListener('pointerleave', stop); button.addEventListener('dblclick', (e) => { e.preventDefault(); setDirection(button.dataset.mobileZoomToggle === 'in' ? 'out' : 'in'); setStatus(`${button.getAttribute('aria-label')} selected. Hold the zoom button to keep zooming.`); }); setDirection(button.dataset.mobileZoomToggle || 'out'); });
  document.querySelectorAll('[data-mobile-action]').forEach((oldButton) => {
    const button = oldButton.cloneNode(true);
    oldButton.replaceWith(button);
    button.addEventListener('click', (e) => {
      e.preventDefault();
      if (button.dataset.mobileAction === 'reset') resetPlayer();
      if (button.dataset.mobileAction === 'environment') { library.classList.toggle('is-collapsed'); setStatus(library.classList.contains('is-collapsed') ? 'Environment list hidden.' : 'Environment list open. Choose an environment file to load.'); }
      if (button.dataset.mobileAction === 'avatar') { library.classList.remove('is-collapsed'); const select = library.querySelector('[data-avatar-select]'); select?.focus(); setStatus('Avatar selector open. Choose an avatar, then press Add.'); }
    });
  });
  async function setupVRControls() {
    if (!renderer.xr.enabled || mobileQualityMode) return;
    const [{ VRButton }, { XRControllerModelFactory }] = await Promise.all([
      import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/webxr/VRButton.js/+esm'),
      import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/webxr/XRControllerModelFactory.js/+esm')
    ]);
    const controllerFactory = new XRControllerModelFactory();
    for (let i=0;i<2;i+=1) { const controller = renderer.xr.getController(i); controller.addEventListener('selectend', () => { teleportRay.set(playerRig.position.clone().add(new THREE.Vector3(0, player.height, 0)), new THREE.Vector3(0, -1, -1).normalize().applyQuaternion(controller.quaternion)); const hit = teleportRay.intersectObjects(envLoader.meshes, true)[0]; if (hit) resetPlayer(hit.point.add(new THREE.Vector3(0, .04, 0)), player.yaw); }); const grip = renderer.xr.getControllerGrip(i); grip.add(controllerFactory.createControllerModel(grip)); playerRig.add(controller, grip); }
    const vrButton = VRButton.createButton(renderer, { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor', 'hand-tracking'] }); vrButton.classList.add('house-vr-button'); stage.append(vrButton);
    renderer.xr.addEventListener('sessionstart', () => { quality = configureRenderer(renderer, 'auto'); setStatus('WebXR session started.'); }); renderer.xr.addEventListener('sessionend', () => { quality = configureRenderer(renderer, 'auto'); setStatus(activeEnvironment ? `Ready: ${activeEnvironment.name}.` : 'WebXR session ended.'); });
  }
  setupVRControls().catch((error) => console.warn('[MUZIKAZ VR]', error));
  const visibilityObserver = new IntersectionObserver(([entry]) => { viewActive = Boolean(entry?.isIntersecting); }, { threshold: 0.05 }); visibilityObserver.observe(stage); document.addEventListener('visibilitychange', () => { viewActive = !document.hidden; });
  function resize() { const rect = stage.getBoundingClientRect(); const viewportHeight = window.visualViewport?.height || window.innerHeight || 720; const width = Math.max(320, Math.floor(Math.min(rect.width || stage.clientWidth || 1280, document.documentElement.clientWidth || rect.width || 1280))); const desktopLimit = Math.max(420, viewportHeight - 180); const mobileLimit = Math.max(360, viewportHeight - 190); const limit = matchMedia('(max-width: 760px)').matches ? mobileLimit : desktopLimit; const tunedWidth = Math.max(320, Math.floor(width * mapSizeScale)); const baseHeight = Math.max(360, rect.height || width * .56) * mapHeightScale; const height = Math.max(320, Math.floor(Math.min(baseHeight, limit))); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileQualityMode ? 1 : quality.pixelRatio)); renderer.setSize(tunedWidth, height, false); camera.aspect = tunedWidth / height; camera.updateProjectionMatrix(); } new ResizeObserver(resize).observe(stage); addEventListener('orientationchange', resize); window.visualViewport?.addEventListener('resize', resize); resize();
  renderer.setAnimationLoop((time = 0) => {
    if (!viewActive && !renderer.xr.isPresenting) { clock.getDelta(); return; }
    if (targetFrameMs && !renderer.xr.isPresenting && time - lastFrameTime < targetFrameMs) return;
    lastFrameTime = time;
    const delta = Math.min(.05, clock.getDelta());
    updatePlayer(delta);
    updateToxicBubbles(delta, time / 1000);
    if (!mobileQualityMode || renderer.xr.isPresenting) envLoader.mixers.forEach((m) => m.update(delta));
    renderer.render(scene, camera);
  });
  // The map must not wait for optional avatar API calls. Populate worlds from
  // the repository environment manifest first, then enrich the picker with
  // avatars after the playable GLB has begun loading.
  await refreshLibrary();
  refreshAvatarLibrary().catch((error) => { library.insertAdjacentHTML('beforeend', `<small>${error.message || 'Unable to load active avatars.'}</small>`); });
  const params = new URLSearchParams(location.search);
  const requestedEnvironment = registry.find(params.get('house'))?.id || registry.find(params.get('environment'))?.id;
  // Keep the restored startup path: open the known-good main-floor GLB first.
  // The full house and upper floor remain selectable after the explorer is ready.
  const startEnvironment = requestedEnvironment || registry.find('muzikaz-main')?.id || registry.all()[0]?.id;
  let mapOpeningPromise = null;
  function loadStartEnvironment() {
    if (envLoader.world) return Promise.resolve(true);
    if (!startEnvironment) return Promise.resolve(false);
    if (!mapOpeningPromise) {
      setStatus('Loading the complete MUZIKAZ game space…');
      mapOpeningPromise = loadById(startEnvironment).finally(() => { mapOpeningPromise = null; });
    }
    return mapOpeningPromise;
  }
  async function openHouseMap({ requestWalk = false, startRadTox = false } = {}) {
    canvas.focus({ preventScroll: true });
    if (!envLoader.world && startEnvironment) {
      const loaded = await loadStartEnvironment();
      if (!loaded || !envLoader.world) throw new Error('The MUZIKAZ map could not be loaded. Choose another environment and try again.');
    }
    if (!envLoader.world) throw new Error('No MUZIKAZ map is available yet. Refresh the page or select an environment and try again.');
    walkButton.textContent = 'Enter house';
    walkButton.setAttribute('aria-pressed', 'true');
    if (startRadTox && radTox.enabled && !radTox.active) activateRadTox({ unlockAudio: false });
    if (requestWalk && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
  }
  async function startRadToxRun() {
    if (!radTox.enabled) throw new Error('Turn RAD-TOX functions on before starting a run.');
    await openHouseMap();
    activateRadTox();
    setStatus('RAD-TOX is live. Click glowing bubbles, move with WASD or the on-screen controls, and press Escape to close the map.');
  }
  async function launchHouseGame({ startRadTox = true } = {}) {
    if (houseModal && !houseModal.open) houseModal.showModal();
    // A dialog has no usable canvas size while closed, so resize only after it opens.
    await new Promise((resolve) => requestAnimationFrame(() => { resize(); resolve(); }));
    if (startRadTox) await startRadToxRun();
    else await openHouseMap();
  }
  function closeHouseGame() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    houseModal?.close();
  }
  document.querySelectorAll('[data-house-launch]').forEach((button) => button.addEventListener('click', () => {
    launchHouseGame({ startRadTox: button.dataset.houseLaunch !== 'explore' && radTox.enabled }).catch((error) => setStatus(error.message || 'Unable to open the MUZIKAZ map.'));
  }));
  document.querySelectorAll('[data-house-close]').forEach((button) => button.addEventListener('click', closeHouseGame));
  document.querySelector('[data-action="house"]')?.addEventListener('click', () => {
    launchHouseGame().catch((error) => setStatus(error.message || 'Unable to open the MUZIKAZ map.'));
  });
  houseModal?.addEventListener('close', () => { if (document.pointerLockElement === canvas) document.exitPointerLock?.(); });
  window.MuzikazHouseGame = Object.freeze({ openMap: () => launchHouseGame({ startRadTox: false }), startRadTox: () => launchHouseGame({ startRadTox: true }), setRadToxEnabled });
  window.addEventListener('muzikaz:house-map:open', (event) => {
    const startRadTox = event.detail?.startRadTox !== false;
    launchHouseGame({ startRadTox }).catch((error) => setStatus(error.message || 'Unable to open the MUZIKAZ map.'));
  });
  walkButton.addEventListener('click', () => {
    if (document.pointerLockElement === canvas) { document.exitPointerLock?.(); return; }
    openHouseMap({ requestWalk: true }).catch((error) => setStatus(error.message || 'Unable to start the MUZIKAZ house game.'));
  });
  canvas.addEventListener('click', () => {
    openHouseMap({ requestWalk: true }).catch((error) => setStatus(error.message || 'Unable to start walking.'));
  });
  document.querySelector('a[href="#house-explorer-canvas"]')?.addEventListener('click', () => {
    openHouseMap({ requestWalk: true }).catch((error) => setStatus(error.message || 'Unable to open the MUZIKAZ map.'));
  });
  canvas.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    openHouseMap({ requestWalk: true }).catch((error) => setStatus(error.message || 'Unable to enter the MUZIKAZ map.'));
  });
  if (startEnvironment) {
    setStatus('Auto-loading the MUZIKAZ main floor from the restored 3D House Explorer startup path for desktop and mobile controls…');
    await openHouseMap();
  } else {
    setStatus('No house maps are available. Refresh and try again.');
  }
}
