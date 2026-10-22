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
 const dir=await mkdtemp(join(tmpdir(),'transport-map-'));t.after(()=>rm(dir,{recursive:true,force:true}));const runtime=new AuthoritativeRooms({store:new SharedRoomStore(join(dir,'rooms.json'))});let request=0;
 const alice={accountId:'alice',username:'Alice',stats:{health:100}},bob={accountId:'bob',username:'Bob',stats:{health:100}};
 const send=(user,action,fields={})=>runtime.command(world.id,world,user,{action,requestId:'map-'+ ++request,...fields});
 await send(alice,'join');await send(bob,'join');assert.equal(supportsRadTox(world),false);
 for(const place of world.builderScene.layoutMeta.locations){const state=await send(alice,'map-access',{locationId:place.id});const position=state.players['account:alice'].position;assert.ok(Math.hypot(position.x-place.x,position.z-place.z)<=13,place.name+' arrives nearby');assert.ok(position.y>=0);assert.equal(Object.keys(state.players).length,2);assert.equal(state.players['account:alice'].radToxEnabled,false);}
 const craft=world.builderScene.objects.filter(o=>['corsair-aircraft','diamond-da40','piper-cub','harbor-skiff','harbor-sailboat'].includes(o.modelId));
 let state=await send(alice,'map-access',{entityId:craft[0].id});assert.equal(state.players['account:alice'].vehicleId,craft[0].id);assert.equal(state.actors[craft[0].id].holderId,'account:alice');
 await assert.rejects(send(bob,'map-access',{entityId:craft[0].id}),/Another player/);
 state=await send(bob,'map-access',{entityId:craft[1].id});assert.equal(state.players['account:bob'].vehicleId,craft[1].id);assert.equal(state.players['account:alice'].vehicleId,craft[0].id);
 await assert.rejects(send(alice,'map-access',{locationId:world.builderScene.layoutMeta.locations[0].id}),/leave your vehicle/);
 await send(alice,'interact');await assert.rejects(send(alice,'map-access',{entityId:'missing'}),/unavailable/);await assert.rejects(send(alice,'map-access',{locationId:'missing'}),/listed/);
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
