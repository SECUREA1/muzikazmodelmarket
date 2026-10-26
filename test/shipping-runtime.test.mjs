import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {shippingHelmFloorPose,shippingHeadsetMenu} from '../public/js/shipping-runtime.js';
import {shippingVesselType} from '../public/js/shipping-vessel-specs.js';
import {isShippingEnvironment} from '../public/js/shipping-config.js';
import {shippingPredictedControls} from '../public/js/shipping-prediction.js';
import {boatAssistedInput} from '../public/js/boat-assist.js';
import {shippingWorld} from '../shipping-world.mjs';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');

test('shipping bridge floor follows every cargo vessel without counting measured eye height twice',()=>{
 for(const modelId of ['shipping-feeder','shipping-container','shipping-tanker'])for(const yaw of [0,Math.PI/2,-2.1]){
  const boat={modelId,position:{x:600,y:.2,z:-320},rotation:{y:yaw}},seat=shippingVesselType(boat).seat,before=structuredClone(boat),pose=shippingHelmFloorPose(boat,seat);
  assert.ok(Math.abs(pose.x-(600+seat[0]*Math.cos(yaw)+seat[2]*Math.sin(yaw)))<1e-9);
  assert.ok(Math.abs(pose.z-(-320-seat[0]*Math.sin(yaw)+seat[2]*Math.cos(yaw)))<1e-9);
  assert.ok(Math.abs(pose.y+1.65-(.2+seat[1]))<1e-9);assert.deepEqual(boat,before);
 }
 assert.ok(Object.values(shippingHelmFloorPose({position:{x:Infinity,y:NaN,z:NaN},rotation:{y:NaN}},[NaN,NaN,NaN])).every(Number.isFinite));
});

test('VR shipping positions the floor under the bridge and preserves the tracked head pose',()=>{
 const camera=new THREE.PerspectiveCamera(),rig=new THREE.Group();rig.add(camera);camera.position.set(.14,1.72,-.08);camera.rotation.set(.08,.3,.02,'YXZ');rig.rotation.y=.6;
 const position=camera.position.clone(),quaternion=camera.quaternion.clone(),rigYaw=rig.rotation.y,boat={id:'feeder',modelId:'shipping-feeder',position:{x:-1030,y:0,z:330},rotation:{y:Math.PI/2}};
 const context=vm.createContext({renderer:{xr:{isPresenting:true}},activeEnvironment:{id:'hormuz-shipping'},shippingVesselType,isShippingEnvironment,shippingHelmFloorPose,playerRig:rig});
 const start=source.indexOf('  function presentXRShippingSeat('),end=source.indexOf('  const xrFishingPrimaryHolds=',start);vm.runInContext(source.slice(start,end),context);
 assert.equal(context.presentXRShippingSeat(boat,null),true);const expected=shippingHelmFloorPose(boat,shippingVesselType(boat).seat);
 assert.deepEqual(rig.position.toArray(),[expected.x,expected.y,expected.z]);assert.equal(rig.rotation.y,rigYaw);assert.ok(camera.position.equals(position));assert.ok(camera.quaternion.equals(quaternion));
 context.renderer.xr.isPresenting=false;assert.equal(context.presentXRShippingSeat(boat,null),false);context.renderer.xr.isPresenting=true;context.activeEnvironment={id:'neon-harbor'};assert.equal(context.presentXRShippingSeat(boat,null),false);
});

test('immersive cargo menus expose only available quests and use real shipping operations',()=>{
 const calls=[],handlers={action:(...args)=>calls.push(args),status:message=>calls.push(message),helm:()=>calls.push('helm'),endSession:()=>calls.push('exit')};
 assert.deepEqual(shippingHeadsetMenu({enabled:false},handlers),[]);
 const offers=[{id:'near',name:'Nearby cargo',rewardMzk:20},{id:'far',name:'Remote cargo',rewardMzk:60}],items=shippingHeadsetMenu({enabled:true,phase:'ready',boardingId:'feeder',contracts:offers,availableContracts:['near']},handlers);
 assert.ok(items.some(item=>item.label==='Accept · Nearby cargo'));assert.ok(!items.some(item=>item.label.includes('Remote cargo')));assert.ok(!items.some(item=>/chart|open menu/i.test(item.label)));
 items.find(item=>item.label==='Board available cargo ship').run();items.find(item=>item.label==='Accept · Nearby cargo').run();assert.deepEqual(calls,[['board',{entityId:'feeder'}],['accept',{contractId:'near'}]]);
});

test('native shipping chart routes to the exact chosen port and exchanges earned dock stock',()=>{
 const calls=[],state={enabled:true,phase:'delivered',aboard:true,canTrade:true,ports:[{id:'qeshm',name:'Qeshm'},{id:'fujairah',name:'Fujairah'}],supplies:{'shipping-tools-stock':1}},handlers={navigate:id=>calls.push(['navigate',id]),action:(...args)=>calls.push(args)},items=shippingHeadsetMenu(state,handlers);
 items.find(item=>item.label==='Sail to · Fujairah').run();items.find(item=>item.label==='Exchange stock · Unlock professional fishing rod').run();
 assert.deepEqual(calls,[['navigate','fujairah'],['trade',{tradeId:'tools-rod'}]]);
 assert.ok(!shippingHeadsetMenu({...state,canTrade:false},handlers).some(item=>item.label.startsWith('Exchange stock')));
 assert.ok(!shippingHeadsetMenu({...state,aboard:false},handlers).some(item=>item.label.startsWith('Sail to')));
});

test('compact shipping bridge controls retain manual helm and safe exit without duplicating cargo handling',()=>{
 const calls=[],handlers={manual:()=>calls.push('manual'),anchor:()=>calls.push('anchor'),exitVehicle:()=>calls.push('exit')},state={enabled:true,aboard:true,phase:'sailing',speed:.2,anchored:true},items=shippingHeadsetMenu(state,handlers);
 items.find(item=>item.label==='Take manual helm').run();items.find(item=>item.label==='Raise anchor').run();items.find(item=>item.label==='Leave stopped cargo ship').run();assert.deepEqual(calls,['manual','anchor','exit']);
 assert.ok(!shippingHeadsetMenu({...state,speed:3},handlers).some(item=>item.label==='Leave stopped cargo ship'));
 for(const phase of ['loading','secured','unloading'])assert.ok(!shippingHeadsetMenu({...state,phase},handlers).some(item=>/manual helm|anchor/.test(item.label)));
});

test('an active automated passage is a native headset status and cannot silently restart its route',()=>{
 const calls=[],state={enabled:true,phase:'sailing',job:{phase:'sailing'},primaryLabel:'Passage in progress',primaryEnabled:false,next:{operation:'navigate',enabled:false}},items=shippingHeadsetMenu(state,{status:label=>calls.push(label),action:()=>assert.fail('Disabled primary restarted the ship route')});
 const primary=items.find(item=>item.label==='Passage in progress');assert.equal(primary.keepOpen,true);primary.run();assert.deepEqual(calls,['Passage in progress']);
});

test('VR loading, passage, docking and unloading retain server authority and phase choices',()=>{
 for(const phase of ['loading','secured','sailing','unloading']){
  const calls=[],job={phase,units:4,loaded:[{side:'port',mass:2}],quality:96,waypoints:[{name:'Musandam channel'}],checkpointIndex:0},state={enabled:true,phase,job,next:{operation:phase==='sailing'?'navigate':'load',fields:{side:'starboard'}},primaryLabel:'Next cargo action'},items=shippingHeadsetMenu(state,{action:(...args)=>calls.push(args)});
  if(phase==='loading'){items.find(item=>item.label==='Load starboard side').run();assert.deepEqual(calls,[['load',{side:'starboard'}]]);assert.ok(items.some(item=>item.label==='Secure balanced cargo'));}
  if(phase==='secured')assert.ok(items.some(item=>item.label==='Depart on the marked route'));
  if(phase==='sailing'){items.find(item=>item.label==='Dock at assigned berth').run();assert.deepEqual(calls,[['dock']]);assert.ok(items.some(item=>item.label==='Next waypoint · Musandam channel'));}
  if(phase==='unloading'){items.find(item=>item.label==='Unload one cargo unit').run();assert.deepEqual(calls,[['unload']]);}
 }
});

test('shipping VR primary opens a visible native menu when no cargo action is active',()=>{
 const calls=[];let state={next:{operation:'chart'}};
 const context=vm.createContext({shippingUI:{menuOpen:()=>false,snapshot:()=>state,trigger:()=>calls.push('action')},xrGameControls:{openMenu:()=>calls.push('xr-menu')}}),start=source.indexOf('  function shippingXRTrigger()');
 vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);assert.equal(context.shippingXRTrigger(),true);assert.deepEqual(calls,['xr-menu']);state={next:{operation:'load'}};context.shippingXRTrigger();assert.deepEqual(calls,['xr-menu','action']);
});

test('native shipping menus neutralize held helm inputs without cancelling the automatic route',()=>{
 const context=vm.createContext({gameplayControlsReady:()=>true,isWatercraft:()=>true,serverActors:{},serverVehicleId:'boat',renderer:{xr:{isPresenting:true}},activeEnvironment:{id:'hormuz-shipping'},xrGameControls:{menuOpen:true},player:{yaw:.8}}),start=source.indexOf('  function serverInput()');
 vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);const input=context.serverInput();
 assert.equal(input.forward,0);assert.equal(input.side,0);assert.equal(input.rudder,0);assert.equal(input.firing,false);assert.equal(input.jump,false);assert.equal(input.throttle,undefined);assert.equal(input.anchor,undefined);
});

test('handling heartbeats cannot cancel a new automatic departure while local prediction keeps the dock lock',()=>{
 for(const phase of ['loading','secured','unloading']){
  const context=vm.createContext({gameplayControlsReady:()=>true,isWatercraft:()=>true,serverActors:{},serverVehicleId:'boat',renderer:{xr:{isPresenting:false}},activeEnvironment:{id:'hormuz-shipping'},serverViewSnapshot:{players:{self:{shipping:{job:{phase}}}}},authoritativeClient:{selfId:'self'},player:{yaw:.8}}),start=source.indexOf('  function serverInput()');
  vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);const delayedInput=context.serverInput();assert.equal(delayedInput.forward,0);assert.equal(delayedInput.side,0);assert.equal(delayedInput.throttle,undefined);assert.equal(delayedInput.anchor,undefined);assert.equal(delayedInput.firing,false);
  const preview=shippingPredictedControls(delayedInput,phase);assert.equal(preview.anchor,true);assert.equal(preview.throttle,0);assert.equal(delayedInput.anchor,undefined,'preview must not mutate the outgoing network packet');
  const boat={id:'boat',modelId:'shipping-feeder',active:true,position:{x:-1030,y:0,z:330},rotation:{y:Math.PI/2},boating:{speed:0,assist:'launch',assistOrigin:{x:-1030,z:330},anchor:false}},environment=shippingWorld(),controls=boatAssistedInput(boat,delayedInput,environment,100000,{boat});
  assert.equal(boat.boating.assist,'launch','a handling packet arriving after Depart must not cancel new helm assistance');assert.equal(controls.anchor,false);assert.ok(controls.throttle>0);
 }
 const sailing={forward:1,side:.2};assert.equal(shippingPredictedControls(sailing,'sailing'),sailing);
});

test('new cargo ship entry tilts toward the deck once and preserves later deliberate camera look',()=>{
 const boat={modelId:'shipping-feeder'},player={yaw:0,pitch:0},context=vm.createContext({lastHarborViewId:null,self:{vehicleId:'boat'},snapshot:{actors:{boat}},preharborView:null,gameCameraMode:'broadcast',setGameCameraMode(){},yaw:Math.PI/2,player,shippingVesselType,localVehicleView:{actor:{id:'boat'}},lastHarborHeading:Math.PI/2}),start=source.indexOf('if(lastHarborViewId!==self.vehicleId)'),end=source.indexOf('lastHarborViewId=self.vehicleId',start);
 vm.runInContext(source.slice(start,end),context);assert.equal(player.pitch,-.17);player.pitch=.35;context.lastHarborViewId='boat';vm.runInContext(source.slice(start,end),context);assert.equal(player.pitch,.35);
});

test('shipping default pointer actions cannot ghost fire while the cargo action bar is active',()=>{
 const system={tool:'laser',toolSelected:false};
 for(const name of ['handlePointerInteraction','handleXRInteraction','fireFlame','fireExtraWeapon','swingBat','fireTaser','fireToxin','throwDynamite','useUtility','sprayAt'])system[name]=()=>assert.fail('A cargo action must not fire a weapon.');
 const context=vm.createContext({toxicBubbleSystem:system,fishingUI:{active:()=>false,visible:()=>false},activeEnvironment:{id:'hormuz-shipping'}}),start=source.indexOf("  for(const name of ['handlePointerInteraction'");
 vm.runInContext(source.slice(start,source.indexOf("  for(const [method,lastOnly]",start)),context);
 for(const method of Object.keys(system))if(typeof system[method]==='function')assert.equal(system[method](),false);
});
