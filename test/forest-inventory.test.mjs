import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {ensureForestHarvest,forestHarvestCommand} from '../server-forest-harvest.mjs';
import {exportForestItem,reconcileForestExports,resolveForestAsset} from '../server-forest-inventory.mjs';
import {FOREST_STATIONS} from '../public/js/forest-harvest-config.js';

async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'forest-inventory-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const database=new UserJsonDatabase(join(dir,'users.json')),walletId='account:forest-crafter',now=1_000_000;
 await database.transaction(data=>{data.users[walletId]={walletId,tokens:{MZK:75},items:[],memory:{},revision:0};data.users['account:forest-other']={walletId:'account:forest-other',tokens:{MZK:1000},items:[],memory:{},revision:0};return {};});
 const environment={id:'forest-harvest',game:'forest-harvest'},player={actorId:'account:forest-crafter',walletId,position:{...FOREST_STATIONS.find(station=>station.kind==='craft').approach},health:100,grounded:true};
 const sim={players:{[player.actorId]:player},actors:{}};ensureForestHarvest(sim,environment,now);forestHarvestCommand(sim,player,environment,{action:'forest-status'},now);
 let sequence=0;const send=fields=>exportForestItem(sim,player,environment,{action:'forest-export',requestId:'forest-inventory-'+ ++sequence,...fields},now,{database,walletId});
 const crafted=(id='forest-crafted-1',quantity=1)=>player.forestHarvest.crafted.push({id,recipeId:'dining-table',speciesId:'oak',quantity,name:'Fake display name',modelId:'hostile-model',category:'furniture',color:'#fff',craftedAt:now});
 return {database,walletId,environment,player,sim,now,send,crafted};
}

test('earned crafted batches become canonical Backpack items without charging MZK',async t=>{
 const f=await fixture(t);f.crafted('forest-crafted-1',2);
 const result=await f.send({kind:'crafted',craftedId:'forest-crafted-1',buildAssetId:'tower-crane',priceMzk:-9999});
 assert.equal(result.items.length,2);assert.equal(result.items[0].buildAssetId,'material:table');assert.equal(result.items[0].name,'Oak Hardwood Table');
 assert.equal(result.items[0].source,'forest-harvest-earned');assert.equal(result.items[0].configuration.damage,0);assert.equal(result.items[0].color,'#ae8151');
 assert.equal(f.player.forestHarvest.crafted.length,0);const account=await f.database.get(f.walletId);assert.equal(account.items.length,2);assert.equal(account.tokens.MZK,75);
 const repeated=await f.send({kind:'crafted',craftedId:'forest-crafted-1'});assert.equal(repeated.duplicate,true);assert.deepEqual(repeated.items.map(item=>item.id),result.items.map(item=>item.id));assert.equal((await f.database.get(f.walletId)).items.length,2);
});

test('lumber exports preserve dry-unit quantities and request retries cannot change intent',async t=>{
 const f=await fixture(t);f.player.forestHarvest.stock.dry['pine:plank']=7;
 const fields={kind:'lumber',speciesId:'pine',productId:'plank',quantity:5,requestId:'one-lumber-export'};
 const first=await f.send(fields);assert.equal(first.items.length,5);assert.equal(first.items[0].buildAssetId,'forestry-lumber-plank');assert.equal(f.player.forestHarvest.stock.dry['pine:plank'],2);
 const repeated=await f.send(fields);assert.equal(repeated.duplicate,true);assert.equal(f.player.forestHarvest.stock.dry['pine:plank'],2);
 await assert.rejects(f.send({...fields,quantity:1}),/another forest export/);
 await assert.rejects(f.send({...fields,requestId:'not-enough',quantity:3}),/Dry that quantity/);
 assert.equal((await f.database.get(f.walletId)).items.length,5);
});

test('account receipts reconcile stock when a room save is recovered after delivery',async t=>{
 const f=await fixture(t);f.player.forestHarvest.stock.dry['birch:panel']=4;const before=structuredClone(f.player.forestHarvest);
 const first=await f.send({kind:'lumber',speciesId:'birch',productId:'panel',quantity:4});
 f.player.forestHarvest=before;
 await reconcileForestExports(f.database,f.walletId,f.sim,f.player,f.environment);
 assert.equal(f.player.forestHarvest.stock.dry['birch:panel'],0);assert.ok(f.player.forestHarvest.exportReceipts.includes(first.forestReceipt.id));
 await reconcileForestExports(f.database,f.walletId,f.sim,f.player,f.environment);assert.equal(f.player.forestHarvest.stock.dry['birch:panel'],0);
 await assert.rejects(f.send({kind:'lumber',speciesId:'birch',productId:'panel',quantity:1}),/Dry that quantity/);
 assert.equal((await f.database.get(f.walletId)).items.length,4);
});

test('exports require current ownership, workshop proximity and earned resources',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.send({kind:'crafted',craftedId:'forged',crafted:{recipeId:'timber-wall'}}),/Craft that batch/);
 await assert.rejects(f.send({kind:'lumber',speciesId:'__proto__',productId:'plank',quantity:1}),/Choose a lumber/);
 await assert.rejects(f.send({kind:'lumber',speciesId:'pine',productId:'plank',quantity:0}),/between 1 and 50/);
 f.crafted();f.player.position={x:-70,y:0,z:-30};await assert.rejects(f.send({kind:'crafted',craftedId:'forest-crafted-1'}),/closer to the timber workshop/);
 f.player.position={...FOREST_STATIONS.find(station=>station.kind==='craft').approach};f.player.walletId='account:forest-other';await assert.rejects(f.send({kind:'crafted',craftedId:'forest-crafted-1'}),/another account/);
 assert.equal((await f.database.get(f.walletId)).items.length,0);assert.equal(f.player.forestHarvest.crafted.length,1);
});

test('export provenance survives mutable item fields and cannot be forged or traded',async t=>{
 const f=await fixture(t);f.crafted();const result=await f.send({kind:'crafted',craftedId:'forest-crafted-1'}),itemId=result.items[0].id;
 await f.database.transaction(data=>{const item=data.users[f.walletId].items[0];item.name='Forged crane';item.buildAssetId='tower-crane';item.source='untrusted';item.configuration={behavior:'hostile',damage:999};item.listing={active:true,priceMzk:1};data.users['account:forest-other'].items.push({id:'forest-item:forged',buildAssetId:'material:table',source:'forest-harvest-earned'});return {};});
 const resolved=await resolveForestAsset(f.database,f.walletId,itemId);assert.equal(resolved.name,'Oak Hardwood Table');assert.equal(resolved.buildAssetId,'material:table');assert.equal(resolved.configuration.behavior,'decor');assert.equal(resolved.configuration.damage,0);
 assert.equal(await resolveForestAsset(f.database,'account:forest-other',itemId),null);assert.equal(await resolveForestAsset(f.database,'account:forest-other','forest-item:forged'),null);
 await assert.rejects(f.database.listItem(f.walletId,itemId,10),/bound to your Backpack/);assert.equal((await f.database.marketListings()).some(item=>item.itemId===itemId),false);
 await assert.rejects(f.database.trade({buyerId:'account:forest-other',sellerId:f.walletId,itemId,requestId:'forged-forest-trade'}),/bound to their owner/);
});
