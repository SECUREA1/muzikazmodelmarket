import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {URBAN_LAYOUTS,createUrbanScene} from '../public/js/urban-sandbox.js';
import {startUrbanMission,updateUrbanMission} from '../public/js/urban-missions.js';
import {createBuilderModel} from '../public/js/builder-models-3d.js';
import {compileBuilderScene} from '../public/js/builder-gameplay-pipeline.js';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
test('urban templates include editable roads, usable models, vehicles, safehouses and ordered routes',()=>{
 for(const layout of Object.keys(URBAN_LAYOUTS).filter(id=>id!=='urban-media-lounge'))for(const size of [40,80,120]){
  const scene=createUrbanScene(layout,size);assert.ok(scene.mapSize>=80);assert.equal(scene.streets.length,6);const manifest=compileBuilderScene(scene);assert.ok(manifest.spawn);
  assert.equal(manifest.actors.find(actor=>actor.objectId==='urban-garage-quad').gameplay.behavior,'vehicle');
  const mission=manifest.actors.find(actor=>actor.objectId==='urban-dispatcher').gameplay.urbanMission;assert.equal(mission.checkpoints.length,4);
  const collision=new ServerBuilderCollision(),environment={id:layout+size,proceduralLand:true,builderScene:scene};assert.ok(collision.safeSpawn(environment,{x:0,y:0,z:3}));
  for(const object of scene.objects){assert.ok(Math.abs(object.position.x)<scene.mapSize/2);assert.ok(Math.abs(object.position.z)<scene.mapSize/2);const model=createBuilderModel(object.modelId);assert.ok(model);model.traverse(node=>{node.geometry?.dispose();for(const mat of Array.isArray(node.material)?node.material:[node.material])mat?.dispose();});}
 }
});
test('courier progress requires ordered driving, times out, retries and awards score once',()=>{
 const player={health:100,score:0,position:{x:10,z:10}},config={id:'test',checkpoints:[{x:0,z:0},{x:10,z:10}],timeLimit:30,rewardScore:50};
 startUrbanMission(player,config,0);updateUrbanMission(player,100);assert.equal(player.urbanMission.next,0);
 player.vehicleId='quad';updateUrbanMission(player,200);assert.equal(player.urbanMission.next,0,'later checkpoint is ignored');
 player.position={x:0,z:0};updateUrbanMission(player,300);assert.equal(player.urbanMission.next,1);
 updateUrbanMission(player,30001);assert.equal(player.urbanMission.state,'expired');assert.equal(player.score,0);
 startUrbanMission(player,config,31000);updateUrbanMission(player,31001);player.position={x:10,z:10};updateUrbanMission(player,31002);assert.equal(player.score,50);
 startUrbanMission(player,config,32000);updateUrbanMission(player,32001);assert.equal(player.score,50);assert.equal(player.urbanMission.state,'complete');
 assert.throws(()=>startUrbanMission(player,{id:'bad',checkpoints:[{x:NaN,z:0}]},0));
});
test('published urban missions use moved checkpoint pads and persist shared route completion',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'urban-room-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const scene=createUrbanScene('urban-downtown',80);scene.objects.find(object=>object.id==='urban-checkpoint-0').position.x=-22;
 const environment={id:'city',proceduralLand:true,builderScene:scene,spawn:{x:0,y:0,z:3}},store=new SharedRoomStore(join(dir,'rooms.json'));let now=100000,index=0;
 const runtime=new AuthoritativeRooms({store,now:()=>now}),identity={accountId:'driver',username:'Driver',stats:{health:100}},id='account:driver';
 const send=(action,fields={})=>runtime.command('city',environment,identity,{action,requestId:'city-'+ ++index,...fields});await send('join');
 await store.update('city',room=>{room.simulation.players[id].position={x:4,y:0,z:5};});let state=await send('interact',{entityId:'urban-dispatcher'});assert.equal(state.players[id].urbanMission.checkpoints[0].x,-22);
 await store.update('city',room=>{room.simulation.players[id].position={x:17,y:0,z:4};});state=await send('interact',{entityId:'urban-garage-quad'});assert.equal(state.players[id].vehicleId,'urban-garage-quad');
 for(const point of state.players[id].urbanMission.checkpoints){await store.update('city',room=>{room.simulation.players[id].position={x:point.x,y:.2,z:point.z};});now+=50;state=await send('input',{input:{}});}
 assert.equal(state.players[id].urbanMission.state,'complete');assert.equal(state.players[id].score,50);
 const restarted=new AuthoritativeRooms({store:new SharedRoomStore(store.file),now:()=>now});const saved=await restarted.snapshot('city',environment);assert.equal(saved.players[id].urbanMission.state,'complete');
});
