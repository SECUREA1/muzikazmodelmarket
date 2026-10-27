import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {TOOL_IDS,isFishingTool,FISHING_TOOL_IDS} from '../public/js/game-tool-rules.js';
import {isAircraft} from '../public/js/aircraft-flight.js';
import {UTILITY_TOOLS} from '../public/js/game-utilities.js';
import {supportsWorldTools} from '../public/js/rad-tox-rules.js';
const source=readFileSync('public/js/house-explorer-glb.js','utf8');
function fixture(){
 const sent=[],calls=[],system={tool:'laser',sprayMode:'paintball',sprayColorIndex:0,initAudio:()=>{},placeBrick:()=>calls.push('brick')};
 for(const method of ['handlePointerInteraction','handleXRInteraction','fireFlame','fireExtraWeapon','swingBat','fireTaser','fireToxin','throwDynamite','useUtility','sprayAt'])system[method]=()=>calls.push(method);
 const context=vm.createContext({THREE,UTILITY_TOOLS,isFishingTool,currentFunhouseEquipment:()=>null,fireCarriedWater:()=>calls.push('water-blaster'),fishingUI:{active:()=>false,visible:()=>false,open:()=>{calls.push('fishing');return true;}},setStatus:()=>{},isAircraft,supportsWorldTools,gameplayControlsReady:()=>true,serverActors:{},serverVehicleId:null,fireAircraft:()=>calls.push('aircraft-cannon'),toxicBubbleSystem:system,radToxEnabled:true,serverHostedRoom:true,activeEnvironment:{},ownedPlacement:{active:false,confirm:()=>calls.push('placement')},isBasketballEnvironment:()=>false,isFiringRangeEnvironment:()=>false,liveRangeSnapshot:null,isTopDownView:()=>false,gameplayOverlayOpen:()=>false,document:{querySelector:()=>false},camera:{getWorldDirection:target=>target.set(0,0,-1)},sharedRangeAim:()=>[0,0,-1],player:{eyeHeight:1.65},SPRAY_COLORS:[{hex:0xff33aa}],serverCommand:(action,fields)=>{sent.push({action,...fields});return true;}});
 const start=source.indexOf("  for(const name of ['handlePointerInteraction'");
 vm.runInContext(source.slice(start,source.indexOf("  for(const [method,lastOnly]",start)),context);
 return {context,system,sent,calls};
}
test('all selected weapons and utility kits dispatch their own shared action without falling back to laser',()=>{
 const {system,sent,calls}=fixture();
 for(const tool of TOOL_IDS){system.tool=tool;const count=sent.length;system.handlePointerInteraction({}, {centre:true});if(isFishingTool(tool)){assert.equal(sent.length,count);assert.equal(calls.at(-1),'fishing');}else if(tool==='brick')assert.equal(calls.at(-1),'brick');else {assert.equal(sent.at(-1).tool,tool);assert.equal(sent.at(-1).action,'fire');}}
});
test('paintball and solid drawing work with combat off; menus block activation',()=>{
 const {context,system,sent}=fixture();context.radToxEnabled=false;system.tool='spray';system.handlePointerInteraction({}, {centre:true});assert.equal(sent.at(-1).action,'fire');
 system.sprayMode='draw';system.handlePointerInteraction({}, {centre:true});assert.equal(sent.at(-1).action,'draw-paint');assert.equal(sent.at(-1).color,0xff33aa);
 context.gameplayOverlayOpen=()=>true;const count=sent.length;system.handlePointerInteraction({}, {centre:true});assert.equal(sent.length,count);
});
test('XR uses the selected tool and shared drawing action',()=>{
 const {system,sent}=fixture();system.tool='spray';system.sprayMode='draw';system.handleXRInteraction({getWorldQuaternion:()=>new THREE.Quaternion()});assert.equal(sent.at(-1).action,'draw-paint');
});
test('a carried carnival water blaster uses harmless splash controls instead of a combat weapon',()=>{
 const {context,system,sent,calls}=fixture();context.currentFunhouseEquipment=()=>({tool:'water'});
 system.handlePointerInteraction({}, {centre:true});system.handleXRInteraction({});
 assert.deepEqual(calls,['water-blaster','water-blaster']);assert.equal(sent.length,0);
});
test('training routes every firearm through its real ammo and cooldown handler, while paint bypasses scoring',()=>{
 const called=[],system={tool:'laser',fireExtraWeapon:()=>called.push('ranged'),fireFlame:()=>called.push('flame'),useUtility:()=>called.push('utility')};
 const context=vm.createContext({THREE,toxicBubbleSystem:system,rangeActive:true,envLoader:{world:{}},RANGED_WEAPONS:{laser:{},'pulse-rifle':{},'rail-cannon':{}},UTILITY_TOOLS,rangeRaycaster:{set(){},setFromCamera(){},ray:{origin:new THREE.Vector3(),direction:new THREE.Vector3(0,0,-1)}},camera:{}});
 const start=source.indexOf('  function handleRangeShot(');vm.runInContext(source.slice(start,source.indexOf('  // User input must',start)),context);
 for(const tool of ['laser','pulse-rifle','rail-cannon','flamethrower','medkit']){system.tool=tool;context.handleRangeShot({centre:true});assert.equal(called.at(-1),tool==='flamethrower'?'flame':tool==='medkit'?'utility':'ranged');}
 system.tool='spray';assert.equal(context.handleRangeShot({centre:true}),null);
});
test('shared paint effects use their chosen color and never render a laser; utility kits do not render laser shots',()=>{
 const effects=[],context=vm.createContext({THREE,UTILITY_TOOLS,serverShotEvents:new Set(),serverRadToxRoots:new Map(),toxicBubbleSystem:{paintImpact:(point,normal,color)=>effects.push(['paint',point.y,color]),showWeaponShot:tool=>effects.push(['weapon',tool])}});
 const start=source.indexOf('  function renderSharedToolEvents(');vm.runInContext(source.slice(start,source.indexOf('  function updateServerEnemyVisuals',start)),context);
 context.renderSharedToolEvents({serverTime:1000,events:[{id:'paint',action:'fire',tool:'spray',origin:{x:0,y:1.5,z:0},direction:[0,-1,0],end:{x:0,y:0,z:0},paintNormal:[0,1,0],color:0xff33aa,at:1000},{id:'heal',action:'fire',tool:'medkit',origin:{x:0,y:1.5,z:0},direction:[0,0,-1],at:1000},{id:'laser',action:'fire',tool:'laser',origin:{x:0,y:1.5,z:0},direction:[0,0,-1],at:1000}]},'self');
 assert.deepEqual(effects,[['paint',0,0xff33aa],['weapon','laser']]);
});

test('aircraft pilots fire their onboard cannons even when ground combat is off',()=>{const {context,system,sent,calls}=fixture();context.serverActors={plane:{modelId:'corsair-aircraft'}};context.serverVehicleId='plane';context.radToxEnabled=false;system.handlePointerInteraction({}, {centre:true});assert.equal(calls.at(-1),'aircraft-cannon');assert.equal(sent.length,0);});

const maps=JSON.parse(readFileSync('public/models/environments/environments.json','utf8'));
test('every loaded map dispatches the equipped weapon with encounters switched off',()=>{
 const {context,system,sent}=fixture();context.radToxEnabled=false;
 for(const map of maps){
  context.activeEnvironment=map;
  context.isBasketballEnvironment=environment=>environment.game==='basketball';
  system.toolSelected=true;
  for(const tool of ['laser','pulse-rifle','rail-cannon','flamethrower','bat','taser','toxin','dynamite']){
   system.tool=tool;const before=sent.length;system.handlePointerInteraction({}, {centre:true});
   assert.equal(sent.length,before+1,map.id+': '+tool+' is usable without an encounter');
   assert.equal(sent.at(-1).tool,tool);
  }
 }
});
test('basketball keeps its default sport trigger while explicit weapon selection fires the weapon',()=>{
 const {context,system,sent,calls}=fixture();context.isBasketballEnvironment=()=>true;
 context.basketballTrigger=()=>calls.push('basketball');
 system.handlePointerInteraction({}, {centre:true});assert.equal(calls.at(-1),'basketball');assert.equal(sent.length,0);
 system.toolSelected=true;system.handlePointerInteraction({}, {centre:true});assert.equal(sent.at(-1).tool,'laser');
});
test('equipped weapons cannot fire while the map is loading or a menu is open',()=>{
 const {context,system,sent}=fixture();system.toolSelected=true;
 context.gameplayControlsReady=()=>false;assert.equal(system.handlePointerInteraction({}, {centre:true}),false);assert.equal(sent.length,0);
 context.gameplayControlsReady=()=>true;context.gameplayOverlayOpen=()=>true;
 assert.equal(system.handleXRInteraction({}),false);assert.equal(sent.length,0);
});

test('solo weapon effects and cooldowns update while disabled encounters stay paused',()=>{
 const start=source.indexOf('    update(delta,elapsed){'),end=source.indexOf('    updateVisualEffects(',start);
 const context=vm.createContext({THREE,rangeActive:false,RAD_TOX_STATES:{ACTIVE:'active'}});
 const System=vm.runInContext(`(class {${source.slice(start,end)}})`,context),system=new System();
 let effects=0,flames=0;
 Object.assign(system,{state:'active',active:false,tool:'laser',utilityEffects:[],weaponCooldown:1,flameModel:{},flameSystem:{update:()=>flames++},
  endBoss:{update:()=>assert.fail('disabled boss must remain paused')},batModel:{},taserModel:new THREE.Object3D(),toxinModel:new THREE.Object3D(),dynamiteModel:new THREE.Object3D(),brickModel:{},dynamiteCooldown:1,toxinCooldown:1,
  updateElectricShocks(){},updateVisualEffects:()=>effects++,updateHud:()=>assert.fail('disabled encounter must remain paused')});
 system.update(.1,1);
 assert.equal(system.weaponCooldown,.9);assert.equal(system.dynamiteCooldown,.9);assert.equal(effects,1);assert.equal(flames,1);
});

test('solo dynamite explodes and is removed after its fuse with encounters disabled',()=>{
 const begin=source.indexOf(' explodeDynamite(stick){'),end=source.indexOf(' createDynamiteGas(position,radius){',begin);
 let gas=0;
 const context=vm.createContext({THREE,TOXIC_BUBBLE_CONFIG:{dynamiteRadius:5,dynamiteDamage:100},trackGameQuest:()=>assert.fail('no encounter hits should be counted')});
 const System=vm.runInContext(`(class {${source.slice(begin,end)}})`,context),system=new System(),scene=new THREE.Scene(),stick=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());scene.add(stick);
 Object.assign(system,{scene,active:false,resources:{},dynamites:[stick],explosions:[],bubbles:[new THREE.Object3D()],endBoss:{takeDamage:()=>assert.fail('disabled boss is not a blast target')},avatarTargets:()=>[],getPlayerPosition:()=>new THREE.Vector3(20,0,0),createDynamiteGas:()=>gas++,tone(){},setState(){},damageTarget:()=>assert.fail('disabled enemies are not blast targets')});
 const gateContext=vm.createContext({toxicBubbleSystem:system,radToxEnabled:false,serverHostedRoom:false,activeEnvironment:{},isBasketballEnvironment:()=>false,isCleanCommonsEnvironment:()=>false});
 const gateStart=source.indexOf('  const legacyGameplayMethods='),gateEnd=source.indexOf('  let radToxEnabled=',gateStart);
 vm.runInContext(source.slice(gateStart,gateEnd),gateContext);
 system.explodeDynamite(stick);
 assert.equal(stick.parent,null);assert.equal(system.dynamites.length,0);assert.equal(system.explosions.length,1);assert.equal(gas,1);
});


test('all fishing tackle routes pointer and XR activation to fishing and cannot dispatch weapon fire',()=>{
 for(const tool of FISHING_TOOL_IDS){const {context,system,sent,calls}=fixture();system.tool=tool;context.radToxEnabled=false;system.handlePointerInteraction({}, {centre:true});system.handleXRInteraction({});assert.deepEqual(calls,['fishing','fishing']);assert.equal(sent.length,0);
  context.gameplayOverlayOpen=()=>true;system.handlePointerInteraction({}, {centre:true});assert.equal(calls.length,2,'a different modal retains control');
  context.gameplayOverlayOpen=()=>false;context.fishingUI.active=()=>true;system.handleXRInteraction({});assert.equal(calls.length,2,'a live fishing cast cannot reopen or trigger another action');assert.equal(sent.length,0);
 }
});
