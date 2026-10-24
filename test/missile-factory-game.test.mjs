import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {factoryCommand,factoryAccountState,publicFactoryState,resolveFactoryAsset,stepFactory,factoryView} from '../server-missile-factory.mjs';
import {FACTORY_ID,FACTORY_STATIONS,FACTORY_RECIPES,FACTORY_CREW} from '../public/js/missile-factory-config.js';

const station=id=>FACTORY_STATIONS.find(place=>place.id==='factory-'+id);
async function fixture(t,balance=1000){
 const directory=await mkdtemp(join(tmpdir(),'missile-factory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:factory-player';
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:balance},items:[],memory:{},revision:0};return {};});
 let now=1000000,sequence=0;const environment={id:FACTORY_ID},player={actorId:'account:factory-player',username:'Builder',position:{...station('procurement').position},health:100,lastSeen:now},sim={players:{[player.actorId]:player},actors:{}};
 const send=(action,fields={})=>factoryCommand(sim,player,environment,{action,requestId:'factory-test-'+ ++sequence,...fields},now,{database,walletId:wallet});
 const move=id=>{player.position={...station(id).position};};
 const advance=milliseconds=>{now+=milliseconds;player.lastSeen=now;};
 async function cycles(){for(const step of player.factory.job.steps){player.position={...FACTORY_STATIONS.find(place=>place.id===step.stationId).position};await send('factory-work',{jobId:player.factory.job.id,stationId:step.stationId});advance(player.factory.job.readyAt-now);await send('factory-status');}}
 function truck(id='factory-truck'){const actor=sim.actors[id] ||= {id,modelId:'site-dumptruck',position:{...station('loading').position},holderId:player.actorId,driving:{speed:0}};player.vehicleId=id;player.position={...actor.position};return actor;}
 async function haul(){const vehicle=truck();await send('factory-haul',{jobId:player.factory.job.id,stationId:'factory-loading'});advance(7000);vehicle.position={...station('dispatch').position};player.position={...vehicle.position};await send('factory-haul',{jobId:player.factory.job.id,stationId:'factory-dispatch'});player.vehicleId=null;move('dispatch');}
 return {database,wallet,sim,player,environment,send,move,advance,cycles,truck,haul,get now(){return now;}};
}

test('factory orders debit canonical MZK exactly once and reject invalid recipes, locations and insufficient funds',async t=>{
 const f=await fixture(t);f.move('assembly');await assert.rejects(f.send('factory-start',{recipeId:'training-missile'}),/Move closer/);f.move('procurement');
 await assert.rejects(f.send('factory-start',{recipeId:'forged'}),/available production recipe/);
 const command={action:'factory-start',recipeId:'training-missile',requestId:'same-order'},send=()=>factoryCommand(f.sim,f.player,f.environment,command,f.now,{database:f.database,walletId:f.wallet});
 const [first,repeat]=await Promise.all([send(),send()]);assert.equal(first.factory.job.id,repeat.factory.job.id);assert.equal(repeat.duplicate,true);assert.equal((await f.database.get(f.wallet)).tokens.MZK,820);
 assert.equal((await f.database.read()).transactions.filter(row=>row.type==='FACTORY_ORDER').length,1);
 await assert.rejects(f.send('factory-start',{recipeId:'cargo-rocket'}),/current production order/);
 await assert.rejects(factoryCommand(f.sim,f.player,f.environment,{...command,recipeId:'cargo-rocket'},f.now,{database:f.database,walletId:f.wallet}),/another factory action/);
 const low=await fixture(t,179);await assert.rejects(low.send('factory-start',{recipeId:'training-missile'}),/Not enough MZK/);assert.equal((await low.database.read()).factory,undefined);assert.equal((await low.database.get(low.wallet)).tokens.MZK,179);
});

test('machine work enforces physical proximity, sequence, server duration and shared reservations',async t=>{
 const f=await fixture(t);await f.send('factory-start',{recipeId:'training-missile'});const jobId=f.player.factory.job.id;
 await assert.rejects(f.send('factory-work',{jobId,stationId:'factory-assembly'}),/Component fabrication next/);
 await assert.rejects(f.send('factory-work',{jobId,stationId:'factory-fabrication'}),/Move closer/);f.move('fabrication');
 await f.send('factory-work',{jobId,stationId:'factory-fabrication',durationMs:0,readyAt:f.now});assert.equal(f.player.factory.job.readyAt-f.now,7000);
 await assert.rejects(f.send('factory-work',{jobId,stationId:'factory-assembly'}),/still running/);
 await f.send('factory-status');assert.equal(f.player.factory.job.stepIndex,0);assert.equal(f.player.factory.job.status,'processing');
 stepFactory(f.sim,f.environment,f.now);assert.equal(factoryView(f.sim,f.now).stations.find(place=>place.id==='factory-fabrication').occupiedBy,f.player.actorId);
 const otherWallet='account:factory-second';await f.database.transaction(data=>{data.users[otherWallet]={tokens:{MZK:1000},items:[]};return {};});
 const other={actorId:otherWallet,position:{...station('procurement').position},health:100,lastSeen:f.now};
 const second=(action,fields={})=>factoryCommand(f.sim,other,f.environment,{action,requestId:'second-'+action,...fields},f.now,{database:f.database,walletId:otherWallet});
 await second('factory-start',{recipeId:'cargo-rocket'});other.position={...station('fabrication').position};await assert.rejects(second('factory-work',{jobId:other.factory.job.id,stationId:'factory-fabrication'}),/another order/);
 f.advance(7000);await f.send('factory-status');assert.equal(f.player.factory.job.status,'awaiting');assert.equal(f.player.factory.job.stepIndex,1);
 await second('factory-work',{jobId:other.factory.job.id,stationId:'factory-fabrication'});assert.equal(other.factory.job.status,'processing');
});

test('both recipes produce one detailed Backpack model only after all cycles and real truck freight',async t=>{
 for(const recipe of FACTORY_RECIPES){
  const f=await fixture(t);await f.send('factory-start',{recipeId:recipe.id});const jobId=f.player.factory.job.id;
  f.move('dispatch');await assert.rejects(f.send('factory-collect',{jobId}),/production cells and freight/);
  await f.cycles();assert.equal(f.player.factory.job.status,'haul');assert.equal(f.player.factory.job.completedSteps.length,3);
  await assert.rejects(f.send('factory-haul',{jobId,stationId:'factory-loading'}),/Enter the factory dump truck/);
  const truck=f.truck();truck.position={...station('dispatch').position};await assert.rejects(f.send('factory-haul',{jobId,stationId:'factory-loading'}),/Move closer/);
  truck.position={...station('loading').position};await f.send('factory-haul',{jobId,stationId:'factory-loading'});assert.equal(truck.factoryCargo.buildAssetId,recipe.buildAssetId);
  truck.position={...station('dispatch').position};await assert.rejects(f.send('factory-haul',{jobId,stationId:'factory-dispatch'}),/freight route/);
  f.advance(5000);const wrong=f.truck('wrong-truck');wrong.position={...station('dispatch').position};await assert.rejects(f.send('factory-haul',{jobId,stationId:'factory-dispatch'}),/same truck/);f.player.vehicleId=truck.id;
  await f.send('factory-haul',{jobId,stationId:'factory-dispatch'});assert.equal(truck.factoryCargo,undefined);
  await assert.rejects(f.send('factory-collect',{jobId}),/Exit your vehicle/);f.player.vehicleId=null;f.move('dispatch');
  const {item,factory}=await f.send('factory-collect',{jobId});assert.equal(item.buildAssetId,recipe.buildAssetId);assert.equal(factory.progress.completedJobs,1);assert.deepEqual(factory.progress.badges,['Factory Apprentice']);
  await f.send('factory-collect',{jobId});assert.equal((await f.database.get(f.wallet)).items.length,1);assert.equal((await f.database.get(f.wallet)).tokens.MZK,1000-recipe.costMzk);
  assert.equal((await f.database.read()).transactions.filter(row=>row.type==='FACTORY_ITEM_CREATED').length,1);
 }
});

test('crew assistance reduces future cycle time and jobs survive server restart and map travel',async t=>{
 const f=await fixture(t);await f.send('factory-start',{recipeId:'cargo-rocket'});const jobId=f.player.factory.job.id;f.player.position={...FACTORY_CREW[0].home};
 await f.send('factory-assist',{jobId,enabled:true});f.move('fabrication');await f.send('factory-work',{jobId,stationId:'factory-fabrication'});assert.equal(f.player.factory.job.readyAt-f.now,6750);
 f.advance(6750);const restarted=new UserJsonDatabase(f.database.file),restored=await factoryAccountState(restarted,f.wallet,{now:f.now,environment:f.environment,actors:f.sim.actors});assert.equal(restored.job.stepIndex,1);assert.equal(restored.job.status,'awaiting');assert.equal(restored.balance,680);
 await assert.rejects(factoryCommand(f.sim,f.player,{id:'other',factory:{enabled:true}},{action:'factory-work',requestId:'wrong-map',jobId,stationId:'factory-assembly'},f.now,{database:restarted,walletId:f.wallet}),/Return to the map/);
 const shared=publicFactoryState(restored);assert.equal(shared.balance,undefined);assert.equal(JSON.stringify(shared).includes(f.wallet),false);
});

test('only a durable creation receipt authorizes deploying a factory model; edited wallet fields cannot forge it',async t=>{
 const f=await fixture(t);await f.database.transaction(data=>{data.users[f.wallet].items.push({id:'forged',source:'missile-factory',buildAssetId:'factory-cargo-rocket'});return {};});assert.equal(await resolveFactoryAsset(f.database,f.wallet,'forged'),null);
 await f.send('factory-start',{recipeId:'training-missile'});await f.cycles();await f.haul();const {item}=await f.send('factory-collect',{jobId:f.player.factory.job.id});
 await f.database.transaction(data=>{const owned=data.users[f.wallet].items.find(value=>value.id===item.id);owned.buildAssetId='untrusted-model';owned.name='Forged name';return {};});
 const resolved=await resolveFactoryAsset(f.database,f.wallet,item.id);assert.equal(resolved.buildAssetId,'factory-training-missile');assert.equal(resolved.name,'Aster Training Missile');assert.equal(await resolveFactoryAsset(f.database,'account:other',item.id),null);
});
