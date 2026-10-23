import {isBasketballEnvironment} from './public/js/basketball-rules.js';
import {isDedicatedFiringRange,firingRangeLocations,rangeLocalToWorld,rangeWorldToLocal} from './public/js/firing-range.js';
import {compileBuilderScene} from './public/js/builder-gameplay-pipeline.js';
import {createHash} from 'node:crypto';
const COMMONS_RETURN_LIMIT=128,COMMONS_RETURN_TTL=900000;
const gap=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const returnNeeded=(sim,entry,now)=>Object.values(sim.players||{}).some(player=>!player.replacedByRoom&&now-player.lastSeen<15000&&(player.lastPortalArrival?.from===entry.source||gap(player.position,entry.definition.transform.position)<8));
function returnActor(entry){
 const definition=structuredClone(entry.definition),portal=definition.gameplay.portal;
 return {id:definition.objectId,modelId:definition.modelId,asset:structuredClone(definition.asset),name:definition.name,worldGateway:{destination:portal.targetMapId,name:definition.gameplay.prompt,ownerName:portal.ownerName,color:portal.color},position:{...definition.transform.position},rotation:{...definition.transform.rotation},scale:{...definition.transform.scale},health:100,active:true,spawned:true,arrivalReturn:true,destructible:false,definition};
}
/** The Commons catalogue remains paged through districts. Incoming validated
 * trips retain a small runtime return gate without adding every saved map to
 * that catalogue or changing its authored geometry. */
export function syncCommonsArrivalReturns(sim,environment,manifest,now){
 if(environment.id!=='public-commons')return [];
 const staticTargets=new Set(manifest.objects.filter(object=>!object.objectId.startsWith('commons-arrival-return-')).map(object=>object.gameplay.portal?.targetMapId).filter(Boolean));
 const retained=[];
 for(const entry of sim.commonsArrivalReturns||[]){
  if(staticTargets.has(entry.source)||entry.expiresAt<now&&!returnNeeded(sim,entry,now)){if(sim.actors[entry.definition.objectId]?.arrivalReturn)delete sim.actors[entry.definition.objectId];continue;}
  retained.push(entry);sim.actors[entry.definition.objectId] ||= returnActor(entry);
 }
 sim.commonsArrivalReturns=retained;
 return retained.map(entry=>structuredClone(entry.definition));
}
export function ensureCommonsArrivalReturn(sim,environment,manifest,from,sourceName,collision,objects,now){
 if(environment.id!=='public-commons')return null;
 const existing=sim.commonsArrivalReturns?.find(entry=>entry.source===from);
 if(existing){existing.expiresAt=now+COMMONS_RETURN_TTL;return null;}
 if(manifest.objects.some(object=>object.gameplay.portal?.destinationType==='map'&&object.gameplay.portal.targetMapId===from))return null;
 const entries=sim.commonsArrivalReturns ||= [];
 if(entries.length>=COMMONS_RETURN_LIMIT){
  const removable=entries.filter(entry=>!returnNeeded(sim,entry,now)).sort((a,b)=>a.expiresAt-b.expiresAt)[0];
  if(!removable)throw Object.assign(new Error('The Commons arrival gates are busy. Try entering again shortly.'),{statusCode:409});
  entries.splice(entries.indexOf(removable),1);delete sim.actors[removable.definition.objectId];
  manifest.objects=manifest.objects.filter(definition=>definition.objectId!==removable.definition.objectId);manifest.actors=manifest.actors.filter(definition=>definition.objectId!==removable.definition.objectId);
 }
 const center=collision.safeSpawn(environment,environment.spawn||{x:5,y:0,z:5}),occupied=Object.values(sim.actors).filter(actor=>actor.worldGateway&&actor.active!==false).map(actor=>actor.position);
 let position;
 for(const radius of [7,14,21,28,35,42,56,70,84,98,112]){
  const steps=Math.max(8,Math.ceil(Math.PI*2*radius/7));
  for(let step=0;step<steps;step++){
   const angle=step/steps*Math.PI*2,candidate={x:center.x+Math.cos(angle)*radius,y:center.y,z:center.z+Math.sin(angle)*radius};
   let floor;try{floor=collision.meetingPosition(environment,candidate,sim.actors,objects);}catch{continue;}
   if(gap(floor,candidate)>1.25||occupied.some(other=>gap(floor,other)<6))continue;
   // Reserve the arch footprint and a walkable arrival approach four metres
   // in front. Each sample must retain its requested position and floor.
   const samples=[{x:floor.x-1.1,y:floor.y,z:floor.z},{x:floor.x+1.1,y:floor.y,z:floor.z},{x:floor.x,y:floor.y,z:floor.z-4}];
   let clear=collision.hasBodyClearance(environment,floor,.5,{actors:sim.actors,objects});
   for(const sample of samples){let support;try{support=collision.meetingPosition(environment,sample,sim.actors,objects);}catch{clear=false;break;}if(gap(support,sample)>.35||Math.abs(support.y-floor.y)>.3||!collision.hasBodyClearance(environment,support,.5,{actors:sim.actors,objects})){clear=false;break;}}
   if(!clear||collision.blocksShot(environment,{x:floor.x,y:floor.y+.9,z:floor.z-4},[0,0,1],3.5,sim.actors))continue;
   position=floor;break;
  }
  if(position)break;
 }
 if(!position)throw Object.assign(new Error('No clear Commons return-gate approach is available. Please try again.'),{statusCode:409});
 const id='commons-arrival-return-'+createHash('sha256').update(from).digest('hex').slice(0,20),name=String(sourceName||from).slice(0,100);
 const definition=compileBuilderScene({objects:[{id,modelId:'archway',name:'Return to '+name,position,rotation:{x:0,y:0,z:0},scale:{x:.8,y:.8,z:.8},functionalSettings:{behavior:'interact',action:'teleport',interactionDistance:5,destructible:false,prompt:'Return to '+name,portal:{enabled:true,destinationType:'map',targetMapId:from,ownerName:'Shared public world',color:'#9cffcf'}}}]}).objects[0];
 const entry={source:from,definition,expiresAt:now+COMMONS_RETURN_TTL};entries.push(entry);sim.actors[id]=returnActor(entry);
 return structuredClone(definition);
}
// Runtime travel fixtures never modify the member's authored layout.
export function worldTravelObjects(environment,collision){
 if(!environment.travelPortals?.length)return [];
 const rangeLocation=isDedicatedFiringRange(environment)?firingRangeLocations(environment).find(location=>location.id==='main'):null;
 const center=collision.safeSpawn(environment,rangeLocation?rangeLocalToWorld(rangeLocation,{x:0,y:0,z:16.2}):environment.spawn||{x:0,y:0,z:2}),occupied=[],authoredIds=new Set((environment.builderScene?.objects||environment.placementScene?.objects||[]).map(object=>object.id));
 return environment.travelPortals.map((portal,index)=>{
  const basketball=isBasketballEnvironment(environment),firingRange=isDedicatedFiringRange(environment),candidate=firingRange?rangeLocalToWorld(rangeLocation,{x:(index%2?-1:1)*17,y:0,z:17.2-Math.floor(index/2)*1.8}):basketball?{x:(index%2?-1:1)*10.8,y:center.y,z:8-Math.floor(index/2)*4}:{x:center.x+(index? -3:3),y:center.y,z:center.z+2};
  const candidates=[candidate];for(const radius of [3,5,2,7,9])for(let step=0;step<24;step++){const angle=step*Math.PI/12+index*Math.PI;candidates.push({x:center.x+Math.cos(angle)*radius,y:center.y,z:center.z+Math.sin(angle)*radius});}
  let position;
  for(const point of candidates){
   let floor;try{floor=environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,point):collision.groundAt(environment,point);}catch{continue;}
   if(basketball&&floor&&Math.abs(floor.x)<9&&Math.abs(floor.z)<16)continue;
   if(firingRange&&floor&&rangeWorldToLocal(rangeLocation,floor).z<14)continue;
   if(!floor||occupied.some(other=>Math.hypot(other.x-floor.x,other.z-floor.z)<2.2))continue;
   const origin={...center,y:center.y+.9},delta=[floor.x-center.x,floor.y-center.y,floor.z-center.z],length=Math.hypot(...delta);
   if(length<1||collision.blocksShot(environment,origin,delta.map(n=>n/length),length))continue;
   position=floor;break;
  }
  position ||= environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,candidate):collision.encounterSpawn(environment,candidate,center,occupied);
  occupied.push(position);
  let id='world-return-'+index;while(authoredIds.has(id))id+='-shared';
  return {id,modelId:'archway',name:'Return to '+portal.name,position,rotation:{x:0,y:0,z:0},scale:{x:.65,y:.65,z:.65},functionalSettings:{behavior:'interact',action:'teleport',interactionDistance:firingRange?2.5:5,prompt:'Return to '+portal.name,portal:{enabled:true,destinationType:'map',targetMapId:portal.mapId,ownerName:'Shared public world',color:portal.color||'#9cffcf'}}};
 });
}
export function portalArrivalPosition(environment,manifest,from,collision,actors,objects){
 if(isDedicatedFiringRange(environment)){const location=firingRangeLocations(environment).find(location=>location.id==='main');return collision.safeSpawn(environment,rangeLocalToWorld(location,{x:0,y:0,z:16.2}));}
 if(isBasketballEnvironment(environment))return collision.safeSpawn(environment,environment.spawn||{x:8.8,y:0,z:0});
 const reciprocal=manifest.objects.filter(object=>object.gameplay.portal?.targetMapId===from).sort((a,b)=>Number(b.objectId.startsWith('world-return-'))-Number(a.objectId.startsWith('world-return-')))[0];
 const center=collision.safeSpawn(environment,manifest.spawn?.position||environment.spawn||{x:0,y:0,z:2});
 if(!reciprocal)return center;
 const portal=reciprocal.transform.position,yaw=reciprocal.transform.rotation.y||0;
 const candidate={x:portal.x-Math.sin(yaw)*4,y:portal.y,z:portal.z-Math.cos(yaw)*4};
 return environment.builderScene||environment.proceduralLand?collision.meetingPosition(environment,candidate,actors,objects):collision.encounterSpawn(environment,candidate,center,[]);
}
