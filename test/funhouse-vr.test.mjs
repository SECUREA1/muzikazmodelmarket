import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createFunhouseVR} from '../public/js/funhouse-vr.js';
import {FUNHOUSE_STATIONS} from '../public/js/clown-funhouse-config.js';
import {FUNHOUSE_ADVENTURE_START,FUNHOUSE_ADVENTURE_CLUES} from '../public/js/funhouse-adventure-rules.js';
import {funhouseRidePose} from '../public/js/funhouse-experience-rules.js';

const turns=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture(kind='water',{state={},defer=false,reducedMotion=false,roots=[],audioSettings={},audioPreferences={},audioCaption=null}={}){
 const station=FUNHOUSE_STATIONS.find(station=>station.kind===kind),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 let presenting=true,sequence=1,resolve;
 const position={...station.position},commands=[],statuses=[],audioChanges=[],audioCalls={replay:0,preview:0};camera.position.set(position.x,position.y+1.6,position.z);scene.add(camera);
 const snapshot=(data=state)=>({sequence:sequence++,selfId:'me',serverTime:Date.now(),players:{me:{position:{...position},funhouse:{stamps:[],costume:{hat:false,shoes:false},...data}}}});
 const vr=createFunhouseVR({getAudioSettings:()=>audioSettings,getAudioPreferences:()=>audioPreferences,getAudioCaption:()=>audioCaption,onAudioSettings:patch=>{audioChanges.push(patch);Object.assign(audioSettings,patch);},onReplayClown:()=>audioCalls.replay++,onPreviewMusic:()=>audioCalls.preview++,scene,camera,getEnvironment:()=>({id:'muzikaz-clown-funhouse'}),getPosition:()=>position,getRoots:()=>roots,getPresenting:()=>presenting,getReducedMotion:()=>reducedMotion,createCanvas:()=>null,onStatus:message=>statuses.push(message),send:(action,fields)=>{commands.push({action,...fields});return defer?new Promise(done=>resolve=done):Promise.resolve(snapshot(state));}});
 vr.update(snapshot(state),'me');
 const rayToButton=id=>{const button=vr.snapshot().buttons.find(button=>button.id===id);assert.ok(button,id+' exists');const point=vr.root.localToWorld(new THREE.Vector3(...button.position)),origin=camera.getWorldPosition(new THREE.Vector3());return {origin,direction:point.sub(origin).normalize()};};
 return {vr,station,scene,camera,position,commands,statuses,snapshot,rayToButton,audioSettings,audioPreferences,audioChanges,audioCalls,setAudioCaption:value=>audioCaption=value,resolve:value=>resolve(value),setPresenting:value=>presenting=value};
}

async function audioButton(f,id){
 for(let page=0;page<4;page++){
  const button=f.vr.snapshot().buttons.find(button=>button.id===id);
  if(button){const ray=f.rayToButton(id);f.vr.pointerUp('audio');assert.equal(f.vr.pointerDown(ray,'audio'),true);await turns();return button;}
  assert.ok(f.vr.snapshot().buttons.some(button=>button.id==='next-actions'),id+' is available on an audio page');
  f.vr.pointerUp('audio');f.vr.pointerDown(f.rayToButton('next-actions'),'audio');await turns();
 }
 assert.fail(id+' was not reachable');
}

test('headset sound settings are real paginated controls and held triggers never repeat a mix change',async()=>{
 const f=fixture('welcome');f.vr.menuItems().find(item=>item.label==='Clown voices, sounds & music').run();
 assert.equal(f.vr.snapshot().mode,'audio');assert.equal(f.vr.snapshot().audioSettings.musicVolume,35);
 const ray=f.rayToButton('audio-music-mute');f.vr.pointerDown(ray,'audio');f.vr.pointerDown(ray,'audio');await turns();
 assert.equal(f.audioChanges.length,1);assert.deepEqual(f.audioChanges[0],{musicMuted:true});
 await audioButton(f,'audio-music-up');assert.equal(f.audioSettings.musicVolume,45);
 await audioButton(f,'audio-effects-down');assert.equal(f.audioSettings.effectsVolume,55);
 assert.equal(f.commands.length,0,'sound controls never issue gameplay or wallet commands');
 assert.ok(f.vr.snapshot().buttons.some(button=>button.id==='close'));f.vr.dispose();
});

test('headset replay and music previews obey category mutes while expired captions leave replay available',async()=>{
 const f=fixture('welcome',{audioCaption:{text:'Your shadow arrived early.',speaker:'The Ringmaster',expiresAt:Date.now()+5000}});
 f.vr.showAudio();assert.equal(f.vr.snapshot().audioCaption.speaker,'The Ringmaster');
 await audioButton(f,'audio-replay');assert.equal(f.audioCalls.replay,1);
 await audioButton(f,'audio-preview');assert.equal(f.audioCalls.preview,1);
 f.audioPreferences.masterMuted=true;f.vr.showAudio();
 assert.equal((await audioButton(f,'audio-replay')).enabled,false);assert.equal(f.audioCalls.replay,1);
 assert.equal((await audioButton(f,'audio-preview')).enabled,false);assert.equal(f.audioCalls.preview,1);
 f.audioPreferences.masterMuted=false;f.audioPreferences.dialogueMuted=true;f.vr.showAudio();
 assert.equal((await audioButton(f,'audio-replay')).enabled,false);
 assert.equal((await audioButton(f,'audio-preview')).enabled,true);assert.equal(f.audioCalls.preview,2);
 f.audioPreferences.dialogueMuted=false;f.setAudioCaption({text:'An old joke.',speaker:'Driver',expiresAt:Date.now()-1});f.vr.showAudio();
 assert.equal(f.vr.snapshot().audioCaption,null);assert.equal((await audioButton(f,'audio-replay')).enabled,true);assert.equal(f.audioCalls.replay,2);f.vr.dispose();
});

test('the real scene-board drawing includes the clown speaker and line even when voices are muted',()=>{
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),drawn=[];
 const ink={clearRect(){},fillRect(){},strokeRect(){},fillText:value=>drawn.push(value),measureText:value=>({width:String(value).length*10})};
 const canvas={width:0,height:0,getContext:()=>ink},caption={speaker:'The Ringmaster',text:'Your shadow arrived early. It saved you a seat.',expiresAt:Date.now()+6000};
 scene.add(camera);camera.position.set(0,1.65,40);
 const vr=createFunhouseVR({scene,camera,createCanvas:()=>canvas,getEnvironment:()=>({id:'muzikaz-clown-funhouse'}),getPosition:()=>({x:0,y:.02,z:40}),getAudioCaption:()=>caption,getAudioPreferences:()=>({masterMuted:true})});
 vr.showAudio();assert.ok(drawn.includes(caption.speaker));assert.ok(drawn.includes(caption.text));vr.dispose();
});

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

test('boarding and exiting reanchor controls once after the tracked head reaches the new pose',()=>{
 const f=fixture('car');f.vr.setVisible(true);const approach=f.vr.snapshot().position;
 const pose={position:{x:27.35,y:.6,z:25.55},exitPosition:{...f.position}};
 f.vr.update(f.snapshot({ride:{id:'boarded',kind:'car',stationId:f.station.id,status:'active',endsAt:Date.now()+20000,pose}}),'me');
 f.vr.tick();assert.deepEqual(f.vr.snapshot().position,approach,'the panel must wait for actual tracked arrival');
 f.camera.position.set(pose.position.x,pose.position.y+1.15,pose.position.z);f.vr.tick();
 const seated=f.vr.snapshot().position;assert.ok(Math.hypot(seated[0]-approach[0],seated[2]-approach[2])>2);
 f.camera.position.x+=.35;f.vr.tick();assert.deepEqual(f.vr.snapshot().position,seated,'ordinary head parallax must not drag the panel');
 f.vr.update(f.snapshot({ride:{id:'boarded',kind:'car',stationId:f.station.id,status:'cancelled',pose}}),'me');
 f.camera.position.set(f.position.x,f.position.y+1.65,f.position.z);f.vr.tick();
 assert.ok(Math.hypot(f.vr.snapshot().position[0]-seated[0],f.vr.snapshot().position[2]-seated[2])>2);f.vr.dispose();
});

test('the board travels with the physical spinner seat through snapshots without following head motion',()=>{
 const originalNow=Date.now;let clock=100000;Date.now=()=>clock;
 try{
  const station=FUNHOUSE_STATIONS.find(station=>station.kind==='spinner'),ride={id:'spinning',kind:'spinner',stationId:station.id,status:'active',startedAt:clock,endsAt:clock+15000,durationMs:15000,gentle:true};
  ride.pose=funhouseRidePose(ride,station,clock);
  const f=fixture('spinner',{state:{ride}});f.camera.position.set(ride.pose.position.x,ride.pose.position.y+1.15,ride.pose.position.z);f.vr.setVisible(true);f.vr.tick();
  const offset=f.vr.snapshot().position.map((value,index)=>value-[ride.pose.position.x,ride.pose.position.y,ride.pose.position.z][index]);
  for(let index=0;index<6;index++){
   clock+=800;const pose=funhouseRidePose(ride,station,clock);
   f.camera.position.set(pose.position.x,pose.position.y+1.15,pose.position.z);f.vr.update(f.snapshot({ride:{...ride,pose}}),'me');f.vr.tick();
   f.vr.snapshot().position.forEach((value,axis)=>assert.ok(Math.abs(value-[pose.position.x,pose.position.y,pose.position.z][axis]-offset[axis])<1e-7));
  }
  const anchored=f.vr.snapshot().position;f.camera.position.x+=.4;f.vr.tick();assert.deepEqual(f.vr.snapshot().position,anchored,'leaning the headset retains physical parallax');
  clock+=100;const between=funhouseRidePose(ride,station,clock);f.vr.tick();
  f.vr.snapshot().position.forEach((value,axis)=>assert.ok(Math.abs(value-[between.position.x,between.position.y,between.position.z][axis]-offset[axis])<1e-7,'seat transport stays smooth between network snapshots'));
  f.vr.dispose();
 }finally{Date.now=originalNow;}
});

test('all target controls remain reachable through board pages and the car has comfort controls',async()=>{
 const station=FUNHOUSE_STATIONS.find(station=>station.kind==='water'),f=fixture('water',{state:{round:{id:'round',stationId:station.id,status:'active',endsAt:Date.now()+30000,targetId:5}}});
 f.vr.setVisible(true);assert.ok(f.vr.snapshot().buttons.some(button=>button.id==='close'));
 f.vr.pointerDown(f.rayToButton('next-actions'),'right');await turns();f.vr.pointerUp('right');
 assert.ok(f.vr.snapshot().buttons.some(button=>button.id==='water-5'));assert.ok(f.vr.snapshot().buttons.some(button=>button.id==='water-stop'));assert.ok(f.vr.snapshot().buttons.some(button=>button.id==='close'));f.vr.dispose();
 const car=FUNHOUSE_STATIONS.find(station=>station.kind==='car'),rider=fixture('car',{state:{ride:{id:'car',kind:'car',stationId:car.id,status:'active',endsAt:Date.now()+20000,gentle:true}}});
 rider.vr.setVisible(true);assert.ok(rider.vr.snapshot().buttons.some(button=>button.id==='gentle'));await rider.vr.menuItems().find(item=>item.id==='funhouse:gentle').run();assert.equal(rider.commands[0].operation,'gentle');rider.vr.dispose();
});

test('physical discoveries work far from attraction stations and trail stop preserves a ride',async()=>{
 const clue=FUNHOUSE_ADVENTURE_CLUES[0],root=new THREE.Group(),token=new THREE.Group();token.position.set(clue.position.x,1.5,clue.position.z-1);root.add(token);root.userData.funhouseInteractionTargets=[{kind:'adventure',operation:'inspect',clueId:clue.id,root:token,radius:.5}];
 const f=fixture('welcome',{roots:[root],state:{adventure:{id:'trail',status:'active',startedAt:Date.now(),endsAt:Date.now()+600000,clueIndex:0,found:[]}}});
 Object.assign(f.position,clue.position);f.camera.position.set(f.position.x,1.5,f.position.z);
 assert.equal(f.vr.worldTrigger({origin:f.camera.position,direction:[0,0,-1]}),true);await turns();
 assert.equal(f.commands[0].action,'funhouse-adventure');assert.equal(f.commands[0].clueId,clue.id);
 f.vr.setVisible(true);assert.equal(f.vr.snapshot().mode,'adventure');assert.ok(f.vr.snapshot().buttons.some(button=>button.id==='adventure-stop'));
 await f.vr.menuItems().find(item=>item.id==='funhouse:adventure-stop').run();assert.deepEqual(f.commands[1],{action:'funhouse-adventure',operation:'stop',adventureId:'trail'});f.vr.dispose();
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
