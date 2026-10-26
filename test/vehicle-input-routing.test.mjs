import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {isAircraft,stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {isRoadVehicle} from '../public/js/road-vehicles.js';
import {isWatercraft} from '../public/js/harbor-water.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';
const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
function fixture(kind='walker'){
 const calls={raw:0,walking:0,flight:[],boat:[],stick:[],construction:0},state={ready:true,menu:false,fishingVisible:false,fishingActive:false,raw:{x:.03,y:.025},walking:{x:.6,y:-.4},flight:{gear:false,flaps:.5,brake:true,throttle:.72,rudder:.2},boat:{throttle:.25,sailTrim:.65,anchor:false},constructionTravel:null};
 const context=vm.createContext({THREE,isAircraft,isWatercraft,isRoadVehicle,constructionUI:{inputs:()=>{calls.construction++;return state.constructionTravel;}},activeEnvironment:{},serverVehicleId:kind==='walker'?null:kind,serverActors:{aircraft:{modelId:'corsair-aircraft'},boat:{modelId:'harbor-skiff'},quad:{modelId:'dune-quad'},car:{modelId:'grand-tourer'}},fishingUI:{visible:()=>state.fishingVisible,active:()=>state.fishingActive},gameplayControlsReady:()=>state.ready,gameplayOverlayOpen:()=>state.menu,document:{querySelector:()=>state.menu},player:{yaw:.7,eyeHeight:1.65},camera:{getWorldDirection:target=>target.set(0,0,-1)},renderer:{xr:{isPresenting:false}},explorerWalkingYaw:()=>1.2,thumbInput:{leftX:0,leftY:0,rightX:0,rightY:0},airportOps:{lift:0,flightInput:forward=>{calls.flight.push(forward);return {...state.flight};},flightControls:controls=>{calls.stick.push({...controls});return {...state.flight,forward:0,side:controls.side,lift:controls.forward};}},harborOps:{ahead:0,inputs:forward=>{calls.boat.push(forward);return {...state.boat};}},getInput:()=>{calls.raw++;return new THREE.Vector2(state.raw.x,state.raw.y);},getMovementInput:()=>{calls.walking++;return new THREE.Vector2(state.walking.x,state.walking.y);},keys:new Set(),mobile:new Set(),ownedPlacement:{active:false},toxicBubbleSystem:{flameTrigger:null,tool:'laser',sprayColorIndex:0},SPRAY_COLORS:[{hex:0xff00ff}],stickSprinting:false});
 const start=source.indexOf('  function serverInput()');vm.runInContext(source.slice(start,source.indexOf('  const serverAssetRetryAt=',start)),context);
 return {context,state,calls,input:()=>context.serverInput()};
}
test('walking uses the scene basis while road cars, aircraft and boats use raw controls',()=>{
 for(const kind of ['walker','quad','aircraft','boat','car']){const {calls,state,input}=fixture(kind),controls=input(),vehicle=['aircraft','boat','car'].includes(kind);assert.equal(calls.raw,vehicle?1:0);assert.equal(calls.walking,vehicle?0:1);assert.equal(controls.side,vehicle?state.raw.x:state.walking.x);assert.equal(controls.forward,vehicle?state.raw.y:state.walking.y);}
});
test('unready gameplay sends neutral axes without reading held walking or vehicle power controls',()=>{
 for(const kind of ['walker','quad','aircraft','boat','car']){
  const {context,state,calls,input}=fixture(kind);state.ready=false;state.constructionTravel={forward:1,side:1,brake:false};state.raw={x:1,y:1};state.walking={x:1,y:1};context.harborOps.ahead=1;context.airportOps.lift=1;context.keys.add(' ');context.keys.add('shift');context.toxicBubbleSystem.flameTrigger=()=>{};
  const controls=input();
  for(const axis of ['side','forward','lift','rudder'])assert.equal(controls[axis],0,kind+' '+axis);
  for(const action of ['jump','sprint','firing'])assert.equal(controls[action],false,kind+' '+action);
  assert.equal(controls.throttle,undefined,'joining cannot replay the instrument throttle setting');
  assert.equal(calls.raw+calls.walking+calls.flight.length+calls.boat.length+calls.stick.length+calls.construction,0);
 }
});
test('small aircraft stick corrections control lift and roll without inadvertently changing throttle',()=>{
 const {context,state,calls,input}=fixture('aircraft');context.thumbInput.leftX=.012;context.thumbInput.leftY=-.018;state.raw={x:.012,y:.018};const controls=input();assert.equal(controls.side,.012);assert.equal(controls.lift,.018);assert.equal(controls.forward,0);assert.equal(calls.flight.at(-1),0);assert.equal(calls.stick.at(-1).side,.012);assert.equal(controls.throttle,.72);assert.equal(controls.gear,false);assert.equal(controls.flaps,.5);assert.equal(controls.brake,true);
});
test('small boat stick input remains raw while a centered stick permits the Ahead/Astern hold buttons',()=>{
 const {context,state,calls,input}=fixture('boat');let controls=input();assert.equal(controls.side,.03);assert.equal(controls.forward,.025);assert.equal(calls.boat.at(-1),.025);
 state.raw={x:.015,y:0};context.harborOps.ahead=-1;controls=input();assert.equal(controls.side,.015);assert.equal(controls.forward,-1);assert.equal(calls.boat.at(-1),-1);assert.equal(controls.anchor,false);assert.equal(controls.sailTrim,.65);
});
test('open dialogs neutralize motion and firing but preserve discrete vehicle settings and explicit zero values',()=>{
 for(const kind of ['aircraft','boat']){const {context,state,input}=fixture(kind);state.menu=true;state.flight={gear:false,flaps:0,brake:false,throttle:0};state.boat={throttle:0,sailTrim:0,anchor:false};context.harborOps.ahead=1;context.keys.add(' ');context.keys.add('shift');context.toxicBubbleSystem.flameTrigger=()=>{};const controls=input();assert.equal(controls.side,0);assert.equal(controls.forward,0);assert.equal(controls.jump,false);assert.equal(controls.sprint,false);assert.equal(controls.firing,false);assert.equal(controls.throttle,0);if(kind==='aircraft'){assert.equal(controls.gear,false);assert.equal(controls.flaps,0);assert.equal(controls.brake,false);}else{assert.equal(controls.sailTrim,0);assert.equal(controls.anchor,false);}}
});
test('free head look does not become flight/boat steering or overwrite explicit rudder controls',()=>{
 for(const kind of ['aircraft','boat']){const {context,state,input}=fixture(kind);state.raw={x:0,y:0};let controls=input();const previous={...controls};context.player.yaw+=1.5;context.thumbInput.rightX=.9;context.thumbInput.rightY=-.7;controls=input();assert.equal(controls.side,0);assert.equal(controls.forward,previous.forward);assert.equal(controls.rudder,previous.rudder);
  if(kind==='aircraft'){const aircraft={position:{x:0,y:20,z:60},rotation:{y:0},flight:{speed:16,airspeed:16,altitude:19.6}};assert.deepEqual(stepAircraftFlight(aircraft,controls,.05),stepAircraftFlight(aircraft,previous,.05));}
  else{const boat={modelId:'harbor-skiff',position:{x:160,y:0,z:20},rotation:{y:0},boating:{speed:3,throttle:.4}},environment={builderScene:{layoutMeta:{harbor:{extent:256,islands:[]}}}};assert.deepEqual(stepBoatSimulation(boat,controls,.05,{environment}),stepBoatSimulation(boat,previous,.05,{environment}));}
 }
});
test('actual keyboard input keeps vehicle power and steering independent while normalizing walking diagonals',()=>{
 for(const kind of ['aircraft','boat']){
  const {context,state,calls,input}=fixture(kind);context.xrGameControls=null;context.walkingSprint=()=>false;context.renderer.xr.getSession=()=>null;context.keys.add('w');context.keys.add('d');delete state.flight.throttle;
  const start=source.indexOf('  function getInput(');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);
  const walking=context.getInput(),vehicle=context.getInput(false);assert.ok(Math.abs(walking.x-Math.SQRT1_2)<1e-9);assert.ok(Math.abs(walking.y-Math.SQRT1_2)<1e-9);assert.equal(vehicle.x,1);assert.equal(vehicle.y,1);
  const controls=input();assert.equal(controls.side,1);assert.equal(controls.forward,1);if(kind==='aircraft')assert.equal(calls.flight.at(-1),1);else assert.equal(calls.boat.at(-1),1);
 }
});

test('held construction travel controls reach room input and open menus neutralize them',()=>{
 const {state,input}=fixture('car');state.constructionTravel={forward:.7,side:-.4,brake:false};let controls=input();assert.equal(controls.forward,.7);assert.equal(controls.side,-.4);assert.equal(controls.brake,false);state.menu=true;controls=input();assert.equal(controls.forward,0);assert.equal(controls.side,0);
});
test('shared jumps reach the server even when large maps use authoritative collision only',async()=>{
 for(const localWalkingActive of [false,true]){const calls=[],context=vm.createContext({fishingUI:{visible:()=>false},gameplayControlsReady:()=>true,serverHostedRoom:true,localWalkingActive,toxicBubbleSystem:{tool:'laser'},localWalkingView:{jump:()=>calls.push('predicted')},serverInput:()=>({forward:1,yaw:0}),serverCommand:async(action,fields)=>{calls.push({action,...fields});return true;},authoritativeClient:{ready:true,requestInput:()=>calls.push('refresh')}});const start=source.indexOf('  function jump()');vm.runInContext(source.slice(start,source.indexOf('\n',start)),context);await context.jump();const sent=calls.find(call=>call.action==='input');assert.equal(sent.input.jump,true);assert.equal(sent.input.forward,1);assert.equal(calls.includes('predicted'),localWalkingActive);assert.equal(calls.at(-1),'refresh');}
});


test('fishing panels and live casts neutralize held helm overrides without reading or reapplying them',()=>{
 for(const mode of ['fishingVisible','fishingActive']){
  const {context,state,calls,input}=fixture('boat');state.boat={throttle:.9,anchor:false,sailTrim:.7};context.harborOps.ahead=1;context.keys.add(' ');context.keys.add('shift');context.toxicBubbleSystem.flameTrigger=()=>{};
  state[mode]=true;const controls=input();assert.equal(controls.forward,0);assert.equal(controls.side,0);assert.equal(controls.throttle,0);assert.equal(controls.rudder,0);assert.equal(controls.firing,false);assert.equal(controls.jump,false);assert.equal(controls.sprint,false);assert.equal(controls.anchor,undefined,'fishing never publishes a stale weigh-anchor override');assert.equal(calls.boat.length,0);assert.equal(calls.raw,0);
  state[mode]=false;assert.equal(input().throttle,.9,'ordinary helm routing resumes when fishing closes');
 }
});

test('browsing fishing during a selected route preserves automatic helm and suppresses manual inputs',()=>{
 const {context,state,calls,input}=fixture('boat');state.fishingVisible=true;state.boat={throttle:1,anchor:true};context.serverActors.boat.boating={assist:'navigate',navigationType:'fishing'};context.harborOps.ahead=1;context.keys.add(' ');context.toxicBubbleSystem.flameTrigger=()=>{};
 const controls=input();assert.equal(controls.throttle,undefined,'an open fishing panel cannot cancel the selected destination');assert.equal(controls.anchor,undefined);assert.equal(controls.forward,0);assert.equal(controls.side,0);assert.equal(controls.rudder,0);assert.equal(controls.firing,false);assert.equal(controls.jump,false);assert.equal(calls.boat.length,0);
 state.fishingActive=true;assert.equal(input().throttle,0,'a live cast always holds the helm neutral');
});
