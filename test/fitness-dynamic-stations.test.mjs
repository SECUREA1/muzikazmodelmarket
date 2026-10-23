import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {FITNESS_ID,FITNESS_STATIONS,fitnessStations} from '../public/js/fitness-config.js';
import {fitnessCommand,stepFitness,fitnessView,grantFitnessReward} from '../server-fitness.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';

const equipment=(id='bench-one',extra={})=>({id,name:'My Gold Press',modelId:'fitness-bench-press',position:{x:10,y:.02,z:15},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},functionalSettings:{fitnessStation:'bench-press',fitnessStationId:'fitness-bench-press',fitnessApproach:{x:0,y:0,z:4},interactionDistance:4},...extra});
const editable=objects=>({id:'my-gold-gym',game:'fitness',builderScene:{sourceFitness:{enabled:true,editableStations:true},objects}});
function fixture(objects=[equipment()]){
 let now=1000000;const environment=editable(objects),station=fitnessStations(environment)[0],player={actorId:'account:alice',username:'Alice',position:{...station.position},health:100,grounded:true,lastSeen:now,input:{}},sim={actors:{},players:{'account:alice':player}};
 const at=time=>{now=time;player.lastSeen=now;stepFitness(sim,environment,now);};
 const send=(action,extra={})=>fitnessCommand(sim,player,environment,{action,...extra},now,{integer:()=>0});
 function finish(){send('fitness-start',{stationId:station.id});const round=player.fitness;for(const [cueIndex,cue]of round.cues.entries()){at(cue.at);send('fitness-input',{roundId:round.id,cueIndex,input:cue.input});}at(round.endsAt);return send('fitness-finish',{roundId:round.id}).settlement;}
 return {environment,station,sim,player,send,at,finish,get now(){return now;}};
}

test('editable station approaches match scaled XYZ equipment transforms and preserve stable instance identities',()=>{
 const original=equipment('bench-one',{position:{x:8,y:1,z:-10},rotation:{x:.2,y:Math.PI/2,z:-.3},scale:{x:2,y:1.5,z:3}}),copy=equipment('bench-copy',{position:{x:-8,y:.02,z:10}}),environment=editable([original,copy]),before=structuredClone(environment),stations=fitnessStations(environment);
 const expected=new THREE.Vector3(0,0,4).multiply(new THREE.Vector3(2,1.5,3)).applyEuler(new THREE.Euler(.2,Math.PI/2,-.3)).add(new THREE.Vector3(8,1,-10));
 assert.ok(expected.distanceTo(new THREE.Vector3(...['x','y','z'].map(axis=>stations[0].position[axis])))<1e-9);assert.deepEqual(environment,before);
 assert.equal(stations.length,2);assert.equal(new Set(stations.map(station=>station.id)).size,2);assert.ok(stations.every(station=>station.canonicalStationId==='fitness-bench-press'));
 const reordered=fitnessStations(editable([copy,original]));assert.deepEqual(stations.map(station=>station.id).sort(),reordered.map(station=>station.id).sort());
 original.rotation.y+=.1;assert.notEqual(fitnessStations(environment)[0].stationRevision,stations[0].stationRevision);
});

test('deleting or disabling editable equipment never revives inherited station coordinates',()=>{
 const environment=editable([equipment()]);environment.builderScene.sourceFitness.stations=FITNESS_STATIONS;
 for(const flags of [{enabled:false},{active:false},{visible:false},{deleted:true},{disabled:true},{status:'deleted'},{functionalSettings:{fitnessStation:'bench-press',enabled:false}}])assert.equal(fitnessStations(editable([equipment('off',flags)])).length,0);
 environment.builderScene.objects=[];assert.deepEqual(fitnessStations(environment),[]);
 environment.builderScene.objects=[{id:'decoration',modelId:'fitness-bench-press'}];assert.deepEqual(fitnessStations(environment),[]);
 const fallback={id:'legacy-custom-gym',builderScene:{sourceFitness:{enabled:true,stations:[{...FITNESS_STATIONS[1],position:{x:40,y:.2,z:50}}]}}};assert.equal(fitnessStations(fallback)[0].position.x,40);
 const canonical=fitnessStations({id:FITNESS_ID,builderScene:{objects:[equipment('ignored')]}});assert.equal(canonical.length,7);assert.deepEqual(canonical.map(station=>station.position),FITNESS_STATIONS.map(station=>station.position));
});

test('spawned purchased equipment adds live stations while held, destroyed and authored duplicates are excluded',()=>{
 const environment={id:FITNESS_ID,builderScene:{objects:[equipment('authored-bench')]}},makeActor=(id,extra={})=>({id,spawned:true,active:true,health:100,position:{x:14,y:.02,z:20},rotation:{x:0,y:Math.PI/2,z:0},scale:{x:2,y:2,z:2},asset:{name:'Purchased press',buildAssetId:'fitness-bench-press',function_data:{fitnessStation:'bench-press',fitnessApproach:{x:0,y:0,z:4}}},definition:{gameplay:{behavior:'interact'}},...extra});
 const actors={one:makeActor('spawn-one'),authored:makeActor('authored-bench'),held:makeActor('spawn-held',{holderId:'account:alice'}),dead:makeActor('spawn-dead',{health:0}),removed:makeActor('spawn-removed',{active:false})},stations=fitnessStations(environment,{actors});
 assert.equal(stations.length,8);const owned=stations.find(station=>station.objectId==='spawn-one');assert.ok(owned);assert.equal(owned.canonicalStationId,'fitness-bench-press');assert.ok(Math.abs(owned.position.x-22)<1e-8);assert.ok(Math.abs(owned.position.z-20)<1e-8);
 const f=fixture();f.environment.id=FITNESS_ID;f.environment.builderScene={objects:environment.builderScene.objects};f.sim.actors=actors;stepFitness(f.sim,f.environment,f.now);assert.equal(fitnessView(f.sim,f.now).stations.length,8);
 f.player.position={...owned.position};f.send('fitness-start',{stationId:owned.id});actors.one.rotation.y=0;stepFitness(f.sim,f.environment,f.now);assert.equal(f.player.fitness.status,'cancelled');
});

test('a copied gym plays at the new station location and settles to canonical skills exactly once',async t=>{
 const f=fixture([equipment('moved',{position:{x:24,y:.02,z:-8},rotation:{x:0,y:Math.PI,z:0},scale:{x:1.5,y:1.5,z:1.5}})]);
 assert.throws(()=>f.send('fitness-start',{stationId:'fitness-bench-press'}),/Choose a fitness station/);
 const result=f.finish();assert.equal(result.stationId,'fitness-instance:moved');assert.equal(result.canonicalStationId,'fitness-bench-press');assert.equal(result.score,1200);assert.equal(f.player.fitnessProgress.bestScores['fitness-bench-press'],1200);assert.equal(f.player.fitnessProgress.bestScores[result.stationId],undefined);
 const directory=await mkdtemp(join(tmpdir(),'dynamic-fitness-reward-'));t.after(()=>rm(directory,{recursive:true,force:true}));const db=new UserJsonDatabase(join(directory,'users.json')),wallet='account:builder-gym';await db.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:100},items:[],memory:{},revision:0};return {};});
 const one=await grantFitnessReward(db,wallet,result,{now:f.now}),replayed=await grantFitnessReward(db,wallet,result,{now:f.now});assert.deepEqual(one,replayed);assert.equal(one.amountMzk,30);assert.equal(one.stationId,'fitness-instance:moved');assert.equal(one.canonicalStationId,'fitness-bench-press');assert.equal(one.progress.bestScores['fitness-bench-press'],1200);assert.equal(one.progress.bestScores[result.stationId],undefined);assert.equal((await db.get(wallet)).tokens.MZK,130);
 await assert.rejects(async()=>grantFitnessReward(db,wallet,{...result,canonicalStationId:'fitness-boxing'},{now:f.now}),/Invalid authoritative fitness result/);
});

test('changing, deleting, scaling or disabling equipment cancels live and unpaid completed sets',()=>{
 const changes=[object=>object.position.x+=2,object=>object.rotation.y+=.2,object=>object.scale.x=2,object=>object.functionalSettings.fitnessStation='boxing',object=>object.functionalSettings.enabled=false];
 for(const change of changes){const f=fixture();f.send('fitness-start',{stationId:f.station.id});change(f.environment.builderScene.objects[0]);f.at(f.now+100);assert.equal(f.player.fitness.status,'cancelled');assert.throws(()=>f.send('fitness-finish',{roundId:f.player.fitness.id}),/Cancelled sets/);}
 const deleted=fixture();deleted.send('fitness-start',{stationId:deleted.station.id});deleted.environment.builderScene.objects=[];deleted.at(deleted.now+100);assert.equal(deleted.player.fitness.status,'cancelled');assert.deepEqual(fitnessView(deleted.sim,deleted.now).stations,[]);
 const completed=fixture();completed.finish();completed.environment.builderScene.objects[0].scale.y=2;completed.at(completed.now+100);assert.equal(completed.player.fitness.status,'cancelled');
});

test('duplicate equipment has independent occupancy while sharing the same canonical training skill',()=>{
 const f=fixture([equipment('one'),equipment('two',{position:{x:-15,y:.02,z:-20}})]),stations=fitnessStations(f.environment);f.send('fitness-start',{stationId:stations[0].id});
 const bob={...f.player,actorId:'account:bob',position:{...stations[1].position},fitness:null};f.sim.players[bob.actorId]=bob;fitnessCommand(f.sim,bob,f.environment,{action:'fitness-start',stationId:stations[1].id},f.now);
 assert.equal(bob.fitness.canonicalStationId,f.player.fitness.canonicalStationId);assert.notEqual(bob.fitness.stationId,f.player.fitness.stationId);const view=fitnessView(f.sim,f.now);assert.deepEqual(new Set(view.stations.map(station=>station.occupiedBy)),new Set(['account:alice','account:bob']));
});
