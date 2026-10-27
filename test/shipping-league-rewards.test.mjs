import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {shippingWorld} from '../shipping-world.mjs';
import {UserJsonDatabase} from '../user-json-database.mjs';
import {shippingCommand,stepShipping,shippingView,playerShippingView,grantShippingReward,applyShippingSettlement,shippingAccountState,applyShippingAccount} from '../server-shipping.mjs';
import {SHIPPING_LEAGUE_RULES} from '../server-shipping-competition.mjs';
import {boatAssistedInput} from '../public/js/boat-assist.js';
import {stepBoatSimulation} from '../public/js/boat-simulation.js';

async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'shipping-league-'));t.after(()=>rm(dir,{recursive:true,force:true}));const database=new UserJsonDatabase(join(dir,'users.json')),wallet='account:league-captain';await database.transaction(data=>{data.users[wallet]={walletId:wallet,tokens:{MZK:0},items:[],memory:{},revision:0};return {};});
 const environment=shippingWorld(),authored=environment.builderScene.objects.find(object=>object.id==='shipping-starter-feeder'),boat={...structuredClone(authored),active:true,health:650,maxHealth:650,holderId:wallet,boating:{speed:0,anchor:true}},player={actorId:wallet,username:'League Captain',health:100,position:{...boat.position,y:.35},vehicleId:boat.id,lastSeen:100000,movementRevision:0,grounded:true},sim={actors:{[boat.id]:boat},players:{[wallet]:player},events:[]};let now=100000;
 applyShippingAccount(player,await shippingAccountState(database,wallet));
 const advance=ms=>{now+=ms;player.lastSeen=now;stepShipping(sim,environment,now);};
 const send=(operation,fields={})=>shippingCommand(sim,player,environment,{operation,...fields},now);
 const commit=async result=>{const receipt=await grantShippingReward(database,wallet,result.settlement,{now});applyShippingSettlement(sim,player,result.settlement,receipt,now);return receipt;};
 send('status');return {sim,boat,player,environment,database,wallet,advance,send,commit,get now(){return now;}};
}
test('a real joined cargo voyage scores only after the receipt commits, then pays one durable league prize',async t=>{
 const f=await fixture(t),round=f.sim.shipping.competition;f.send('join-league',{competitionId:round.id});
 assert.throws(()=>f.send('claim-league',{competitionId:round.id,rank:1,amountMzk:9999}),/finish/);f.send('accept',{contractId:'dock-induction'});
 for(let i=0;i<4;i++){f.send('load',{side:i%2?'starboard':'port'});f.advance(2000);}f.send('secure');f.send('depart');
 for(let frames=0;f.boat.boating.assist&&frames<6000;frames++){
  f.advance(250);const input=boatAssistedInput(f.boat,{},f.environment,f.now,f.sim.actors);Object.assign(f.boat,stepBoatSimulation(f.boat,input,.25,{environment:f.environment,now:f.now}));f.player.position={...f.boat.position,y:.35};
 }
 f.advance(250);assert.equal(f.player.shipping.job.checkpointIndex,f.player.shipping.job.waypoints.length);f.send('dock');
 let result;for(let i=0;i<4;i++){result=f.send('unload');if(i<3)f.advance(2000);}
 assert.equal(playerShippingView(f.sim,f.player).competition.score,0,'uncommitted cargo cannot earn league credit');
 const shipment=await f.commit(result),scored=playerShippingView(f.sim,f.player).competition.score;assert.ok(scored>0);applyShippingSettlement(f.sim,f.player,result.settlement,shipment,f.now);assert.equal(playerShippingView(f.sim,f.player).competition.score,scored,'replayed delivery does not score twice');
 f.advance(round.endsAt-f.now);assert.equal(shippingView(f.sim).competition.status,'finished');const claim=f.send('claim-league',{competitionId:round.id}),receipt=await f.commit(claim);
 assert.equal(receipt.amountMzk,90);assert.equal(receipt.stats.leaguesPlayed,1);assert.equal(receipt.stats.leaguesWon,1);assert.equal((await f.database.get(f.wallet)).tokens.MZK,110);
 assert.throws(()=>f.send('claim-league',{competitionId:round.id}),/already/);
 await f.database.transaction(data=>{data.transactions=[];return {};});const replay=await grantShippingReward(f.database,f.wallet,claim.settlement,{now:f.now});assert.equal(replay.id,receipt.id,'private claims survive a trimmed general transaction log');assert.equal((await f.database.get(f.wallet)).tokens.MZK,110);
 const reloaded=await shippingAccountState(new UserJsonDatabase(f.database.file),f.wallet);assert.equal(reloaded.stats.leaguesPlayed,1);assert.equal(reloaded.stats.deliveries,1);
});
test('league rewards share the daily shipping cap and reject changed, early or invalid private results',async t=>{
 const f=await fixture(t);const endsAt=f.now-1,result={type:'competition',worldId:'hormuz-shipping',competitionId:randomUUID(),rank:1,score:500,deliveries:1,unitsDelivered:4,startsAt:endsAt-SHIPPING_LEAGUE_RULES.durationMs,endsAt,amountMzk:90};
 await f.database.transaction(data=>{data.shipping={accounts:{[f.wallet]:{stats:{},supplies:{},rewardDay:new Date(f.now).toISOString().slice(0,10),dailyEarnedMzk:395}}};return {};});
 const receipt=await grantShippingReward(f.database,f.wallet,result,{now:f.now});assert.equal(receipt.amountMzk,5);assert.equal((await f.database.get(f.wallet)).tokens.MZK,5);
 for(const invalid of [{...result,competitionId:randomUUID(),rank:0},{...result,competitionId:randomUUID(),amountMzk:9999},{...result,competitionId:randomUUID(),endsAt:f.now+1},{...result,competitionId:randomUUID(),deliveries:0}])assert.throws(()=>grantShippingReward(f.database,f.wallet,invalid,{now:f.now}),/Invalid authoritative/);
});
test('live port demand quotes a bounded bonus and the accepted manifest keeps its agreed value',async t=>{
 const f=await fixture(t),market=f.sim.shipping.portEconomy.fujairah;market.stock['building-supplies']=0;
 const offer=shippingView(f.sim).contracts.find(offer=>offer.id==='gulf-gateway');assert.equal(offer.demandBonusMzk,15);assert.equal(offer.rewardMzk,offer.baseRewardMzk+15);
 f.send('accept',{contractId:'gulf-gateway',demandBonusMzk:999999});assert.equal(f.player.shipping.job.demandBonusMzk,15);
 market.stock['building-supplies']=120;assert.equal(shippingView(f.sim).contracts.find(offer=>offer.id==='gulf-gateway').demandBonusMzk,0);assert.equal(f.player.shipping.job.demandBonusMzk,15,'warehouse changes do not reprice an accepted manifest');
 assert.equal(shippingView(f.sim).contracts.find(offer=>offer.id==='dock-induction').demandBonusMzk,0,'the training contract remains predictable');
});
