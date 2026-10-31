import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {bunkerWorld} from '../bunker-world.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {BUNKER_DEFENSE_DAMAGE as DAMAGE} from '../public/js/bunker-defense-rules.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'bunker-defense-shared-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const world=bunkerWorld(),file=join(directory,'rooms.json'),store=new SharedRoomStore(file);
 let now=1000000,sequence=0;
 const runtime=new AuthoritativeRooms({store,now:()=>now,doomsdayRandom:()=>0});
 const surface={accountId:'surface-observer',username:'Surface observer'},sheltered={accountId:'shelter-observer',username:'Shelter observer'};
 const surfaceId='account:'+surface.accountId,shelteredId='account:'+sheltered.accountId;
 const send=async(identity,action,fields={})=>{now+=100;return runtime.command(world.id,world,identity,{action,requestId:'defense-shared-'+ ++sequence,...fields});};
 await send(surface,'join',{deferRadTox:true,radToxEnabled:false});
 await send(sheltered,'join',{deferRadTox:true,radToxEnabled:false});
 // This visitor stands directly above the bunker rooms, on actual surface terrain.
 await send(surface,'teleport-floor',{position:{x:16,y:.02,z:70}});
 await send(surface,'teleport-floor',{position:{x:16,y:.02,z:4}});
 const shelterPoint={x:0,y:world.bunkerDefense.undergroundLevel+.02,z:27.5};
 await send(sheltered,'map-access',{position:shelterPoint});
 const at=async target=>{
  now=target;
  await store.update(world.id,room=>{for(const player of Object.values(room.simulation.players)){player.lastSeen=now;player.spawnProtectedUntil=0;}});
  return runtime.snapshot(world.id,world);
 };
 const state=()=>runtime.snapshot(world.id,world);
 return {world,file,store,runtime,surface,sheltered,surfaceId,shelteredId,send,at,state,get now(){return now;}};
}

test('shared airstrikes and nuclear impacts damage surface visitors once while the sealed underground shelter protects its occupants',async t=>{
 const f=await fixture(t);let state=await f.state();
 assert.ok(state.bunkerDefense,'real shared rooms publish bunker readiness');
 assert.equal(state.bunkerDefense.protection[f.surfaceId].underground,false);
 assert.ok(Math.abs(state.players[f.surfaceId].position.y-.02)<.1,'the exposed observer is on actual overburden terrain above the rooms');
 assert.equal(state.bunkerDefense.protection[f.shelteredId].blastProtected,true);
 assert.equal(state.bunkerDefense.protection[f.shelteredId].falloutProtected,true);
 const nuclearDue=state.doomsday.nextEventAt;
 state=await f.at(state.bunkerDefense.airstrike.nextEventAt);
 assert.equal(state.bunkerDefense.airstrike.phase,'warning');
 assert.equal(state.bunkerDefense.alarm.kind,'airstrike');
 const strikeId=state.bunkerDefense.airstrike.id;
 state=await f.at(state.bunkerDefense.airstrike.impactAt);
 assert.equal(state.players[f.surfaceId].health,100-DAMAGE.airstrikeExposed);
 assert.equal(state.players[f.shelteredId].health,100);
 assert.equal(state.bunkerDefense.impacts.filter(impact=>impact.id===strikeId).length,1);
 const surfaceAfterAirstrike=state.players[f.surfaceId].health;
 state=await f.at(f.now+100);
 assert.equal(state.players[f.surfaceId].health,surfaceAfterAirstrike,'ordinary room steps cannot replay an impact');
 let reloaded=await new AuthoritativeRooms({store:new SharedRoomStore(f.file),now:()=>f.now,doomsdayRandom:()=>0}).snapshot(f.world.id,f.world);
 assert.equal(reloaded.players[f.surfaceId].health,surfaceAfterAirstrike,'restarting the room store cannot replay an airstrike');
 assert.equal(reloaded.bunkerDefense.impacts.filter(impact=>impact.id===strikeId).length,1);
 // Give the exposed observer a fresh health baseline to compare the second
 // threat independently; their surface position and protection stay unchanged.
 await f.store.update(f.world.id,room=>{room.simulation.players[f.surfaceId].health=100;});
 state=await f.at(nuclearDue);
 assert.equal(state.doomsday.phase,'warning');assert.equal(state.bunkerDefense.alarm.kind,'nuclear');
 const nuclearId=state.doomsday.id;
 state=await f.at(state.doomsday.detonationAt);
 assert.equal(state.players[f.surfaceId].health,100-DAMAGE.nuclearExposed);
 assert.equal(state.players[f.shelteredId].health,100);
 assert.equal(state.bunkerDefense.protection[f.shelteredId].level,'protected');
 reloaded=await new AuthoritativeRooms({store:new SharedRoomStore(f.file),now:()=>f.now,doomsdayRandom:()=>0}).snapshot(f.world.id,f.world);
 assert.equal(reloaded.players[f.surfaceId].health,100-DAMAGE.nuclearExposed,'a reconnect during detonation cannot apply the same nuclear impact twice');
 assert.equal(reloaded.bunkerDefense.impacts.filter(impact=>impact.id===nuclearId+':blast').length,1);
 state=await f.at(state.doomsday.falloutAt);
 assert.equal(state.doomsday.phase,'fallout');
 assert.equal(state.players[f.surfaceId].health,100-DAMAGE.nuclearExposed-DAMAGE.falloutExposed);
 assert.equal(state.players[f.shelteredId].health,100,'sealed, powered filtration blocks the fallout pulse');
 const afterPulse=state.players[f.surfaceId].health;
 state=await f.at(f.now+100);
 assert.equal(state.players[f.surfaceId].health,afterPulse,'fallout damage is bounded to one pulse per interval');
 assert.equal(state.radTox,null,'emergency protection does not enable unrelated ambient combat');
});

test('the actual entrance shutter and filtration control change shelter protection, and missing equipment never grants readiness',async t=>{
 const f=await fixture(t);let state=await f.state();
 const shutterId=f.world.bunkerDefense.stations.shutter,filterId=f.world.bunkerDefense.stations.filtration;
 assert.equal(state.bunkerDefense.systems.sealed,true);
 await f.send(f.sheltered,'map-access',{position:{x:0,y:f.world.bunkerDefense.undergroundLevel+.02,z:27.5}});
 state=await f.send(f.sheltered,'interact',{entityId:shutterId});
 assert.equal(state.actors[shutterId].open,true,'the normal interaction opens the physical entrance shutter');
 state=await f.state();
 assert.equal(state.bunkerDefense.protection[f.shelteredId].underground,true);
 assert.equal(state.bunkerDefense.protection[f.shelteredId].blastProtected,false);
 assert.equal(state.bunkerDefense.protection[f.shelteredId].level,'unsealed');
 state=await f.send(f.sheltered,'interact',{entityId:shutterId});assert.equal(state.actors[shutterId].open,false);
 state=await f.state();assert.equal(state.bunkerDefense.protection[f.shelteredId].blastProtected,true);
 const filter=state.actors[filterId],approach={x:filter.position.x,y:filter.position.y+.02,z:filter.position.z+2.5};
 await f.send(f.sheltered,'map-access',{position:approach});
 state=await f.send(f.sheltered,'interact',{entityId:filterId});assert.equal(state.actors[filterId].switched,false);
 state=await f.state();
 assert.equal(state.bunkerDefense.protection[f.shelteredId].blastProtected,true,'closed underground cover still protects from blast');
 assert.equal(state.bunkerDefense.protection[f.shelteredId].falloutProtected,false,'stopping filtration removes fallout protection');
 assert.equal(state.bunkerDefense.systems.ready,false);
 await f.store.update(f.world.id,room=>{delete room.simulation.actors[filterId];});
 // Removing the authored component is the supported editable-map operation.
 const edited=structuredClone(f.world);edited.id='bunker-missing-filter';edited.builderScene.objects=edited.builderScene.objects.filter(object=>object.id!==filterId);
 const missing=await f.runtime.command(edited.id,edited,f.sheltered,{action:'join',requestId:'missing-filter-arrival',deferRadTox:true,radToxEnabled:false});
 assert.equal(missing.bunkerDefense.systems.filtration.available,false);
 assert.equal(missing.bunkerDefense.systems.ready,false,'stale defense metadata cannot turn a deleted filter into protection');
});

test('alert acknowledgement requires a live player at the physical console and never clears the threat',async t=>{
 const f=await fixture(t);let state=await f.state();state=await f.at(state.bunkerDefense.airstrike.nextEventAt);
 await assert.rejects(f.send(f.surface,'bunker-defense',{operation:'acknowledge'}),/within reach/);
 const alert=state.actors[f.world.bunkerDefense.stations.alert];
 await f.send(f.sheltered,'map-access',{position:{x:alert.position.x,y:alert.position.y+.02,z:alert.position.z+2.5}});
 state=await f.send(f.sheltered,'bunker-defense',{operation:'acknowledge'});
 assert.equal(state.bunkerDefense.alarm.acknowledgedBy,f.shelteredId);
 assert.equal(state.bunkerDefense.alarm.active,true,'acknowledging the message cannot skip the strike');
 assert.equal(state.bunkerDefense.airstrike.phase,'warning');
 await assert.rejects(f.send(f.sheltered,'bunker-defense',{operation:'stop'}),/physical controls/);
});
