import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {forestHarvestWorld} from '../forest-harvest-world.mjs';
import {FOREST_TREES,FOREST_VEHICLES} from '../public/js/forest-harvest-config.js';
import {localMapLocations} from '../public/js/local-map-locations.js';
import {createRoomSnapshotEncoder,hydrateRoomSnapshot,snapshotAcknowledgements} from '../public/js/room-snapshot.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'authoritative-forest-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'rooms.json'),environment=forestHarvestWorld();
 let now=1_000_000,sequence=0;
 const identity={accountId:'forest-worker',username:'Forest worker',walletId:'account:forest-worker'};
 let runtime=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>now});
 t.after(()=>runtime.collision.clearWorlds());
 const send=(action,fields={},who=identity)=>{now+=800;return runtime.command(environment.id,environment,who,{action,requestId:'forest-'+ ++sequence,...fields});};
 const change=fn=>runtime.store.update(environment.id,room=>fn(room.simulation));
 const move=(position,who=identity)=>change(sim=>{
  const player=sim.players['account:'+who.accountId];
  player.position={...position};player.floor=position.y;player.grounded=true;player.velocityY=0;player.input={};player.lastSeen=now;
 });
 return {environment,identity,send,change,move,file,get runtime(){return runtime;},get now(){return now;},advance:ms=>now+=ms,
  async restart(){await runtime.store.flush();runtime.collision.clearWorlds();runtime=new AuthoritativeRooms({store:new SharedRoomStore(file),now:()=>now});}
 };
}

test('forest room shares peaceful harvest state and every map destination has supported clear ground',async t=>{
 const f=await fixture(t),joined=await f.send('join'),id=joined.selfId;
 assert.equal(joined.radTox,null);assert.equal(joined.match,null);assert.equal(joined.players[id].radToxEnabled,false);
 assert.equal(Object.keys(joined.forestHarvest.trees).length,48);
 assert.ok(!Object.values(joined.actors).some(actor=>actor.radTox||actor.loot||actor.runtimeMachine||actor.roadFleet||actor.trafficAI&&!actor.resident));
 for(const place of localMapLocations(f.environment)){
  const arrival=await f.send('map-access',{locationId:place.id}),position=arrival.players[id].position;
  const options={actors:arrival.actors,objects:arrival.objects};
  assert.match(arrival.result.message,/^Arrived at /,place.id);
  const floor=f.runtime.collision.groundAt(f.environment,position,options);
  assert.ok(floor&&Math.abs(floor.y-position.y)<.05,place.id+' floor');
  assert.ok(f.runtime.collision.hasBodyClearance(f.environment,position,.38,options),place.id+' player clearance');
 }
 const tree=FOREST_TREES[0];await f.move(tree.position);
 const cut=await f.send('forest-fell',{treeId:tree.id,position:{x:999,y:0,z:999},power:999});
 assert.equal(cut.forestHarvest.trees[tree.id].hits,1);
 const other={accountId:'forest-second',username:'Second worker',walletId:'account:forest-second'};
 const second=await f.send('join',{},other);
 assert.equal(second.forestHarvest.trees[tree.id].hits,1);
 assert.equal(second.players[second.selfId].forestHarvest.progress.harvested,0);
});

test('real room commands conserve harvested timber through haul, mill, drying and crafting after durable restart',async t=>{
 const f=await fixture(t),joined=await f.send('join'),id=joined.selfId,tree=FOREST_TREES[0];
 await assert.rejects(f.send('forest-fell',{treeId:tree.id,position:tree.position}),/Move within/);
 await f.move(tree.position);
 for(let stroke=0;stroke<4;stroke++)await f.send('forest-fell',{treeId:tree.id});
 await f.send('forest-buck',{treeId:tree.id});
 const loaded=await f.send('forest-load',{treeId:tree.id});
 assert.equal(loaded.players[id].forestHarvest.cargo.pine,2);
 assert.equal(Object.values(loaded.forestHarvest.logs).filter(log=>log.treeId===tree.id).length,2);
 await assert.rejects(f.send('forest-unload'),/Go to/);
 await f.send('map-access',{locationId:'forest-mill'});
 await f.send('forest-unload');
 const milling=await f.send('forest-mill',{speciesId:'pine',productId:'plank',quantity:2});
 assert.equal(milling.players[id].forestHarvest.stock.logs.pine,0);
 assert.equal(milling.players[id].forestHarvest.stock.green['pine:plank']||0,0);
 await f.restart();
 f.advance(5000);
 const resumed=await f.send('join');
 assert.equal(resumed.forestHarvest.trees[tree.id].phase,'stump');
 assert.equal(resumed.players[id].forestHarvest.stock.green['pine:plank'],8);
 await f.send('map-access',{locationId:'forest-kiln'});
 await f.send('forest-dry',{speciesId:'pine',productId:'plank',quantity:4});
 f.advance(7000);await f.send('forest-status');
 await f.send('map-access',{locationId:'forest-workbench'});
 const crafted=await f.send('forest-craft',{recipeId:'planter',speciesId:'pine',quantity:1,modelId:'material:gold',requestId:'craft-planter-once'});
 assert.equal(crafted.result.crafted.modelId,'material:planter');
 assert.equal(crafted.players[id].forestHarvest.stock.dry['pine:plank'],0);
 assert.equal(crafted.players[id].forestHarvest.stock.green['pine:plank'],4);
 assert.equal(crafted.players[id].forestHarvest.progress.milled,8);
 assert.equal(crafted.players[id].forestHarvest.progress.crafted,1);
 const retried=await f.send('forest-craft',{recipeId:'planter',speciesId:'pine',quantity:1,requestId:'craft-planter-once'});
 assert.equal(retried.players[id].forestHarvest.crafted.length,1);
});

test('shared forestry machines board, drive and require their actual operator for work',async t=>{
 const f=await fixture(t),joined=await f.send('join'),id=joined.selfId,vehicle=FOREST_VEHICLES.find(item=>item.kind==='harvester');
 await f.send('map-access',{locationId:vehicle.id});
 await f.send('forest-equip',{equipmentId:'harvester'});
 const tree=FOREST_TREES[0];await f.move(tree.position);
 await assert.rejects(f.send('forest-fell',{treeId:tree.id}),/Board/);
 await f.send('map-access',{locationId:vehicle.id});
 const boarded=await f.send('interact',{entityId:vehicle.id});
 assert.equal(boarded.players[id].vehicleId,vehicle.id);
 assert.equal(boarded.actors[vehicle.id].holderId,id);
 const start={...boarded.actors[vehicle.id].position};
 await f.send('input',{input:{forward:1,side:0,yaw:0}});
 for(let frame=0;frame<6;frame++){f.advance(100);await f.runtime.snapshot(f.environment.id,f.environment);}
 const driven=await f.send('input',{input:{forward:0,brake:true,yaw:0}});
 assert.ok(Math.hypot(driven.actors[vehicle.id].position.x-start.x,driven.actors[vehicle.id].position.z-start.z)>.05,'operator input moves the real machine');
 await f.change(sim=>{
  const actor=sim.actors[vehicle.id];actor.position={...tree.position,x:tree.position.x+5};actor.driving={...actor.driving,speed:0,parked:true};
  const player=sim.players[id];player.position={...actor.position};player.input={};player.floor=player.position.y;player.lastSeen=f.now;
 });
 const felled=await f.send('forest-fell',{treeId:tree.id});
 assert.equal(felled.forestHarvest.trees[tree.id].phase,'felled');
 const other={accountId:'forest-other-driver',username:'Other',walletId:'account:forest-other-driver'};await f.send('join',{},other);
 await f.move(felled.actors[vehicle.id].position,other);
 await assert.rejects(f.send('interact',{entityId:vehicle.id},other),/Another player/);
});

test('compact room snapshots retain forestry state on acknowledged frames and transmit changed tree cuts',async t=>{
 const f=await fixture(t),joined=await f.send('join'),encode=createRoomSnapshotEncoder();
 const request={action:'input',snapshotMode:'compact',snapshotProtocol:2,sceneVersion:joined.sceneVersion};
 const first=hydrateRoomSnapshot(encode(joined,request,f.environment));
 const secondWire=encode(joined,{...request,snapshotAcknowledgements:snapshotAcknowledgements(first)},f.environment);
 assert.ok(secondWire.snapshotUnchanged.includes('forestHarvest'));
 const second=hydrateRoomSnapshot(secondWire,first);
 assert.deepEqual(second.forestHarvest,joined.forestHarvest);
 const tree=FOREST_TREES[0];await f.move(tree.position);const cut=await f.send('forest-fell',{treeId:tree.id});
 const thirdWire=encode(cut,{...request,snapshotAcknowledgements:snapshotAcknowledgements(second)},f.environment);
 assert.ok(!thirdWire.snapshotUnchanged?.includes('forestHarvest'));
 const third=hydrateRoomSnapshot(thirdWire,second);
 assert.equal(third.forestHarvest.trees[tree.id].hits,1);
 assert.equal(second.forestHarvest.trees[tree.id].hits,0);
});
