import {factoryCrew} from './public/js/missile-factory-config.js';
import {localMapLocations} from './public/js/local-map-locations.js';
import {ensureResidentIntelligence,stepResidentLife,archiveResidentIntelligence} from './server-resident-life.mjs';
import {stepFactoryCrewWork} from './server-factory-crew-work.mjs';

/** Factory staff use the same appearance, memory, needs, dialogue and favor
 * systems as every other local resident. Their routines never grant items. */
export function stepFactoryResidents(sim,environment,now,dt,{collision,objects={}}={}){
 sim.actors||={};sim.players||={};
 const crew=factoryCrew(environment,{actors:sim.actors}),expected=new Set(crew.map(person=>person.id));
 for(const [id,actor]of Object.entries(sim.actors))if(actor.resident?.factory&&!expected.has(id)){
  archiveResidentIntelligence(sim,actor,environment,now);delete sim.actors[id];if(sim.devices)delete sim.devices[id];
 }
 const locations=localMapLocations(environment);
 for(const [index,source]of crew.entries()){
  let npc=sim.actors[source.id];
  if(!npc){
   const requested=source.home||source.position||{x:0,y:0,z:20};
   const home=collision?.groundAt?.(environment,requested,{entry:true,actors:sim.actors,objects})||requested;
   const locationIndex=locations.reduce((best,place,i)=>Math.hypot(place.x-home.x,place.z-home.z)<Math.hypot((locations[best]?.x??1e9)-home.x,(locations[best]?.z??1e9)-home.z)?i:best,0);
   npc=sim.actors[source.id]={id:source.id,name:source.name+' · '+source.role,modelId:'world-resident',asset:{buildAssetId:'world-resident'},active:true,health:100,destructible:false,spawned:true,trafficAI:true,position:{...home},rotation:{x:0,y:source.heading||0,z:0},resident:{factory:true,isAI:true,ageGroup:'adult',name:source.name,index,locationIndex,placeName:locations[locationIndex]?.name||environment.name,home:{...home},phase:'working',moving:false,speech:'',speechUntil:0},definition:{objectId:source.id,modelId:'world-resident',name:source.name,position:{...home},gameplay:{behavior:'talk',interactionDistance:4,cooldown:1,prompt:'Factory crew / jobs · '+source.name},dialogue:{text:source.greeting||'Check the Factory production board or ask me for a local job.'}}};
  }
  const homeRevision=JSON.stringify(source.home||source.position),home=source.home||source.position;
  if(!npc.resident)npc.resident={factory:true,isAI:true,ageGroup:'adult',name:source.name,index,locationIndex:0,placeName:environment.name,home:{...home},phase:'working',moving:false,speech:'',speechUntil:0};
  if(npc.factoryHomeRevision!==homeRevision){if(npc.factoryHomeRevision!==undefined)npc.position={...home};npc.resident.home={...home};npc.factoryHomeRevision=homeRevision;}
  npc.definition ||= {objectId:source.id,modelId:'world-resident',name:source.name,gameplay:{behavior:'talk',interactionDistance:4,cooldown:1,prompt:'Factory crew / jobs · '+source.name},dialogue:{text:source.greeting}};
  npc.active=true;npc.health=Math.max(1,npc.health||100);npc.trafficAI=true;npc.spawned=true;npc.destructible=false;
  ensureResidentIntelligence(sim,npc,environment,now);
  Object.assign(npc.resident,{factory:true,factoryCrewId:source.canonicalCrewId||source.id,role:source.role,name:source.name,uniform:'construction',color:source.color||npc.resident.color,skin:source.skin||npc.resident.skin});
  if(source.task)npc.resident.workLabel=source.task;
  if(source.greeting)npc.resident.tip=source.greeting;
  if(npc.resident.appearance){npc.resident.appearance.outfit=npc.resident.color;npc.resident.appearance.skin=npc.resident.skin;}
  npc.name=source.name+' · '+source.role;
 }
 stepResidentLife(sim,environment,now,dt,{collision,objects});
 stepFactoryCrewWork(sim,environment,now,dt,{collision,objects});
 for(const player of Object.values(sim.players)){
  const task=player.residentTask;
  if(task?.status==='active'&&(player.movementRevision||0)!==task.revision){task.status='cancelled';task.message='Travel reset this factory favor.';}
  if(task?.status==='active'&&now>task.deadline){task.status='expired';task.message='Factory favor expired. Ask a worker for another job.';}
 }
}
