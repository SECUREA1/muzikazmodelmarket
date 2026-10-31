import {harborWaterAt} from './public/js/harbor-water.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,(a.y||0)-(b.y||0),a.z-b.z);
const finite=point=>point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));

// A map marker may sit in furniture, on a closed door, or over water. Resolve
// walking objectives beside the authored site, using the same floor and body
// clearance queries as ordinary movement. Keep the site's floor level.
function siteFloor(environment,site,sim,collision,objects){
 const entity=site.entityId&&sim.actors[site.entityId];
 if(site.entityId&&(!entity||entity.active===false))return null;
 const origin={x:Number((entity?.position||site).x),y:Number((entity?.position||site).y)||0,z:Number((entity?.position||site).z)};
 if(!finite(origin))return null;
 const reach=Math.max(.6,Math.min(8,Number(site.interactionDistance)||3));
 const radii=site.entityId?[0,.8,1.4,2,Math.max(.6,reach-.4)]:site.survey?[0,1.5,3,5]:[0,1.5,3,5,8];
 const context={actors:sim.actors,objects,earthworks:sim.construction?.earthworks};
 for(const radius of [...new Set(radii)])for(let direction=0;direction<(radius?8:1);direction++){
  const angle=direction*Math.PI/4,candidate={x:origin.x+Math.sin(angle)*radius,y:origin.y,z:origin.z+Math.cos(angle)*radius};
  const floor=collision?.groundAt?collision.groundAt(environment,candidate,{...context,maxRise:.4}):candidate;
  if(!finite(floor)||Math.abs(floor.y-origin.y)>2)continue;
  if(harborWaterAt(environment,floor,.4)&&floor.y<.05)continue;
  if(site.entityId&&distance(floor,origin)>reach-.05)continue;
  if(collision?.hasBodyClearance&&!collision.hasBodyClearance(environment,floor,.4,context))continue;
  if(collision?.teleportPosition){try{collision.teleportPosition(environment,floor,floor,sim.actors,objects,{localMap:true,earthworks:context.earthworks});}catch{continue;}}
  return floor;
 }
 return null;
}

export function prepareSiteQuest(sim,player,quest,environment,{collision,objects={}}={}){
 const points=[],sites=(quest.sites||[]).slice(0,8),arrival=sites.find(site=>site.id==='map-arrival');
 // Imported models often have a measured entrance far from the catalogue's
 // nominal spawn. Survey offsets must follow that same physical entrance.
 let resolvedArrival=null;
 if(arrival&&collision?.safeSpawn&&(environment.modelUrl||environment.modelUrls?.length)&&!environment.builderScene){
  try{resolvedArrival=collision.safeSpawn(environment,arrival);}catch{}
 }
 for(const source of sites){
  const site=resolvedArrival&&(source.id==='map-arrival'||source.survey)?{...source,x:resolvedArrival.x+source.x-arrival.x,y:resolvedArrival.y,z:resolvedArrival.z+source.z-arrival.z}:source;
  const floor=siteFloor(environment,site,sim,collision,objects);if(!floor)continue;
  const duplicate=points.findIndex(point=>distance(point,floor)<1.5);
  if(duplicate>=0){
   // A sparse imported floor can move a survey back toward its entrance.
   // Keep the required final return, instead of dropping Arrival as a duplicate.
   if(quest.challenge&&site.id==='map-arrival')points.splice(duplicate,1);else continue;
  }
  const action=site.action==='interact'?'interact':'check-in';
  points.push({name:site.name,...floor,radius:action==='interact'?Math.max(2,Math.min(4,Number(site.interactionDistance)||3)):2.5,dwell:action==='interact'?0:2,action,siteId:site.id,entityId:action==='interact'?site.entityId:undefined,behavior:site.behavior,prompt:site.prompt,interactionDistance:site.interactionDistance,...(site.requiredState?{requiredState:structuredClone(site.requiredState)}:{})});
 }
 if(quest.strictSites&&points.length!==sites.length)throw Error('A required campaign station has no clear walking access. Restore the station before accepting this operation.');
 if(points.length<(quest.kind==='site-job'?1:2))throw Error('This route has no clear walking access right now. Choose another local assignment.');
 if(quest.kind==='site-job'&&!points.some(point=>point.entityId))throw Error('The local service items are unavailable. Choose another assignment.');
 quest.worldId=environment.id;quest.checkpoints=points;
 const route=quest.kind==='site-job'?'Visit '+points.map(point=>point.name).join(' → ')+'. Use each marked object in order to complete the job.':(quest.challenge?'Complete the marked route before time runs out: ':'Explore the marked walking route: ')+points.map(point=>point.name).join(' → ')+'. Pause at each stop and confirm your check-in.';
 quest.description=quest.campaign?quest.description+' '+route:route;
 quest.message=quest.description;
 // Do not expose raw survey candidates as a route after authoritative floors
 // have been resolved. The accepted checkpoints are the playable objectives.
 delete quest.sites;
 return points;
}

export function recordMapQuestCompletion(player,quest,now){
 if((!quest.siteQuest&&!quest.siteWork)||!quest.worldId)return;
 const prior=player.mapQuestProgress?.worldId===quest.worldId?player.mapQuestProgress.completed:{};
 const completed={...prior},entry=completed[quest.questId],elapsed=Math.max(0,now-quest.startedAt);
 completed[quest.questId]={count:Math.min(1000000,(entry?.count||0)+1),bestMs:entry?.bestMs==null?elapsed:Math.min(entry.bestMs,elapsed),lastCompletedAt:now};
 const recent=Object.entries(completed).sort((a,b)=>b[1].lastCompletedAt-a[1].lastCompletedAt).slice(0,48);
 player.mapQuestProgress={worldId:quest.worldId,completed:Object.fromEntries(recent)};
}
