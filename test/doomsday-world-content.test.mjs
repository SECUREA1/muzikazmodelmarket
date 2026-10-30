import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {airportWorld} from '../airport-world.mjs';
import {DOOMSDAY_MODEL_INFO,DOOMSDAY_AIRCRAFT_IDS,doomsdayForEnvironment} from '../public/js/doomsday-config.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {nativeBuilderItem} from '../public/js/native-builder-items.js';
import {armedAircraft,aircraftType} from '../public/js/aircraft-types.js';
import {stepAircraftFlight} from '../public/js/aircraft-flight.js';
import {startAircraftAssist,aircraftAssistedInput} from '../server-aircraft-access.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('emergency assets are reusable native models with live, unarmed aircraft rigs and catalog artwork',async()=>{
 for(const id of Object.keys(DOOMSDAY_MODEL_INFO)){
  const root=createBuilderModel(id),item=nativeBuilderItem(id);
  assert.equal(root.userData.modelId,id);assert.equal(root.userData.doomsdayModel,true);assert.ok(item);
  assert.match(await readFile(new URL('..'+item.thumbnailUrl,import.meta.url),'utf8'),/<title>/);
  root.traverse(node=>{for(const value of node.geometry?.attributes?.position?.array||[])assert.ok(Number.isFinite(value),id);});
  if(DOOMSDAY_AIRCRAFT_IDS.includes(id)){
   assert.equal(armedAircraft({modelId:id}),false);assert.equal(root.userData.aircraftModel,true);
   assert.deepEqual(root.userData.cockpitPose.position,aircraftType({modelId:id}).eye);assert.ok(root.userData.aircraftRig.propeller);
   assert.equal(item.behavior,'vehicle');assert.equal(item.vehicleSettings.mode,'fly');
  }
  root.traverse(node=>{node.geometry?.dispose();for(const mat of Array.isArray(node.material)?node.material:[node.material])mat?.dispose();});
 }
});

test('airport emergency response sites have supported ground and a traversable shelter entrance',()=>{
 const environment=airportWorld(),collision=new ServerBuilderCollision(),config=doomsdayForEnvironment(environment);
 assert.equal(config.objectives.length,3);
 for(const objective of config.objectives){const floor=collision.groundAt(environment,objective.position);assert.ok(floor,objective.id+' has a collision-supported destination');}
 let position=collision.safeSpawn(environment,{x:-150,y:0,z:37});
 while(position.z>32.5){const next=collision.resolve(environment,position,{...position,z:position.z-.2},{});assert.ok(position.z-next.z>.1,'shelter entrance stays open');position=next;}
 assert.ok(position.y>.1,'shelter floor supports the visitor');
 const command=createBuilderModel('doomsday-command-aircraft');assert.ok(command.getObjectByName('CONTINUITY_COMMUNICATIONS_DOME'));
 const rescue=createBuilderModel('doomsday-evacuation-aircraft');assert.ok(rescue.getObjectByName('FIRST_AID_CARGO'));
});

test('generic response sites follow nested and transformed arrivals without rewriting authored sites',()=>{
 const nested=doomsdayForEnvironment({id:'glb',playableSize:200,spawn:{position:{x:20,y:9,z:-20}}});
 assert.deepEqual(nested.objectives[0].position,{x:14,y:9,z:-20});
 const external=doomsdayForEnvironment({id:'external',spawn:{x:900,y:21,z:850}});assert.deepEqual(external.objectives[0].position,{x:894,y:21,z:850},'model arrivals are not clamped to an unrelated procedural floor');
 const aligned=doomsdayForEnvironment({id:'aligned',builderScene:{mapSize:200,baseEnvironment:{modelUrl:'/example.glb',spawn:{x:10,y:2,z:4}},baseTransform:{x:20,y:3,z:30,scale:2,rotation:90}}});
 assert.ok(Math.abs(aligned.objectives[0].position.x-22)<.001);assert.equal(aligned.objectives[0].position.y,7);assert.ok(Math.abs(aligned.objectives[0].position.z-10)<.001);
 const explicit=doomsdayForEnvironment({doomsday:{objectives:[{id:'shelter',position:{x:600,y:13,z:-500}}]}});
 assert.deepEqual(explicit.objectives[0].position,{x:600,y:13,z:-500});
});

test('command and evacuation aircraft take off with the same public runway assistance as the touring fleet',()=>{
 for(const modelId of DOOMSDAY_AIRCRAFT_IDS){
  const plane={id:'plane',modelId,active:true,health:400,holderId:'pilot',position:{x:-12,y:.4,z:110},rotation:{x:0,y:0,z:0},flight:{}},player={actorId:'pilot',vehicleId:'plane',position:{...plane.position},input:{}},sim={actors:{plane},players:{pilot:player},airport:{}},world=airportWorld();
  startAircraftAssist(sim,player,world,'takeoff',1000);
  for(let now=1050;now<21000&&plane.flight.assist;now+=50)Object.assign(plane,stepAircraftFlight(plane,aircraftAssistedInput(plane,{},world,now),.05,{ground:.4,half:1000,cleared:true}));
  assert.equal(plane.flight.assist,null,modelId+' completes automatic takeoff');assert.ok(plane.flight.altitude>=14);assert.equal(plane.flight.gear,true);
 }
});

test('both emergency aircraft can be selected and entered through authoritative public map access',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'emergency-fleet-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const environment=airportWorld(),runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,'rooms.json')),now:()=>100000}),identity={accountId:'emergency-pilot',username:'Emergency Pilot'};let count=0;
 const send=(action,extra={})=>runtime.command(environment.id,environment,identity,{action,requestId:'emergency-'+ ++count,...extra});
 await send('join');
 for(const id of ['airport-command-flight','airport-evacuation-flight']){
  const snapshot=await send('map-access',{entityId:id});
  assert.equal(snapshot.players['account:emergency-pilot'].vehicleId,id);
  assert.equal(snapshot.actors[id].holderId,'account:emergency-pilot');
  await assert.rejects(send('fire',{tool:'laser',direction:[0,0,-1]}),/unarmed/);
 }
});
