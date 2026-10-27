import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFactoryTestingVR,testingDashboardPage} from '../public/js/factory-testing-vr.js';
import {PROVING_ID,COMPOUND_ID,PROVING_STATIONS,COMPOUND_STATIONS,PROVING_TARGETS} from '../public/js/factory-test-config.js';

const turns=async()=>{for(let index=0;index<12;index++)await Promise.resolve();};
const models=[{id:'owned-training',name:'Own training model',buildAssetId:'factory-training-missile',profileId:'accuracy'},{id:'owned-cargo',name:'Own cargo model',buildAssetId:'factory-cargo-rocket',profileId:'cargo'}];
function canvasRecorder(){const calls=[],context=new Proxy({},{get:(object,key)=>object[key]??((...args)=>calls.push({method:key,args})),set:(object,key,value)=>(object[key]=value,true)});return {canvas:{width:0,height:0,getContext:()=>context},calls};}
function fixture({environment={id:PROVING_ID},state={},position=null,stations=null,items=models,canvas=null,deferAction=null,presenting=true}={}){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),compound=environment.id===COMPOUND_ID||environment.factoryTesting?.kind==='compound';
 const location={...(position||(compound?COMPOUND_STATIONS[1].position:PROVING_STATIONS[0].position))};camera.position.set(location.x,location.y+1.65,location.z);scene.add(camera);
 let currentEnvironment=environment,time=10000,sequence=1,resolver=null,held=null,present=presenting;
 const commands=[],statuses=[],releases=[];
 const own={session:null,progress:{completedTests:0,skills:{},badges:[]},clearance:{compound:false,deep:false},containment:null,...structuredClone(state)};
 const publicView={kind:compound?'compound':'proving',stations:structuredClone(stations||(compound?COMPOUND_STATIONS:PROVING_STATIONS)),targets:structuredClone(PROVING_TARGETS),sessions:[]};
 const make=(privateItems=true)=>({sequence:sequence++,selfId:'me',serverTime:time,testing:structuredClone(publicView),players:{me:{actorId:'me',health:100,heldId:held,position:{...location},testing:structuredClone(own)}},...(privateItems?{result:{message:'Server accepted action',testing:{...structuredClone(own),eligibleItems:structuredClone(items)}}}:{})});
 const vr=createFactoryTestingVR({THREE,scene,camera,getEnvironment:()=>currentEnvironment,getPosition:()=>location,getPresenting:()=>present,getServerTime:()=>time,createCanvas:()=>canvas,onStatus:value=>statuses.push(value),onInputRelease:value=>releases.push(value),send:(action,fields)=>{
  commands.push({action,...fields});
  if(action===deferAction)return new Promise(resolve=>resolver=resolve);
  if(action==='proving-setup')own.session={id:'configured-test',status:'configured',itemId:fields.itemId,itemName:'Own training model',profileId:fields.profileId,targetId:fields.targetId};
  if(action==='proving-deploy')own.session={...own.session,status:'deployed',padId:fields.padId};
  if(action==='proving-arm')own.session={...own.session,status:'armed'};
  if(action==='proving-launch')own.session={...own.session,status:'countdown',aim:fields.aim,launchAt:time+4000,flightEndsAt:time+12000,endsAt:time+14000};
  if(action==='proving-core-adjust'){own.containment.channels[fields.channel].value=(own.containment.channels[fields.channel].value+fields.delta+3)%3;own.containment.moves++;own.containment.lastInputAt=time;}
  return Promise.resolve(make());
 }});
 vr.receive(make(),'me');
 const ray=(id,from=camera.getWorldPosition(new THREE.Vector3()))=>{const button=vr.snapshot().buttons.find(value=>value.id===id);assert.ok(button,id+' exists on '+vr.snapshot().page);const to=vr.root.localToWorld(new THREE.Vector3(...button.position));return {origin:from,direction:to.sub(from).normalize()};};
 const click=async(id,controller='right')=>{assert.equal(vr.pointerDown(ray(id),controller),true);await turns();vr.pointerUp(controller);};
 return {vr,scene,camera,own,view:publicView,location,commands,statuses,releases,make,ray,click,open:async id=>{assert.equal(vr.setVisible(true,id),true);await turns();},setTime:value=>time=value,advance:value=>time+=value,now:()=>time,setPresenting:value=>present=value,setEnvironment:value=>currentEnvironment=value,setHeld:value=>held=value,resolve:value=>resolver(value)};
}

test('private owned models survive public snapshots; public or stale injected lists cannot become launchable inventory',async()=>{
 const f=fixture();await f.open();assert.deepEqual(f.vr.snapshot().eligibleItems.map(value=>value.id),models.map(value=>value.id));
 const publicSnapshot=f.make(false);publicSnapshot.players.me.testing.eligibleItems=[{...models[0],id:'forged'}];f.vr.receive(publicSnapshot,'me');assert.equal(f.vr.snapshot().selectedItemId,models[0].id);assert.equal(f.vr.snapshot().eligibleItems.length,2);
 assert.equal(f.vr.receive({...publicSnapshot,sequence:publicSnapshot.sequence-1,result:{testing:{eligibleItems:[{...models[0],id:'stale'}]}}},'me'),false);
 const privateSameSequence={...publicSnapshot,result:{testing:{eligibleItems:[models[1]]}}};assert.equal(f.vr.receive(privateSameSequence,'me'),true);assert.equal(f.vr.snapshot().selectedItemId,models[1].id,'same-sequence private reply follows an already projected public response');
 f.vr.receive({...f.make(false),result:{testing:{eligibleItems:[]}}},'me');assert.deepEqual(f.vr.snapshot().eligibleItems,[]);f.vr.dispose();
});

test('both controller rays perform configure/deploy/arm/launch with state and full-distance gates',async()=>{
 const f=fixture();await f.open();await f.click('configure');assert.deepEqual(f.commands.at(-1),{action:'proving-setup',itemId:'owned-training',profileId:'accuracy',targetId:'target-alpha',stationId:'proving-setup'});
 assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='deploy').enabled,false);
 Object.assign(f.location,PROVING_STATIONS.find(value=>value.kind==='pad').position);await f.click('deploy','left');assert.equal(f.commands.at(-1).padId,'proving-pad');
 f.vr.setDashboard('launch');assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='arm').enabled,false);
 Object.assign(f.location,PROVING_STATIONS.find(value=>value.kind==='control').position);await f.click('aim-x-plus','left');await f.click('aim-y-minus','right');assert.deepEqual(f.vr.snapshot().aim,{x:.1,y:-.1});
 await f.click('arm','left');await f.click('launch','right');assert.deepEqual(f.commands.at(-1),{action:'proving-launch',sessionId:'configured-test',aim:{x:.1,y:-.1},stationId:'proving-control'});
 assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='launch').enabled,false);f.vr.dispose();
});

test('a held trigger sends one command, consumes disabled and background hits, and cannot leak after pressing Hide',async()=>{
 const f=fixture({deferAction:'proving-setup'});await f.open();const controller={hand:'right'},ray=f.ray('configure');
 assert.equal(f.vr.pointerDown(ray,controller),true);assert.equal(f.vr.pointerDown(ray,controller),true);await turns();assert.equal(f.commands.filter(value=>value.action==='proving-setup').length,1);
 assert.equal(f.vr.snapshot().pending,true);assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='close').enabled,true);
 const before=f.commands.length;f.vr.pointerDown(f.ray('deploy'),'left');await turns();assert.equal(f.commands.length,before,'disabled scene controls consume the ray without another room command');
 f.vr.pointerUp('left');f.vr.pointerDown(f.ray('close'),'left');assert.equal(f.vr.visible(),false);assert.equal(f.vr.pointerDown({origin:[0,0,0],direction:[0,0,-1]},'left'),true,'closing press stays consumed until release');
 f.vr.pointerUp('left');assert.equal(f.vr.pointerDown({origin:[0,0,0],direction:[0,0,-1]},'left'),false);
 f.resolve(f.make());await turns();assert.equal(f.vr.visible(),false);f.vr.dispose();
});

test('walking between duplicate control dashboards uses the station the player is actually near',async()=>{
 const control=PROVING_STATIONS.find(value=>value.kind==='control'),first={...control,id:'testing-instance:first'},second={...control,id:'testing-instance:second',position:{x:100,y:0,z:100},testingDashboard:'telemetry'};
 const f=fixture({state:{session:{id:'deployed',status:'deployed'}},position:first.position,stations:[...PROVING_STATIONS.filter(value=>value.kind!=='control'),first,second]});await f.open(first.id);assert.equal(f.vr.snapshot().page,'launch');
 Object.assign(f.location,second.position);f.vr.tick();assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='arm').enabled,true);await f.click('arm');assert.equal(f.commands.at(-1).stationId,second.id);
 f.vr.setVisible(false);await f.open(second.id);assert.equal(f.vr.snapshot().page,'telemetry');assert.equal(testingDashboardPage({kind:'control',testingDashboard:'telemetry'}),'telemetry');
 f.vr.setDashboard('launch');f.location.y+=10;f.advance(100);f.vr.tick();assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='launch').enabled,false,'vertical separation cannot operate a dashboard');f.vr.dispose();
});

test('ticks settle active flights no more than once per 1.1 seconds without intervals or repeated status announcements',async()=>{
 const session={id:'flight',status:'flight',profileId:'accuracy',launchAt:9000,flightEndsAt:17000,endsAt:19000},f=fixture({state:{session}});await f.open();const count=()=>f.commands.filter(value=>value.action==='proving-status').length;
 assert.equal(count(),1);f.setTime(11099);f.vr.tick();await turns();assert.equal(count(),1);f.setTime(11100);f.vr.tick();await turns();assert.equal(count(),2);f.vr.tick();await turns();assert.equal(count(),2);
 assert.deepEqual(f.statuses,[],'successful automatic status polls never repeat spoken messages');f.vr.setVisible(false);f.setTime(30000);f.vr.tick();await turns();assert.equal(count(),2);f.vr.dispose();
});

test('late action replies cannot cross a reset, changed player or changed map',async()=>{
 for(const reason of ['reset','map','player']){const f=fixture({deferAction:'proving-setup'});await f.open();f.vr.pointerDown(f.ray('configure'),'right');await turns();
  if(reason==='reset')f.vr.reset();else if(reason==='map'){f.setEnvironment({id:'ordinary-world'});f.vr.tick();}else{const replacement=f.make(false);replacement.players.other=replacement.players.me;delete replacement.players.me;replacement.selfId='other';f.vr.receive(replacement,'other');}
  f.resolve(f.make());await turns();assert.equal(f.vr.snapshot().pending,false);assert.equal(f.vr.snapshot().session,null);assert.deepEqual(f.statuses,[]);f.vr.dispose();
 }
});

test('the board anchors near eye height, retains tracked parallax, recenters explicitly, and releases GPU resources',async()=>{
 const f=fixture();await f.open();const before=f.vr.snapshot(),head=f.camera.position.clone(),quaternion=f.camera.quaternion.clone();assert.ok(new THREE.Vector3(...before.position).distanceTo(head)>1&&new THREE.Vector3(...before.position).distanceTo(head)<2);
 f.camera.position.x+=.3;f.camera.rotation.set(.1,.4,.02);const leaned=f.camera.position.clone(),turned=f.camera.quaternion.clone();f.vr.tick();assert.deepEqual(f.vr.snapshot().position,before.position);assert.ok(f.camera.position.equals(leaned));assert.ok(f.camera.quaternion.equals(turned));assert.ok(quaternion.angleTo(turned)>.1);
 f.vr.recenter();assert.notDeepEqual(f.vr.snapshot().position,before.position);assert.ok(f.camera.position.equals(leaned));assert.ok(f.camera.quaternion.equals(turned));
 f.setPresenting(false);f.vr.tick();assert.equal(f.vr.visible(),false);let released=0;f.vr.root.traverse(object=>{object.geometry?.addEventListener('dispose',()=>released++);object.material?.addEventListener('dispose',()=>released++);object.material?.map?.addEventListener('dispose',()=>released++);});f.vr.dispose();assert.equal(released,3);assert.equal(f.scene.getObjectByName('ATLAS_FACTORY_TESTING_VR'),undefined);
});

test('compound scene controls adjust real symbolic channels and only unlock the correct deep-access scope',async()=>{
 const puzzle={id:'core',environmentId:COMPOUND_ID,status:'active',startedAt:5000,lastInputAt:null,moves:0,channels:{coolant:{value:1,target:0},shield:{value:1,target:0},power:{value:1,target:0}}};
 const f=fixture({environment:{id:COMPOUND_ID},state:{clearance:{compound:true,deep:false},containment:puzzle}});await f.open();assert.equal(f.vr.snapshot().page,'compound');assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='core-confirm').enabled,false);
 for(const channel of ['coolant','shield','power']){await f.click('channel-'+channel+'-minus');f.advance(200);f.vr.tick();}
 assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='core-confirm').enabled,true);await f.click('core-confirm');assert.deepEqual(f.commands.at(-1),{action:'proving-core-confirm',puzzleId:'core',stationId:'compound-containment'});
 Object.assign(f.location,COMPOUND_STATIONS.find(value=>value.kind==='deep-hatch').position);f.vr.tick();assert.equal(f.vr.snapshot().buttons.find(value=>value.id==='deep-enter').enabled,false);
 f.own.clearance.deep=true;f.vr.receive(f.make(),'me');await f.click('deep-enter');assert.deepEqual(f.commands.at(-1),{action:'proving-deep-enter',stationId:'compound-deep-hatch'});f.vr.dispose();
 const custom=fixture({environment:{id:'custom-compound',factoryTesting:{kind:'compound'}},position:COMPOUND_STATIONS[2].position,state:{containment:{...puzzle,status:'solved',environmentId:'different-map'}}});await custom.open();assert.equal(custom.vr.snapshot().buttons.find(value=>value.id==='deep-enter').enabled,false);custom.own.containment.environmentId='custom-compound';custom.vr.receive(custom.make(),'me');assert.equal(custom.vr.snapshot().buttons.find(value=>value.id==='deep-enter').enabled,true);custom.vr.dispose();
});

test('CanvasTexture dashboards render vector telemetry, occupancy, records and badges without HTML controls',async()=>{
 const recorder=canvasRecorder(),f=fixture({canvas:recorder.canvas,state:{session:{id:'test',itemName:'Training model',profileId:'accuracy',status:'flight',launchAt:9000,flightEndsAt:17000,endsAt:19000},progress:{completedTests:2,bestScores:{accuracy:100,cargo:90},skills:{accuracy:1,cargo:1},badges:['Range Operator']}}});
 f.view.sessions=[{playerId:'operator',name:'Mara',session:{id:'other',status:'armed',padId:'proving-pad'}}];await f.open();f.vr.setDashboard('telemetry');assert.ok(f.vr.snapshot().padStatus.includes('Mara'));assert.ok(f.vr.snapshot().record.includes('Range Operator'));assert.ok(recorder.calls.some(value=>value.method==='quadraticCurveTo'));assert.ok(recorder.calls.some(value=>value.method==='arc'));
 assert.ok(f.vr.root.getObjectByName('FACTORY_TESTING_VR_DASHBOARD').material.map.isCanvasTexture);const draws=f.vr.snapshot().drawCount;f.vr.tick();assert.equal(f.vr.snapshot().drawCount,draws);f.advance(200);f.vr.tick();assert.ok(f.vr.snapshot().drawCount>draws);f.vr.dispose();
});

test('cleared station lists, unsupported maps and a missing headset cannot expose a live dashboard',async()=>{
 const f=fixture();await f.open();f.view.stations=[];f.vr.receive(f.make(),'me');assert.equal(f.vr.isActive(),false);assert.equal(f.vr.visible(),false);assert.equal(f.vr.setVisible(true),false);f.vr.dispose();
 const ordinary=fixture();ordinary.setEnvironment({id:'ordinary-world'});assert.equal(ordinary.vr.isActive(),false);assert.equal(ordinary.vr.setVisible(true),false);ordinary.vr.dispose();
 const desktop=fixture({presenting:false});assert.equal(desktop.vr.setVisible(true),false);assert.equal(desktop.vr.pointerMove({origin:[0,0,0],direction:[0,0,-1]}),false);desktop.vr.dispose();
});
