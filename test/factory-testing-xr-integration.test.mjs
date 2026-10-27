import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
function fixture(withLogistics=false){
 const calls=[],camera=new THREE.PerspectiveCamera(),rig=new THREE.Group(),xr=new THREE.EventDispatcher();rig.add(camera);camera.position.set(.12,1.72,-.08);camera.rotation.set(.1,.22,.04);
 xr.enabled=true;xr.isPresenting=true;
 const native={active:true,shown:false,hit:false,pointerDown(ray,controller){calls.push(['native-trigger',controller]);return this.hit;},pointerUp(controller){calls.push(['native-release',controller]);},visible(){return this.shown;},isActive(){return this.active;},setVisible(next,station){this.shown=next;calls.push(['native-visible',next,station]);return next;},cycleDashboard(){calls.push(['native-cycle']);},menuItems:()=>[{label:'Native launch dashboard',run(){}}]};
 const logistics={shown:false,enabled:true,station:null,close(){this.shown=false;calls.push(['freight-desktop-close']);},open(id){this.shown=true;calls.push(['freight-desktop-open',id]);},near(){return this.station;},available(){return this.enabled;},visible(){return this.shown;},menuItems(){return [{label:'Certify owned model',keepOpen:true,run:()=>calls.push(['certify-model'])}];},setPage(page){calls.push(['freight-page',page]);}};
 const context=vm.createContext({THREE,renderer:{xr},activeEnvironment:{id:'muzikaz-factory-proving-grounds'},pendingFactoryTestingXRFrames:0,webXrAvailable:true,scene:new THREE.Scene(),camera,playerRig:rig,player:{yaw:.4,pitch:.2,eyeHeight:1.65},stage:{},gameplayStarted:true,keys:new Set(),topDownAimTarget:null,
  mountFactoryLogisticsUI:(_stage,_command,options)=>{context.logisticsOptions=options;return logistics;},factoryLogisticsXRMenu:false,factoryLogisticsXRTrigger:()=>false,openFactoryLogisticsControls:()=>false,factoryLogisticsXRMenuItems:()=>[],factoryLogisticsUI:{visible:()=>false,near:()=>null,available:()=>false,close(){}},factoryTestingVR:native,factoryTestingUI:{close:()=>calls.push(['desktop-close']),open:id=>calls.push(['desktop-open',id]),near:()=>({id:'proving-vr-setup'})},ownedPlacement:{active:false},toxicBubbleSystem:{tool:'laser',toolSelected:false,handleXRInteraction:()=>calls.push(['weapon'])},
  xrGameControls:null,mountXRGameControls:options=>{context.options=options;return {closeMenu:()=>calls.push(['menu-close']),controllers:[],endSession(){},openMenu:()=>calls.push(['menu-open'])};},
  panelXR:{snapshot:()=>({active:false})},funhouseSeatView:{reset(){}},funhouseVR:{isActive:()=>false,setVisible(){},release(){},pointerUp(){},trigger:()=>false},funhouseUI:{close(){}},funhouseRide:()=>null,currentFunhouseEquipment:()=>null,fireCarriedWater(){},
  fishingUI:{playing:()=>false,releasePrimary(){}},fishingVRScreen:{pointerUp(){},setVisible(){}},shippingUI:{visible:()=>false},canOpenXRFishing:()=>false,isFishingTool:()=>false,isBasketballEnvironment:()=>false,handleRangeShot:()=>null,
  closeFishingCompanions(){},lockMenuInput:()=>calls.push(['release-input']),releaseXRFishingInputs:()=>calls.push(['fishing-release']),xrFishingPrimaryHolds:new Set(),syncXRFishingReel(){},xrFishingSeatKey:null,xrFishingDesktopLook:null,syncCameraToggle(){},updateGameCamera(){},updateFunhouseWaterGun(){},setStatus(){},serverCommand:async()=>({}),cycleXRTool:()=>calls.push(['cycle-weapon']),teleportFromController:()=>calls.push(['teleport'])
 });
 vm.runInContext(section('  let pendingFactoryTestingXRFrames=','  document.querySelector(\'#factory-testing-toggle\')'),context);
 if(withLogistics)vm.runInContext(section('  let factoryLogisticsXRMenu=',"  document.querySelector('#factory-logistics-toggle')"),context);
 vm.runInContext(section('  async function setupVRControls()','  async function openXRWorldMode('),context);
 return {context,calls,native,camera,xr,logistics};
}

test('the explorer routes dashboard hits and misses before tools and opens nearby consoles without moving the tracked view',async()=>{
 const {context,calls,native,camera}=fixture();await context.setupVRControls();const controller={id:'right'},ray={origin:new THREE.Vector3(),direction:new THREE.Vector3(0,0,-1)};
 const position=camera.position.clone(),quaternion=camera.quaternion.clone();
 native.hit=true;context.toxicBubbleSystem.toolSelected=true;assert.equal(context.options.onTrigger('right',ray,controller),true);assert.ok(!calls.some(call=>call[0]==='weapon'));
 native.hit=false;native.shown=true;assert.equal(context.options.onTrigger('right',ray,controller),true);assert.ok(!calls.some(call=>call[0]==='weapon'),'a missed dashboard press cannot fire through the panel');
 native.shown=false;context.toxicBubbleSystem.toolSelected=false;context.options.onTrigger('right',ray,controller);assert.ok(calls.some(call=>call[0]==='native-visible'&&call[2]==='proving-vr-setup'));assert.ok(!calls.some(call=>call[0]==='desktop-open'));
 assert.ok(camera.position.equals(position));assert.ok(camera.quaternion.equals(quaternion));
 native.shown=false;native.active=false;context.factoryTestingUI.near=()=>null;context.options.onTrigger('right',ray,controller);assert.ok(calls.some(call=>call[0]==='weapon'),'ordinary worlds retain the existing tool path');
});

test('headset session, trigger release, menus and grips use native dashboards while desktop controls remain available',async()=>{
 const {context,calls,native,xr}=fixture();await context.setupVRControls();
 context.options.onEnter();assert.ok(calls.some(call=>call[0]==='desktop-close'));assert.equal(context.options.menuOnEnter(),false);
 xr.dispatchEvent({type:'sessionstart'});assert.equal(native.shown,false,'auto-open waits for the tracked XR render pose');context.presentFactoryTestingXRDashboard();assert.equal(native.shown,false);context.presentFactoryTestingXRDashboard();assert.ok(native.shown);assert.ok(context.options.menuItems().some(item=>item.label==='Native launch dashboard'));
 context.options.onTriggerEnd('right',{},'controller');assert.ok(calls.some(call=>call[0]==='native-release'&&call[1]==='controller'));
 context.options.onInputRelease('xr-session-hidden');assert.ok(calls.some(call=>call[0]==='native-release'&&call[1]===undefined));
 native.shown=false;context.options.onGrip('left',{},{});assert.ok(native.shown);assert.ok(calls.some(call=>call[0]==='native-cycle'));assert.ok(!calls.some(call=>call[0]==='cycle-weapon'));
 context.options.onGrip('right',{},{});assert.equal(native.shown,false);
 xr.isPresenting=false;context.openFactoryTestingControls('desktop-station');assert.ok(calls.some(call=>call[0]==='desktop-open'&&call[1]==='desktop-station'));
});


test('freight uses native menu callbacks before tools, preserves testing dashboards, and migrates its desktop modal into XR',async()=>{
 const {context,calls,native,camera,xr,logistics}=fixture(true);await context.setupVRControls();
 const pose=camera.position.clone(),orientation=camera.quaternion.clone(),ray={origin:new THREE.Vector3(),direction:new THREE.Vector3(0,0,-1)};
 logistics.station={id:'factory-export',name:'Factory export'};
 assert.equal(context.options.onTrigger('right',ray,{}),true);
 assert.ok(calls.some(call=>call[0]==='menu-open'));assert.ok(!calls.some(call=>call[0]==='freight-desktop-open'||call[0]==='weapon'));
 const certify=context.options.menuItems().find(item=>item.label==='Certify owned model');assert.ok(certify);certify.run();assert.ok(calls.some(call=>call[0]==='certify-model'),'the rendered native item executes its real callback');
 const dashboard=context.options.menuItems().find(item=>item.label==='Launch and testing dashboards');dashboard.run();assert.equal(native.visible(),true);
 native.hit=true;assert.equal(context.options.onTrigger('right',ray,{}),true);assert.equal(calls.at(-1)[0],'native-trigger','the native testing panel retains ray ownership');
 native.shown=false;logistics.shown=true;context.options.onEnter();assert.equal(logistics.shown,false);assert.equal(context.options.menuOnEnter(),true);
 xr.dispatchEvent({type:'sessionstart'});context.presentFactoryTestingXRDashboard();context.presentFactoryTestingXRDashboard();assert.equal(native.visible(),false,'a pending automatic test dashboard cannot cover the freight menu');
 assert.ok(context.options.menuItems().some(item=>item.label==='Certify owned model'));
 assert.ok(camera.position.equals(new THREE.Vector3()),'the existing session-start local camera reset remains intact');
 // Opening and switching native surfaces never writes the tracked view itself.
 camera.position.copy(pose);camera.quaternion.copy(orientation);context.openFactoryLogisticsControls('factory-export');assert.ok(camera.position.equals(pose));assert.ok(camera.quaternion.equals(orientation));
 context.options.onResume();assert.equal(vm.runInContext('factoryLogisticsXRMenu',context),false);
 xr.isPresenting=false;context.openFactoryLogisticsControls('desktop-export');assert.ok(calls.some(call=>call[0]==='freight-desktop-open'&&call[1]==='desktop-export'));
});
