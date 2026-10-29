import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {compactRoomSnapshot,hydrateRoomSnapshot} from '../public/js/room-snapshot.js';

test('trusted projection runs before result detachment and retains full recovery and compact replay semantics',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'room-result-projection-'));
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000});
 t.after(async()=>{runtime.clearCaches();await rm(directory,{recursive:true,force:true});});
 const world={id:'projected',updatedAt:'v1',builderScene:{layout:'grand-floor',mapSize:40,objects:[
  {id:'bench',modelId:'camp-log-bench',position:{x:8,y:0,z:0},functionalSettings:{behavior:'decor'}},
  {id:'door',modelId:'door',position:{x:5,y:0,z:0},functionalSettings:{behavior:'door'}}]}},identity={accountId:'alice',username:'Alice'};
 const joined=await runtime.command(world.id,world,identity,{action:'join',requestId:'join',radToxEnabled:false});
 assert.ok(joined.actors.bench,'the existing four-argument API supplies the complete scene');
 const command={action:'input',requestId:'input-1',inputEpoch:joined.inputEpoch,inputSequence:1,input:{side:1},snapshotMode:'compact',sceneVersion:joined.sceneVersion};
 const full=await runtime.command(world.id,world,identity,command);
 assert.ok(full.actors.bench,'compact transport is opt-in through the trusted server projection');
 let captured;
 const projected=await runtime.command(world.id,world,identity,command,{projectResult:snapshot=>{captured=snapshot;return compactRoomSnapshot(snapshot,command,world);}});
 assert.equal(projected.actorsPartial,true);assert.equal(projected.actors.bench,undefined);assert.ok(projected.actors.door);
 assert.equal(projected.selfId,full.selfId);assert.equal(projected.inputEpoch,full.inputEpoch);assert.deepEqual(projected.result,full.result);
 const hydrated=hydrateRoomSnapshot(projected,full);assert.deepEqual(hydrated.actors,full.actors);
 projected.players[joined.selfId].position.x=999;captured.actors.bench.health=0;captured.actors.door.position.x=888;
 const canonical=await store.get(world.id);
 assert.notEqual(canonical.simulation.players[joined.selfId].position.x,999);assert.equal(canonical.simulation.actors.bench.health,100);assert.equal(canonical.simulation.actors.door.position.x,5);
 const cold={...command,requestId:'cold-baseline',inputSequence:2,sceneVersion:'old-map'};
 const recovered=await runtime.command(world.id,world,identity,cold,{projectResult:snapshot=>compactRoomSnapshot(snapshot,cold,world)});
 assert.ok(recovered.actors.bench);assert.notEqual(recovered.actorsPartial,true,'stale client versions retain full recovery baselines');
});

test('a failed projection cannot publish accepted controls or a receipt, and the room queue remains usable',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'room-projection-rollback-'));
 const store=new SharedRoomStore(join(directory,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>100000}),world={id:'rollback',builderScene:{layout:'grand-floor',mapSize:40,objects:[]}},identity={accountId:'alice',username:'Alice'};
 t.after(async()=>{runtime.clearCaches();await rm(directory,{recursive:true,force:true});});
 const joined=await runtime.command(world.id,world,identity,{action:'join',requestId:'join',radToxEnabled:false});
 const input={action:'input',requestId:'project-failed',inputEpoch:joined.inputEpoch,inputSequence:1,input:{side:1}};
 await assert.rejects(runtime.command(world.id,world,identity,input,{projectResult:()=>{throw Error('projection failed');}}),/projection failed/);
 const rolledBack=await store.get(world.id);assert.equal(rolledBack.simulation.players[joined.selfId].lastInputSequence,-1);assert.equal(rolledBack.simulation.receipts[joined.selfId+':project-failed'],undefined);
 const retried=await runtime.command(world.id,world,identity,input);assert.equal(retried.players[joined.selfId].input.side,1);assert.equal((await store.get(world.id)).simulation.players[joined.selfId].lastInputSequence,1);
});
