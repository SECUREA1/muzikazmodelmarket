import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {constructionWorld} from '../construction-world.mjs';
import {stepConstructionCrew} from '../server-construction-crew.mjs';
import {stepConstruction,constructionCrewSetOperator} from '../server-construction.mjs';
import {earthworksTake} from '../public/js/construction-earthworks.js';

test('a reversing loaded truck follows the native outer-haul corner without cutting through the gravel survey post',()=>{
 let now=1000;const environment=constructionWorld(),runtime=new AuthoritativeRooms({store:{},now:()=>now}),room={objects:{}},sim=runtime.initialize(room,environment).sim,crew=sim.construction.crew,worker=crew.workers.find(worker=>worker.id==='crew-jules'),truck=sim.actors['construction-truck'],context=runtime.constructionContext(sim,environment,room.objects);
 // This is the actual end-of-eastbound checkpoint: an articulated truck
 // reverses east, then continues south along the authored x=145 haul lane.
 truck.position={x:142,y:.022,z:52};truck.rotation.y=Math.PI/2;truck.driving={speed:-2,parked:false};truck.construction.cargo=earthworksTake(sim.construction.earthworks,{x:25,y:0,z:17},2,{cutY:-8});truck.construction.load=truck.construction.cargo.soil+truck.construction.cargo.gravel;
 crew.enabled=true;for(const member of crew.workers)member.enabled=member===worker;
 Object.assign(worker,{machineId:truck.id,jobId:'haul',phase:'haul-out',state:'operating',travelReverse:true,driveRouteKey:'haul:haul-out',driveRoute:[{x:145,y:0,z:108}],driveIndex:0});constructionCrewSetOperator(sim,truck.id,worker.id,now);
 let moved=0;for(let index=0;index<240&&truck.position.z<88;index++){
  now+=250;const before={...truck.position};stepConstructionCrew(sim,now,.25,context);
  assert.equal(truck.driving.blocked,false,JSON.stringify(truck.construction.blocked));
  stepConstruction(sim,now,.25,context);const distance=Math.hypot(truck.position.x-before.x,truck.position.z-before.z);assert.ok(distance<=.88);moved+=distance;
  if(truck.position.z>66&&truck.position.z<82)assert.ok(truck.position.x>141,'the full-size chassis stays clear of the gravel bay corner');
 }
 assert.ok(truck.position.z>=88,'the real articulated truck completes the outer turn');assert.ok(moved>30);assert.equal(truck.construction.load,2);assert.equal(crew.jobs.find(job=>job.id==='haul').completed,0,'passing a waypoint alone cannot award a delivered load');
});

test('the native crew tips its real load and completes the job only after driving forward clear of the deposited material',()=>{
 let now=1000;const environment=constructionWorld(),runtime=new AuthoritativeRooms({store:{},now:()=>now}),room={objects:{}},sim=runtime.initialize(room,environment).sim,crew=sim.construction.crew,worker=crew.workers.find(worker=>worker.id==='crew-jules'),truck=sim.actors['construction-truck'],context=runtime.constructionContext(sim,environment,room.objects),job=crew.jobs.find(job=>job.id==='dump');
 truck.position={x:79.6161886259,y:.02,z:93.291959364};truck.rotation.y=-3.4059308887;truck.driving={speed:0,parked:true};truck.construction.cargo=earthworksTake(sim.construction.earthworks,{x:25,y:0,z:17},2,{cutY:-8});truck.construction.load=truck.construction.cargo.soil+truck.construction.cargo.gravel;
 crew.enabled=true;for(const member of crew.workers)member.enabled=member===worker;for(const item of crew.jobs)if(item!==job)item.status='completed';
 Object.assign(worker,{machineId:truck.id,jobId:'dump',phase:'prepare',state:'operating'});constructionCrewSetOperator(sim,truck.id,worker.id,now);const start={...truck.position},yaw=truck.rotation.y,total=()=>sim.construction.earthworks.patches.reduce((sum,patch)=>sum+patch.soil.reduce((a,b)=>a+b,0)+patch.gravel.reduce((a,b)=>a+b,0),0)+(truck.construction.cargo.soil||0)+(truck.construction.cargo.gravel||0),before=total();let tipped=false;
 for(let index=0;index<240&&job.status!=='completed';index++){
  now+=250;stepConstructionCrew(sim,now,.25,context);stepConstruction(sim,now,.25,context);
  if(!truck.construction.load)tipped=true;
 }
 assert.equal(job.status,'completed',JSON.stringify({worker,truck}));assert.equal(job.completed,2);assert.ok(tipped);assert.equal(truck.construction.load,0);assert.equal(truck.construction.bed,0);assert.equal(truck.driving.speed,0);
 const forward=(truck.position.x-start.x)*-Math.sin(yaw)+(truck.position.z-start.z)*-Math.cos(yaw);assert.ok(forward>5,'the empty truck moves forward away from its real rear discharge');assert.ok(Math.abs(total()-before)<1e-6,'tipping and departure conserve all material');assert.equal(truck.construction.crewOperator,undefined);
});
