import {createHash} from 'node:crypto';
import {RAD_TOX_REPORT_GRACE_MS} from './rad-tox-local-score.mjs';
import {combatStats,matchRows} from './rpg-match.mjs';

const MAX_CLAIMS = 64;
export const RAD_TOX_REWARD_PROGRESS_FIELDS=Object.freeze(['enemyKills','hits','sprayActions','taserHits','blastHits']);
const SUPPLIES = Object.freeze([
  {resource:'health',amount:25,name:'Field health refill'},
  {resource:'ammo',amount:24,name:'Field ammunition'},
  {resource:'fuel',amount:25,name:'Igniter fuel'},
  {resource:'spray',amount:12,name:'Paint refill'}
]);
const fail=(message,statusCode=422,code)=>{throw Object.assign(new Error(message),{statusCode,code:code||(statusCode===503?'RAD_TOX_REWARDS_DEFERRED':undefined)});};
const claimKey=(phase,playerId,slot)=>'rad-reward-'+createHash('sha256').update(JSON.stringify([1,phase.matchId,phase.phaseId,playerId,slot])).digest('hex').slice(0,40);

function rewardPhase(value) {
  if (!value || !['wave','boss'].includes(value.phaseKind) || !Number.isSafeInteger(value.targetCount) || value.targetCount<1 || value.targetCount>512) fail('Invalid server RAD-TOX reward phase.');
  for (const key of ['matchId','phaseId']) if (typeof value[key]!=='string' || !value[key] || value[key].length>140) fail('Invalid server RAD-TOX reward identity.');
  return {matchId:value.matchId,phaseId:value.phaseId,phaseKind:value.phaseKind,targetCount:value.targetCount};
}

/** Compact reward slots only. Enemy meshes, placement and collection stay local. */
export function radToxRewardManifest(input,playerId) {
  const phase=rewardPhase(input);
  if (typeof playerId!=='string' || !playerId || playerId.length>160) fail('Invalid RAD-TOX reward owner.');
  const entries=[];
  const add=(slot,entry)=>entries.push({id:claimKey(phase,playerId,slot),slot,...entry});
  for(let i=0;i<6;i++)add('field-coin-'+i,{kind:'mzk',name:'MZK field coin',amountMzk:5});
  SUPPLIES.forEach((supply,i)=>add('field-supply-'+i,{kind:'supply',...supply}));
  add('field-care-0',{kind:'catalog',name:'Ion Health Vial',catalogId:'ion-health-vial'});
  add('field-care-1',{kind:'catalog',name:'Plasma Water',catalogId:'plasma-water'});
  if(phase.phaseKind==='boss') {
    add('boss-coin',{kind:'mzk',name:'End boss MZK reward',amountMzk:25,requiresBoss:true});
    add('boss-care',{kind:'catalog',name:'IonCore Survival Pack',catalogId:'ioncore-survival-pack',requiresBoss:true});
  }else{
    const coins=Math.min(12,phase.targetCount),supplies=Math.min(6,phase.targetCount);
    for(let i=0;i<coins;i++)add('kill-coin-'+i,{kind:'mzk',name:'Enemy MZK drop',amountMzk:2,requiresKills:Math.ceil((i+1)*phase.targetCount/coins)});
    for(let i=0;i<supplies;i++)add('kill-supply-'+i,{kind:'supply',...SUPPLIES[i%SUPPLIES.length],requiresKills:Math.ceil((i+1)*phase.targetCount/supplies)});
  }
  return entries;
}

function claimIds(value) {
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>MAX_CLAIMS||value.some(id=>typeof id!=='string'||id.length>100))fail('Invalid RAD-TOX pickup claims.');
  return [...new Set(value)];
}

/** Recompute every amount from fixed slots, including at the database boundary. */
export function validateRadToxRewardGrant(input) {
  if(!input||typeof input.playerId!=='string')fail('Invalid server RAD-TOX reward grant.');
  const phase=rewardPhase(input.phase),manifest=radToxRewardManifest(phase,input.playerId),byId=new Map(manifest.map(entry=>[entry.id,entry]));
  const claims=claimIds(input.claimIds).map(id=>{const entry=byId.get(id);if(!entry)fail('This RAD-TOX pickup does not belong to this player.');return entry;});
  const progress=Object.fromEntries(RAD_TOX_REWARD_PROGRESS_FIELDS.map(key=>[key,input.progress?.[key]??0]));
  progress.shots=input.progress?.shots??progress.hits;
  progress.bossDefeated=input.progress?.bossDefeated??false;
  if([...RAD_TOX_REWARD_PROGRESS_FIELDS,'shots'].some(key=>!Number.isSafeInteger(progress[key])||progress[key]<0||progress[key]>100000)||progress.enemyKills>phase.targetCount||progress.hits>progress.shots||progress.taserHits>progress.shots||progress.blastHits>progress.shots)fail('Invalid server RAD-TOX reward progress.');
  if(typeof progress.bossDefeated!=='boolean'||progress.bossDefeated&&(phase.phaseKind!=='boss'||progress.enemyKills<1))fail('Invalid server RAD-TOX boss reward progress.');
  for(const entry of claims)if(entry.requiresKills>progress.enemyKills||entry.requiresBoss&&!progress.bossDefeated)fail('Defeat the required enemies before collecting this reward.',409);
  return {playerId:input.playerId,phase,claims,progress};
}

export function validateRadToxRewardClaims(sim,playerId,report,now,{acceptedOnly=false}={}) {
  const phase=sim.radToxScoreLedger?.phases?.[`${report?.matchId}:${report?.phaseId}`];
  if(!phase||!phase.participants.includes(playerId))fail('This RAD-TOX pickup phase does not belong to this player.',409);
  const prior=phase.rewardClaims?.[playerId]||{};
  const accepted=phase.players[playerId],stats=acceptedOnly?accepted?.stats:report.stats||accepted?.stats;
  const bossDefeated=acceptedOnly?accepted?.bossDefeated:Boolean(report.bossDefeated||accepted?.bossDefeated);
  const validated=validateRadToxRewardGrant({playerId,phase,claimIds:report.claimIds,progress:{...Object.fromEntries(RAD_TOX_REWARD_PROGRESS_FIELDS.map(key=>[key,stats?.[key]||0])),shots:stats?.shots||0,bossDefeated:Boolean(bossDefeated)}});
  const deadline=phase.closedAt===null?phase.endsAt:Math.min(phase.closedAt,phase.endsAt??Infinity);
  for(const entry of validated.claims) {
    if(prior[entry.id])continue;
    if(deadline!==null&&now>deadline+RAD_TOX_REPORT_GRACE_MS)fail('The final RAD-TOX pickup window has ended.',409,'RAD_TOX_PHASE_EXPIRED');
    if(entry.requiresKills>Number(stats?.enemyKills||0)||entry.requiresBoss&&!bossDefeated)fail('Defeat the required enemies before collecting this reward.',409);
  }
  return {phase,claims:validated.claims};
}

export function radToxLocalRewardView(sim,playerId) {
  const campaign=sim.radTox;
  if(campaign?.combatMode!=='local'||!campaign.phaseId||!sim.match)return null;
  const phase=sim.radToxScoreLedger?.phases?.[`${sim.match.id}:${campaign.phaseId}`];
  if(!phase||!phase.participants.includes(playerId))return null;
  const receipts=Object.values(phase.rewardClaims?.[playerId]||{});
  return {matchId:phase.matchId,phaseId:phase.phaseId,manifest:radToxRewardManifest(phase,playerId),claimedIds:receipts.map(receipt=>receipt.claimId),
    progress:phase.rewardProgress?.[playerId]||{enemyKills:0,hits:0},
    ...(Number.isFinite(sim.players[playerId]?.localRewardBalance)?{balanceAfterMzk:sim.players[playerId].localRewardBalance}:{})};
}

function recordCollectedItems(sim,phase,playerId,receipts,now) {
  const catalogIds=[...new Set(receipts.flatMap(receipt=>receipt.catalogId?[receipt.catalogId]:[]))];
  if(!catalogIds.length)return;
  const merge=items=>[...new Set([...(items||[]),...catalogIds])];
  const player=sim.players[playerId];
  if(player?.matchId===phase.matchId){
    const stats=combatStats(player);stats.itemsCollected=merge(stats.itemsCollected);
    if(sim.match?.id===phase.matchId){
      if(sim.match.state==='finished')sim.match.results=matchRows(sim,now);
      if(sim.radTox?.transition?.kind==='wave')sim.radTox.transition.results=matchRows(sim,now);
    }
  }
  for(const match of new Set([sim.match,...(sim.matchHistory||[])])){
    if(match?.id!==phase.matchId||!match.results)continue;
    const row=match.results.find(entry=>entry.id===playerId);if(!row)continue;
    row.itemsCollected=merge(row.itemsCollected);row.items=merge(row.items);
  }
}

export async function claimRadToxRewards(sim,playerId,report,now,grant) {
  const {phase,claims}=validateRadToxRewardClaims(sim,playerId,report,now,{acceptedOnly:true});
  phase.rewardClaims ||= {};
  const stored=phase.rewardClaims[playerId] ||= {};
  const pending=claims.filter(entry=>!stored[entry.id]);
  const accepted=phase.players[playerId],progress={...Object.fromEntries(RAD_TOX_REWARD_PROGRESS_FIELDS.map(key=>[key,accepted?.stats?.[key]||0])),shots:accepted?.stats?.shots||0,bossDefeated:Boolean(accepted?.bossDefeated)};
  phase.rewardProgress ||= {};
  const previousProgress=phase.rewardProgress[playerId]||{enemyKills:0,hits:0};
  const hasProgress=RAD_TOX_REWARD_PROGRESS_FIELDS.some(key=>progress[key]>(previousProgress[key]||0))||progress.bossDefeated&&!previousProgress.bossDefeated;
  let result=null;
  if(pending.length||hasProgress) {
    if(typeof grant!=='function')fail('RAD-TOX Backpack rewards are temporarily unavailable.',503);
    result=await grant({playerId,phase:rewardPhase(phase),claimIds:pending.map(entry=>entry.id),progress});
    const receipts=new Map((result?.receipts||[]).map(receipt=>[receipt.claimId,receipt]));
    if(pending.some(entry=>!receipts.has(entry.id)))fail('RAD-TOX Backpack did not confirm every pickup.',503);
    for(const entry of pending)stored[entry.id]=receipts.get(entry.id);
    if(hasProgress)phase.rewardProgress[playerId]={...Object.fromEntries([...RAD_TOX_REWARD_PROGRESS_FIELDS,'shots'].map(key=>[key,Math.max(previousProgress[key]||0,Number(result?.progress?.[key])||0)])),bossDefeated:Boolean(previousProgress.bossDefeated||result?.progress?.bossDefeated)};
    if(Number.isFinite(result.balanceAfterMzk))sim.players[playerId].localRewardBalance=result.balanceAfterMzk;
  }
  const receipts=claims.map(entry=>stored[entry.id]);
  recordCollectedItems(sim,phase,playerId,receipts,now);
  return {matchId:phase.matchId,phaseId:phase.phaseId,claimedIds:claims.map(entry=>entry.id),receipts,progress:phase.rewardProgress[playerId]||{enemyKills:0,hits:0},
    amountMzk:receipts.reduce((sum,receipt)=>sum+(receipt.amountMzk||0),0),
    ...(Number.isFinite(result?.balanceAfterMzk??sim.players[playerId]?.localRewardBalance)?{balanceAfterMzk:result?.balanceAfterMzk??sim.players[playerId].localRewardBalance}:{}),
    items:receipts.flatMap(receipt=>receipt.item?[receipt.item]:[])};
}
