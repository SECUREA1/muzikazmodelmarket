import {randomUUID} from 'node:crypto';
import {attachQuestContact,questConversationLine,updateQuestContact,converseQuest} from './server-quest-dialogue.mjs';
import {questCatalog} from './public/js/quest-catalog.js';
import {teamCommand} from './server-quest-teams.mjs';
import {questRadio as radio} from './server-quest-radio.mjs';
import {startExpandedQuest,cancelExpandedQuest,expandedQuestAction,requestQuestSupport} from './server-expanded-quests.mjs';
import {boatMovementBlocked} from './server-boat-assist.mjs';
import {isAircraft} from './public/js/aircraft-flight.js';
import {isWatercraft,harborWaterAt,watercraftOverlap} from './public/js/harbor-water.js';
import {airportRunways} from './public/js/airport-navigation.js';
import {harborQuestRadii} from './public/js/harbor-quest-routes.js';
const separation=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const routeCache=new WeakMap();
function routes(environment){if(routeCache.has(environment))return routeCache.get(environment);const result=buildRoutes(environment);routeCache.set(environment,result);return result;}
function buildRoutes(environment){
 const half=(environment.builderScene?.mapSize||1024)/2,harbor=environment.builderScene?.layoutMeta?.harbor;
 if(harbor)return harborQuestRadii(environment).map((radius,index)=>({kind:'boat',radius,y:0,speed:4+index,modelId:index?'harbor-sailboat':'harbor-skiff',callsign:index?'Palm Runner':'Beacon Tender',crew:index?'Captain Maya':'Captain Ellis'}));
 if(environment.airport?.enabled&&half>100&&(environment.airport.ceiling||80)>35)return [.48,.67].map((factor,index)=>({kind:'aircraft',radius:half*factor,y:Math.min(environment.airport.ceiling||80,80)-12-index*14,speed:index?13:18,modelId:index?'piper-cub':'diamond-da40',callsign:index?'Cub Two':'Diamond One',crew:index?'Pilot Sam':'Pilot Alex'}));
 return [];
}
export function stepTransportTraffic(sim,environment,now,dt,{collision,objects={}}={}){
 const choices=routes(environment);
 const offered=questCatalog(environment);if(offered.length&&now>=(sim.nextLiveDispatchAt||0)){const index=sim.dispatchOfferIndex||0,offer=offered[index%offered.length];sim.dispatchOfferIndex=index+1;sim.liveDispatch={id:'dispatch-'+now,questId:offer.id,title:offer.title,mode:offer.mode,expires:now+90000};sim.nextLiveDispatchAt=now+120000;radio(sim,now,'Dispatch','Available operation: '+offer.title+'. Volunteer through the local map; no assignment is started automatically.');}
 for(const [index,route]of choices.entries()){
  const id='transport-traffic-'+route.kind+'-'+index;let actor=sim.actors[id];
  if(!actor){const angle=index*Math.PI;const position={x:Math.cos(angle)*route.radius,y:route.y,z:Math.sin(angle)*route.radius};actor=sim.actors[id]={id,modelId:route.modelId,name:route.callsign+' · '+route.crew,active:true,spawned:true,spawnedAt:now,health:400,maxHealth:400,trafficAI:true,trafficAngle:angle,crew:{name:route.crew,callsign:route.callsign},position,rotation:{x:0,y:0,z:0},asset:{buildAssetId:route.modelId},definition:{objectId:id,modelId:route.modelId,name:route.callsign,position:{...position},rotation:{x:0,y:0,z:0},gameplay:{behavior:'vehicle',enabled:true,prompt:'AI crew · radio traffic'},movement:{speed:route.speed}}};}
  if(actor.active===false){actor.trafficDestroyedAt??=now;if(now-actor.trafficDestroyedAt<15000||Object.values(sim.players).some(player=>player.position&&separation(player.position,actor.position)<50))continue;actor.active=true;actor.health=400;actor.spawnedAt=now;delete actor.trafficDestroyedAt;delete actor.destroyedAt;}
  actor.trafficJob||={title:route.kind==='boat'?'Channel supply transfer':'Coastal survey flight',sector:0,completed:0,nextAngle:actor.trafficAngle+Math.PI/2};const job=actor.trafficJob;const servicing=route.kind==='boat'&&now<(job.serviceUntil||0);
  const angle=actor.trafficAngle+Math.max(0,Math.min(.25,dt))*(servicing?0:route.speed)*(actor.trafficHolding&&route.kind==='aircraft'?.7:1)/route.radius;
  const next={x:Math.cos(angle)*route.radius,y:route.y,z:Math.sin(angle)*route.radius};
  const blocked=(route.kind==='boat'&&collision&&boatMovementBlocked(environment,actor,sim.actors,collision,objects)(actor.position,next,Math.PI-angle))||Object.values(sim.actors).some(other=>other.id!==id&&other.active!==false&&other.position&&(route.kind==='boat'&&isWatercraft(other)?watercraftOverlap(next,Math.PI-angle,other.position,other.rotation?.y||0,8,actor,other):isAircraft(other)&&route.kind==='aircraft'&&separation(next,other.position)<35));
  if(!blocked||route.kind==='aircraft'){actor.position=next;actor.trafficAngle=angle;actor.rotation={x:0,y:Math.PI-angle,z:route.kind==='aircraft'?.045:0};}
  actor.trafficHolding=blocked;job.phase=servicing?'transferring supplies':blocked?'yielding to traffic':route.kind==='boat'?'delivery underway':'surveying sector '+(job.sector+1);if(!servicing&&actor.trafficAngle>=job.nextAngle){job.nextAngle+=Math.PI/2;job.sector=(job.sector+1)%4;job.completed++;if(route.kind==='boat')job.serviceUntil=now+12000;radio(sim,now,route.callsign,route.kind==='boat'?'At the channel rendezvous. Holding twelve seconds for supply transfer.':'Survey sector complete. '+job.completed+' sectors logged; continuing to the next beacon.');}
  if(route.kind==='aircraft')actor.flight={airborne:true,altitude:route.y,airspeed:route.speed*(blocked?.7:1),speed:route.speed*(blocked?.7:1),throttle:.65,gear:true,bank:blocked?0:.045,phase:blocked?'traffic separation':'patrol'};
  else actor.boating={speed:blocked||servicing?0:route.speed,throttle:blocked||servicing?0:.45,phase:job.phase,sailTrim:.65,anchor:false};
 }
 if(choices.length&&now>=(sim.transportNextRadioAt||0)){
  const index=sim.transportCallIndex||0;sim.transportCallIndex=index+1;const route=choices[Math.floor(index/2)%choices.length],actor=sim.actors['transport-traffic-'+route.kind+'-'+(Math.floor(index/2)%choices.length)];
  if(actor?.active!==false){const quadrant=(actor.position.x<0?'west':'east')+(actor.position.z<0?' north':' south');radio(sim,now,index%2?(route.kind==='boat'?'Harbor Control':'MUZIKAZ Tower'):route.crew+' / '+route.callsign,index%2?route.callsign+', traffic acknowledged. Maintain separation; player craft have priority.':actor.trafficHolding?'Holding for nearby traffic.':route.kind==='boat'?'Underway in the '+quadrant+' channel. All crew aboard.':'Patrolling '+quadrant+' airspace at '+Math.round(route.y)+' meters.');}
  sim.transportNextRadioAt=now+11000;
 }
}
export function vehicleMissionCommand(sim,player,environment,operation,now,options={}){
 if(operation==='converse')return converseQuest(sim,player,now,options);
 if(['share','join','radio'].includes(operation))return teamCommand(sim,player,operation,now,options);
 if(operation==='support')return requestQuestSupport(sim,player,environment,now,options);
 if(operation==='hail'){if(now<(player.questRadioAt||0)+4000)throw Error('Wait for the current radio call.');player.questRadioAt=now;const crews=Object.values(sim.actors).filter(a=>a.trafficAI&&!a.questOwner&&a.active!==false&&a.trafficJob).sort((a,b)=>separation(a.position,player.position)-separation(b.position,player.position));const crew=crews[0];if(!crew)throw Error('No working crew is in radio range.');radio(sim,now,player.username,'Nearby crew, report your current task.');radio(sim,now,crew.crew?.callsign||crew.name,player.username+', '+crew.trafficJob.title+'. '+crew.trafficJob.phase+'. '+crew.trafficJob.completed+' transfers or sectors completed. Keeping clear of your craft.');return 'Nearby crew answered.';}
 if(operation==='interact')return expandedQuestAction(sim,player,now);
 if(operation==='cancel'){const previous=player.vehicleMission;if(previous?.contactId&&!previous.questId)delete sim.actors[previous.contactId];cancelExpandedQuest(sim,player,now);if(player.vehicleMission?.status==='active'){player.vehicleMission.status='cancelled';player.vehicleMission.message='Assignment cancelled.';}return 'Assignment cancelled.';}
 if(operation!=='start')throw new Error('Choose start or cancel.');
 if(player.vehicleMission?.status==='active')throw new Error('Finish or cancel the current assignment.');
 if(player.transportRewardAt!=null&&now<player.transportRewardAt+60000)throw new Error('Dispatch is preparing your next assignment. Try again shortly.');
 if(options.questId)return startExpandedQuest(sim,player,environment,options.questId,now,options);
 const craft=sim.actors[player.vehicleId];if(!craft||craft.trafficAI||craft.active===false||craft.holderId!==player.actorId||player.health<=0)throw new Error('Board your own boat or aircraft first.');
 let checkpoints,title;
 if(isAircraft(craft)&&environment.airport?.enabled){const runway=airportRunways(environment)[0];if(!runway)throw new Error('No runway is available.');title='Air courier circuit';checkpoints=[{name:'Departure beacon',x:runway.x,y:22,z:runway.z-runway.length/2-30,radius:40,airborne:true},{name:'Coastal survey beacon',x:Math.min((environment.builderScene?.mapSize||1024)*.28,300),y:35,z:-180,radius:45,airborne:true},{name:'Return and stop on the main runway',x:runway.x,y:.4,z:runway.z,radius:Math.max(15,runway.width),landed:true,runwayWidth:runway.width}];}
 else if(isWatercraft(craft)){const route=routes(environment).find(r=>r.kind==='boat');if(!route)throw new Error('This harbor has no safe survey circuit.');title='Harbor supply patrol';checkpoints=[{name:'East channel supplies',x:route.radius,y:0,z:0,radius:25},{name:'South channel survey',x:0,y:0,z:route.radius,radius:25},{name:'Return to your departure berth and stop',...craft.position,radius:22,stopped:true}];}
 else throw new Error('Dispatch supports boats and aircraft on their home maps.');
 player.vehicleMission={title,status:'active',vehicleId:craft.id,startedAt:now,deadline:now+600000,index:0,checkpoints,reward:500,message:'Follow the numbered beacons, then return safely.'};const legacy=player.vehicleMission;legacy.instanceId='legacy-quest-'+randomUUID();legacy.mode=isWatercraft(craft)?'boat':'aircraft';legacy.kind='patrol';legacy.team={[player.actorId]:{role:'leader',vehicleId:craft.id,revision:player.movementRevision||0,contribution:0}};attachQuestContact(sim,player,legacy,environment,now,options);radio(sim,now,'Dispatch',title+' assigned. '+checkpoints[0].name+'.');return title+' started. Complete the circuit for 500 score points.';
}
export function stepVehicleMissions(sim,now){
 for(const player of Object.values(sim.players)){const mission=player.vehicleMission;if(mission?.status!=='active'||mission.questId)continue;updateQuestContact(sim,player,mission,now);const craft=sim.actors[mission.vehicleId];
  if(player.vehicleId!==mission.vehicleId||!craft||craft.active===false||craft.holderId!==player.actorId||player.health<=0||now-player.lastSeen>15000){if(mission.contactId)delete sim.actors[mission.contactId];mission.status='cancelled';mission.message='Assignment ended: you left the craft or disconnected.';continue;}
  if(now>mission.deadline){if(mission.contactId)delete sim.actors[mission.contactId];mission.status='expired';mission.message='Time expired. Ask dispatch for another assignment.';continue;}
  const point=mission.checkpoints[mission.index];mission.distance=Math.round(separation(craft.position,point));
  if(now-mission.startedAt<3000||now-(mission.checkpointAt||mission.startedAt)<1500||mission.distance>point.radius||point.airborne&&!craft.flight?.airborne||point.landed&&(craft.flight?.airborne||Math.abs(craft.flight?.speed||0)>2||Math.abs(craft.position.x-point.x)>point.runwayWidth/2)||point.stopped&&Math.abs(craft.boating?.speed||0)>.7)continue;
  mission.index++;mission.checkpointAt=now;
  if(mission.index===mission.checkpoints.length){if(mission.contactId)delete sim.actors[mission.contactId];mission.status='completed';mission.completedAt=now;mission.message='Safe return confirmed · +500 score';player.score=(player.score||0)+mission.reward;player.transportRewardAt=now;if(mission.contact)questConversationLine(sim,player,mission,now,'Safe return confirmed. Excellent work. Five hundred score points awarded.');radio(sim,now,'Dispatch',player.username+', circuit complete. Five hundred score points awarded.');}
  else if(mission.contact)questConversationLine(sim,player,mission,now,'Checkpoint confirmed. Next: '+mission.checkpoints[mission.index].name+'.');else radio(sim,now,'Dispatch',player.username+', checkpoint confirmed. Next: '+mission.checkpoints[mission.index].name+'.');
 }
}
