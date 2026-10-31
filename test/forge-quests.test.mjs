import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {forgeCommand,forgeAccountState} from '../server-forge.mjs';
import {FORGE_STATIONS} from '../public/js/forge-config.js';
import {FORGE_QUESTS,forgeQuestView} from '../public/js/forge-quests.js';
import {FORGE_RECIPES,FORGE_STRIKE_COOLDOWN_MS} from '../public/js/forge-recipes.js';

async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'forge-commissions-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'users.json'),database=new UserJsonDatabase(file),walletId='account:commission-smith',player={actorId:'smith',walletId,health:100,grounded:true,position:{...FORGE_STATIONS[0].approach}},sim={actors:{},players:{smith:player}},environment={id:'traditional-forge',game:'forge'};
 await database.transaction(data=>{data.users[walletId]={walletId,tokens:{MZK:5000},items:[],memory:{}};});
 let now=1e6,sequence=0;const send=(action,fields={})=>forgeCommand(sim,player,environment,{action,requestId:'commission-'+ ++sequence,...fields},now+=600,{database,walletId});
 const at=kind=>player.position={...FORGE_STATIONS.find(station=>station.kind===kind).approach};
 async function finish(recipe=FORGE_RECIPES[0]){
  at('sourcing');const started=await send('forge-start',{recipeId:recipe.id}),jobId=started.forge.job.id;
  at('heat');await send('forge-heat',{jobId});now+=recipe.heatMs;await send('forge-status');at('hammer');for(let i=0;i<recipe.hammerStrikes;i++){now+=FORGE_STRIKE_COOLDOWN_MS;await send('forge-hammer',{jobId});}
  at('quench');await send('forge-quench',{jobId});at('temper');await send('forge-temper',{jobId});now+=recipe.temperMs;at('finish');return send('forge-finish',{jobId});
 }
 return {file,database,walletId,player,sim,environment,send,at,finish,get now(){return now;}};
}

test('forge commissions require acceptance, canonical progress, prerequisite claims and physical handover; rewards pay once',async t=>{
 const f=await fixture(t),id='first-maker-mark',recipe=FORGE_RECIPES[0];
 await assert.rejects(f.send('forge-claim-quest',{questId:id}),/Accept/);
 await assert.rejects(f.send('forge-accept-quest',{questId:'steady-hammer'}),/preceding/);
 await assert.rejects(f.send('forge-accept-quest',{questId:'__proto__'}),/listed/);
 const accepted=await f.send('forge-accept-quest',{questId:id});assert.equal(accepted.forge.progress.quests.find(q=>q.id===id).status,'active');
 await assert.rejects(f.send('forge-claim-quest',{questId:id,completedItems:999,rewardMzk:99999}),/objective/);
 await f.finish();f.player.position={x:1000,y:0,z:1000};await assert.rejects(f.send('forge-claim-quest',{questId:id}),/Walk closer/);
 f.at('finish');const claimed=await f.send('forge-claim-quest',{questId:id,rewardMzk:99999,requestId:'claim-apprentice'});
 assert.equal(claimed.forgeReceipt.type,'FORGE_QUEST_REWARD');assert.equal(claimed.forgeReceipt.amountMzk,15);assert.equal(claimed.forge.balance,5000-recipe.costMzk+15);
 assert.equal(claimed.forge.progress.quests.find(q=>q.id===id).status,'claimed');assert.ok(claimed.forge.progress.badges.includes('Apprentice’s Mark'));
 assert.equal((await f.send('forge-claim-quest',{questId:id,requestId:'claim-apprentice'})).duplicate,true);
 assert.equal((await f.send('forge-claim-quest',{questId:id})).duplicate,true);
 const state=await forgeAccountState(new UserJsonDatabase(f.file),f.walletId,{now:f.now,environment:f.environment});
 assert.equal(state.balance,claimed.forge.balance);assert.equal(state.progress.quests.find(q=>q.id==='steady-hammer').unlocked,true);
 const data=await f.database.read();assert.equal(data.transactions.filter(row=>row.type==='FORGE_QUEST_REWARD'&&row.walletId===f.walletId).length,1);
});

test('design commissions count distinct canonical designs and commerce commissions ignore client memory and pending activity',async t=>{
 const state={completedItems:12,byRecipe:{'forge-damascus-blade':12},badges:[],quests:{accepted:{'first-market-sale':{acceptedAt:1},'first-harbor-delivery':{acceptedAt:1},'first-store-order':{acceptedAt:1}},claimed:{'first-maker-mark':{claimedAt:1}}},commerce:{sales:0,deliveries:0,stockOrders:0}};
 let rows=forgeQuestView(state);assert.equal(rows.find(q=>q.id==='armory-of-ember').current,1);assert.equal(rows.find(q=>q.id==='armory-of-ember').target,5);
 for(const id of ['first-market-sale','first-harbor-delivery','first-store-order'])assert.equal(rows.find(q=>q.id===id).complete,false);
 state.commerce={sales:1,deliveries:1,stockOrders:1};rows=forgeQuestView(state);
 for(const id of ['first-market-sale','first-harbor-delivery','first-store-order'])assert.equal(rows.find(q=>q.id===id).status,'ready');
 const f=await fixture(t);await f.send('forge-status');await f.database.put(f.walletId,{memory:{forge:{completedItems:999,commerce:{sales:100,deliveries:100,stockOrders:100}}}});
 assert.equal((await f.send('forge-status')).forge.progress.quests.find(q=>q.id==='first-market-sale').current,0);
});

test('forge collection mastery scales with the complete recipe catalogue and all commission IDs are unique',()=>{
 assert.equal(new Set(FORGE_QUESTS.map(q=>q.id)).size,FORGE_QUESTS.length);assert.ok(FORGE_QUESTS.length>=9);
 const state={completedItems:FORGE_RECIPES.length,byRecipe:Object.fromEntries(FORGE_RECIPES.map(recipe=>[recipe.id,1])),quests:{accepted:{'master-of-patterns':{}},claimed:{'steady-hammer':{}}}};
 const mastery=forgeQuestView(state).find(q=>q.id==='master-of-patterns');assert.equal(mastery.target,FORGE_RECIPES.length);assert.equal(mastery.current,FORGE_RECIPES.length);assert.equal(mastery.status,'ready');assert.deepEqual(mastery.missingDesigns,[]);
});

test('a crafted Trading Market sale completes the market commission only after verified ownership transfer',async t=>{
 const f=await fixture(t),crafted=await f.finish(),first='first-maker-mark',market='first-market-sale',buyer='account:commission-buyer';
 await f.send('forge-accept-quest',{questId:first});await f.send('forge-claim-quest',{questId:first});await f.send('forge-accept-quest',{questId:market});
 await f.database.transaction(data=>{data.users[buyer]={walletId:buyer,tokens:{MZK:1000},items:[],memory:{}};});
 await f.database.listItem(f.walletId,crafted.item.id,100);
 assert.equal((await f.send('forge-status')).forge.progress.quests.find(q=>q.id===market).current,0,'a listing does not complete a sale');
 const fields={sellerId:f.walletId,buyerId:buyer,itemId:crafted.item.id,requestId:'commission-verified-sale'};
 await f.database.trade(fields);await f.database.trade(fields);
 const status=await f.send('forge-status');assert.equal(status.forge.progress.quests.find(q=>q.id===market).status,'ready');
 const claimed=await f.send('forge-claim-quest',{questId:market});assert.equal(claimed.forgeReceipt.amountMzk,15);
 const data=await f.database.read();assert.equal(data.forge.accounts[f.walletId].commerce.sales,1);assert.equal(data.users[buyer].items[0].id,crafted.item.id);
});
