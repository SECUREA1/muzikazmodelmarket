import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('batch ticks isolate results, failed rooms and retained callback references; checkpoints survive restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'room-tick-isolation-'));
 try{
  const store=new SharedRoomStore(join(dir,'rooms.json'));
  for(const id of ['active','failed','sleeping'])await store.update(id,room=>{room.simulation={players:{alice:{position:{x:0,y:0,z:0}}}};});
  let retained;const error=Error('bad room');let ticks=0;
  const result=await store.updateMany(['active','active','failed'],(room,id)=>{
   room.simulation.players.alice.position.x=4;
   if(id==='failed')throw error;
   ticks++;retained=room;return room.simulation.players.alice;
  });
  assert.equal(ticks,1);assert.equal(result[1].error,error);
  retained.simulation.players.alice.position.x=999;result[0].result.position.x=888;
  assert.equal((await store.get('active')).simulation.players.alice.position.x,4);
  assert.equal((await store.get('failed')).simulation.players.alice.position.x,0);
  assert.equal((await store.get('sleeping')).simulation.players.alice.position.x,0);
  const exposed=await store.read();exposed.sleeping.simulation.players.alice.position.x=777;
  assert.equal((await store.get('sleeping')).simulation.players.alice.position.x,0);
  await Promise.all([
   store.updateMany(['active'],room=>{room.simulation.players.alice.position.x++;}),
   store.update('active',room=>{room.simulation.players.alice.position.x++;},{persist:false,roomOnly:true})
  ]);
  await store.flush();
  const reopened=new SharedRoomStore(store.file);
  assert.equal((await reopened.get('active')).simulation.players.alice.position.x,6);
  assert.deepEqual(await reopened.get('sleeping'),await store.get('sleeping'));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('empty and failed ticks preserve pending changes for the next durable checkpoint',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'room-tick-empty-'));
 try{
  const store=new SharedRoomStore(join(dir,'rooms.json'));
  await store.update('active',room=>{room.marker=42;},{persist:false,roomOnly:true});
  assert.deepEqual(await store.updateMany([],()=>assert.fail('no rooms')) ,[]);
  await store.updateMany(['active'],room=>{room.marker=0;throw Error('retry');});
  await store.updateMany([],()=>assert.fail('no rooms'),{persist:true});assert.equal((await new SharedRoomStore(store.file).get('active')).marker,42);
 }finally{await rm(dir,{recursive:true,force:true});}
});
