import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {forgeCommand,forgeAccountState,resolveForgeAsset} from '../server-forge.mjs';
import {FORGE_STATIONS} from '../public/js/forge-config.js';
import {FORGE_RECIPES,FORGE_STRIKE_COOLDOWN_MS} from '../public/js/forge-recipes.js';

async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'forge-runtime-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const file=join(dir,'users.json'),database=new UserJsonDatabase(file),walletId='account:forge-smith',otherId='account:forge-buyer';
 await database.transaction(data=>{for(const id of [walletId,otherId])data.users[id]={walletId:id,tokens:{MZK:1000},items:[],memory:{},revision:0};});
 const environment={id:'traditional-forge',game:'forge'},player={actorId:walletId,walletId,position:{...FORGE_STATIONS[0].approach},health:100,grounded:true},sim={players:{},actors:{}};
 sim.players[player.actorId]=player;let now=1_000_000,sequence=0;
 const send=fields=>forgeCommand(sim,player,environment,{requestId:'forge-command-'+ ++sequence,...fields},now,{database,walletId});
 const move=kind=>{player.position={...FORGE_STATIONS.find(station=>station.kind===kind).approach};};
 const advance=ms=>now+=ms;
 async function finish(recipe=FORGE_RECIPES[0]){
  move('sourcing');const started=await send({action:'forge-start',recipeId:recipe.id}),jobId=started.forge.job.id;
  move('heat');await send({action:'forge-heat',jobId});advance(recipe.heatMs);await send({action:'forge-status'});
  move('hammer');for(let index=0;index<recipe.hammerStrikes;index++){advance(FORGE_STRIKE_COOLDOWN_MS);await send({action:'forge-hammer',jobId});}
  move('quench');await send({action:'forge-quench',jobId});move('temper');await send({action:'forge-temper',jobId});advance(recipe.temperMs);await send({action:'forge-status'});
  move('finish');return send({action:'forge-finish',jobId});
 }
 return {dir,file,database,walletId,otherId,environment,player,sim,send,move,advance,finish,get now(){return now;}};
}

test('the forge conserves counted metal and fuel funding through durable sequential work and one Backpack grant',async t=>{
 const f=await fixture(t),recipe=FORGE_RECIPES[0];
 const started=await f.send({action:'forge-start',recipeId:recipe.id,costMzk:-9000,materials:[],buildAssetId:'tower-crane',requestId:'fund-once'}),jobId=started.forge.job.id;
 assert.equal(started.forge.balance,1000-recipe.costMzk);assert.deepEqual(started.forge.job.materials,recipe.materials);assert.equal(started.forge.job.buildAssetId,recipe.buildAssetId);
 const retried=await f.send({action:'forge-start',recipeId:recipe.id,requestId:'fund-once'});assert.equal(retried.duplicate,true);assert.equal(retried.forge.job.id,jobId);
 await assert.rejects(f.send({action:'forge-start',recipeId:FORGE_RECIPES[1].id,requestId:'fund-once'}),/another forge action/);
 f.move('finish');await assert.rejects(f.send({action:'forge-finish',jobId,score:999}),/Complete.*hearth/);
 f.move('heat');await f.send({action:'forge-heat',jobId});await assert.rejects(f.send({action:'forge-hammer',jobId}),/Complete.*hearth/);
 f.advance(recipe.heatMs);f.player.forge=null;
 const saved=await forgeAccountState(new UserJsonDatabase(f.file),f.walletId,{now:f.now,environment:f.environment});assert.equal(saved.job.stage,'hammer');
 f.move('hammer');await f.send({action:'forge-hammer',jobId});await assert.rejects(f.send({action:'forge-hammer',jobId}),/hammer recover/);
 for(let index=1;index<recipe.hammerStrikes;index++){f.advance(FORGE_STRIKE_COOLDOWN_MS);await f.send({action:'forge-hammer',jobId});}
 f.move('quench');await f.send({action:'forge-quench',jobId});f.move('temper');await f.send({action:'forge-temper',jobId});f.advance(recipe.temperMs);
 f.move('finish');const result=await f.send({action:'forge-finish',jobId,requestId:'collect-once'});
 assert.equal(result.item.buildAssetId,recipe.buildAssetId);assert.equal(result.item.source,'traditional-forge');assert.equal(result.forge.job.status,'collected');assert.equal(result.forge.progress.completedItems,1);assert.deepEqual(result.forge.job.completedStages.map(stage=>stage.stage),['heat','hammer','quench','temper','finish']);
 const first=await f.database.get(f.walletId);assert.equal(first.items.length,1);assert.equal(first.tokens.MZK,1000-recipe.costMzk);
 assert.equal((await f.send({action:'forge-finish',jobId,requestId:'collect-once'})).duplicate,true);
 assert.equal((await f.send({action:'forge-finish',jobId})).duplicate,true);assert.equal((await f.database.get(f.walletId)).items.length,1);
});

test('forge work requires canonical recipe, account, live station proximity and a usable on foot player',async t=>{
 const f=await fixture(t),recipe=FORGE_RECIPES[0];
 await assert.rejects(f.send({action:'forge-start',recipeId:'__proto__'}),/listed forge recipe/);
 f.player.position={x:999,y:0,z:999};await assert.rejects(f.send({action:'forge-start',recipeId:recipe.id,position:FORGE_STATIONS[0].approach}),/Walk closer/);
 f.move('sourcing');f.player.walletId=f.otherId;await assert.rejects(f.send({action:'forge-start',recipeId:recipe.id}),/another account/);f.player.walletId=f.walletId;
 f.player.vehicleId='truck';await assert.rejects(f.send({action:'forge-start',recipeId:recipe.id}),/hands free/);delete f.player.vehicleId;
 f.environment.builderScene={objects:[]};await assert.rejects(f.send({action:'forge-start',recipeId:recipe.id}),/Place or enable/);delete f.environment.builderScene;
 await f.database.transaction(data=>{data.users[f.walletId].tokens.MZK=0;});await assert.rejects(f.send({action:'forge-start',recipeId:recipe.id}),/Not enough MZK/);
 assert.equal((await f.database.get(f.walletId)).items.length,0);
});

test('changing or disabling a heating station interrupts its cycle without consuming another kit',async t=>{
 const f=await fixture(t),recipe=FORGE_RECIPES[0];
 f.environment.builderScene={objects:FORGE_STATIONS.map(station=>({id:station.id,position:{...station.position},functionalSettings:{forgeStation:station.kind,forgeApproach:{x:0,y:0,z:5}}}))};
 const started=await f.send({action:'forge-start',recipeId:recipe.id}),jobId=started.forge.job.id;
 f.move('heat');await f.send({action:'forge-heat',jobId});f.environment.builderScene.objects.find(object=>object.id==='forge-heat').functionalSettings.active=false;
 f.advance(recipe.heatMs);const status=await f.send({action:'forge-status'});assert.equal(status.forge.job.stage,'heat');assert.equal(status.forge.job.status,'awaiting');assert.match(status.message,/Equipment changed/);assert.equal(status.forge.balance,1000-recipe.costMzk);
});

test('crafted metalwork trades for MZK and its immutable provenance survives field edits, replay and trimmed public trade feeds',async t=>{
 const f=await fixture(t),crafted=await f.finish(),itemId=crafted.item.id;
 await f.database.transaction(data=>{const item=data.users[f.walletId].items[0];item.buildAssetId='tower-crane';item.name='Fake crane';item.source='untrusted';item.configuration={behavior:'hostile',damage:999};});
 const resolved=await resolveForgeAsset(f.database,f.walletId,itemId);assert.equal(resolved.buildAssetId,FORGE_RECIPES[0].buildAssetId);assert.equal(resolved.configuration.damage,0);
 await f.database.listItem(f.walletId,itemId,200);const listing=(await f.database.marketListings()).find(item=>item.itemId===itemId);assert.equal(listing.buildAssetId,FORGE_RECIPES[0].buildAssetId);assert.equal(listing.itemName,resolved.name);
 await f.database.trade({buyerId:f.otherId,sellerId:f.walletId,itemId,requestId:'buy-workpiece'});
 assert.equal(await resolveForgeAsset(f.database,f.walletId,itemId),null);assert.equal((await resolveForgeAsset(f.database,f.otherId,itemId)).buildAssetId,resolved.buildAssetId);
 await f.database.transaction(data=>{data.trades=[];data.users[f.walletId].items.push({...resolved});});
 assert.equal(await resolveForgeAsset(f.database,f.walletId,itemId),null);assert.equal((await resolveForgeAsset(new UserJsonDatabase(f.file),f.otherId,itemId)).buildAssetId,resolved.buildAssetId);
 await assert.rejects(f.database.listItem(f.walletId,itemId,1),/verified forging/);
});

test('editable saves cannot forge earning receipts or a second collection, while native market purchases remain deployable',async t=>{
 const f=await fixture(t),crafted=await f.finish(),itemId=crafted.item.id;
 await f.database.put(f.walletId,{memory:{forge:{job:{status:'collected'},completedItems:999}},items:[{id:'forge-item:counterfeit',buildAssetId:'forge-warhammer',type:'forge-item'}]});
 const state=await forgeAccountState(f.database,f.walletId,{now:f.now,environment:f.environment});assert.equal(state.progress.completedItems,1);assert.equal(state.job.itemId,itemId);
 assert.equal(await resolveForgeAsset(f.database,f.walletId,'forge-item:counterfeit'),null);await assert.rejects(f.database.listItem(f.walletId,'forge-item:counterfeit',1),/verified forging/);
 f.move('finish');assert.equal((await f.send({action:'forge-finish',jobId:state.job.id})).duplicate,true);assert.equal((await f.database.get(f.walletId)).items.length,1);
 await f.database.economyAction(f.otherId,'buy','native:forge-warhammer','buy-forge-product');
 const owned=await resolveForgeAsset(f.database,f.otherId,'economy:native:forge-warhammer');assert.equal(owned.buildAssetId,'forge-warhammer');assert.equal(owned.type,'game-upgrade');
});
