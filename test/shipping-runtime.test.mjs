import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {shippingHelmFloorPose,shippingHeadsetMenu,createShippingActivityAnnouncements} from '../public/js/shipping-runtime.js';
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

test('native Freight League actions use separate current join and previous-round claim identities',()=>{
 const calls=[],state={enabled:true,phase:'ready',competition:{id:'round-next',name:'Strait Freight League',status:'open',leaderboard:[{rank:1,name:'Gulf Link',ai:true,score:240,deliveries:2},{rank:2,name:'Captain Human',ai:false,score:180,deliveries:1}]},league:{canJoin:true,canClaim:true,competitionId:'round-finished',prizeMzk:55}},items=shippingHeadsetMenu(state,{action:(...args)=>calls.push(args),status:message=>calls.push(message)});
 items.find(item=>item.label==='Join Freight League').run();items.find(item=>item.label==='Claim Freight League prize · 55 MZK').run();
 assert.deepEqual(calls,[['join-league',{competitionId:'round-next'}],['claim-league',{competitionId:'round-finished'}]]);
 assert.ok(items.some(item=>item.keepOpen&&item.label==='League 1. Gulf Link · AI · 240 points · 2 deliveries'));
 assert.ok(items.some(item=>item.keepOpen&&item.label==='League 2. Captain Human · 180 points · 1 deliveries'));
 assert.ok(!shippingHeadsetMenu({...state,league:{canJoin:false,canClaim:false}},{}).some(item=>/^(Join Freight League|Claim Freight League prize)/.test(item.label)));
 assert.ok(!shippingHeadsetMenu({...state,league:{canClaim:true}},{}).some(item=>item.label.startsWith('Claim Freight League prize')),'a claim without its server receipt identity is unavailable');
});

test('native live shipping readouts expose actual AI manifests and port activity without boarding or altering rivals',()=>{
 const state={enabled:true,phase:'ready',nearestPort:'qeshm',ports:[{id:'qeshm',name:'Qeshm · island dock'},{id:'khasab',name:'Khasab · relief dock'}],rivals:[{shipId:'ai-gulf-link',companyName:'Gulf Link',captainName:'Captain Noor',job:{phase:'unloading',originId:'khasab',destinationId:'qeshm',units:8,loaded:[{},{}],unloaded:3}}],portEconomy:{qeshm:{deliveries:4,queueLength:2}},dispatch:[{message:'Gulf Link arrived at Qeshm.'}]},before=structuredClone(state),calls=[],items=shippingHeadsetMenu(state,{action:()=>assert.fail('AI status is read-only'),status:message=>calls.push(message)});
 const rival=items.find(item=>item.label.startsWith('AI Gulf Link'));assert.equal(rival.keepOpen,true);rival.run();
 assert.match(calls[0],/Captain Noor · unloading · Khasab to Qeshm · Cargo 3\/8/);
 assert.ok(items.some(item=>item.keepOpen&&item.label==='Qeshm live port · 4 deliveries · 2 ships queued'));
 assert.ok(items.some(item=>item.keepOpen&&item.label==='Gulf Link arrived at Qeshm.'));
 assert.ok(!items.some(item=>item.label==='Board available cargo ship'));assert.deepEqual(state,before);
});

test('native league clocks and live warehouse demand use server timestamps and canonical cargo labels',()=>{
 const state={enabled:true,serverTime:100000,competition:{id:'round',status:'active',startsAt:90000,endsAt:1300000},nearestPort:'qeshm',ports:[{id:'qeshm',name:'Qeshm'}],cargo:[{id:'provisions',name:'Island provisions'}],portEconomy:[{portId:'qeshm',imports:3,stock:{provisions:40,parts:42},demand:{provisions:8,parts:0}}]},items=shippingHeadsetMenu(state);
 assert.ok(items.some(item=>item.label==='League time remaining 20:00'));
 assert.ok(items.some(item=>item.label==='Qeshm live port · 3 deliveries'));
 assert.ok(items.some(item=>item.label==='Warehouse stock · 82 cargo units'));
 assert.ok(items.some(item=>item.label==='Port demand · Island provisions · 8 units below target'));
 assert.ok(!items.some(item=>item.label==='Port demand · parts · 0 units below target'));
 const next=shippingHeadsetMenu({...state,competition:{id:'next',status:'open',startsAt:115000,endsAt:1315000}});assert.ok(next.some(item=>item.label==='League starts in 0:15'));
});

test('port captions do not replay entry history, repeat packets, distant events or an active player manifest',()=>{
 const messages=[],announcer=createShippingActivityAnnouncements({announce:text=>messages.push(text)}),environment={id:'hormuz-shipping'};
 const event=(id,at,message,portId='qeshm')=>({id,at,type:'arrived',message,portId});
 const make=(sequence,serverTime,dispatch,phase=null)=>({sequence,serverTime,shipping:{enabled:true,environmentId:environment.id,ports:[{id:'qeshm',x:0,z:0},{id:'fujairah',x:1000,z:1000}],dispatch},players:{self:{health:100,position:{x:0,z:0},shipping:{nearbyPortId:'qeshm',job:phase?{phase}:null}}}});
 const previous=event('old',99000,'Historical arrival');announcer.update(make(1,100000,[previous]),'self',environment);assert.deepEqual(messages,[]);
 const arrived=event('arrival-1',120000,'Gulf Link arrived at Qeshm.');announcer.update(make(2,120000,[previous,arrived]),'self',environment);assert.deepEqual(messages,[arrived.message]);
 announcer.update(make(3,121000,[arrived]),'self',environment);announcer.update(make(4,122000,[arrived,event('close',122000,'Another arrival')]),'self',environment);assert.equal(messages.length,1);
 announcer.update(make(5,140000,[event('distant',140000,'Distant arrival','fujairah')]),'self',environment);assert.equal(messages.length,1);
 announcer.update(make(6,160000,[event('working',160000,'Do not interrupt loading')],'loading'),'self',environment);assert.equal(messages.length,1);
 announcer.update(make(7,180000,[event('fresh',180000,'Fresh arrival')]),'self',environment);assert.deepEqual(messages,[arrived.message,'Fresh arrival']);
 announcer.dispose();announcer.update(make(8,200000,[event('disposed',200000,'Not active')]),'self',environment);assert.equal(messages.length,2);
});

test('port captions reject old sequence and world generations before consuming a new dispatch event',()=>{
 const messages=[],announcer=createShippingActivityAnnouncements({announce:text=>messages.push(text)}),environment={id:'hormuz-shipping'},make=(sequence,at,dispatch=[])=>({sequence,serverTime:at,shipping:{enabled:true,environmentId:environment.id,dispatch,ports:[{id:'qeshm',x:0,z:0}]},players:{self:{health:100,position:{x:0,z:0},shipping:{nearbyPortId:'qeshm'}}}}),event={id:'future',at:120000,type:'departed',portId:'qeshm',message:'Gulf Link departed.'};
 announcer.update(make(10,100000),'self',environment);announcer.update(make(9,120000,[event]),'self',environment);assert.deepEqual(messages,[]);
 announcer.update(make(11,120000,[event]),'self',environment);assert.deepEqual(messages,[event.message]);
 announcer.update(make(12,140000,[{...event,id:'late-world',at:140000,message:'Wrong world'}]),'self',{id:'neon-harbor'});assert.equal(messages.length,1);
 announcer.update(make(13,160000,[{...event,id:'returned',at:160000,message:'No entry replay'}]),'self',environment);assert.equal(messages.length,1);
});
