import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {fishingSeatPose} from '../public/js/harbor-camera.js';
import {isWatercraft} from '../public/js/harbor-water.js';
import {isFishingBoat} from '../public/js/fishing-config.js';
import {isFishingTool} from '../public/js/game-tool-rules.js';

const source=readFileSync(new URL('../public/js/house-explorer-glb.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));

test('live fishing selects the actual first-person camera and restores the saved overhead preference',()=>{
 const context=vm.createContext({fishingViewEnabled:false,funhouseRideCamera:false,gameCameraMode:'broadcast',renderer:{xr:{isPresenting:false}},camera:{id:'boat'},overviewCamera:{id:'overhead'}});
 vm.runInContext(section('  function isTopDownView()','  function syncCameraToggle()'),context);
 assert.equal(context.displayCamera().id,'overhead');context.fishingViewEnabled=true;
 assert.equal(context.displayCamera().id,'boat');assert.equal(context.gameCameraMode,'broadcast');
 context.fishingViewEnabled=false;assert.equal(context.displayCamera().id,'overhead');
});

test('fishing closes ordinary quest and conversation companions that would cover the actual water',()=>{
 const calls=[],context=vm.createContext({mapQuestPrompts:{close:()=>calls.push('quests')},residentUI:{open:value=>calls.push(['residents',value])},transportActivity:{close:()=>calls.push('assignments')},districtMap:{dialog:{open:true,close:()=>calls.push('map')}}});
 vm.runInContext(section('  function closeFishingCompanions()','  function presentXRFishingSeat('),context);
 context.closeFishingCompanions();assert.deepEqual(calls,['quests',['residents',false],'assignments','map']);
});

test('legacy movement, item, reset and jump keys cannot operate the boat behind live fishing',()=>{
 const calls=[],keys=new Set(['w']),context=vm.createContext({gameplayControlsReady:()=>true,gameplayOverlayOpen:()=>false,fishingUI:{visible:()=>true},keys,isTypingTarget:()=>false,isGameCameraToggleKey:()=>false,safelyInteract:()=>calls.push('legacy-action'),heldGameInput:{press:()=>{calls.push('held');return true;}},renderer:{xr:{isPresenting:false}},player:{yaw:1,pitch:.2}});
 const line=source.split('\n').find(line=>line.includes('const onGameplayKeyDown='));vm.runInContext(line+'\nglobalThis.key=onGameplayKeyDown;',context);
 for(const key of ['e','f','g','r',' ','w','ArrowUp'])context.key({key,repeat:false,preventDefault(){calls.push('prevent');}});
 assert.equal(keys.size,0);assert.deepEqual(calls,[]);assert.equal(context.player.yaw,1);assert.equal(context.player.pitch,.2);
});

test('VR fishing moves the floor origin without changing tracked head pose or resetting a snap turn each frame',()=>{
 const boat={id:'angler',modelId:'harbor-fishing-boat',position:{x:145,y:0,z:-38},rotation:{y:.5}},rig=new THREE.Group(),camera=new THREE.PerspectiveCamera();rig.add(camera);camera.position.set(.1,1.7,-.04);camera.rotation.set(.1,.3,.02);const trackedPosition=camera.position.clone(),trackedQuaternion=camera.quaternion.clone();
 const context=vm.createContext({renderer:{xr:{isPresenting:true}},fishingUI:{playing:()=>true,side:'starboard',snapshot:()=>({castPoint:{x:151,y:.05,z:-37}})},isWatercraft,fishingSeatPose,playerRig:rig,player:{yaw:.5,pitch:.2},xrFishingSeatKey:null,xrFishingDesktopLook:null,camera});
 vm.runInContext(section('  function presentXRFishingSeat(','  const fitnessUI='),context);
 assert.equal(context.presentXRFishingSeat(boat),true);const baseYaw=context.player.yaw;context.player.yaw+=Math.PI/6;context.presentXRFishingSeat(boat);
 assert.equal(context.player.yaw,baseYaw+Math.PI/6);assert.ok(camera.position.equals(trackedPosition));assert.ok(camera.quaternion.equals(trackedQuaternion));
 assert.equal(rig.position.y,.2,'the tracked local-floor eye height must not be counted twice');
 assert.equal(context.xrFishingDesktopLook.relativeYaw,0);assert.equal(context.xrFishingDesktopLook.pitch,.2);
 context.renderer.xr.isPresenting=false;assert.equal(context.presentXRFishingSeat(boat),false);assert.equal(context.xrFishingSeatKey,null);
});

test('native headset fishing menus discover the Angler helm and retain real owned tackle, catches and standings',()=>{
 let state={playing:false},calls=[];
 const context=vm.createContext({fishingUI:{playing:()=>state.playing,snapshot:()=>state,open:()=>calls.push('open'),trigger:()=>calls.push('primary'),action:(...args)=>calls.push(args),close:()=>calls.push('helm')},isFishingTool,isFishingBoat,toxicBubbleSystem:{tool:'laser'},serverActors:{boat:{modelId:'harbor-fishing-boat'}},serverVehicleId:'boat',serverViewSnapshot:null,authoritativeClient:{selfId:'self'},xrGameControls:{endSession:()=>calls.push('exit-vr')},setStatus:message=>calls.push(message)});
 vm.runInContext(section('  function canOpenXRFishing()','  async function setupVRControls()'),context);
 assert.equal(context.canOpenXRFishing(),true,'the driver can discover fishing with the default laser selected');
 let items=context.fishingXRMenuItems();assert.equal(items[0].label,'Start fishing from the boat');items[0].run();assert.deepEqual(calls,['open']);
 state={playing:true,primaryLabel:'Hook now',side:'starboard',gear:[{id:'fishing-rod',name:'Owned starter rod',kind:'rod'},{id:'fishing-lure',name:'Owned spoon',kind:'bait'}],rodId:'fishing-rod',baitId:'fishing-lure',creel:[{name:'Bass',weightKg:1.25,valueMzk:15}],creelCapacity:10,guide:{name:'Captain Mara'},canSell:true,canJoin:false,canClaim:true,tournament:{name:'Fishing Cup',status:'finished',leaderboard:[{actorId:'self',name:'You',weightKg:2,catches:1},{actorId:'ai',name:'Mara',ai:true,weightKg:1,catches:1}]}};
 items=context.fishingXRMenuItems();assert.ok(items.some(item=>item.label.includes('Creel · 1 / 10')));assert.ok(items.some(item=>item.label.includes('your rank 1')));assert.ok(items.some(item=>item.label.includes('Bass · 1.25 kg')));assert.ok(!items.some(item=>item.label==='Join Fishing Cup'));
 items.find(item=>item.label.includes('Owned starter rod')).run();assert.equal(calls.at(-1)[0],'rod');assert.equal(calls.at(-1)[1].id,'fishing-rod');
 items.find(item=>item.label.startsWith('Sell 1')).run();assert.deepEqual(calls.at(-1),['sell']);items.find(item=>item.label==='Claim Fishing Cup result').run();assert.deepEqual(calls.at(-1),['claim']);
 assert.ok(!items.some(item=>item.label.toLowerCase().includes('open menu')),'headset entries use actual XR actions, not hidden DOM dialogs');
 context.serverActors={};state={playing:false};assert.equal(context.canOpenXRFishing(),false);
 context.serverViewSnapshot={players:{self:{fishing:{availability:{canCast:true}}}}};assert.equal(context.canOpenXRFishing(),true,'valid shore fishing is discoverable too');
});
