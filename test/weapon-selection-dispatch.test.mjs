import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {TOOL_IDS} from '../public/js/game-tool-rules.js';
import {isAircraft} from '../public/js/aircraft-flight.js';
import {UTILITY_TOOLS} from '../public/js/game-utilities.js';
const source=readFileSync('public/js/house-explorer-glb.js','utf8');
function fixture(){
 const sent=[],calls=[],system={tool:'laser',sprayMode:'paintball',sprayColorIndex:0,placeBrick:()=>calls.push('brick')};
 for(const method of ['handlePointerInteraction','handleXRInteraction','fireFlame','fireExtraWeapon','swingBat','fireTaser','fireToxin','throwDynamite','useUtility','sprayAt'])system[method]=()=>calls.push(method);
 const context=vm.createContext({THREE,UTILITY_TOOLS,isAircraft,serverActors:{},serverVehicleId:null,fireAircraft:()=>calls.push('aircraft-cannon'),toxicBubbleSystem:system,radToxEnabled:true,serverHostedRoom:true,activeEnvironment:{},ownedPlacement:{active:false,confirm:()=>calls.push('placement')},isBasketballEnvironment:()=>false,isFiringRangeEnvironment:()=>false,liveRangeSnapshot:null,isTopDownView:()=>false,document:{querySelector:()=>false},camera:{getWorldDirection:target=>target.set(0,0,-1)},sharedRangeAim:()=>[0,0,-1],player:{eyeHeight:1.65},SPRAY_COLORS:[{hex:0xff33aa}],serverCommand:(action,fields)=>{sent.push({action,...fields});return true;}});
 const start=source.indexOf("  for(const name of ['handlePointerInteraction'");
 vm.runInContext(source.slice(start,source.indexOf("  for(const [method,lastOnly]",start)),context);
 return {context,system,sent,calls};
}
test('all selected weapons and utility kits dispatch their own shared action without falling back to laser',()=>{
 const {system,sent,calls}=fixture();
 for(const tool of TOOL_IDS){system.tool=tool;system.handlePointerInteraction({}, {centre:true});if(tool==='brick')assert.equal(calls.at(-1),'brick');else {assert.equal(sent.at(-1).tool,tool);assert.equal(sent.at(-1).action,'fire');}}
});
test('paintball and solid drawing work with combat off; menus block activation',()=>{
 const {context,system,sent}=fixture();context.radToxEnabled=false;system.tool='spray';system.handlePointerInteraction({}, {centre:true});assert.equal(sent.at(-1).action,'fire');
 system.sprayMode='draw';system.handlePointerInteraction({}, {centre:true});assert.equal(sent.at(-1).action,'draw-paint');assert.equal(sent.at(-1).color,0xff33aa);
 context.document.querySelector=()=>true;const count=sent.length;system.handlePointerInteraction({}, {centre:true});assert.equal(sent.length,count);
});
test('XR uses the selected tool and shared drawing action',()=>{
 const {system,sent}=fixture();system.tool='spray';system.sprayMode='draw';system.handleXRInteraction({getWorldQuaternion:()=>new THREE.Quaternion()});assert.equal(sent.at(-1).action,'draw-paint');
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
