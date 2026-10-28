import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ServerBuilderCollision} from '../server-builder-collision.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

const environment=id=>({id,updatedAt:'v1',spawn:{x:0,y:0,z:2},builderScene:{layout:'grand-floor',mapSize:32,objects:[
 {id:'door',modelId:'door',position:{x:5,y:0,z:0},functionalSettings:{behavior:'door'}}]}});
const crate={id:'crate',spawned:true,active:true,asset:{buildAssetId:'supply-crate'},position:{x:8,y:0,z:0},rotation:{y:0}};

test('active rooms retain real static and placed collision beyond idle cache limits and release it on expiry',()=>{
 const collision=new ServerBuilderCollision({maxPlacedWorlds:2}),worlds=Array.from({length:40},(_,index)=>environment('active-'+index));
 collision.setActiveWorlds(worlds.map(world=>world.id));
 const resources=worlds.map(world=>{
  const staticWorld=collision.world(world),placed=collision.placedWorld({crate:structuredClone(crate)},{},world);
  assert.ok(staticWorld.floors.length>0);assert.ok(placed.meshes.length>0);
  return {staticWorld,placed:collision.placedCache.world};
 });
 let disposed=0;resources[0].staticWorld.floors[0].geometry.addEventListener('dispose',()=>disposed++);
 for(const [index,world]of worlds.entries()){
  assert.strictEqual(collision.world({...world}),resources[index].staticWorld);
  collision.placedWorld({crate:structuredClone(crate)},{},{...world});
  assert.strictEqual(collision.placedCache.world,resources[index].placed);
  const floor=collision.groundAt(world,{x:0,y:0,z:2},{actors:{crate}});assert.ok(floor&&Number.isFinite(floor.y));
 }
 assert.equal(disposed,0);assert.equal(collision.cache.size,40);assert.equal(collision.placedWorlds.size,40);
 const revised=collision.world({...worlds[0],updatedAt:'v2'});
 assert.notStrictEqual(revised,resources[0].staticWorld);assert.equal(collision.cache.size,40);assert.ok(disposed>0);
 collision.setActiveWorlds([]);
 assert.equal(collision.cache.size,0);assert.equal(collision.placedWorlds.size,0);assert.equal(collision.activeWorldIds.size,0);
 collision.clearWorlds();
});

test('background tick owns all live room resources and clears abandoned worlds without dropping populated rooms',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'room-resource-lifecycle-'));let now=100000;
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now});
 t.after(async()=>{runtime.clearCaches();await rm(directory,{recursive:true,force:true});});
 const original=environment('template');
 await runtime.command(original.id,original,{accountId:'visitor',username:'Visitor'},{action:'join',requestId:'template-join',radToxEnabled:false});
 const template=await store.get(original.id);store.data={};runtime.clearCaches();
 for(let index=0;index<40;index++){
  const id='room-'+index,room=structuredClone(template);
  room.simulation.environmentUpdatedAt=id+':v1:[]';store.data[id]=room;runtime.activeWorlds.set(id,environment(id));
 }
 now+=50;await runtime.tickActive();
 assert.equal(runtime.activeWorlds.size,40);assert.equal(runtime.collision.cache.size,40);assert.equal(runtime.manifestCache.size,40);
 for(const room of Object.values(store.data))assert.equal(room.simulation.time,now);
 now+=15001;await runtime.tickActive();
 assert.equal(runtime.activeWorlds.size,0);assert.equal(runtime.collision.cache.size,0);assert.equal(runtime.collision.placedWorlds.size,0);assert.ok(runtime.manifestCache.size<=32);
 runtime.clearCaches();assert.equal(runtime.manifestCache.size,0);assert.equal(runtime.manifestOwners.size,0);
});

test('burst inputs reuse initialization within the physics window while revisions immediately refresh room content',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'room-init-cadence-'));let now=100000;
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now}),world=environment('cadence'),identity={accountId:'visitor',username:'Visitor'};
 t.after(async()=>{runtime.clearCaches();await rm(directory,{recursive:true,force:true});});
 const joined=await runtime.command(world.id,world,identity,{action:'join',requestId:'join',radToxEnabled:false});
 let preparations=0;const initialize=runtime.initialize.bind(runtime);runtime.initialize=(...args)=>{preparations++;return initialize(...args);};
 for(let index=1;index<=20;index++)await runtime.command(world.id,world,identity,{action:'input',requestId:'input-'+index,inputEpoch:joined.inputEpoch,inputSequence:index,input:{side:1}});
 assert.equal(preparations,0,'same-window input bursts cannot repeat expensive world initialization');
 const resting=await store.get(world.id);assert.deepEqual(resting.simulation.players[joined.selfId].position,joined.players[joined.selfId].position);
 now+=33;let snapshot=await runtime.snapshot(world.id,world);assert.equal(preparations,1);assert.ok(snapshot.players[joined.selfId].position.x>joined.players[joined.selfId].position.x);
 world.updatedAt='v2';world.builderScene.objects[0].position.x=7;
 snapshot=await runtime.snapshot(world.id,world);assert.equal(preparations,2);assert.equal(snapshot.actors.door.position.x,7);
 await store.update(world.id,room=>{room.revision++;},{persist:false,roomOnly:true});
 await runtime.snapshot(world.id,world);assert.equal(preparations,3,'saved building edits invalidate same-window preparation');
 world.builderScene.baseTransform={x:2};
 await runtime.snapshot(world.id,world);assert.equal(preparations,4,'alignment changes invalidate immediately even without a new content timestamp');
 assert.equal((await store.get(world.id)).simulation.baseAlignmentKey,JSON.stringify({x:2}));
 const stale=await runtime.command(world.id,world,identity,{action:'input',requestId:'stale-epoch',inputEpoch:'old',inputSequence:999,input:{side:-1}});
 assert.equal(stale.players[joined.selfId].input.side,1,'an old epoch cannot replace accepted controls');
 assert.equal((await store.get(world.id)).simulation.players[joined.selfId].lastInputSequence,20);
});
