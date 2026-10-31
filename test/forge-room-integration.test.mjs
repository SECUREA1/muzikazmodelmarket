import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {forgeCommand,forgeAccountState,resolveForgeAsset} from '../server-forge.mjs';
import {forgeWorld} from '../forge-world.mjs';
import {FORGE_ID,forgeStations} from '../public/js/forge-config.js';
import {FORGE_RECIPES} from '../public/js/forge-recipes.js';

test('forge room completes authoritative stages, protects wallet privacy, restores work and deploys earned items',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'forge-room-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(directory,'users.json')),wallet='account:forge-room-maker',identity={accountId:'forge-room-maker',username:'Maker',walletId:wallet};
 await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:5000},items:[],memory:{},revision:0};return {};});
 let now=1000000,sequence=0;
 const runtimeFor=file=>new AuthoritativeRooms({store:new SharedRoomStore(join(directory,file)),now:()=>now,
  forgeState:(actor,time,environment,sim)=>forgeAccountState(database,actor.walletId,{now:time,environment,actors:sim?.actors}),
  forgeAction:(actor,sim,player,environment,command,time)=>forgeCommand(sim,player,environment,command,time,{database,walletId:actor.walletId}),
  resolveAsset:(actor,command)=>resolveForgeAsset(database,actor.walletId,command.itemId)});
 const environment=forgeWorld(),runtime=runtimeFor('rooms.json'),recipe=FORGE_RECIPES[0];
 const send=(action,fields={})=>{now+=600;return runtime.command(FORGE_ID,environment,identity,{action,requestId:'forge-room-'+ ++sequence,...fields});};
 const at=async kind=>send('map-access',{locationId:forgeStations(environment).find(station=>station.kind===kind).id});
 let state=await send('join'),self=state.selfId;
 assert.equal(state.players[self].radToxEnabled,false);assert.equal(state.radTox,null);assert.equal(state.players[self].forge.balance,undefined);
 await assert.rejects(send('forge-start',{recipeId:recipe.id}),/closer/);
 await at('sourcing');state=await send('forge-start',{recipeId:recipe.id});
 const job=state.players[self].forge.job;
 assert.equal(state.result.forge.balance,5000-recipe.costMzk);assert.equal(state.players[self].forge.balance,undefined);
 assert.ok(state.events.every(event=>event.forge?.balance===undefined&&!event.forgeReceipt&&!event.item),'shared work history omits private receipts');
 await at('heat');state=await send('forge-heat',{jobId:job.id});assert.equal(state.players[self].forge.job.status,'processing');
 const restored=runtimeFor('fresh-rooms.json');now+=recipe.heatMs+1000;
 state=await restored.command(FORGE_ID,environment,identity,{action:'join',requestId:'forge-rejoin'});
 assert.equal(state.players[state.selfId].forge.job.id,job.id);assert.equal(state.players[state.selfId].forge.job.stage,'hammer');
 await at('hammer');state=await send('forge-status');assert.equal(state.players[self].forge.job.stage,'hammer');
 for(let strike=0;strike<recipe.hammerStrikes;strike++)state=await send('forge-hammer',{jobId:job.id});
 assert.equal(state.players[self].forge.job.stage,'quench');
 await at('quench');state=await send('forge-quench',{jobId:job.id});assert.equal(state.players[self].forge.job.stage,'temper');
 await at('temper');await send('forge-temper',{jobId:job.id});now+=recipe.temperMs+1000;
 await send('forge-status');await at('finish');state=await send('forge-finish',{jobId:job.id,requestId:'forge-finish-once'});
 const item=state.result.item;assert.equal(item.buildAssetId,recipe.buildAssetId);assert.match(item.id,/^forge-item:/);
 assert.equal(state.players[self].forge.progress.completedItems,1);assert.equal(state.players[self].forge.job.status,'collected');
 const duplicate=await send('forge-finish',{jobId:job.id,requestId:'forge-finish-once'});assert.equal(duplicate.result.item.id,item.id);
 assert.equal((await send('forge-finish',{jobId:job.id})).result.duplicate,true);
 const account=await database.get(wallet);assert.equal(account.items.filter(row=>row.id===item.id).length,1);assert.equal(account.tokens.MZK,5000-recipe.costMzk);
 const commons={id:'forge-deployment-test',name:'Forge deployment yard',proceduralLand:true,spawn:{x:0,y:.02,z:10},builderScene:{version:3,layout:'grand-floor',mapSize:80,objects:[]}};
 now+=1000;await runtime.command(commons.id,commons,identity,{action:'join',requestId:'forge-deploy-join',radToxEnabled:false});
 const placed=await runtime.command(commons.id,commons,identity,{action:'spawn',requestId:'forge-deploy-item',itemId:item.id});
 assert.equal(placed.actors[placed.result.spawnedId].modelId,recipe.buildAssetId);
 assert.equal(placed.actors[placed.result.spawnedId].definition.gameplay.behavior,'pickup');
 const equipped=await runtime.command(commons.id,commons,identity,{action:'interact',requestId:'forge-equip-item',entityId:placed.result.spawnedId});
 const used=await runtime.command(commons.id,commons,identity,{action:'forge-use',requestId:'forge-swing-item',direction:[0,0,-1],equipmentId:'forged-client-superweapon',damage:9999});
 assert.equal(used.result.equipmentId,recipe.buildAssetId);assert.equal(used.result.tool,'forge-equipment');assert.equal(used.players[used.selfId].ammo,equipped.players[equipped.selfId].ammo);

});
