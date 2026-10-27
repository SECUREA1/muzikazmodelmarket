import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFunhouseVR} from '../public/js/funhouse-vr.js';
import {FUNHOUSE_STATIONS} from '../public/js/clown-funhouse-config.js';

const turns=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(kind='water',{state={},defer=false,reducedMotion=false,roots=[]}={}){
 const station=FUNHOUSE_STATIONS.find(station=>station.kind===kind),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 let presenting=true,sequence=1,resolve;
 const position={...station.position},commands=[],statuses=[];camera.position.set(position.x,position.y+1.6,position.z);scene.add(camera);
 const snapshot=(data=state)=>({sequence:sequence++,selfId:'me',serverTime:Date.now(),players:{me:{position:{...position},funhouse:{stamps:[],costume:{hat:false,shoes:false},...data}}}});
 const vr=createFunhouseVR({scene,camera,getEnvironment:()=>({id:'muzikaz-clown-funhouse'}),getPosition:()=>position,getRoots:()=>roots,getPresenting:()=>presenting,getReducedMotion:()=>reducedMotion,createCanvas:()=>null,onStatus:message=>statuses.push(message),send:(action,fields)=>{commands.push({action,...fields});return defer?new Promise(done=>resolve=done):Promise.resolve(snapshot(state));}});
 vr.update(snapshot(state),'me');
 const rayToButton=id=>{const button=vr.snapshot().buttons.find(button=>button.id===id);assert.ok(button,id+' exists');const point=vr.root.localToWorld(new THREE.Vector3(...button.position)),origin=camera.getWorldPosition(new THREE.Vector3());return {origin,direction:point.sub(origin).normalize()};};
 return {vr,station,scene,camera,position,commands,statuses,snapshot,rayToButton,resolve:value=>resolve(value),setPresenting:value=>presenting=value};
}

test('the immersive board selects real controls by either controller ray and consumes a held trigger once',async()=>{
 const f=fixture('water',{defer:true}),controller={hand:'right'};f.vr.setVisible(true);
 const ray=f.rayToButton('water-start');assert.equal(f.vr.pointerDown(ray,controller),true);assert.equal(f.vr.pointerDown(ray,controller),true);await turns();
 assert.equal(f.commands.length,1);assert.deepEqual(f.commands[0],{action:'funhouse-start',stationId:f.station.id});
 assert.equal(f.vr.snapshot().buttons.find(button=>button.id==='close').enabled,true,'the player can close the board during a slow reply');
 f.resolve(f.snapshot({round:{id:'round',stationId:f.station.id,status:'active',endsAt:Date.now()+30000,targetId:2,score:0}}));await turns();
 assert.equal(f.vr.snapshot().pending,false);assert.equal(f.vr.snapshot().buttons.find(button=>button.id==='water-2').enabled,true);
 f.vr.pointerUp(controller);f.vr.dispose();
});

test('a ride request completed after leaving immersive mode safely releases the late seat',async()=>{
 const f=fixture('car',{defer:true});
 const started=f.vr.menuItems().find(item=>item.label==='Board the clown car').run();await turns();
 f.setPresenting(false);
 f.resolve(f.snapshot({ride:{id:'late-seat',kind:'car',stationId:f.station.id,status:'active',endsAt:Date.now()+20000}}));await turns();
 assert.deepEqual(f.commands.at(-1),{action:'funhouse-ride-exit',rideId:'late-seat'});
 f.resolve(f.snapshot({ride:{id:'late-seat',kind:'car',stationId:f.station.id,status:'cancelled'}}));await started;
 assert.equal(f.vr.snapshot().ride.status,'cancelled');assert.equal(f.vr.snapshot().visible,false);f.vr.dispose();
});

test('duplicate snapshots cannot rewind the attraction clock or replace a newer cue',()=>{
 const f=fixture('car'),snapshot=f.snapshot({ride:{id:'seat',stationId:f.station.id,kind:'car',status:'active',endsAt:Date.now()+20000,nextCueAt:Date.now()+4000,score:10}});
 assert.equal(f.vr.update(snapshot,'me'),true);
 assert.equal(f.vr.update({...snapshot,serverTime:snapshot.serverTime-9000,players:{me:{funhouse:{ride:{...snapshot.players.me.funhouse.ride,score:0}}}}},'me'),false);
 assert.equal(f.vr.snapshot().ride.score,10);f.vr.dispose();
});

test('every funhouse experience exposes its actual action through the headset menu',async()=>{
 for(const [kind,label,action,extra]of [
  ['water','Start water-gun round','funhouse-start',{}],
  ['car','Board the clown car','funhouse-ride',{}],
  ['spinner','Sit on the dizzy spinner','funhouse-ride',{}],
  ['dressup','Wear propeller hat','funhouse-dress',{hat:true,shoes:false}],
  ['jackbox','Start the fright-box challenge','funhouse-challenge',{}],
  ['ballpit','Start the monster toss game','funhouse-challenge',{}],
  ['mirrors','Start the mirror maze','funhouse-challenge',{}],
  ['maze-finish','Ring the maze exit bell','funhouse-use',{}],
  ['welcome','Hear the attraction guide','funhouse-use',{}]
 ]){
  const f=fixture(kind),item=f.vr.menuItems().find(item=>item.label===label);assert.ok(item,kind+' has a headset control');await item.run();
  assert.deepEqual(f.commands,[{action,stationId:f.station.id,...extra}]);f.vr.dispose();
 }
});

test('walking between attractions replaces completed station controls with the nearby experience',async()=>{
 const f=fixture('water');await f.vr.menuItems().find(item=>item.label==='Start water-gun round').run();
 Object.assign(f.position,FUNHOUSE_STATIONS.find(station=>station.kind==='spinner').position);f.vr.update(f.snapshot(),'me');f.vr.setVisible(true);
 assert.equal(f.vr.snapshot().kind,'spinner');assert.ok(f.vr.menuItems().some(item=>item.label==='Sit on the dizzy spinner'));f.vr.dispose();
});

test('world-space water misses are real shots in desktop first person, independent of VR panel visibility',async()=>{
 const station=FUNHOUSE_STATIONS.find(station=>station.kind==='water'),f=fixture('water',{state:{round:{id:'aim-round',stationId:station.id,status:'active',endsAt:Date.now()+30000,targetId:0,score:0}}});
 f.setPresenting(false);
 const ray={origin:new THREE.Vector3(-30,1.65,12),direction:new THREE.Vector3(0,1,0)};
 assert.equal(f.vr.worldTrigger(ray),true);await turns();
 assert.deepEqual(f.commands,[{action:'funhouse-squirt',roundId:'aim-round',targetId:-1,origin:{x:-30,y:1.65,z:12},direction:[0,1,0]}]);
 assert.equal(f.vr.setVisible(true),false);f.vr.dispose();
});

test('active aiming ignores nearby start controls and selects the physical gallery target',async()=>{
 const station=FUNHOUSE_STATIONS.find(station=>station.kind==='water'),root=new THREE.Group(),start=new THREE.Group(),target=new THREE.Group();
 start.position.set(-30,1.65,10);target.position.set(-30,1.65,6);root.add(start,target);
 root.userData.funhouseInteractionTargets=[{stationId:station.id,kind:'water',operation:'start',root:start,radius:.4},{stationId:station.id,kind:'water',operation:'squirt',targetId:2,root:target,radius:.4}];
 const f=fixture('water',{roots:[root],state:{round:{id:'aim-round',stationId:station.id,status:'active',endsAt:Date.now()+30000,targetId:2,score:0}}});
 assert.equal(f.vr.worldTrigger({origin:[-30,1.65,12],direction:[0,0,-1]}),true);await turns();
 assert.equal(f.commands[0].targetId,2);f.vr.dispose();
});

test('authoritative moved and disabled equipment closes stale controls before the shared actor cache updates',()=>{
 const equipment={id:'placed-gallery',position:{x:2,y:0,z:0},functionalSettings:{funhouseStation:'water'}},environment={id:'funhouse-copy',builderScene:{objects:[equipment]}},scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 camera.position.set(2,1.65,0);scene.add(camera);
 const vr=createFunhouseVR({scene,camera,createCanvas:()=>null,getEnvironment:()=>environment,getPosition:()=>equipment.position,getActors:()=>({[equipment.id]:equipment})});
 const snapshot=(sequence,actor)=>({sequence,selfId:'me',actors:{[equipment.id]:actor},players:{me:{position:equipment.position,funhouse:{}}}});
 vr.update(snapshot(1,equipment),'me');vr.setVisible(true);assert.equal(vr.snapshot().visible,true);
 vr.update(snapshot(2,{...equipment,position:{x:200,y:0,z:0}}),'me');assert.equal(vr.snapshot().visible,false);assert.equal(vr.isActive(),false,'a distant portable attraction leaves other game controls available');
 vr.update(snapshot(3,{...equipment,deleted:true}),'me');assert.equal(vr.isActive(),false);assert.equal(vr.snapshot().stationId,null);vr.dispose();
});

test('the anchored board retains real head parallax, recenters on request and releases on session exit',()=>{
 const f=fixture();f.vr.setVisible(true);const anchored=f.vr.snapshot().position;
 f.camera.position.x+=2;f.vr.tick();assert.deepEqual(f.vr.snapshot().position,anchored);
 f.vr.menuItems().find(item=>item.label==='Recenter attraction board').run();assert.ok(f.vr.snapshot().position[0]>anchored[0]+1.9);
 f.setPresenting(false);f.vr.tick();assert.equal(f.vr.snapshot().visible,false);
 assert.equal(f.vr.pointerDown({origin:[0,0,0],direction:[0,0,-1]}),false);f.vr.dispose();
});

test('reset invalidates pending actions without reopening a stale board or replacing current state',async()=>{
 const f=fixture('water',{defer:true});f.vr.setVisible(true);void f.vr.menuItems().find(item=>item.label==='Start water-gun round').run();await turns();
 f.vr.reset();f.resolve(f.snapshot({round:{id:'old',status:'active'},message:'Obsolete reply'}));await turns();
 assert.equal(f.vr.snapshot().visible,false);assert.equal(f.vr.snapshot().pending,false);assert.equal(f.vr.snapshot().round,null);assert.deepEqual(f.statuses,[]);f.vr.dispose();
});

test('ride stop controls and ball colors match the server contract while comfort mode stays gentle',async()=>{
 const station=FUNHOUSE_STATIONS.find(station=>station.kind==='spinner'),f=fixture('spinner',{state:{ride:{id:'ride',kind:'spinner',stationId:station.id,status:'active',endsAt:Date.now()+15000,targetId:0,gentle:true}},reducedMotion:true});
 f.vr.setVisible(true);assert.equal(f.vr.snapshot().buttons.find(button=>button.id==='gentle').enabled,false);
 await f.vr.menuItems().find(item=>item.label==='Stop ride and step off').run();assert.deepEqual(f.commands,[{action:'funhouse-ride-exit',rideId:'ride'}]);f.vr.dispose();
 const pit=FUNHOUSE_STATIONS.find(station=>station.kind==='ballpit'),balls=fixture('ballpit',{state:{challenge:{id:'balls',kind:'ballpit',stationId:pit.id,status:'active',endsAt:Date.now()+20000,targetId:1,score:0}}});
 const actions=balls.vr.menuItems();assert.ok(actions.some(item=>item.label==='● Toss at Gold'));assert.ok(actions.some(item=>item.label==='Toss at Cyan'));
 await actions.find(item=>item.label==='● Toss at Gold').run();assert.deepEqual(balls.commands[0],{action:'funhouse-action',stationId:pit.id,operation:'toss',targetId:1});balls.vr.dispose();
});
