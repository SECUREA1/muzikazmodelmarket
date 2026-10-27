import {randomUUID} from 'node:crypto';
import {SHIPPING_ID,SHIPPING_PORTS,SHIPPING_ROUTES,isShippingEnvironment} from './public/js/shipping-config.js';
import {SHIPPING_RIVAL_ROUTES} from './public/js/shipping-ai-config.js';

export const SHIPPING_LEAGUE_RULES=Object.freeze({durationMs:1200000,stagingMs:15000,claimWindowMs:86400000,rolloverMs:60000,historyLimit:72,prizes:Object.freeze([90,55,30]),participationMzk:15});
const fail=message=>{throw Object.assign(Error(message),{statusCode:409});};
const clone=value=>structuredClone(value);
const roundFor=(sim,id)=>[sim.shipping?.competition,...sim.shipping?.competitionHistory||[]].find(round=>round?.id===id);
const entries=round=>Object.values(round?.entries||{});
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

// Score the published voyage rather than distance spent circling or client
// positions. Long-distance and high-capacity work competes with short runs.
export function shippingLeagueScore(event,{ai=false}={}){
 const route=(ai?SHIPPING_RIVAL_ROUTES:SHIPPING_ROUTES).find(route=>route.id===event?.contractId),quality=event?.quality;
 if(!route||event.units!==route.units||!Number.isInteger(quality)||quality<40||quality>100)return null;
 const origin=SHIPPING_PORTS.find(port=>port.id===route.from),distance=route.waypoints.reduce((sum,point,index)=>sum+gap(index?route.waypoints[index-1]:origin.berth,point),0);
 return {score:Math.max(1,Math.round((event.units*40+distance*.1)*quality/100)),distanceKm:Math.round(distance/10)/100};
}
function leaderboard(round){
 return entries(round).sort((a,b)=>b.score-a.score||b.deliveries-a.deliveries||b.quality-a.quality||a.actorId.localeCompare(b.actorId)).map((entry,index)=>({...clone(entry),rank:index+1}));
}
export function shippingLeaguePrize(rank,deliveries){return deliveries>0?(SHIPPING_LEAGUE_RULES.prizes[rank-1]||SHIPPING_LEAGUE_RULES.participationMzk):0;}
function addRival(round,rival,now){
 const id='shipping-company:'+String(rival.companyId||rival.id||'');if(id==='shipping-company:')return;
 round.entries[id] ||= {actorId:id,companyId:rival.companyId||rival.id,name:rival.companyName||rival.name||rival.id,captain:rival.captainName||rival.captain||'',ai:true,color:rival.color,joinedAt:Math.max(round.createdAt,Math.min(now,round.endsAt)),score:0,deliveries:0,unitsDelivered:0,distanceKm:0,quality:0,qualityTotal:0};
}
export function stepShippingLeague(sim,environment,now){
 if(!isShippingEnvironment(environment)||!Number.isFinite(now))return;
 sim.shipping ||= {};let round=sim.shipping.competition;
 if(round&&now>=round.endsAt&&round.status!=='finished'){round.status='finished';round.finishedAt=round.endsAt;round.finalLeaderboard=leaderboard(round);}
 if(!round||round.status==='finished'&&now>=round.endsAt+SHIPPING_LEAGUE_RULES.rolloverMs){
  if(round){sim.shipping.competitionHistory ||= [];const archived={...round};delete archived.deliveryIds;sim.shipping.competitionHistory.push(archived);sim.shipping.competitionHistory=sim.shipping.competitionHistory.filter(previous=>now-previous.endsAt<=SHIPPING_LEAGUE_RULES.claimWindowMs).slice(-SHIPPING_LEAGUE_RULES.historyLimit);}
  round=sim.shipping.competition={id:randomUUID(),name:'Strait Freight League',createdAt:now,startsAt:now+SHIPPING_LEAGUE_RULES.stagingMs,endsAt:now+SHIPPING_LEAGUE_RULES.stagingMs+SHIPPING_LEAGUE_RULES.durationMs,status:'open',entries:{},deliveryIds:{},claims:{}};
 }
 if(round.status==='open'&&now>=round.startsAt)round.status='active';
 for(const rival of Object.values(sim.shipping.rivals||{}))addRival(round,rival,now);
}
export function joinShippingLeague(sim,player,id,now){
 const round=sim.shipping?.competition;if(!round||id&&round.id!==id)fail('This freight league has changed. Refresh the standings.');
 if(round.status==='finished'||now>=round.endsAt)fail('This league is finished. Join the next freight round.');
 if(!round.entries[player.actorId])round.entries[player.actorId]={actorId:player.actorId,name:String(player.username||'Captain').slice(0,80),ai:false,joinedAt:now,score:0,deliveries:0,unitsDelivered:0,distanceKm:0,quality:0,qualityTotal:0};
 return {message:'Joined the Strait Freight League. Load and depart during preparation; new manifests completed during the round count toward the standings.'};
}
export function shippingLeagueForManifest(sim,player,now){const round=sim.shipping?.competition;return round&&round.status!=='finished'&&now<round.endsAt&&round.entries[player.actorId]?round.id:null;}

// Only the actual AI unload callback or a committed human delivery receipt may
// call this. Keeping IDs per round also makes replayed settlements harmless.
export function recordShippingLeagueDelivery(sim,event,{actorId,name,ai=false,companyId,competitionId,now=event?.deliveredAt}={}){
 const scored=shippingLeagueScore(event,{ai});if(!scored||!/^[a-f0-9-]{36}$/.test(event?.deliveryId||'')||!Number.isFinite(now)||!Number.isFinite(event.startedAt)||!Number.isFinite(event.departedAt)||!Number.isFinite(event.deliveredAt)||event.deliveredAt>now)return false;
 const round=competitionId?roundFor(sim,competitionId):sim.shipping?.competition;if(!round||round.status==='finished'||event.deliveredAt>round.endsAt||event.deliveredAt<round.startsAt)return false;
 const id=ai?'shipping-company:'+companyId:actorId;if(!id)return false;
 if(ai&&!round.entries[id])addRival(round,{companyId,name},round.createdAt);
 const entry=round.entries[id];if(!entry||entry.ai!==ai||event.startedAt<entry.joinedAt||event.deliveredAt<event.departedAt||event.startedAt>event.departedAt||round.deliveryIds[event.deliveryId])return false;
 round.deliveryIds[event.deliveryId]=id;entry.score+=scored.score;entry.deliveries++;entry.unitsDelivered+=event.units;entry.distanceKm=Math.round((entry.distanceKm+scored.distanceKm)*100)/100;entry.qualityTotal+=event.quality;entry.quality=Math.round(entry.qualityTotal/entry.deliveries);entry.lastDeliveryAt=event.deliveredAt;return true;
}
export function shippingCompetitionView(sim){
 const round=sim.shipping?.competition;if(!round)return null;
 const publicRound=round=>({id:round.id,name:round.name,status:round.status,createdAt:round.createdAt,startsAt:round.startsAt,endsAt:round.endsAt,leaderboard:clone(round.finalLeaderboard||leaderboard(round))});
 return {...publicRound(round),rules:{durationMs:SHIPPING_LEAGUE_RULES.durationMs,claimWindowMs:SHIPPING_LEAGUE_RULES.claimWindowMs,preparationAllowed:true,prizes:[...SHIPPING_LEAGUE_RULES.prizes],participationMzk:SHIPPING_LEAGUE_RULES.participationMzk},history:(sim.shipping.competitionHistory||[]).slice(-3).reverse().map(publicRound)};
}
function claimable(sim,player,now){
 return [sim.shipping?.competition,...(sim.shipping?.competitionHistory||[]).slice().reverse()].find(round=>round?.status==='finished'&&round.endsAt+SHIPPING_LEAGUE_RULES.claimWindowMs>=now&&!round.claims?.[player.actorId]&&(round.entries[player.actorId]?.deliveries||0)>0);
}
export function playerShippingCompetitionView(sim,player,now){
 const round=sim.shipping?.competition,entry=round?.entries[player.actorId],claim=claimable(sim,player,now),target=claim||round,row=(target?.finalLeaderboard||leaderboard(target)).find(row=>row.actorId===player.actorId);
 return {joined:!!entry,canJoin:!!round&&round.status!=='finished'&&now<round.endsAt&&!entry,canClaim:!!claim,competitionId:target?.id||null,currentCompetitionId:round?.id||null,rank:row?.rank||null,score:entry?.score||0,deliveries:entry?.deliveries||0,prizeMzk:claim?shippingLeaguePrize(row.rank,row.deliveries):0,message:claim?'Your freight league prize is ready.':entry?'New completed manifests score for this round.':'Join the league before accepting a new manifest.'};
}
export function claimShippingLeague(sim,player,id,now){
 const round=roundFor(sim,id);if(!round||round.status!=='finished'||now<round.endsAt)fail('Wait for the freight league to finish before claiming.');
 if(now>round.endsAt+SHIPPING_LEAGUE_RULES.claimWindowMs)fail('The freight prize claim window has ended.');
 if(round.claims?.[player.actorId])fail('This freight league prize has already been claimed.');
 const entry=(round.finalLeaderboard||leaderboard(round)).find(entry=>entry.actorId===player.actorId);if(!entry||entry.ai||entry.deliveries<1)fail('Complete a new shipment in this league before claiming a prize.');
 return {message:'Saving your Strait Freight League result.',settlement:{type:'competition',worldId:SHIPPING_ID,competitionId:round.id,rank:entry.rank,score:entry.score,deliveries:entry.deliveries,unitsDelivered:entry.unitsDelivered,startsAt:round.startsAt,endsAt:round.endsAt,amountMzk:shippingLeaguePrize(entry.rank,entry.deliveries)}};
}
export function applyShippingLeagueClaim(sim,player,result){const round=roundFor(sim,result.competitionId);if(round){round.claims ||= {};round.claims[player.actorId]=true;}}
