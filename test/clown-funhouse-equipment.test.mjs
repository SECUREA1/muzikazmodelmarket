import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {equipOwnedFunhouseItem,sprayOwnedFunhouseWater} from '../server-clown-equipment.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';

test('owned clown equipment toggles real slots and water sprays never change health or ammunition',()=>{
 const player={health:100,ammo:120,position:{x:2,y:.02,z:4}};
 for(const [model,slot]of [['funhouse-propeller-hat','hat'],['funhouse-clown-shoes','shoes']]){
  equipOwnedFunhouseItem(player,{id:model,buildAssetId:model},{enabled:true});assert.equal(player.funhouse.costume[slot],true);
  equipOwnedFunhouseItem(player,{id:model,buildAssetId:model},{enabled:false});assert.equal(player.funhouse.costume[slot],false);
 }
 assert.throws(()=>equipOwnedFunhouseItem(player,{buildAssetId:'funhouse-clown-car'}),/costume or water/);
 assert.throws(()=>equipOwnedFunhouseItem(player,{buildAssetId:'funhouse-water-gun'},{enabled:'true'}),/whether/);
 equipOwnedFunhouseItem(player,{id:'owned-gun',sku:'native:funhouse-water-gun',buildAssetId:'funhouse-water-gun'},{itemId:'owned-gun'});
 assert.throws(()=>sprayOwnedFunhouseWater(player,{direction:[0,NaN,1]},1000),/valid/);
 const shot=sprayOwnedFunhouseWater(player,{direction:[0,0,-7],origin:{x:99,y:99,z:99}},1000);
 assert.deepEqual(shot.funhouseEffect.origin,{x:2,y:1.27,z:4});assert.deepEqual(shot.funhouseEffect.direction,[0,0,-1]);
 assert.throws(()=>sprayOwnedFunhouseWater(player,{direction:[0,0,-1]},1299),/refilling/);
 assert.equal(player.health,100);assert.equal(player.ammo,120);
 equipOwnedFunhouseItem(player,{buildAssetId:'funhouse-water-gun'},{enabled:false});
 assert.throws(()=>sprayOwnedFunhouseWater(player,{direction:[0,0,-1]},1400),/Equip/);
});

test('shared rooms verify gear ownership, deduplicate equip and reject a transferred water gun',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'funhouse-equipment-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 let now=100000,number=0,owned=true;
 const asset={id:'owned-gun',sku:'native:funhouse-water-gun',buildAssetId:'funhouse-water-gun',name:'Water Blaster',function_data:{behavior:'interact',funhouseTool:'water',interactionDistance:3}},identity={accountId:'gear-owner',username:'Gear owner',avatar:{buildAssetId:'funhouse-greeter-avatar'}};
 const environment={id:'ordinary-gear-room',name:'Gear room',playable:true,proceduralLand:true,builderScene:{layout:'grand-floor',mapSize:60,objects:[],gameplay:{radTox:false}}};
 const store=new SharedRoomStore(join(dir,'rooms.json')),runtime=new AuthoritativeRooms({store,now:()=>now,resolveAsset:async(_identity,command)=>owned&&(command.itemId===asset.id||command.sku===asset.sku)?asset:null});
 const command=(action,fields={})=>{now+=400;return runtime.command(environment.id,environment,identity,{action,requestId:'gear-'+ ++number,...fields});};
 const joined=await command('join');assert.equal(joined.players[joined.selfId].avatarBuildAssetId,'funhouse-greeter-avatar');
 await assert.rejects(command('funhouse-equip',{itemId:'not-owned'}),/Purchase/);
 const equipped=await command('funhouse-equip',{itemId:asset.id,enabled:true}),self=equipped.selfId;
 assert.equal(equipped.players[self].funhouse.tool,'water');
 const retry=await runtime.command(environment.id,environment,identity,{action:'funhouse-equip',requestId:'gear-'+number,itemId:asset.id,enabled:true});
 assert.equal(retry.players[self].funhouse.tool,'water');
 const before=retry.players[self],shot=await command('funhouse-water',{direction:[0,0,-1]});
 assert.equal(shot.result.funhouseEffect.kind,'water-spray');assert.equal(shot.players[self].health,before.health);assert.equal(shot.players[self].ammo,before.ammo);
 const placed=await command('spawn',{itemId:asset.id});
 const removed=await command('interact',{entityId:placed.result.spawnedId});assert.equal(removed.players[self].funhouse.tool,null);
 now+=1000;
 const worn=await command('interact',{entityId:placed.result.spawnedId});assert.equal(worn.players[self].funhouse.tool,'water');
 owned=false;await assert.rejects(command('funhouse-water',{direction:[0,0,-1]}),/owned water blaster/);
 await store.flush();const restored=new SharedRoomStore(join(dir,'rooms.json'));assert.equal((await restored.read())[environment.id].simulation.players[self].funhouse.tool,'water');
});
