import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'world-entry-safety-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const world={id:'saved-entry-test',publicDestination:true,proceduralLand:true,spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:80,objects:[]}};
 let store=new SharedRoomStore(join(directory,'rooms.json'));
 let runtime=new AuthoritativeRooms({store,now:()=>100000}),sequence=0;
 const send=(accountId='visitor')=>runtime.command(world.id,world,{accountId,username:accountId,stats:{health:100}},{action:'join',requestId:'safe-entry-'+ ++sequence,deferRadTox:true,radToxEnabled:false});
 // A restart retires the old writer; fixture mutations follow the restored store.
 const reload=()=>{runtime.collision.clearPlacedWorlds();store=new SharedRoomStore(store.file);runtime=new AuthoritativeRooms({store,now:()=>100000});};
 const clear=state=>{const point=state.players[state.selfId].position;assert.doesNotThrow(()=>runtime.collision.teleportPosition(world,point,point,state.actors,state.objects,{localMap:true}));assert.ok(['x','y','z'].every(axis=>Number.isFinite(point[axis])));assert.ok(runtime.collision.hasBodyClearance(world,point,.38,{actors:state.actors,objects:state.objects}));const floor=runtime.collision.groundAt(world,point,{actors:state.actors,objects:state.objects});assert.ok(floor&&Math.abs(floor.y-point.y)<.05);};
 return {world,get store(){return store;},send,reload,clear};
}

test('new arrivals and persisted walking players clear saved room obstacles on every join without losing progress',async t=>{
 const f=await fixture(t);await f.send();
 await f.store.update(f.world.id,room=>{
  const player=room.simulation.players['account:visitor'];player.health=42;player.score=77;player.quests={kept:'complete'};
  room.objects.wall={id:'wall',materialId:'brick',position:[0,2,0],rotation:[0,0,0],scale:[4,10,4],paint:[]};
 });
 f.reload();
 const restored=await f.send();f.clear(restored);
 assert.notDeepEqual(restored.players[restored.selfId].position,{x:0,y:.02,z:0});
 assert.equal(restored.players[restored.selfId].health,42);assert.equal(restored.players[restored.selfId].score,77);assert.equal(restored.players[restored.selfId].quests.kept,'complete');
 const newcomer=await f.send('newcomer');f.clear(newcomer);
 assert.ok(Math.hypot(newcomer.players[newcomer.selfId].position.x,newcomer.players[newcomer.selfId].position.z)>2);
});

test('saved placed actors participate in cold and returning arrival clearance',async t=>{
 const f=await fixture(t);await f.send();
 await f.store.update(f.world.id,room=>{room.simulation.actors.blocker={id:'blocker',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:5,y:5,z:5}};});
 f.reload();f.clear(await f.send());f.clear(await f.send('newcomer'));
});

test('a valid walking position and an airborne jump keep their exact pose through reconnect',async t=>{
 const f=await fixture(t);await f.send();
 for(const airborne of [false,true]){
  const pose={x:14,y:airborne?2:.02,z:14};
  await f.store.update(f.world.id,room=>{Object.assign(room.simulation.players['account:visitor'],{position:pose,floor:.02,velocityY:airborne?4:0,grounded:!airborne});});
  f.reload();const state=await f.send();assert.deepEqual(state.players[state.selfId].position,pose);assert.equal(state.players[state.selfId].movementRevision,0);
 }
});

for(const kind of ['seat','aircraft'])test('rejoining preserves an occupied '+kind+' and its airborne or seated pose',async t=>{
 const f=await fixture(t);await f.send();const pose={x:20,y:kind==='aircraft'?45:1,z:20};
 await f.store.update(f.world.id,room=>{
  room.simulation.actors.occupied={id:'occupied',spawned:true,active:true,modelId:kind==='aircraft'?'piper-cub':'material:bench',holderId:'account:visitor',position:pose,rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},...(kind==='aircraft'?{flight:{airborne:true,speed:0,altitude:45}}:{})};
  Object.assign(room.simulation.players['account:visitor'],{position:pose,floor:pose.y,grounded:kind==='seat',vehicleId:kind==='aircraft'?'occupied':null,seatedId:kind==='seat'?'occupied':null});
  if(kind==='aircraft')room.objects.coveredGround={id:'covered-ground',materialId:'brick',position:[0,5,0],rotation:[0,0,0],scale:[80,25,160],paint:[]};
 });
 f.reload();const state=await f.send(),player=state.players[state.selfId];assert.deepEqual(player.position,pose);assert.equal(player[kind==='aircraft'?'vehicleId':'seatedId'],'occupied');assert.equal(state.actors.occupied.holderId,state.selfId);assert.equal(player.movementRevision,0);
});

test('unsupported saved positions recover to real terrain after reload',async t=>{
 const f=await fixture(t);await f.send();
 await f.store.update(f.world.id,room=>{room.simulation.players['account:visitor'].position={x:10000,y:.02,z:10000};});
 f.reload();const state=await f.send();f.clear(state);assert.ok(Math.abs(state.players[state.selfId].position.x)<40&&Math.abs(state.players[state.selfId].position.z)<40);assert.equal(state.players[state.selfId].movementRevision,1);
});

test('a returning chairlift passenger stays on the moving lift',async t=>{
 const {skiLifts,liftPosition}=await import('../public/js/ski-resort.js');
 const f=await fixture(t);await f.send();f.world.game='ski';const lift=skiLifts[0],pose=liftPosition(lift,.3);
 await f.store.update(f.world.id,room=>{Object.assign(room.simulation.players['account:visitor'],{position:pose,grounded:false,skiLift:{id:lift.id,progress:.3,startedAt:79000,boardingFrom:pose}});});
 f.reload();const state=await f.send(),player=state.players[state.selfId];assert.ok(player.skiLift);assert.equal(player.skiLift.id,lift.id);assert.ok(player.position.y>10);assert.equal(player.movementRevision,0);
});

test('clearance rejects a capsule deep inside a saved solid and ignores an opened or removed piece',async()=>{
 const {ServerBuilderCollision}=await import('../server-builder-collision.mjs');
 const collision=new ServerBuilderCollision(),world={id:'entry-volume',proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:80,objects:[]}};
 const wall={id:'wall',materialId:'brick',position:[0,2,0],rotation:[0,0,0],scale:[4,10,4]},point={x:0,y:.02,z:0};
 assert.equal(collision.hasBodyClearance(world,point,.38,{objects:{wall}}),false);
 assert.equal(collision.hasBodyClearance(world,point,.38,{objects:{wall:{...wall,open:true}}}),true);
 assert.equal(collision.hasBodyClearance(world,point,.38,{objects:{wall:{...wall,deleted:true}}}),true);
 collision.clearPlacedWorlds();
});

test('rotated saved walls preserve empty floor inside their world bounding box',async()=>{
 const {ServerBuilderCollision}=await import('../server-builder-collision.mjs');
 const collision=new ServerBuilderCollision(),world={id:'rotated-clear-entry',proceduralLand:true,builderScene:{layout:'grand-floor',objects:[]}};
 const wall={id:'wall',materialId:'wall',position:[0,1.2,0],rotation:[0,Math.PI/4,0],scale:[4,1,1]},placed={objects:{wall}};
 assert.equal(collision.hasBodyClearance(world,{x:1.5,y:.02,z:1.5},.38,placed),true,'the rotated world envelope is empty away from the actual wall');
 assert.equal(collision.hasBodyClearance(world,{x:0,y:.02,z:0},.38,placed),false,'a player enclosed in the actual primitive still requires recovery');
 assert.equal(collision.hasBodyClearance(world,{x:0,y:.02,z:.1},.38,placed),false,'nearby actual wall faces remain solid');
});
