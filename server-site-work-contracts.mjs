import {siteWorkOffers} from './public/js/site-work-contracts.js';
import {fitnessStations} from './public/js/fitness-config.js';

const count=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const position=value=>({x:Number(value?.x)||0,y:Number(value?.y)||0,z:Number(value?.z)||0});
const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);

export function prepareSiteWorkQuest(sim,player,q,environment,now){
 const offer=siteWorkOffers(environment).find(value=>value.id===q.id&&value.siteWork===q.siteWork);
 if(!offer)throw Error('This work challenge is not available on this map.');
 q.work={type:offer.siteWork,worldId:environment.id,acceptedAt:now,baseline:count(offer.siteWork==='fitness-set'?player.fitnessProgress?.completedSets:player.casinoProgress?.completedTasks)};
 let target=player.position,name;
 if(offer.siteWork==='fitness-set'){
  const stations=fitnessStations(environment,{actors:sim.actors}).sort((a,b)=>distance(a.position,player.position)-distance(b.position,player.position));
  if(!stations.length)throw Error('No working fitness station is available.');
  target=stations[0].position;name='Start a new set at a fitness station · finish with 480 points';
 }else{
  const staff=Object.values(sim.actors||{}).filter(actor=>actor.active!==false&&actor.resident?.casino&&['host','guard','vendor'].includes(actor.resident.duty)).sort((a,b)=>distance(a.position,player.position)-distance(b.position,player.position));
  if(!staff.length)throw Error('Casino staff are unavailable. Ask again when they return.');
  target=staff[0].position;name='Ask casino staff for a new walking favor';
 }
 q.checkpoints=[{name,...position(target),radius:4,milestone:true,work:true}];
 q.activityProgress=0;q.activityGoal=1;
 return q;
}

/** Reads only native, server-confirmed work. Aggregate counters alone cannot
 * complete a contract: its current result must also have begun after accept. */
export function stepSiteWorkQuest(sim,player,q,now){
 const work=q.work;
 if(!work||work.type!==q.siteWork||q.worldId&&q.worldId!==work.worldId)return {progress:0,goal:1,completed:false,message:'This work challenge is unavailable.'};
 const checkpoint=q.checkpoints[0];let completed=false,message;
 if(work.type==='fitness-set'){
  const round=player.fitness;
  completed=count(player.fitnessProgress?.completedSets)>work.baseline&&round?.status==='complete'&&round.environmentId===work.worldId&&Number.isFinite(round.createdAt)&&round.createdAt>=work.acceptedAt&&Number.isFinite(round.finishedAt)&&round.finishedAt>=work.acceptedAt&&round.finishedAt<=now&&count(round.score)>=480;
  if(round?.createdAt>=work.acceptedAt&&round.environmentId===work.worldId){
   if(round.position)Object.assign(checkpoint,position(round.position));
   message=round.status==='complete'?(completed?'Fresh set confirmed · '+round.score+' timing points':'Set finished · '+count(round.score)+'/480 points. Start a fresh set to try again.'):round.status==='cancelled'?'Set cancelled. Start a fresh set at a fitness station.':'Complete your new '+(round.name||'fitness')+' set · '+count(round.score)+'/480 timing points';
  }else message='Start a fresh fitness set after accepting this challenge; finish with at least 480 timing points.';
 }else if(work.type==='casino-favor'){
  const task=player.casinoTask;
  completed=count(player.casinoProgress?.completedTasks)>work.baseline&&task?.status==='completed'&&Number.isFinite(task.startedAt)&&task.startedAt>=work.acceptedAt&&Number.isFinite(task.completedAt)&&task.completedAt>=work.acceptedAt&&task.completedAt<=now;
  if(task?.startedAt>=work.acceptedAt){
   const point=task.checkpoints?.[task.index],target=point?.actorId?sim.actors?.[point.actorId]?.position:point;
   if(target)Object.assign(checkpoint,position(target));
   message=completed?'New staff favor confirmed.':task.status==='active'?(task.title+' · '+(point?.name||'Follow your favor marker')+' · '+(task.index+1)+'/'+task.checkpoints.length):'Ask staff for a new favor and complete its walking route.';
  }else message='Ask a casino host, guard or refreshments vendor for a new favor. Complete its public walking route; no wager is required.';
 }else message='This work challenge is unavailable.';
 if(checkpoint)checkpoint.name=message;
 return {progress:completed?1:0,goal:1,completed,message};
}
