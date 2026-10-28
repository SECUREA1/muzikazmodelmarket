import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('builder provides illustrated rideable quad and Corsair aircraft assets', async t => {
  const [builder, quad, corsair] = await Promise.all([
    read('../environment-builder.js'),
    read('../public/images/builder-pack/dune-quad.svg'), read('../public/images/builder-pack/corsair-aircraft.svg')
  ]);
  assert.match(builder, /from '\.\/public\/js\/native-builder-items\.js'/);
  assert.match(builder, /gameplayModels=GAMEPLAY_BUILDER_ITEMS/);
  for (const [id, mode, animation] of [['dune-quad','drive','vehicleWheel'], ['corsair-aircraft','fly','vehiclePropeller']]) {
    const item=nativeBuilderItem(id),model=createBuilderModel(id),animated=[];
    assert.equal(item.behavior,'vehicle');assert.equal(item.action,mode);
    assert.equal(item.image,`public/images/builder-pack/${id}.svg`);
    assert.equal(model.userData.modelId,id);assert.equal(model.userData.vehicle.mode,mode);
    assert.equal(model.userData.vehicle.seat.length,3);assert.ok(model.userData.vehicle.seat.every(Number.isFinite));
    model.traverse(part=>{if(part.userData[animation])animated.push(part);});
    assert.ok(animated.length>0,`${id} has its working animated parts`);
    t.after(()=>{const resources=new Set();model.traverse(part=>{if(part.geometry)resources.add(part.geometry);for(const material of [part.material].flat().filter(Boolean))resources.add(material);});for(const resource of resources)resource.dispose();});
  }
  assert.match(quad, /NO BODY/);
  assert.match(corsair, /BLACKWING CORSAIR/);
});

test('game connects the standard vehicle controller to keyboard, rendering and avatar visibility', async () => {
  const game = await read('../public/js/house-explorer-glb.js');
  assert.match(game, /new BuilderVehicleController/);
  assert.match(game, /key === 'f'/);
  assert.match(game, /if\(!serverHostedRoom&&!menuOpen&&!vehicleController\.update\(/);
  assert.match(game, /vehicleController\.update\(frameDelta\)/);
  assert.match(game, /setPlayerAvatarVisible\(false\)/);
  assert.match(game, /setPlayerAvatarVisible\(true\)/);
});

test('vehicles are categorized separately and expose a touch enter button', async () => {
  const [catalog, game, page] = await Promise.all([
    read('../public/models/backpack-assets.json'), read('../public/js/house-explorer-glb.js'), read('../model-explorer.html')
  ]);
  const assets=JSON.parse(catalog).assets;
  for (const id of ['builder-corsair-aircraft','builder-dune-quad']) assert.equal(assets.find(asset=>asset.id===id)?.type,'vehicles');
  assert.match(game, /builder-nearby-action/);
  assert.match(game, /ENTER VEHICLE/);
  assert.match(game, /EXIT VEHICLE/);
  assert.match(game, /data-vehicle-active/);
  assert.match(game, /Tap or click to drive/);
  assert.match(game, /Sticks drive and steer/);
  assert.match(page, /house-environment-scroll-list/);
});

test('nearby item actions are stable and rate-limited for touch devices', async () => {
  const [game, actionButton] = await Promise.all([read('../public/js/house-explorer-glb.js'), read('../public/js/game-action-button.js')]);
  assert.match(game, /function resolveNearbyAction\((?:key=null)?\)/);
  assert.match(game, /function renderNearbyAction\(next\)/);
  assert.match(game, /now-nearbyActionCheckedAt<100/);
  assert.match(game, /bindGameActionButton\(builderActionButton,activateNearbyAction\)/);
  assert.match(actionButton, /button\.addEventListener\('pointerup',up\)/);
  assert.match(actionButton, /event\.pointerType!=='touch'/);
  assert.match(game, /touch-action:manipulation/);
  assert.doesNotMatch(game, /builderActionButton\.querySelector\('strong'\)\.textContent/);
  assert.doesNotMatch(game, /builderActionButton\.querySelector\('small'\)\.textContent/);
});

test('interaction failures stay isolated from the WebGL render loop', async () => {
  const game = await read('../public/js/house-explorer-glb.js');
  assert.match(game, /function safelyInteract\(context, action\)/);
  assert.match(game, /function safelyCapturePointer\(element, pointerId\)/);
  assert.match(game, /reportInteractionError\('Nearby interaction',error\)/);
  assert.match(game, /safelyInteract\('Vehicle interaction',\(\)=>vehicleController\.toggle\(\)\)/);
  assert.match(game, /safelyInteract\('World interaction'/);
  assert.doesNotMatch(game, /canvas\.setPointerCapture\?\.\(e\.pointerId\)/);
  assert.doesNotMatch(game, /stick\.setPointerCapture\?\.\(pointerId\)/);
});


test('nearby activation blocks unready/covered controls, rechecks the target, and enforces its cooldown', async () => {
  const game=await read('../public/js/house-explorer-glb.js');
  const start=game.indexOf('  function activateNearbyAction(event){');
  const end=game.indexOf("  window.addEventListener('keydown'",start);
  assert.ok(start>=0&&end>start,'exercise the real nearby-action implementation');
  let ready=false,overlay=false,target={kind:'vehicle'},toggles=0,refreshes=0;
  const timers=[];
  const context=vm.createContext({
    gameplayControlsReady:()=>ready,gameplayOverlayOpen:()=>overlay,nearbyActionLocked:false,
    nearbyAction:{kind:'vehicle'},resolveNearbyAction:()=>target,
    renderNearbyAction:next=>{context.nearbyAction=next;},serverHostedRoom:false,
    safelyInteract:(_label,action)=>action(),vehicleController:{toggle:()=>{toggles++;}},
    refreshNearbyAction:()=>{refreshes++;},performance:{now:()=>100},
    window:{setTimeout:(callback,delay)=>timers.push({callback,delay})}
  });
  vm.runInContext(game.slice(start,end),context);
  context.activateNearbyAction();assert.equal(toggles,0,'controls remain disabled before the game starts');
  ready=true;overlay=true;context.activateNearbyAction();assert.equal(toggles,0,'a blocking overlay owns input');
  overlay=false;context.activateNearbyAction();context.activateNearbyAction();
  assert.equal(toggles,1,'duplicate touch/click activation cannot toggle twice');
  assert.equal(refreshes,1);assert.equal(timers.length,1);assert.equal(timers[0].delay,180);
  timers.shift().callback();
  target={kind:'none'};context.activateNearbyAction();assert.equal(toggles,1,'a stale visible hint cannot activate a departed target');
  assert.equal(timers.length,0,'no target does not consume the cooldown');
  target={kind:'vehicle'};context.activateNearbyAction();assert.equal(toggles,2,'a fresh action succeeds once the cooldown expires');
});
