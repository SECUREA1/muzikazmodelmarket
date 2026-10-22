import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('every public explorer world retains walking and jumping after sustained traversal',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'world-traversal-matrix-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const repository=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),repository.map(world=>({...world,source:'repository'})));
 // These destinations have their own simulations. Their input and presentation
 // contracts live in hockey-local-motion.test.mjs and arcade-live-movement.test.mjs.
 const native=environments.filter(world=>['hockey','arcade'].includes(world.game));
 assert.ok(native.some(world=>world.game==='hockey'));
 assert.ok(native.some(world=>world.game==='arcade'));
 const worlds=environments.filter(world=>!native.includes(world));
 assert.ok(worlds.some(world=>world.modelUrl||world.modelUrls?.length),'include imported GLB maps');
 assert.ok(worlds.some(world=>world.builderScene?.layoutMeta?.harbor),'include the populated harbor');
 assert.ok(worlds.some(world=>world.airport?.enabled),'include the populated airport');
 assert.ok(worlds.some(world=>world.id==='public-commons'));
 t.diagnostic(`${worlds.length} explorer worlds and ${native.length} native sports worlds in the public directory.`);

 for(const environment of worlds)await t.test(environment.id,async()=>{
  let now=100000;
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,environment.id+'.json')),now:()=>now});
  const visitor={accountId:'traversal-visitor',username:'Traversal visitor',stats:{health:100}};
  const joined=await runtime.command(environment.id,environment,visitor,{action:'join',requestId:'join',deferRadTox:true,radToxEnabled:false});
  const id=joined.selfId,epoch=joined.result.inputEpoch;
  let previous=joined.players[id].position,travel=0,rise=0,lastSequence=joined.sequence;
  for(let index=0;index<320;index++){
   now+=100;
   // Thirty-two seconds of ordinary input crosses both resident/traffic AI
   // refresh windows. Turn away from real walls rather than requiring a route
   // to pass through authored buildings, railings or the map boundary.
   const input={forward:1,yaw:Math.floor(index/40)%4*Math.PI/2,jump:index%40===0};
   const state=await runtime.command(environment.id,environment,visitor,{action:'input',requestId:'input-'+index,inputEpoch:epoch,inputSequence:index,input});
   const player=state.players[id];
   assert.ok(player,`${environment.id}: the visitor stays in the live room`);
   assert.ok(['x','y','z'].every(axis=>Number.isFinite(player.position[axis])),`${environment.id}: finite physical position after input ${index}`);
   assert.ok(state.sequence>lastSequence,`${environment.id}: the simulation continues to acknowledge input`);
   travel+=Math.hypot(player.position.x-previous.x,player.position.z-previous.z);
   rise=Math.max(rise,player.position.y-previous.y);
   previous=player.position;lastSequence=state.sequence;
  }
  assert.ok(travel>1,`${environment.id}: movement must make progress in at least one direction (${travel} m)`);
  assert.ok(rise>.1,`${environment.id}: jump controls must still produce upward movement (${rise} m)`);
  // Initial progress alone misses a capsule that becomes trapped at a mesh
  // seam later in the walk. A real corner blocks some directions, but must
  // leave a way back out without resetting or teleporting the player.
  const room=await runtime.store.get(environment.id),self=room.simulation.players[id];
  const escapes=Array.from({length:8},(_,index)=>{
   const angle=index*Math.PI/4,next={x:self.position.x+Math.sin(angle)*.3,y:self.position.y-.04,z:self.position.z+Math.cos(angle)*.3};
   const resolved=runtime.collision.resolve(environment,self.position,next,room.simulation.actors,room.objects);
   return Math.hypot(resolved.x-self.position.x,resolved.z-self.position.z);
  });
  assert.ok(escapes.some(distance=>distance>.01),`${environment.id}: late traversal must retain an exit direction at ${JSON.stringify(self.position)}`);
 });
});
