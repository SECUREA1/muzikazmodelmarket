import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorldAtlas} from '../world-atlas.mjs';
import {synchronizeWorldDirectory} from '../world-directory.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {questCatalog} from '../public/js/quest-catalog.js';
import {COMPOUND_ID} from '../public/js/factory-test-config.js';

test('every explorer destination offers local tours and timed routes on real clear floors',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'site-quest-world-matrix-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const repository=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8'));
 const {environments}=await synchronizeWorldDirectory(new WorldAtlas(join(directory,'atlas.json')),repository.map(world=>({...world,source:'repository'})));
 // Hockey and arcade use their own game simulations and native challenges.
 const worlds=environments.filter(world=>!['hockey','arcade'].includes(world.game));
 assert.ok(worlds.some(world=>world.id==='public-commons'));assert.ok(worlds.some(world=>world.airport?.enabled));assert.ok(worlds.some(world=>world.builderScene?.layoutMeta?.harbor));assert.ok(worlds.some(world=>world.modelUrl&&!world.builderScene));
 t.diagnostic(`${worlds.length} authored, generated, imported and specialist destinations use the same physical site checks.`);
 for(const environment of worlds)await t.test(environment.id,async()=>{
  let now=100000,request=0;const user={accountId:'site-visitor',username:'Site visitor',stats:{health:100}},clearance={compound:true,deep:true};
  // Traverse the compound's real tour floors as a member who earned both
  // clearances. Unauthorized entry and deep access have their own gate tests.
  const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(directory,environment.id+'.json')),now:()=>now,
   testingAccess:async identity=>{assert.equal(identity.accountId,user.accountId);return {...clearance};},
   testingState:async()=>({session:null,progress:{},clearance:{...clearance}})
  });
  const send=(action,fields={})=>runtime.command(environment.id,environment,user,{action,requestId:'site-matrix-'+ ++request,...fields});
  const joined=await send('join',{deferRadTox:true,radToxEnabled:false}),offers=questCatalog(environment).filter(offer=>offer.siteQuest);
  if(environment.id===COMPOUND_ID)assert.deepEqual(joined.players[joined.selfId].testing.clearance,clearance,'compound tour visitor has earned deep access');
  assert.ok(offers.some(offer=>offer.kind==='site-tour'&&!offer.challenge),'local discovery tour exists');assert.ok(offers.some(offer=>offer.challenge),'timed local route exists');
  for(const offer of offers){
   const state=await send('vehicle-mission',{operation:'start',questId:offer.id}),quest=state.players[joined.selfId].vehicleMission;
   assert.equal(quest.worldId,environment.id);assert.equal(quest.status,'active');assert.ok(quest.checkpoints.length>=(offer.kind==='site-job'?1:2));
   if(offer.challenge)assert.equal(quest.checkpoints.at(-1).siteId,'map-arrival','timed route returns to the real arrival floor');
   for(const point of quest.checkpoints){
    assert.ok(['x','y','z'].every(axis=>Number.isFinite(point[axis])),`${offer.title}: finite ${point.name}`);
    assert.ok(runtime.collision.hasBodyClearance(environment,point,.38,{actors:state.actors,objects:state.objects}),`${offer.title}: clear ${point.name}`);
    assert.doesNotThrow(()=>runtime.collision.teleportPosition(environment,point,point,state.actors,state.objects,{localMap:true}),`${offer.title}: public usable floor at ${point.name}`);
    if(point.action==='interact'){
     const entity=state.actors[point.entityId];assert.ok(entity?.active,`${offer.title}: real active service item`);
     assert.ok(Math.hypot(point.x-entity.position.x,point.y-entity.position.y,point.z-entity.position.z)<=point.interactionDistance,`${offer.title}: service item reachable from marker`);
    }
   }
   now+=100;await send('vehicle-mission',{operation:'cancel'});
  }
 });
});
