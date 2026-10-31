import {forgeCrew} from './public/js/forge-config.js';
import {localMapLocations} from './public/js/local-map-locations.js';
import {ensureResidentIntelligence,stepResidentLife,archiveResidentIntelligence} from './server-resident-life.mjs';
import {stepCommunityLife} from './server-community-life.mjs';
/** Smithy specialists share resident memory, conversations, favors and routines. */
export function stepForgeResidents(sim,environment,now,dt,{collision,objects={}}={}){
 sim.actors||={};sim.players||={};const crew=forgeCrew(environment),expected=new Set(crew.map(person=>person.id)),locations=localMapLocations(environment);
 for(const [id,actor]of Object.entries(sim.actors))if(actor.resident?.forge&&!expected.has(id)){archiveResidentIntelligence(sim,actor,environment,now);delete sim.actors[id];if(sim.devices)delete sim.devices[id];}
 for(const [index,source]of crew.entries()){
  const requested=source.home,options={entry:true,actors:sim.actors,objects},home=collision?.groundAt?.(environment,requested,options)||requested;
  let npc=sim.actors[source.id];
  if(!npc)npc=sim.actors[source.id]={id:source.id,name:source.name,modelId:source.modelId,asset:{buildAssetId:source.modelId},active:true,health:100,spawned:true,destructible:false,trafficAI:true,position:{...home},rotation:{x:0,y:0,z:0},resident:{forge:true,isAI:true,ageGroup:'adult',name:source.name,index,locationIndex:0,placeName:environment.name,home:{...home},phase:'working',moving:false,speech:'',speechUntil:0}};
  npc.resident||={forge:true,isAI:true,ageGroup:'adult',name:source.name,index,locationIndex:0,placeName:environment.name,home:{...home},phase:'working',moving:false,speech:'',speechUntil:0};
  const revision=JSON.stringify(source.home);if(npc.forgeHomeRevision!==revision){if(npc.forgeHomeRevision!==undefined)npc.position={...home};npc.resident.home={...home};npc.forgeHomeRevision=revision;}
  npc.definition={objectId:source.id,modelId:source.modelId,name:source.name,position:{...home},gameplay:{behavior:'talk',interactionDistance:4,cooldown:1,prompt:'Talk / forge objectives · '+source.name},dialogue:{text:source.greeting}};
  npc.active=true;npc.health=100;npc.destructible=false;npc.spawned=true;npc.trafficAI=true;
  const locationIndex=locations.reduce((best,place,i)=>Math.hypot(place.x-home.x,place.z-home.z)<Math.hypot((locations[best]?.x??1e9)-home.x,(locations[best]?.z??1e9)-home.z)?i:best,0);
  Object.assign(npc.resident,{forge:true,isAI:true,ageGroup:'adult',role:source.role,name:source.name,color:source.color,skin:source.skin,locationIndex,placeName:locations[locationIndex]?.name||environment.name,task:source.task,workLabel:source.task,tip:source.greeting,ask:'Could you check the smithy work stations and return for a forge handover?',prop:'clipboard'});
  ensureResidentIntelligence(sim,npc,environment,now);
  if(npc.resident.appearance){npc.resident.appearance.outfit=source.color;npc.resident.appearance.skin=source.skin;}
  npc.name=source.name+' · '+source.role;
 }
 const cast=Object.values(sim.actors).filter(actor=>actor.resident?.forge);stepCommunityLife(sim,cast,now,dt);stepResidentLife(sim,environment,now,dt,{collision,objects});
 for(const player of Object.values(sim.players)){const task=player.residentTask;if(task?.status==='active'&&(player.movementRevision||0)!==task.revision){task.status='cancelled';task.message='Travel reset this smithy favor.';}if(task?.status==='active'&&now>task.deadline){task.status='expired';task.message='Smithy favor expired. Ask a specialist for another objective.';}}
}
