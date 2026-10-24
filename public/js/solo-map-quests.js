import {mapQuestOffers} from './map-quest-catalog.js';

const finitePoint=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
const copyPoint=point=>({x:point.x,y:point.y,z:point.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const clone=value=>structuredClone(value);

// Imported, unhosted models can still be explored as solo practice. These
// achievements never enter a shared room, account score or wallet balance.
export function createSoloMapQuests({getPosition,resolvePoint,getSpawn,getHealth=()=>100}){
 let environment=null,offers=[],mission=null,lastUpdate=null,sequence=0,occupation={};
 const worlds=new Map();
 const time=value=>Number.isFinite(value)?value:Date.now();
 const health=()=>{const value=Number(getHealth());return Number.isFinite(value)?value:100;};
 const occupied=()=>!!(occupation.vehicleId||occupation.seatedId||occupation.skiLift);
 const progress=()=>worlds.get(environment?.id)||{score:0,completed:{}};
 function finish(status,now,message){if(mission?.status!=='active')return;mission.status=status;mission.message=message;mission.finishedAt=now;mission.ready=false;mission.holdSeconds=0;
  if(status==='completed'){
   const state=progress(),entry=state.completed[mission.questId],elapsed=Math.max(0,now-mission.startedAt);
   state.score+=mission.reward;state.completed[mission.questId]={count:(entry?.count||0)+1,bestMs:entry?Math.min(entry.bestMs,elapsed):elapsed,lastCompletedAt:now};
   mission.elapsed=elapsed;worlds.set(environment.id,state);
  }
 }
 function reset(nextEnvironment){
  environment=nextEnvironment||null;mission=null;lastUpdate=null;occupation={};
  offers=environment?mapQuestOffers(environment).filter(offer=>offer.kind==='site-tour').map(offer=>({...offer,localQuests:true,description:offer.description+' Solo practice: rewards are local practice score.'})):[];
  if(environment&&!worlds.has(environment.id)){worlds.set(environment.id,{score:0,completed:{}});if(worlds.size>32)worlds.delete(worlds.keys().next().value);}
 }
 function view(now){
  const point=getPosition(),state=progress();return {authoritative:false,localQuests:true,serverTime:now,questOffers:clone(offers),actors:{},players:{solo:{id:'solo',username:'Solo explorer',health:health(),position:finitePoint(point)?copyPoint(point):{x:0,y:0,z:0},score:state.score,localQuests:true,vehicleId:occupation.vehicleId||null,seatedId:occupation.seatedId||null,skiLift:occupation.skiLift||null,vehicleMission:mission?clone(mission):null,mapQuestProgress:{worldId:environment?.id,completed:clone(state.completed)}}}};
 }
 function update(value,travelState){
  const now=time(value);if(travelState)occupation={...travelState};
  const dt=lastUpdate===null?0:Math.max(0,Math.min(.25,(now-lastUpdate)/1000));lastUpdate=now;
  if(mission?.status==='active'){
   if(health()<=0||occupied())finish('cancelled',now,'Practice route ended after leaving the walking activity.');
   else if(now>mission.deadline)finish('expired',now,'Practice time expired. Choose a route and try again.');
   else{
    const position=getPosition(),point=mission.checkpoints[mission.index],near=finitePoint(position)&&distance(position,point)<=point.radius;
    mission.distance=finitePoint(position)?Math.round(distance(position,point)):null;
    mission.holdSeconds=near?Math.min(point.dwell,(mission.holdSeconds||0)+dt):0;
    mission.ready=near&&mission.holdSeconds>=point.dwell;
   }
  }
  return view(now);
 }
 function checkpoints(offer){
  const points=[],sites=offer.sites||[],arrival=sites.find(site=>site.id==='map-arrival'),spawn=getSpawn?.();
  for(const original of sites){
   let site={...original};
   if(arrival&&finitePoint(spawn)&&(site.id==='map-arrival'||site.survey))site={...site,x:spawn.x+site.x-arrival.x,y:spawn.y,z:spawn.z+site.z-arrival.z};
   const floor=resolvePoint(site);if(!finitePoint(floor))continue;
   const duplicate=points.findIndex(point=>distance(point,floor)<1.5);
   if(duplicate>=0){if(offer.challenge&&site.id==='map-arrival')points.splice(duplicate,1);else continue;}
   points.push({name:site.name,...copyPoint(floor),siteId:site.id,radius:2.5,dwell:2,action:'check-in'});
  }
  if(points.length<2)throw Error('This model has no clear walking route yet. Move to a clear floor and try another route.');
  return points;
 }
 function command(action,fields={},value){
  const now=time(value);update(now);if(action!=='vehicle-mission')throw Error('Solo practice supports local walking quests only.');
  let message;
  if(fields.operation==='start'){
   if(!environment)throw Error('Load a world before starting a practice route.');
   if(mission?.status==='active')throw Error('Finish or cancel your current practice route first.');
   if(health()<=0||occupied())throw Error('Explore on foot before accepting a practice route.');
   const offer=offers.find(item=>item.id===fields.questId);if(!offer)throw Error('This practice route is not available in this world.');
   const route=checkpoints(offer);
   mission={...offer,questId:offer.id,instanceId:'solo-quest-'+ ++sequence,worldId:environment.id,status:'active',startedAt:now,deadline:now+offer.timeLimit*1000,index:0,checkpoints:route,ready:false,holdSeconds:0,localQuests:true,npcIds:[],message:'Walk to the marked site and pause, then confirm your check-in.'};delete mission.sites;lastUpdate=now;
   message=offer.title+' started as solo practice.';
  }else if(fields.operation==='cancel'){
   finish('cancelled',now,'Practice route cancelled.');message='Practice route cancelled.';
  }else if(fields.operation==='interact'){
   if(mission?.status!=='active')throw Error('Accept a practice route first.');
   const point=mission.checkpoints[mission.index],position=getPosition();
   if(!mission.ready||!finitePoint(position)||distance(position,point)>point.radius)throw Error('Reach the objective and pause before confirming your check-in.');
   mission.index++;mission.ready=false;mission.holdSeconds=0;
   if(mission.index>=mission.checkpoints.length){finish('completed',now,'Practice route complete · +'+mission.reward+' practice score.');message=mission.message;}
   else{mission.message='Next: '+mission.checkpoints[mission.index].name+'.';message='Practice check-in confirmed.';}
  }else throw Error('Choose start, interact or cancel for solo practice.');
  return {...view(now),result:{message}};
 }
 return {reset,update,command,snapshot:value=>view(time(value)),relocate(reason='Practice route ended after map travel.',value){finish('cancelled',time(value),reason);}};
}
