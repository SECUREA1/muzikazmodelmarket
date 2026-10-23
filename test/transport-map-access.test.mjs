import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {airportWorld} from '../airport-world.mjs';
import {neonMarina} from '../neon-marina.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {supportsRadTox} from '../rad-tox-campaign.mjs';
const port=neonMarina();const marina={id:'neon-docks-map-test',name:'Neon Docks',proceduralLand:true,spawn:{x:124,y:0,z:30},builderScene:{layout:'community-park',mapSize:256,layoutMeta:{harbor:port.harbor,locations:port.locations},objects:port.objects}};
for(const world of [airportWorld(),marina])test(world.name+' map travel and boarding share one authoritative space',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'transport-map-'));t.after(()=>rm(dir,{recursive:true,force:true}));const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000});let request=0;
 const alice={accountId:'alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',username:'Bob',stats:{health:100}};
 const send=(user,action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'map-'+ ++request,...fields});
 await send(alice,'join');await send(bob,'join');assert.equal(supportsRadTox(world),false);
 for(const place of world.builderScene.layoutMeta.locations){const state=await send(alice,'map-access',{locationId:place.id});const position=state.players['account:alice'].position;assert.ok(Math.hypot(position.x-(place.arrival||place).x,position.z-(place.arrival||place).z)<=13,place.name+' arrives nearby');assert.ok(position.y>=0);assert.equal(Object.keys(state.players).length,2);assert.equal(state.players['account:alice'].radToxEnabled,false);}
 const craft=world.builderScene.objects.filter(o=>['corsair-aircraft','diamond-da40','piper-cub','harbor-skiff','harbor-sailboat'].includes(o.modelId));
 let state=await send(alice,'map-access',{entityId:craft[0].id});assert.equal(state.players['account:alice'].vehicleId,craft[0].id);assert.equal(state.actors[craft[0].id].holderId,'account:alice');
 await assert.rejects(send(bob,'map-access',{entityId:craft[0].id}),/Another player/);
 state=await send(bob,'map-access',{entityId:craft[1].id});assert.equal(state.players['account:bob'].vehicleId,craft[1].id);assert.equal(state.players['account:alice'].vehicleId,craft[0].id);
 state=await send(alice,'map-access',{locationId:world.builderScene.layoutMeta.locations[0].id});assert.equal(state.players['account:alice'].vehicleId,null);assert.equal(state.actors[craft[0].id].holderId,null);assert.equal(state.players['account:bob'].vehicleId,craft[1].id);
 await assert.rejects(send(alice,'map-access',{entityId:'missing'}),/unavailable/);await assert.rejects(send(alice,'map-access',{locationId:'missing'}),/listed/);
});
for(const world of [airportWorld(),marina])test(world.name+' allows tools immediately after a deferred combat join',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'transport-tools-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000});let request=0;
 const user={accountId:'visitor',username:'Visitor',stats:{health:100}},send=(action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'tools-'+ ++request,...fields});
 // The explorer defers combat assets on every cold join, even in transport maps.
 // A saved combat preference must not put those maps into a loading state.
 const joined=await send('join',{deferRadTox:true,radToxEnabled:true});
 assert.equal(joined.players['account:visitor'].radToxReady,true);
 assert.equal(joined.players['account:visitor'].radToxEnabled,false);
 const fired=await send('fire',{tool:'laser',direction:[0,1,0]});
 assert.equal(fired.players['account:visitor'].ammo,119);
 assert.equal(fired.events.at(-1).action,'fire');
 assert.equal(fired.radTox,null);
});
test('transport floors preserve their authored materials and clear previous slime when switching maps',async()=>{
 const {EnvironmentLoader}=await import('../public/js/environments/environment-loader.js');const {createBuilderLand}=await import('../public/js/environments/builder-land.js');
 const loader=Object.create(EnvironmentLoader.prototype);
 for(const world of [airportWorld(),marina]){
  loader.world=createBuilderLand(world);const floor=loader.world.children.find(node=>node.isMesh&&node.name.startsWith('BUILDER_WALKABLE_FLOOR'));assert.ok(floor);const material=floor.material;
  loader.activeEnvironment={id:'toxic-test'};loader.refreshFloorEffects();assert.ok(loader.floorSlime);assert.notEqual(floor.material,material);
  loader.activeEnvironment=world;loader.refreshFloorEffects();assert.equal(loader.floorSlime,null);assert.equal(floor.material,material,'restores original terrain material');
  if(world.builderScene.layoutMeta.harbor){const water=loader.world.getObjectByName('HARBOR_WATER_VISUAL');assert.equal(water.userData.waterSurface,true);assert.equal(water.userData.collisionDisabled,true);assert.ok(water.material.transparent);}
 }
});
test('travel rotates input epoch so delayed pre-travel controls cannot move or turn the new position',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'travel-input-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=100000,n=0;
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>now}),world={id:'public-commons',proceduralLand:true,spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:100,objects:[]}},who={accountId:'traveler'},send=(action,fields={})=>runtime.command(world.id,world,who,{action,requestId:'epoch-'+ ++n,...fields});
 const joined=await send('join'),oldEpoch=joined.result.inputEpoch;const moved=await send('map-access',{position:{x:15,z:15}}),newEpoch=moved.result.inputEpoch;
 assert.ok(newEpoch);assert.notEqual(newEpoch,oldEpoch);assert.equal(joined.inputEpoch,oldEpoch);assert.equal(moved.inputEpoch,newEpoch);const start={...moved.players['account:traveler'].position};
 await send('input',{inputEpoch:oldEpoch,inputSequence:999,input:{forward:1,yaw:2}});now+=100;const stale=await send('input',{inputEpoch:oldEpoch,inputSequence:1000,input:{forward:1,yaw:2}});assert.ok(Math.hypot(stale.players['account:traveler'].position.x-start.x,stale.players['account:traveler'].position.z-start.z)<1e-8);assert.ok(Math.abs(stale.players['account:traveler'].position.y-start.y)<1e-8);assert.notEqual(stale.players['account:traveler'].yaw,2);assert.equal(stale.inputEpoch,newEpoch,'rejected controls still acknowledge the epoch needed to resume');
 await send('input',{inputEpoch:newEpoch,inputSequence:1,input:{forward:1,yaw:0}});now+=100;const fresh=await send('input',{inputEpoch:newEpoch,inputSequence:2,input:{forward:1,yaw:0}});assert.ok(fresh.players['account:traveler'].position.z<start.z);
});

test('receipt replays return the current control epoch while preserving the original action result',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'receipt-epoch-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json')),now:()=>100000}),world={id:'public-commons',proceduralLand:true,spawn:{x:0,y:0,z:0},builderScene:{layout:'grand-floor',mapSize:100,objects:[]}},who={accountId:'traveler'},send=(action,requestId,fields={})=>runtime.command(world.id,world,who,{action,requestId,...fields});
 const joined=await send('join','receipt-join'),first=await send('map-access','receipt-first',{position:{x:12,z:12}}),second=await send('map-access','receipt-second',{position:{x:20,z:20}});
 assert.notEqual(first.inputEpoch,second.inputEpoch);
 const replay=await send('map-access','receipt-first',{position:{x:12,z:12}});
 assert.deepEqual(replay.result,first.result);assert.equal(replay.inputEpoch,second.inputEpoch);assert.deepEqual(replay.players[replay.selfId].position,second.players[second.selfId].position);
 const replayedInput=await send('input','receipt-stale-input',{inputEpoch:joined.inputEpoch,inputSequence:999,input:{side:1,yaw:0}});
 assert.equal(replayedInput.inputEpoch,second.inputEpoch);assert.deepEqual(replayedInput.players[replayedInput.selfId].input,{yaw:0});
});
