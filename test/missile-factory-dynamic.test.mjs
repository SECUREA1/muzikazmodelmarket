import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {FACTORY_ID,FACTORY_STATIONS,FACTORY_CREW,FACTORY_STATION_MODELS,factoryStations,factoryCrew,isFactoryEnvironment} from '../public/js/missile-factory-config.js';
import {factoryCommand,factoryAccountState,stepFactory,factoryView} from '../server-missile-factory.mjs';
import {stepFactoryResidents} from '../server-factory-residents.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';

const modelFor=kind=>Object.entries(FACTORY_STATION_MODELS).find(([,value])=>value===kind)[0];
const equipment=(kind,id=kind,extra={})=>({id,name:'Custom '+kind,modelId:modelFor(kind),position:{x:FACTORY_STATIONS.find(station=>station.kind===kind).position.x+120,y:.02,z:FACTORY_STATIONS.find(station=>station.kind===kind).position.z+90},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{factoryStation:kind,factoryApproach:{x:0,y:0,z:0}},...extra});
const scene=objects=>({id:'custom-production',game:'missile-factory',builderScene:{sourceFactory:{enabled:true,editableEquipment:true,editableStations:true,editableCrew:true},objects}});
async function fixture(t,environment=scene(FACTORY_STATIONS.map(station=>equipment(station.kind)))){
 const directory=await mkdtemp(join(tmpdir(),'dynamic-factory-'));t.after(()=>rm(directory,{recursive:true,force:true}));const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:dynamic-factory';await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:1000},items:[],memory:{},revision:0};return {};});
 let now=1000000,request=0;const player={actorId:wallet,position:{...factoryStations(environment)[0]?.position},health:100,lastSeen:now},sim={actors:{},players:{[wallet]:player}};
 const send=(action,fields={})=>factoryCommand(sim,player,environment,{action,requestId:'dynamic-'+ ++request,...fields},now,{database,walletId:wallet});
 const move=kind=>{const station=factoryStations(environment,{actors:sim.actors}).find(station=>station.kind===kind);player.position={...station.position};return station;};
 const tick=milliseconds=>{now+=milliseconds;player.lastSeen=now;stepFactory(sim,environment,now);};return {database,wallet,environment,player,sim,send,move,tick,get now(){return now;}};
}

test('factory station instance approaches match scaled XYZ transforms and sanitize edited ranges',()=>{
 const source=equipment('fabrication','press',{position:{x:7,y:2,z:12},rotation:{x:.2,y:Math.PI/2,z:-.3},scale:{x:2,y:1.5,z:3},functionalSettings:{factoryStation:'fabrication',factoryApproach:{x:1,y:.2,z:3.5},interactionDistance:99999,vehicleInteractionDistance:9999}}),environment=scene([source]),before=structuredClone(environment),station=factoryStations(environment)[0];
 const expected=new THREE.Vector3(1,.2,3.5).multiply(new THREE.Vector3(2,1.5,3)).applyEuler(new THREE.Euler(.2,Math.PI/2,-.3)).add(new THREE.Vector3(7,2,12));assert.ok(expected.distanceTo(new THREE.Vector3(station.position.x,station.position.y,station.position.z))<1e-9);assert.deepEqual(environment,before);assert.equal(station.id,'factory-instance:press');assert.equal(station.canonicalStationId,'factory-fabrication');assert.equal(station.interactionDistance,6);assert.equal(station.vehicleInteractionDistance,12);
 source.rotation.y+=.1;assert.notEqual(factoryStations(environment)[0].stationRevision,station.stationRevision);
});

test('removed, disabled and empty editable equipment does not resurrect inherited public stations',()=>{
 const environment=scene([equipment('assembly')]);environment.builderScene.sourceFactory.stations=FACTORY_STATIONS;
 for(const flags of [{enabled:false},{active:false},{visible:false},{deleted:true},{disabled:true},{status:'inactive'},{functionalSettings:{factoryStation:'assembly',active:false}},{functionalSettings:{factoryStation:false}}])assert.deepEqual(factoryStations(scene([equipment('assembly','off',flags)])),[]);
 environment.builderScene.objects=[];assert.deepEqual(factoryStations(environment),[]);assert.deepEqual(factoryCrew(environment),[]);
 const original=factoryStations({id:FACTORY_ID});assert.equal(original.length,6);assert.deepEqual(original.map(station=>station.position),FACTORY_STATIONS.map(station=>station.position));
});

test('ordinary custom maps and runtime purchased machines use only their individually placed stations',async t=>{
 const ordinary={id:'ordinary-map',builderScene:{objects:[equipment('fabrication')]}};assert.equal(isFactoryEnvironment(ordinary),true);assert.equal(factoryStations(ordinary).length,1);assert.deepEqual(factoryCrew(ordinary),[]);
 const modelOnly={id:'ordinary-model-map',builderScene:{objects:[{...equipment('assembly'),functionalSettings:{}}]}};assert.equal(isFactoryEnvironment(modelOnly),true);assert.equal(factoryStations(modelOnly)[0].kind,'assembly');
 const f=await fixture(t);f.environment={id:'unused'};const actors=Object.fromEntries(FACTORY_STATIONS.map(station=>[station.kind,{id:'spawn-'+station.kind,spawned:true,active:true,health:100,position:{...equipment(station.kind).position},scale:{x:1,y:1,z:1},asset:{buildAssetId:modelFor(station.kind),configuration:{factoryStation:station.kind,factoryApproach:{x:0,y:0,z:0}}}}]));
 const runtimeMap={id:'ordinary-runtime-map',builderScene:{objects:[]}},stations=factoryStations(runtimeMap,{actors});assert.equal(stations.length,6);assert.deepEqual(factoryCrew(runtimeMap,{actors}),[]);
 f.sim.actors=actors;f.player.position={...stations.find(station=>station.kind==='procurement').position};await factoryCommand(f.sim,f.player,runtimeMap,{action:'factory-start',recipeId:'training-missile',stationId:stations.find(station=>station.kind==='procurement').id,requestId:'runtime-start'},f.now,{database:f.database,walletId:f.wallet});stepFactory(f.sim,runtimeMap,f.now);assert.equal(factoryView(f.sim,f.now).stations.length,6);assert.equal(f.player.factory.job.steps[0].stationId,'factory-instance:spawn-fabrication');
});

test('a moved Builder factory completes production, edited freight route and Backpack collection with one debit',async t=>{
 const f=await fixture(t);const procurement=f.move('procurement');await f.send('factory-start',{recipeId:'cargo-rocket',stationId:procurement.id});const jobId=f.player.factory.job.id;assert.ok(f.player.factory.job.steps.every(step=>step.stationId.startsWith('factory-instance:')));
 for(const kind of ['fabrication','assembly','calibration']){const station=f.move(kind);await f.send('factory-work',{jobId,stationId:station.id});f.tick(f.player.factory.job.readyAt-f.now);await f.send('factory-status');}
 assert.equal(f.player.factory.job.status,'haul');const loading=f.move('loading'),truck=f.sim.actors['custom-truck']={id:'custom-truck',modelId:'site-dumptruck',position:{...loading.position},holderId:f.player.actorId,driving:{speed:0}};f.player.vehicleId=truck.id;
 await f.send('factory-haul',{jobId,stationId:loading.id});f.tick(6000);const dispatch=factoryStations(f.environment).find(station=>station.kind==='dispatch');truck.position={...dispatch.position};f.player.position={...dispatch.position};await f.send('factory-haul',{jobId,stationId:dispatch.id});f.player.vehicleId=null;
 const result=await f.send('factory-collect',{jobId,stationId:dispatch.id});assert.equal(result.factory.progress.completedJobs,1);assert.equal(result.factory.balance,680);assert.equal(result.item.buildAssetId,'factory-cargo-rocket');assert.equal((await f.database.get(f.wallet)).items.length,1);
});

test('editing or removing an in-flight machine interrupts its cycle without losing funded work',async t=>{
 for(const change of [object=>object.position.x+=2,object=>object.rotation.y=.5,object=>object.scale.z=2,object=>object.functionalSettings.active=false]){
  const f=await fixture(t);f.move('procurement');await f.send('factory-start',{recipeId:'training-missile'});const jobId=f.player.factory.job.id,station=f.move('fabrication');await f.send('factory-work',{jobId,stationId:station.id});change(f.environment.builderScene.objects.find(object=>object.id==='fabrication'));f.tick(9000);
  const restored=await factoryAccountState(f.database,f.wallet,{now:f.now,environment:f.environment,actors:f.sim.actors});assert.equal(restored.job.status,'awaiting');assert.equal(restored.job.stepIndex,0);assert.equal(restored.balance,820);assert.match(restored.job.message,/Equipment changed/);
 }
 const f=await fixture(t);f.move('procurement');await f.send('factory-start',{recipeId:'training-missile'});const jobId=f.player.factory.job.id,station=f.move('fabrication');await f.send('factory-work',{jobId,stationId:station.id});f.environment.builderScene.objects=f.environment.builderScene.objects.filter(object=>object.id!=='fabrication');f.tick(8000);await f.send('factory-status');assert.equal(f.player.factory.job.status,'awaiting');assert.equal(f.player.factory.job.steps[0].stationId,null);
 f.environment.builderScene.objects.push(equipment('fabrication','replacement',{position:{x:150,y:.02,z:120}}));const replacement=f.move('fabrication');await f.send('factory-work',{jobId,stationId:replacement.id});assert.equal(f.player.factory.job.steps[0].stationId,replacement.id);
});

test('incomplete factory layouts cannot debit orders, and duplicated machines have independent reservations',async t=>{
 const incomplete=await fixture(t,scene([equipment('procurement')]));await assert.rejects(incomplete.send('factory-start',{recipeId:'training-missile'}),/Place an active Component fabrication/);assert.equal((await incomplete.database.get(incomplete.wallet)).tokens.MZK,1000);
 const f=await fixture(t);f.environment.builderScene.objects.push(equipment('fabrication','press-two',{position:{x:140,y:.02,z:80}}));f.move('procurement');await f.send('factory-start',{recipeId:'training-missile'});const original=f.move('fabrication');await f.send('factory-work',{jobId:f.player.factory.job.id,stationId:original.id});
 const wallet='account:second-worker';await f.database.transaction(data=>{data.users[wallet]={tokens:{MZK:1000},items:[]};return {};});const other={actorId:wallet,position:{...factoryStations(f.environment).find(station=>station.kind==='procurement').position},health:100,lastSeen:f.now};f.sim.players[wallet]=other;
 const send=(action,extra)=>factoryCommand(f.sim,other,f.environment,{action,requestId:'other-'+action,...extra},f.now,{database:f.database,walletId:wallet});await send('factory-start',{recipeId:'training-missile'});const duplicate=factoryStations(f.environment).find(station=>station.objectId==='press-two');other.position={...duplicate.position};await send('factory-work',{jobId:other.factory.job.id,stationId:duplicate.id});assert.equal(other.factory.job.steps[0].stationId,duplicate.id);
 stepFactory(f.sim,f.environment,f.now);assert.deepEqual(new Set(factoryView(f.sim,f.now).stations.filter(station=>station.kind==='fabrication').map(station=>station.occupiedBy)),new Set([wallet,f.wallet]));
});

test('editable staff adopt authored actors, preserve memory, follow moved homes and disappear when disabled',async t=>{
 const crewObject={id:'my-machinist',name:'Workshop Ada',modelId:'world-resident',position:{x:155,y:.02,z:105},avatarSettings:{displayName:'Ada',bodyColor:'#aa7755',outfitColor:'#2255aa'},functionalSettings:{factoryCrewId:FACTORY_CREW[1].id,factoryCrew:{role:'Lead machinist',greeting:'Let us build.'}}},f=await fixture(t);f.environment.builderScene.objects.push(crewObject);f.sim.actors[crewObject.id]={id:crewObject.id,modelId:'world-resident',asset:{buildAssetId:'world-resident'},position:{...crewObject.position},health:100,active:true};
 stepFactoryResidents(f.sim,f.environment,f.now,0,{});const npc=f.sim.actors[crewObject.id];assert.equal(Object.values(f.sim.actors).filter(actor=>actor.resident?.factory).length,1);assert.equal(npc.resident.factoryCrewId,FACTORY_CREW[1].id);assert.equal(npc.resident.name,'Ada');assert.equal(npc.resident.role,'Lead machinist');assert.equal(npc.resident.color,'#2255aa');
 npc.position={x:160,y:.02,z:110};assert.deepEqual(factoryCrew(f.environment,{actors:f.sim.actors})[0].position,npc.position);const memory=npc.resident.intelligence;
 crewObject.position.x+=20;stepFactoryResidents(f.sim,f.environment,f.now+1000,0,{});assert.equal(npc.position.x,175);assert.equal(npc.resident.home.x,175);assert.equal(npc.resident.intelligence,memory);
 f.move('procurement');await f.send('factory-start',{recipeId:'training-missile'});f.player.position={...npc.position};await f.send('factory-assist',{jobId:f.player.factory.job.id,enabled:true});assert.equal(f.player.factory.job.assisted,true);
 crewObject.functionalSettings.factoryCrewEnabled=false;stepFactoryResidents(f.sim,f.environment,f.now+2000,0,{});assert.equal(f.sim.actors[crewObject.id],undefined);assert.deepEqual(factoryCrew(f.environment),[]);
});
