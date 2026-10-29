import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureForestHarvest,stepForestHarvest,forestHarvestCommand,forestHarvestView} from '../server-forest-harvest.mjs';
import {FOREST_TREES,FOREST_STATIONS,FOREST_VEHICLES,FOREST_SPECIES,FOREST_GROWTH_MS} from '../public/js/forest-harvest-config.js';

function fixture(){
 const environment={id:'forest-harvest',game:'forest-harvest'},sim={players:{},actors:{}},player={actorId:'alice',position:{x:-18,y:.02,z:46}},other={actorId:'bob',position:{x:-18,y:.02,z:46}};
 sim.players.alice=player;sim.players.bob=other;for(const vehicle of FOREST_VEHICLES)sim.actors[vehicle.id]={...structuredClone(vehicle),active:true,holderId:null};
 let now=1_000_000;ensureForestHarvest(sim,environment,now);
 const send=(action,fields={})=>{now+=800;return forestHarvestCommand(sim,player,environment,{action,...fields},now);};
 const at=position=>player.position={...position};
 const station=kind=>at(FOREST_STATIONS.find(value=>value.kind===kind).approach);
 const equip=equipmentId=>{station('equipment');return send('forest-equip',{equipmentId});};
 const board=(kind,position)=>{const vehicle=FOREST_VEHICLES.find(value=>value.kind===kind),actor=sim.actors[vehicle.id];player.vehicleId=actor.id;actor.holderId=player.actorId;if(position)actor.position={...position};at(actor.position);};
 const harvest=(treeId=FOREST_TREES[0].id)=>{const tree=sim.forestHarvest.trees[treeId];at(tree.position);for(let hit=0;hit<4;hit++)send('forest-fell',{treeId});send('forest-buck',{treeId});return tree;};
 return {environment,sim,player,other,send,at,station,equip,board,harvest,tick:milliseconds=>{now+=milliseconds;stepForestHarvest(sim,environment,now);},get now(){return now;}};
}

test('felling and bucking conserve tree yields, protect distance, and share depleted trees',()=>{
 const f=fixture(),tree=FOREST_TREES[0];
 assert.throws(()=>f.send('forest-fell',{treeId:tree.id}),/within/);
 f.at(tree.position);f.send('forest-fell',{treeId:tree.id});
 assert.throws(()=>forestHarvestCommand(f.sim,f.player,f.environment,{action:'forest-fell',treeId:tree.id},f.now+100),/stroke/);
 for(let i=0;i<3;i++)f.send('forest-fell',{treeId:tree.id});
 assert.equal(f.sim.forestHarvest.trees[tree.id].phase,'felled');
 f.send('forest-buck',{treeId:tree.id});
 assert.equal(Object.values(f.sim.forestHarvest.logs).length,FOREST_SPECIES[tree.speciesId].logs);
 assert.equal(f.player.forestHarvest.progress.harvested,1);
 assert.throws(()=>f.send('forest-buck',{treeId:tree.id}),/Fell/);
 f.other.position={...tree.position};
 assert.throws(()=>forestHarvestCommand(f.sim,f.other,f.environment,{action:'forest-fell',treeId:tree.id},f.now+1000),/standing/);
});

test('vehicle capacity requires the real boarded machine and cargo stays bound to it',()=>{
 const f=fixture(),tree=f.harvest();f.equip('log-truck');f.at(tree.position);
 assert.throws(()=>f.send('forest-load',{treeId:tree.id}),/Board/);
 f.board('log-truck',tree.position);f.send('forest-load',{treeId:tree.id});
 assert.equal(f.player.forestHarvest.cargo[tree.speciesId],FOREST_SPECIES[tree.speciesId].logs);
 assert.equal(f.player.forestHarvest.cargoVehicleId,'forest-log-truck');
 f.player.vehicleId=null;f.station('mill');
 assert.throws(()=>f.send('forest-unload'),/Drive/);
 f.board('log-truck',FOREST_STATIONS.find(station=>station.kind==='mill').approach);f.send('forest-unload');
 assert.equal(f.player.forestHarvest.stock.logs[tree.speciesId],FOREST_SPECIES[tree.speciesId].logs);
 assert.equal(Object.values(f.sim.forestHarvest.logs).length,0);
 assert.throws(()=>f.send('forest-unload'),/Load timber/);
});

test('sawing and drying consume exact species stock, finish once, and cannot mint on request',()=>{
 const f=fixture(),tree=f.harvest();
 // The hand-carried load limit is two logs; a second trip is necessary.
 f.send('forest-load',{treeId:tree.id});assert.equal(f.player.forestHarvest.cargo[tree.speciesId],2);
 f.station('mill');f.send('forest-unload');
 const data=f.player.forestHarvest;
 assert.throws(()=>f.send('forest-mill',{speciesId:'oak',productId:'plank',quantity:1}),/Not enough/);
 assert.throws(()=>f.send('forest-mill',{speciesId:tree.speciesId,productId:'plank',quantity:1.5}),/whole/);
 assert.throws(()=>f.send('forest-mill',{speciesId:tree.speciesId,productId:'__proto__',quantity:1}),/valid/);
 f.send('forest-mill',{speciesId:tree.speciesId,productId:'plank',quantity:2});
 assert.equal(data.stock.logs[tree.speciesId],0);assert.equal(data.stock.green[tree.speciesId+':plank'],undefined);
 f.tick(5000);assert.equal(data.stock.green[tree.speciesId+':plank'],8);
 f.tick(5000);assert.equal(data.stock.green[tree.speciesId+':plank'],8,'job cannot pay twice');
 f.station('dry');f.send('forest-dry',{speciesId:tree.speciesId,productId:'plank',quantity:8});
 assert.equal(data.stock.green[tree.speciesId+':plank'],0);f.tick(8000);assert.equal(data.stock.dry[tree.speciesId+':plank'],8);
 assert.equal(f.other.forestHarvest.stock.dry[tree.speciesId+':plank'],undefined,'private output is not paid to another player');
 f.station('craft');assert.throws(()=>f.send('forest-craft',{speciesId:'oak',recipeId:'planter',quantity:1}),/Dry/);
 const made=f.send('forest-craft',{speciesId:tree.speciesId,recipeId:'planter',quantity:2}).crafted;
 assert.equal(made.quantity,2);assert.equal(made.modelId,'material:planter');assert.equal(data.stock.dry[tree.speciesId+':plank'],0);assert.equal(data.crafted.length,1);
 assert.throws(()=>f.send('forest-craft',{speciesId:tree.speciesId,recipeId:'planter',quantity:1}),/Dry/);
});

test('shared mill serializes jobs before debiting material and does not drop absent-owner output',()=>{
 const f=fixture(),station=FOREST_STATIONS.find(value=>value.kind==='mill');f.station('mill');f.player.forestHarvest.stock.logs.pine=3;
 f.send('forest-mill',{speciesId:'pine',productId:'beam',quantity:1});
 f.other.position={...station.approach};f.other.forestHarvest.stock.logs.oak=2;
 assert.throws(()=>forestHarvestCommand(f.sim,f.other,f.environment,{action:'forest-mill',speciesId:'oak',productId:'beam',quantity:1},f.now+1000),/busy/);
 assert.equal(f.other.forestHarvest.stock.logs.oak,2);
 const saved=f.sim.players.alice;delete f.sim.players.alice;f.tick(6000);assert.equal(f.sim.forestHarvest.jobs[0].phase,'working');
 f.sim.players.alice=saved;f.tick(100);assert.equal(saved.forestHarvest.stock.green['pine:beam'],2);
});

test('grinding and replanting require cleared land, logs removed, seedlings and actual growth time',()=>{
 const f=fixture(),tree=f.harvest();f.equip('stump-grinder');f.at(tree.position);
 assert.throws(()=>f.send('forest-grind',{treeId:tree.id}),/Board/);
 f.board('stump-grinder',tree.position);f.send('forest-grind',{treeId:tree.id});assert.equal(tree.phase,'cleared');
 f.player.vehicleId=null;f.equip('planter');f.at(tree.position);
 assert.throws(()=>f.send('forest-plant',{treeId:tree.id,speciesId:'oak'}),/remaining logs/);
 f.equip('forwarder');f.board('forwarder',tree.position);f.send('forest-load',{treeId:tree.id});
 f.board('forwarder',FOREST_STATIONS.find(station=>station.kind==='mill').approach);f.send('forest-unload');f.player.vehicleId=null;
 f.equip('planter');f.at(tree.position);const before=f.player.forestHarvest.stock.seedlings.oak;
 f.send('forest-plant',{treeId:tree.id,speciesId:'oak'});assert.equal(tree.speciesId,'oak');assert.equal(tree.phase,'growing');assert.equal(f.player.forestHarvest.stock.seedlings.oak,before-1);
 f.send('forest-tend',{treeId:tree.id});assert.throws(()=>f.send('forest-tend',{treeId:tree.id}),/already/);
 f.tick(FOREST_GROWTH_MS-35_000);assert.equal(tree.phase,'growing');
 f.tick(5000);assert.equal(tree.phase,'standing');assert.equal(f.player.forestHarvest.progress.regrown,1);
 f.tick(FOREST_GROWTH_MS);assert.equal(f.player.forestHarvest.progress.regrown,1);
});

test('challenges grant earned badges once, and view snapshots do not leak personal inventory',()=>{
 const f=fixture();assert.throws(()=>f.send('forest-claim',{challengeId:'first-harvest'}),/Complete/);
 for(const tree of FOREST_TREES.slice(0,3))f.harvest(tree.id);
 f.send('forest-claim',{challengeId:'first-harvest'});assert.deepEqual(f.player.forestHarvest.badges,['first-harvest']);
 assert.throws(()=>f.send('forest-claim',{challengeId:'first-harvest'}),/already/);
 const shared=forestHarvestView(f.sim),own=forestHarvestView(f.sim,f.player);assert.equal(shared.personal,undefined);assert.equal(own.personal.progress.harvested,3);
 own.trees[FOREST_TREES[0].id].phase='standing';assert.equal(f.sim.forestHarvest.trees[FOREST_TREES[0].id].phase,'stump');
});

test('land reclamation completes only after every stump and cut log is removed',()=>{
 const f=fixture(),plotTrees=FOREST_TREES.filter(tree=>tree.plotId===FOREST_TREES[0].plotId);
 for(const target of plotTrees){
  f.equip('axe');f.player.vehicleId=null;const tree=f.harvest(target.id);
  f.equip('stump-grinder');f.board('stump-grinder',tree.position);f.send('forest-grind',{treeId:tree.id});
  assert.equal(f.player.forestHarvest.progress.clearedPlots,0,'remaining logs prevent completion');
  f.equip('forwarder');f.board('forwarder',tree.position);f.send('forest-load',{treeId:tree.id});
  f.board('forwarder',FOREST_STATIONS.find(value=>value.kind==='mill').approach);f.send('forest-unload');
 }
 assert.equal(f.player.forestHarvest.progress.clearedPlots,1);f.send('forest-claim',{challengeId:'land-reclaimer'});assert.ok(f.player.forestHarvest.badges.includes('land-reclaimer'));
});

test('the forestry engine refuses other maps and invalid/prototype ids',()=>{
 const f=fixture();assert.throws(()=>forestHarvestCommand(f.sim,f.player,{id:'other'},{action:'forest-status'},f.now),/Visit/);
 assert.throws(()=>f.send('forest-equip',{equipmentId:'constructor'}),/valid/);
 assert.throws(()=>f.send('forest-fell',{treeId:'__proto__'}),/valid/);
 assert.throws(()=>f.send('forest-free-money',{rewardMzk:100000}),/Unknown/);
});

 test('dead, airborne and transferred players cannot mutate the forest',()=>{
 const f=fixture(),tree=FOREST_TREES[0];f.at(tree.position);
 f.player.health=0;assert.throws(()=>f.send('forest-fell',{treeId:tree.id}),/Respawn/);
 f.player.health=100;f.player.grounded=false;assert.throws(()=>f.send('forest-fell',{treeId:tree.id}),/ground/);
 f.player.grounded=true;f.player.replacedByRoom='other';assert.throws(()=>f.send('forest-fell',{treeId:tree.id}),/Rejoin/);
 assert.equal(f.sim.forestHarvest.trees[tree.id].hits,0);
 });
