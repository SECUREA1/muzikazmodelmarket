import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SHIPPING_ID} from '../public/js/shipping-config.js';
import {stepShippingLeague,joinShippingLeague,shippingLeagueForManifest,recordShippingLeagueDelivery,shippingCompetitionView,playerShippingCompetitionView,claimShippingLeague,applyShippingLeagueClaim,shippingLeagueScore,SHIPPING_LEAGUE_RULES} from '../server-shipping-competition.mjs';
const world={id:SHIPPING_ID};
function fixture(){const player={actorId:'account:captain',username:'Captain'},sim={shipping:{rivals:{gulf:{id:'gulf',companyId:'gulf',name:'Gulf Link',captain:'Mira'}}}};const now=100000;stepShippingLeague(sim,world,now);return {sim,player,now,round:sim.shipping.competition};}
const delivery=(at=160000)=>({deliveryId:randomUUID(),contractId:'dock-induction',units:4,quality:100,startedAt:101000,departedAt:120000,deliveredAt:at,distanceSailed:550});

test('shared freight league scores only joined, new, physically delivered manifests once',()=>{
 const f=fixture(),round=f.round;assert.equal(round.status,'open');assert.equal(shippingCompetitionView(f.sim).leaderboard[0].ai,true);
 assert.equal(recordShippingLeagueDelivery(f.sim,delivery(),{actorId:f.player.actorId,competitionId:round.id}),false);
 joinShippingLeague(f.sim,f.player,round.id,f.now);assert.equal(shippingLeagueForManifest(f.sim,f.player,f.now),round.id);
 assert.equal(recordShippingLeagueDelivery(f.sim,{...delivery(),startedAt:f.now-1},{actorId:f.player.actorId,competitionId:round.id}),false);
 assert.equal(recordShippingLeagueDelivery(f.sim,{...delivery(),departedAt:110000,deliveredAt:114000},{actorId:f.player.actorId,competitionId:round.id}),false);
 stepShippingLeague(f.sim,world,120000);const event=delivery();
 assert.equal(recordShippingLeagueDelivery(f.sim,event,{actorId:f.player.actorId,competitionId:round.id}),true);
 assert.equal(recordShippingLeagueDelivery(f.sim,event,{actorId:f.player.actorId,competitionId:round.id}),false);
 const hugeDistance={...event,distanceSailed:999999};assert.deepEqual(shippingLeagueScore(hugeDistance),shippingLeagueScore(event),'circling cannot inflate canonical voyage score');
 assert.equal(recordShippingLeagueDelivery(f.sim,{...delivery(),units:999},{actorId:f.player.actorId,competitionId:round.id}),false);
 assert.equal(shippingCompetitionView(f.sim).leaderboard[0].deliveries,1);
 assert.equal(recordShippingLeagueDelivery(f.sim,delivery(200000),{actorId:f.player.actorId,competitionId:round.id,now:199999}),false);
 assert.equal(playerShippingCompetitionView(f.sim,f.player,120000).canClaim,false);
});
test('actual AI deliveries compete with humans, finish freezes rankings, prizes claim exact round and rollover retains them',()=>{
 const f=fixture();joinShippingLeague(f.sim,f.player,f.round.id,f.now);stepShippingLeague(f.sim,world,120000);
 recordShippingLeagueDelivery(f.sim,delivery(),{actorId:f.player.actorId,competitionId:f.round.id});
 recordShippingLeagueDelivery(f.sim,{...delivery(),contractId:'gulf-gateway',deliveredAt:600000},{ai:true,companyId:'gulf',name:'Gulf Link'});
 assert.equal(shippingCompetitionView(f.sim).leaderboard[0].companyId,'gulf');
 assert.throws(()=>claimShippingLeague(f.sim,f.player,f.round.id,600000),/finish/);
 stepShippingLeague(f.sim,world,f.round.endsAt);const ranks=shippingCompetitionView(f.sim).leaderboard;
 assert.equal(ranks.find(row=>row.actorId===f.player.actorId).rank,2);assert.equal(recordShippingLeagueDelivery(f.sim,delivery(),{actorId:f.player.actorId,competitionId:f.round.id}),false);
 const claim=claimShippingLeague(f.sim,f.player,f.round.id,f.round.endsAt);assert.equal(claim.settlement.amountMzk,55);
 stepShippingLeague(f.sim,world,f.round.endsAt+SHIPPING_LEAGUE_RULES.rolloverMs);assert.notEqual(f.sim.shipping.competition.id,f.round.id);assert.equal(playerShippingCompetitionView(f.sim,f.player,f.round.endsAt+60000).competitionId,f.round.id);
 applyShippingLeagueClaim(f.sim,f.player,claim.settlement);assert.throws(()=>claimShippingLeague(f.sim,f.player,f.round.id,f.round.endsAt+60000),/already/);
 assert.deepEqual(f.round.finalLeaderboard,ranks,'a new round does not rewrite the final result');
});
test('inactive worlds do not create leagues and a long offline gap creates one fresh round without fabricated deliveries',()=>{
 const f=fixture();const saved=structuredClone(f.sim);stepShippingLeague(saved,world,100000+86400000);
 assert.equal(saved.shipping.competition.createdAt,100000+86400000);assert.equal(saved.shipping.competitionHistory.length,1);assert.ok(shippingCompetitionView(saved).leaderboard.every(row=>row.score===0));
 const other={};stepShippingLeague(other,{id:'another-world'},100000);assert.equal(other.shipping,undefined);
});
test('staging departures can finish during the round and real AI backhauls have canonical scores',()=>{
 const f=fixture();joinShippingLeague(f.sim,f.player,f.round.id,f.now);
 assert.equal(recordShippingLeagueDelivery(f.sim,{...delivery(),departedAt:110000},{actorId:f.player.actorId,competitionId:f.round.id}),true);
 const backhaul={...delivery(),contractId:'ai-qeshm-return'};assert.ok(shippingLeagueScore(backhaul,{ai:true}));assert.equal(shippingLeagueScore(backhaul),null);
 assert.ok(SHIPPING_LEAGUE_RULES.durationMs>624000,'the verified longest tanker passage can finish in a round');
});
test('unclaimed prizes remain accessible beyond eight rounds for the full claim window',()=>{
 const f=fixture();joinShippingLeague(f.sim,f.player,f.round.id,f.now);recordShippingLeagueDelivery(f.sim,delivery(),{actorId:f.player.actorId,competitionId:f.round.id});let now=f.round.endsAt;
 for(let count=0;count<12;count++){stepShippingLeague(f.sim,world,now);now+=SHIPPING_LEAGUE_RULES.rolloverMs;stepShippingLeague(f.sim,world,now);now=f.sim.shipping.competition.endsAt;}
 const view=playerShippingCompetitionView(f.sim,f.player,now);assert.equal(view.canClaim,true);assert.equal(view.competitionId,f.round.id);assert.equal(claimShippingLeague(f.sim,f.player,f.round.id,now).settlement.amountMzk,90);assert.ok(!f.sim.shipping.competitionHistory[0].deliveryIds,'finished delivery replay maps do not accumulate in history');
});
