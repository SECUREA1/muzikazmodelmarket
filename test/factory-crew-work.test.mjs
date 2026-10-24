import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FACTORY_ID,FACTORY_CREW,FACTORY_STATIONS} from '../public/js/missile-factory-config.js';
import {stepFactoryCrewWork,factoryCrewCommand,factoryCrewStatus,factoryCrewWorkView,preemptFactoryCrewStation} from '../server-factory-crew-work.mjs';
import {factoryCommand,stepFactory,factoryView} from '../server-missile-factory.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {createFactoryModel,applyFactoryMachineActivity,updateFactoryModel} from '../public/js/missile-factory-model.js';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {missileFactoryWorld} from '../missile-factory-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

function fixture(environment={id:FACTORY_ID},context={}){
 let now=100000;
 const player={actorId:'p',username:'Visitor',health:100,lastSeen:now,position:{...FACTORY_CREW[0].home},score:0,inventory:[]};
 const sim={time:now,players:{p:player},actors:Object.fromEntries(FACTORY_CREW.map(person=>[person.id,{id:person.id,name:person.name,position:{...person.home},rotation:{y:0},health:100,active:true,resident:{factory:true,factoryCrewId:person.id,name:person.name,home:{...person.home},skills:{manufacturing:50,observation:40}}}]))};
 const command=operation=>factoryCrewCommand(sim,player,environment,{operation,entityId:FACTORY_CREW[0].id},now);
 const tick=(count=1)=>{for(let index=0;index<count;index++){now+=250;sim.time=now;player.lastSeen=now;stepFactoryCrewWork(sim,environment,now,.25,context);}return sim.factoryCrewWork?.job;};
 const until=condition=>{for(let index=0;index<2500&&!condition();index++)tick();assert.ok(condition(),'bounded live work reaches expected state');};
 return {sim,player,environment,command,tick,until,get now(){return now;}};
}

test('crew actually walks, runs canonical timed machine stages and transforms room materials into one shared output',()=>{
 const f=fixture(),initial=structuredClone(f.sim.actors);f.command('demonstrate');const job=f.sim.factoryCrewWork.job;
 assert.equal(job.steps[0].durationMs,7000);assert.equal(job.readyAt,null);assert.equal(f.sim.factoryCrewWork.materials.models,0);
 f.tick(12);assert.ok(Object.values(f.sim.actors).some(actor=>Math.hypot(actor.position.x-initial[actor.id].position.x,actor.position.z-initial[actor.id].position.z)>.2));
 f.until(()=>job.status==='processing');assert.equal(job.readyAt-job.cycleStartedAt,7000);assert.equal(f.sim.factoryCrewWork.locks['factory-fabrication'].workerId,job.workerId);
 f.tick(10);assert.equal(job.stepIndex,0);assert.equal(f.sim.factoryCrewWork.materials.components,0);
 f.until(()=>job.stepIndex===1);assert.equal(f.sim.factoryCrewWork.materials.components,2);assert.equal(f.sim.factoryCrewWork.materials.assemblies,0);
 f.until(()=>job.stepIndex===2);assert.equal(f.sim.factoryCrewWork.materials.components,0);assert.equal(f.sim.factoryCrewWork.materials.assemblies,1);
 f.until(()=>job.status==='completed');assert.deepEqual(f.sim.factoryCrewWork.materials,{components:0,assemblies:0,models:1});assert.equal(f.sim.factoryCrewWork.outputs.length,1);assert.equal(f.sim.factoryCrewWork.outputs[0].roomOnly,true);assert.equal(new Set(job.completedSteps.map(step=>step.workerId)).size,3,'specialists hand over the actual order');
 f.tick(30);assert.equal(f.sim.factoryCrewWork.completed,1);assert.equal(f.player.score,0);assert.deepEqual(f.player.inventory,[]);assert.equal(f.player.factory,undefined);assert.deepEqual(f.sim.factoryCrewWork.locks,{});
 const view=factoryCrewWorkView(f.sim,f.now),status=factoryCrewStatus(f.sim);assert.equal(status.status,'completed');assert.equal(status.progress,1);assert.equal(view.job.requestedBy,undefined);assert.equal(view.job.path,undefined);
});

test('AI yields a live machine to funded player work, then restarts its interrupted cycle for a full server duration',()=>{
 const f=fixture();f.command('demonstrate');const job=f.sim.factoryCrewWork.job;f.until(()=>job.status==='processing');f.tick(12);
 const oldReady=job.readyAt;f.player.factory={job:{id:'funded',environmentId:FACTORY_ID,status:'processing',stepIndex:0,readyAt:f.now+6000,steps:[{stationId:'factory-fabrication'}]}};
 assert.equal(preemptFactoryCrewStation(f.sim,'factory-fabrication',f.now,'p'),true);assert.equal(job.status,'waiting');assert.equal(job.readyAt,null);assert.deepEqual(f.sim.factoryCrewWork.locks,{});
 while(f.now<=oldReady)f.tick();assert.equal(job.stepIndex,0);assert.equal(f.sim.factoryCrewWork.materials.components,0);
 f.player.factory.job.status='awaiting';f.until(()=>job.status==='processing');assert.equal(job.readyAt-job.cycleStartedAt,7000);f.tick(27);assert.equal(job.stepIndex,0);f.tick();assert.equal(job.stepIndex,1);
});

test('machine edits, blocked paths, removed operators, no visitors and player stop never fabricate output',()=>{
 const editable={id:'edited-factory',factory:{enabled:true,stations:structuredClone(FACTORY_STATIONS),crew:structuredClone(FACTORY_CREW)}};
 const f=fixture(editable);f.command('demonstrate');f.until(()=>f.sim.factoryCrewWork.job.status==='processing');editable.factory.stations.find(station=>station.kind==='fabrication').position.x+=5;f.tick();assert.equal(f.sim.factoryCrewWork.job.status,'cancelled');assert.equal(f.sim.factoryCrewWork.materials.models,0);assert.deepEqual(f.sim.factoryCrewWork.locks,{});
 const blocked=fixture({id:FACTORY_ID},{collision:{groundAt:()=>null}});blocked.command('demonstrate');blocked.tick(200);assert.equal(blocked.sim.factoryCrewWork.job.stepIndex,0);assert.equal(blocked.sim.factoryCrewWork.materials.components,0);assert.match(blocked.sim.factoryCrewWork.job.message,/clear walking route/);
 const gone=fixture();gone.command('demonstrate');for(const actor of Object.values(gone.sim.actors))actor.active=false;gone.tick(80);assert.equal(gone.sim.factoryCrewWork.job.stepIndex,0);assert.equal(gone.sim.factoryCrewWork.materials.models,0);
 const empty=fixture();empty.command('demonstrate');empty.player.lastSeen=-100000;stepFactoryCrewWork(empty.sim,empty.environment,empty.now,.25);assert.equal(empty.sim.factoryCrewWork.job.status,'cancelled');
 const stopped=fixture();stopped.command('demonstrate');stopped.tick(8);stopped.command('stop');const at=stopped.sim.factoryCrewWork.nextAutoAt;stopped.tick(100);assert.equal(stopped.sim.factoryCrewWork.job.status,'cancelled');assert.equal(stopped.sim.factoryCrewWork.nextAutoAt,at);assert.equal(stopped.sim.factoryCrewWork.completed,0);
});

test('autonomous factory shifts alternate real recipes and nearby requests cannot mutate wallet or bypass crew eligibility',()=>{
 const f=fixture();f.tick(49);assert.equal(f.sim.factoryCrewWork.job.recipeId,'training-missile');f.until(()=>f.sim.factoryCrewWork.job.status==='completed');f.until(()=>f.sim.factoryCrewWork.job.recipeId==='cargo-rocket');assert.equal(f.sim.factoryCrewWork.job.steps[0].durationMs,9000);
 f.player.position={x:999,y:0,z:999};assert.throws(()=>f.command('demonstrate'),/closer/);f.player.position={...FACTORY_CREW[0].home};f.player.health=0;assert.throws(()=>f.command('stop'),/live factory/);f.player.health=100;assert.throws(()=>factoryCrewCommand(f.sim,f.player,f.environment,{operation:'demonstrate',entityId:'invented'},f.now),/available factory crew/);assert.equal(f.player.factory,undefined);assert.equal(f.player.score,0);
});

test('a requested demonstration ends when its owner leaves and unrelated players cannot stop another request',()=>{
 const f=fixture();f.command('demonstrate');const second={actorId:'second',health:100,lastSeen:f.now,position:{...FACTORY_CREW[0].home}};f.sim.players.second=second;
 assert.throws(()=>factoryCrewCommand(f.sim,second,f.environment,{operation:'stop',entityId:FACTORY_CREW[0].id},f.now),/another player/);assert.equal(f.sim.factoryCrewWork.job.status,'waiting');
 f.player.lastSeen=f.now-16000;second.lastSeen=f.now;stepFactoryCrewWork(f.sim,f.environment,f.now+1,.25);assert.equal(f.sim.factoryCrewWork.job.status,'cancelled');assert.equal(f.sim.factoryCrewWork.completed,0);
 const moved=fixture();moved.command('demonstrate');moved.player.movementRevision=1;moved.tick();assert.equal(moved.sim.factoryCrewWork.job.status,'cancelled');
 const automatic=fixture();automatic.tick(49);const visitor={...automatic.player,actorId:'other',factoryCrewRequestAt:0};assert.match(factoryCrewCommand(automatic.sim,visitor,automatic.environment,{operation:'stop',entityId:FACTORY_CREW[0].id},automatic.now),/stopped/);
});

test('the live owner can stop their demonstration remotely while other requests still require nearby crew',()=>{
 const f=fixture();f.command('demonstrate');f.tick(8);f.player.position={x:70,y:.02,z:60};
 const unrelated={actorId:'remote-visitor',health:100,lastSeen:f.now,position:{...f.player.position}};f.sim.players[unrelated.actorId]=unrelated;
 assert.throws(()=>factoryCrewCommand(f.sim,unrelated,f.environment,{operation:'stop',entityId:FACTORY_CREW[0].id},f.now),/closer/);
 assert.throws(()=>f.command('demonstrate'),/closer/);assert.match(f.command('stop'),/stopped/);assert.equal(f.sim.factoryCrewWork.job.status,'cancelled');assert.deepEqual(f.sim.factoryCrewWork.locks,{});
 const autonomous=fixture();autonomous.tick(49);autonomous.player.position={x:70,y:.02,z:60};assert.throws(()=>autonomous.command('stop'),/closer/);
});

test('real funded factoryCommand preempts only its station and retains its durable paid order when AI is stopped',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'factory-crew-priority-'));t.after(()=>rm(directory,{recursive:true,force:true}));const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:crew-viewer';await database.transaction(data=>{data.users[wallet]={tokens:{MZK:1000},items:[]};return {};});
 const f=fixture();f.command('demonstrate');f.until(()=>f.sim.factoryCrewWork.job.status==='processing');const demo=f.sim.factoryCrewWork.job;
 const send=(action,fields={})=>factoryCommand(f.sim,f.player,f.environment,{action,requestId:'test-'+action,...fields},f.now,{database,walletId:wallet});
 f.player.position={...FACTORY_STATIONS.find(station=>station.kind==='procurement').position};await send('factory-start',{recipeId:'training-missile'});const funded=f.player.factory.job.id;
 f.player.position={...FACTORY_STATIONS.find(station=>station.kind==='fabrication').position};await send('factory-work',{jobId:funded,stationId:'factory-fabrication'});assert.equal(demo.status,'waiting');assert.equal(f.player.factory.job.status,'processing');assert.equal((await database.get(wallet)).tokens.MZK,820);
 stepFactory(f.sim,f.environment,f.now);const view=factoryView(f.sim,f.now);assert.equal(view.stations.find(station=>station.id==='factory-fabrication').occupiedBy,'p');assert.equal(view.jobs.filter(row=>row.ai).length,1);
 f.player.position={...f.sim.actors[FACTORY_CREW[0].id].position};f.command('stop');assert.equal(f.player.factory.job.id,funded);assert.equal(f.player.factory.job.status,'processing');assert.equal((await database.get(wallet)).items.length,0);assert.equal((await database.read()).transactions.filter(row=>row.type==='FACTORY_ORDER').length,1);
});

test('world machine animation follows actual station cycles while catalog previews still animate',()=>{
 const stage=new THREE.Group(),fabricator=createFactoryModel('factory-fabricator');fabricator.userData.builderObjectId='placed-press';stage.add(fabricator);
 const station={id:'factory-instance:placed-press',objectId:'placed-press',kind:'fabrication',equipmentPosition:{x:0,y:0,z:0}},state={serverTime:2000,stations:[station],jobs:[]};
 applyFactoryMachineActivity(stage,state);updateFactoryModel(fabricator,100);const tool=fabricator.getObjectByName('FACTORY_FABRICATOR_TOOL');assert.equal(tool.position.y,3.1);
 applyFactoryMachineActivity(stage,{...state,jobs:[{ai:true,job:{status:'processing',cycleStartedAt:1000,readyAt:8000,stepIndex:0,steps:[{stationId:station.id}]}}]});updateFactoryModel(fabricator,100);assert.ok(tool.position.y>3.2);assert.equal(fabricator.userData.factoryMachineState.processing,true);
 applyFactoryMachineActivity(stage,{...state,serverTime:9000});updateFactoryModel(fabricator,200);assert.equal(tool.position.y,3.1);
 const preview=createFactoryModel('factory-fabricator');updateFactoryModel(preview,1);assert.ok(preview.getObjectByName('FACTORY_FABRICATOR_TOOL').position.y>3.2);
});

test('the authored factory crew completes its real collision-checked production route',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'factory-crew-route-'));t.after(()=>rm(directory,{recursive:true,force:true}));let now=100000;
 const environment=missileFactoryWorld(),store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 const joined=await runtime.command(environment.id,environment,{accountId:'crew-watcher',username:'Crew watcher'},{action:'join',requestId:'crew-route-join',deferRadTox:true,radToxEnabled:false}),room=await store.get(environment.id),sim=room.simulation,player=sim.players[joined.selfId];
 player.position={...FACTORY_CREW[0].home,z:FACTORY_CREW[0].home.z+4};factoryCrewCommand(sim,player,environment,{operation:'demonstrate',entityId:FACTORY_CREW[0].id},now);
 const job=sim.factoryCrewWork.job;
 for(let index=0;index<1500&&job.status!=='completed'&&job.status!=='cancelled';index++){
  now+=250;sim.time=now;player.lastSeen=now;
  runtime.collision.withActorCandidates(sim.actors,()=>stepFactoryCrewWork(sim,environment,now,.25,{collision:runtime.collision,objects:room.objects}));
 }
 assert.equal(job.status,'completed',job.message);assert.equal(job.completedSteps.length,3);assert.equal(sim.factoryCrewWork.materials.models,1);
 for(const step of job.completedSteps){const worker=sim.actors[step.workerId];assert.ok(worker?.resident.factory);assert.ok(runtime.collision.hasBodyClearance(environment,worker.position,.38,{actors:sim.actors,objects:room.objects}),'worker stands on a clear machine approach');}
});
