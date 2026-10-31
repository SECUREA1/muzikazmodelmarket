import {stepBunkerResponse} from './server-bunker-response.mjs';
import {BUNKER_CREW} from './public/js/bunker-config.js';
import {localMapLocations} from './public/js/local-map-locations.js';
import {ensureResidentIntelligence,stepResidentLife,archiveResidentIntelligence} from './server-resident-life.mjs';
import {stepCommunityLife} from './server-community-life.mjs';

/** Authored bunker staff share the ordinary conversation, memories, needs,
 * invitations and daily-favor implementation. They never mint inventory. */
export function stepBunkerResidents(sim,environment,now,dt,{collision,objects={}}={}){
 sim.actors||={};sim.players||={};
 const source=environment.builderScene?.layoutMeta?.residents;
 const authored=Array.isArray(environment.builderScene?.objects)?new Map(environment.builderScene.objects.map(object=>[object.id,object])):null;
 const crew=(Array.isArray(source)?source:BUNKER_CREW).filter(person=>!authored||authored.has(person.id));
 const expected=new Set(crew.map(person=>person.id));
 for(const [id,actor]of Object.entries(sim.actors))if(actor.resident?.bunker&&!expected.has(id)){
  archiveResidentIntelligence(sim,actor,environment,now);delete sim.actors[id];
 }
 const locations=localMapLocations(environment),cast=[];
 for(const [index,person]of crew.entries()){
  const object=authored?.get(person.id),requested=object?.position||person.home||person.position;
  if(!person.id||!requested||!Number.isFinite(requested.x)||!Number.isFinite(requested.z))continue;
  let npc=sim.actors[person.id];
  if(!npc){
   const home=collision?.groundAt?.(environment,requested,{entry:true,actors:sim.actors,objects})||requested;
   if(collision?.hasBodyClearance&&!collision.hasBodyClearance(environment,home,.42,{actors:sim.actors,objects}))continue;
   const locationIndex=locations.reduce((best,place,i)=>Math.hypot(place.x-home.x,place.z-home.z)<Math.hypot((locations[best]?.x??1e9)-home.x,(locations[best]?.z??1e9)-home.z)?i:best,0);
   npc=sim.actors[person.id]={id:person.id,name:person.name+' · '+person.role,modelId:person.modelId||'world-resident',asset:{buildAssetId:person.modelId||'world-resident'},active:true,health:100,destructible:false,spawned:true,trafficAI:true,position:{...home},rotation:{x:0,y:person.heading||0,z:0},resident:{bunker:true,isAI:true,ageGroup:'adult',name:person.name,index,locationIndex,placeName:locations[locationIndex]?.name||environment.name,home:{...home},phase:'working',moving:false,speech:'',speechUntil:0},definition:{objectId:person.id,modelId:person.modelId||'world-resident',name:person.name,position:{...home},gameplay:{behavior:'talk',interactionDistance:4,cooldown:1,prompt:'Bunker crew / local favors · '+person.name},dialogue:{text:person.greeting}}};
  }
  // Map-authored character actors already exist when a room initializes.
  // Attach social state to those exact identities and retain their native rig.
  if(!npc.resident){
   const home={...npc.position};
   const locationIndex=locations.reduce((best,place,i)=>Math.hypot(place.x-home.x,place.z-home.z)<Math.hypot((locations[best]?.x??1e9)-home.x,(locations[best]?.z??1e9)-home.z)?i:best,0);
   npc.resident={bunker:true,isAI:true,ageGroup:'adult',name:person.name,index,locationIndex,placeName:locations[locationIndex]?.name||environment.name,home,phase:'working',moving:false,speech:'',speechUntil:0};
  }
  const homeRevision=JSON.stringify(requested);
  if(npc.bunkerHomeRevision!==homeRevision){
   const home=collision?.groundAt?.(environment,requested,{entry:true,actors:sim.actors,objects})||requested;
   if(npc.bunkerHomeRevision!==undefined)npc.position={...home};
   npc.resident.home={...home};npc.bunkerHomeRevision=homeRevision;
   if(npc.resident.bunkerResponse?.status==='active'){delete npc.resident.bunkerResponse.path;delete npc.resident.bunkerResponse.targetRevision;delete npc.resident.bunkerResponse.readyAt;}
  }
  npc.active=true;npc.health=Math.max(1,npc.health||100);npc.trafficAI=true;npc.destructible=false;
  ensureResidentIntelligence(sim,npc,environment,now);
  Object.assign(npc.resident,{bunker:true,isAI:true,role:person.role,name:person.name,color:person.color||npc.resident.color,skin:person.skin||npc.resident.skin,workLabel:person.task||npc.resident.workLabel,tip:person.greeting||npc.resident.tip,ask:person.greeting||npc.resident.ask});
  if(npc.resident.appearance){npc.resident.appearance.outfit=npc.resident.color;npc.resident.appearance.skin=npc.resident.skin;}
  npc.name=person.name+' · '+person.role;cast.push(npc);
 }
 stepBunkerResponse(sim,environment,cast,now,dt,{collision,objects});
 stepCommunityLife(sim,cast.filter(npc=>npc.resident.bunkerResponse?.status!=='active'),now,dt);
 stepResidentLife(sim,environment,now,dt,{collision,objects});
 for(const npc of cast)if(npc.resident.bunkerResponse?.status==='active'){const response=npc.resident.bunkerResponse;npc.resident.moving=response.moving===true;npc.resident.phase=response.stage==='walking'?'walking':'working';npc.resident.task=response.message;npc.resident.mood=sim.bunkerDefense?.alarm?.level==='danger'?'alert':'focused';}
 for(const player of Object.values(sim.players)){
  const task=player.residentTask;
  if(task?.status==='active'&&(player.movementRevision||0)!==task.revision){task.status='cancelled';task.message='Travel reset this bunker favor.';}
  if(task?.status==='active'&&now>task.deadline){task.status='expired';task.message='Bunker favor expired. Ask a crew member for another job.';}
 }
}
