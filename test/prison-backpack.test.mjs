import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {AuthoritativeRooms} from '../authoritative-room.mjs';
import {SharedRoomStore} from '../shared-room-store.mjs';
import {claimPrisonItem,prisonAccountState,resolvePrisonAsset} from '../server-prison-rewards.mjs';
import {PRISON_ID,PRISON_STATIONS} from '../public/js/prison-config.js';
import {PRISON_REWARDS} from '../public/js/prison-rewards.js';
import {makePrisonActionPacket,PRISON_PROTOCOL} from '../public/js/prison-protocol.js';
import {GAME_ECONOMY} from '../game-economy.mjs';

const station=id=>PRISON_STATIONS.find(value=>value.id===id);
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'prison-backpack-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const databaseFile=join(dir,'users.json'),roomFile=join(dir,'rooms.json');
 let database=new UserJsonDatabase(databaseFile),now=1_000_000,sequence=0;
 const identity={accountId:'earned-prisoner',username:'Prison Earner',walletId:'account:earned-prisoner'};
 await database.transaction(data=>{data.users[identity.walletId]={walletId:identity.walletId,tokens:{MZK:75},items:[],memory:{},revision:0};return {};});
 const worlds=JSON.parse(await readFile(new URL('../public/models/environments/environments.json',import.meta.url),'utf8')),world=worlds.find(row=>row.id===PRISON_ID);
 const yard={id:'prison-collectible-yard',name:'Keepsake yard',proceduralLand:true,spawn:{x:0,y:.02,z:10},builderScene:{layout:'grand-floor',mapSize:60,objects:[],gameplay:{multiplayer:true}}};
 const runtimeFor=()=>new AuthoritativeRooms({store:new SharedRoomStore(roomFile),now:()=>now,
  prisonState:who=>prisonAccountState(database,who.walletId),
  prisonClaim:(who,sim,player,environment,command,at)=>claimPrisonItem(sim,player,environment,command,at,{database,walletId:who.walletId}),
  resolveAsset:(who,command)=>resolvePrisonAsset(database,who.walletId,command.itemId)});
 let runtime=runtimeFor();
 const send=(action,fields={},environment=world)=>{now+=500;return runtime.command(environment.id,environment,identity,{action,requestId:'prison-backpack-'+ ++sequence,...fields});};
 const move=id=>runtime.store.update(PRISON_ID,room=>{const p=room.simulation.players['account:'+identity.accountId];p.position={...station(id).position,y:.02};p.floor=.02;p.grounded=true;p.input={};p.lastSeen=now;});
 const milestones=goals=>runtime.store.update(PRISON_ID,room=>{room.simulation.prison.players['account:'+identity.accountId].completed=[...goals];});
 const restart=async()=>{await runtime.store.flush();database=new UserJsonDatabase(databaseFile);runtime=runtimeFor();};
 return {identity,world,yard,send,move,milestones,restart,get database(){return database;},get runtime(){return runtime;},advance:milliseconds=>now+=milliseconds};
}

test('a real prison radio milestone becomes one durable Backpack item without spending MZK',async t=>{
 const f=await fixture(t),joined=await f.send('join');
 await assert.rejects(f.send('prison-claim-item',{itemId:'prison-radio',stationId:'intake',completed:['radio']}),/Walk closer/);
 await f.move('intake');await assert.rejects(f.send('prison-claim-item',{itemId:'prison-radio',stationId:'intake',completed:['radio']}),/Tune Ironwood/);
 await f.move('radio');const radio=await f.send('prison-action',{packet:makePrisonActionPacket({operation:'radio',stationId:'radio',input:94.7})});
 assert.equal(radio.result.prisonPacket.protocol,PRISON_PROTOCOL);assert.equal(radio.result.prisonPacket.version,1);
 await f.move('intake');const claimed=await f.send('prison-claim-item',{itemId:'prison-radio',stationId:'intake',priceMzk:-9999});
 assert.equal(claimed.result.item.buildAssetId,'prison-radio');assert.equal(claimed.result.item.source,'prison-earned');
 assert.deepEqual(claimed.prison.players[joined.selfId].claimedItems,['prison-radio']);
 assert.equal((await f.database.get(f.identity.walletId)).tokens.MZK,75);
 const economy=await f.database.economy(f.identity.walletId),catalog=economy.items.find(item=>item.buildAssetId==='prison-radio');
 assert.equal(catalog.owned,true);assert.equal(catalog.earnedOnly,true);assert.equal(catalog.useCostMzk,0);
 assert.ok(economy.ownedAssets.some(item=>item.id===claimed.result.item.id));
 const used=await f.database.economyAction(f.identity.walletId,'use',catalog.sku,'use-earned-radio');assert.equal(used.amountMzk,0);
});

test('claim retries and request replay cannot duplicate items or swap the collectible',async t=>{
 const f=await fixture(t);await f.send('join');await f.move('intake');await f.milestones(['radio','arcade']);
 const fields={requestId:'one-prison-claim',stationId:'intake',itemId:'prison-radio'};
 const first=await f.send('prison-claim-item',fields),repeat=await f.send('prison-claim-item',fields);
 assert.equal(repeat.result.item.id,first.result.item.id);
 await assert.rejects(f.send('prison-claim-item',{...fields,itemId:'prison-chess-set'}),/another prison packet/);
 const third=await f.send('prison-claim-item',{stationId:'intake',itemId:'prison-radio'});assert.equal(third.result.duplicate,true);
 const account=await f.database.get(f.identity.walletId);assert.equal(account.items.length,1);
 assert.equal((await f.database.read()).transactions.filter(row=>row.type==='PRISON_ITEM_EARNED').length,1);
});

test('earned items and claims survive restart and deploy canonically in another world',async t=>{
 const f=await fixture(t);await f.send('join');await f.move('intake');await f.milestones(['work','escape']);
 const claim=await f.send('prison-claim-item',{stationId:'intake',itemId:'prison-supply-crate'}),itemId=claim.result.item.id;
 await f.restart();const joined=await f.send('join');assert.ok(joined.prison.players[joined.selfId].claimedItems.includes('prison-supply-crate'));
 await f.database.transaction(data=>{const item=data.users[f.identity.walletId].items.find(item=>item.id===itemId);item.name='Forged name';item.buildAssetId='prison-earned-trophy';item.configuration={behavior:'hostile',damage:9999};return {};});
 const resolved=await resolvePrisonAsset(f.database,f.identity.walletId,itemId);assert.equal(resolved.buildAssetId,'prison-supply-crate');assert.equal(resolved.behavior,'decor');assert.equal(resolved.configuration.damage,0);
 await f.send('join',{},f.yard);const placed=await f.send('spawn',{itemId},f.yard),actor=placed.actors[placed.result.spawnedId];
 assert.equal(actor.modelId,'prison-supply-crate');assert.equal(actor.definition.gameplay.behavior,'decor');assert.equal(actor.asset.source,'prison-earned');
 await f.restart();const restored=await f.send('join',{},f.yard);assert.ok(restored.actors[placed.result.spawnedId]);
});

test('every collectible is earned-only, and forged legacy inventory cannot authorize use',async t=>{
 const f=await fixture(t);
 for(const reward of PRISON_REWARDS){
  const matches=GAME_ECONOMY.filter(item=>item.buildAssetId===reward.id);assert.equal(matches.length,1);
  assert.throws(()=>f.database.economyAction(f.identity.walletId,'buy',matches[0].sku,'buy-'+reward.id),/Earn this collectible/);
 }
 await f.database.transaction(data=>{data.users[f.identity.walletId].items.push({id:'forged-prison',buildAssetId:'prison-radio',economySku:'backpack:builder-prison-radio',source:'prison-earned',type:'prison-item'});return {};});
 assert.equal(await resolvePrisonAsset(f.database,f.identity.walletId,'forged-prison'),null);
 await assert.rejects(f.database.economyAction(f.identity.walletId,'use','backpack:builder-prison-radio','forged-radio-use'),/Earn and collect/);
 assert.equal((await f.database.get(f.identity.walletId)).tokens.MZK,75);
});

test('account-bound prison items cannot be listed or traded even after metadata edits',async t=>{
 const f=await fixture(t);await f.send('join');await f.move('intake');await f.milestones(['arcade']);
 const claim=await f.send('prison-claim-item',{stationId:'intake',itemId:'prison-chess-set'}),itemId=claim.result.item.id;
 await assert.rejects(f.database.listItem(f.identity.walletId,itemId,20),/bound to your Backpack/);
 await f.database.transaction(data=>{data.users['account:buyer']={walletId:'account:buyer',tokens:{MZK:1000},items:[],memory:{}};const item=data.users[f.identity.walletId].items.find(item=>item.id===itemId);item.source='untrusted';item.buildAssetId='chair';item.listing={active:true,priceMzk:20};return {};});
 assert.equal((await f.database.marketListings()).some(item=>item.itemId===itemId),false);
 await assert.rejects(f.database.trade({buyerId:'account:buyer',sellerId:f.identity.walletId,itemId,requestId:'bad-prison-trade'}),/bound to their owner/);
});

test('versioned action receipts reject altered intent and unsigned legacy replays',async t=>{
 const f=await fixture(t);const joined=await f.send('join');await f.move('intake');
 const fields={requestId:'signed-prison-action',packet:makePrisonActionPacket({operation:'role-guard',stationId:'intake'})};
 const first=await f.send('prison-action',fields),repeat=await f.send('prison-action',fields);
 assert.deepEqual(repeat.result.prisonPacket,first.result.prisonPacket);
 await assert.rejects(f.send('prison-action',{...fields,packet:makePrisonActionPacket({operation:'role-prisoner',stationId:'intake'})}),/another prison packet/);
 await assert.rejects(f.send('prison-action',{packet:{protocol:PRISON_PROTOCOL,version:999,operation:'status',stationId:'intake'}}),/unsupported/);
 await f.runtime.store.update(PRISON_ID,room=>{delete room.simulation.receipts[joined.selfId+':signed-prison-action'].prisonSignature;});
 await assert.rejects(f.send('prison-action',fields),/no packet signature/);
});
