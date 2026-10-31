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
 const dir=await mkdtemp(join(tmpdir(),'forge-wallet-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const db=new UserJsonDatabase(join(dir,'users.json')),account={accountId:'migrating-smith',mzkBalance:1000},old='account:migrating-smith',wallet='0x'+'c'.repeat(40);
 await db.ensureAccount(account);
 const environment={id:'traditional-forge',game:'forge'},player={actorId:old,walletId:old,position:{...FORGE_STATIONS[0].approach},health:100,grounded:true},sim={players:{},actors:{}};sim.players[player.actorId]=player;
 let now=100000,sequence=0;
 const send=fields=>forgeCommand(sim,player,environment,{requestId:'forge-wallet-'+ ++sequence,...fields},now,{database:db,walletId:player.walletId});
 const move=kind=>{player.position={...FORGE_STATIONS.find(station=>station.kind===kind).approach};};
 const advance=ms=>now+=ms;
 return {db,account,old,wallet,environment,player,sim,send,move,advance,get now(){return now;}};
}

test('connecting a wallet preserves funded forge jobs, cycle locks and replay receipts without another material debit',async t=>{
 const f=await fixture(t),recipe=FORGE_RECIPES[0],started=await f.send({action:'forge-start',recipeId:recipe.id,requestId:'original-forge-kit'}),jobId=started.forge.job.id;
 f.move('heat');await f.send({action:'forge-heat',jobId});const before=await f.db.read(),lock=structuredClone(before.forge.stationLocks),balance=(await f.db.get(f.old)).tokens.MZK;
 await f.db.ensureAccount({...f.account,primaryEthereumWallet:f.wallet});f.player.walletId=f.wallet;
 const data=await f.db.read();assert.equal(data.forge.accounts[f.old],undefined);assert.equal(data.forge.accounts[f.wallet].job.id,jobId);assert.deepEqual(data.forge.stationLocks,lock);assert.equal(data.users[f.old],undefined);
 const duplicate=await f.send({action:'forge-start',recipeId:recipe.id,requestId:'original-forge-kit'});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.forge.job.id,jobId);assert.equal(duplicate.forge.balance,balance);
 f.advance(recipe.heatMs);const resumed=await forgeAccountState(f.db,f.wallet,{now:f.now,environment:f.environment});assert.equal(resumed.job.stage,'hammer');assert.equal(resumed.progress.totalSpentMzk,recipe.costMzk);
 assert.equal((await f.db.read()).transactions.filter(row=>row.type==='FORGE_MATERIAL_KIT'&&row.walletId===f.wallet).length,1);
});

test('a forged item bought before wallet linking retains its transferable canonical ownership after linking',async t=>{
 const f=await fixture(t),recipe=FORGE_RECIPES[0],started=await f.send({action:'forge-start',recipeId:recipe.id}),jobId=started.forge.job.id;
 f.move('heat');await f.send({action:'forge-heat',jobId});f.advance(recipe.heatMs);await f.send({action:'forge-status'});f.move('hammer');
 for(let i=0;i<recipe.hammerStrikes;i++){f.advance(FORGE_STRIKE_COOLDOWN_MS);await f.send({action:'forge-hammer',jobId});}
 f.move('quench');await f.send({action:'forge-quench',jobId});f.move('temper');await f.send({action:'forge-temper',jobId});f.advance(recipe.temperMs);f.move('finish');const crafted=await f.send({action:'forge-finish',jobId}),itemId=crafted.item.id;
 const buyerAccount={accountId:'migrating-metal-buyer',mzkBalance:1000},buyerOld='account:migrating-metal-buyer',buyerWallet='0x'+'d'.repeat(40);await f.db.ensureAccount(buyerAccount);
 await f.db.listItem(f.old,itemId,150);await f.db.trade({buyerId:buyerOld,sellerId:f.old,itemId,requestId:'buy-forge-before-link'});
 const index=await f.db.read(),proofKey=Object.keys(index.forgeItemOwnership)[0];assert.equal(index.forgeItemOwnership[proofKey].walletId,buyerOld);
 await f.db.ensureAccount({...buyerAccount,primaryEthereumWallet:buyerWallet});const migrated=await f.db.read();assert.equal(migrated.forgeItemOwnership[proofKey].walletId,buyerWallet);assert.equal(migrated.forgeItemOwnership[proofKey].proofId,index.forgeItemOwnership[proofKey].proofId);
 assert.equal(await resolveForgeAsset(f.db,buyerOld,itemId),null);assert.equal((await resolveForgeAsset(f.db,buyerWallet,itemId)).buildAssetId,recipe.buildAssetId);
 await f.db.listItem(buyerWallet,itemId,175);await f.db.trade({buyerId:f.old,sellerId:buyerWallet,itemId,requestId:'resell-forge-after-link'});assert.equal((await resolveForgeAsset(f.db,f.old,itemId)).buildAssetId,recipe.buildAssetId);assert.equal(await resolveForgeAsset(f.db,buyerWallet,itemId),null);
});
