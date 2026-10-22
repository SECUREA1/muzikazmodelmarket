import {questRadio as radio} from './server-quest-radio.mjs';
import {startExpandedQuest,cancelExpandedQuest,expandedQuestAction} from './server-expanded-quests.mjs';
import {boatMovementBlocked} from './server-boat-assist.mjs';
import {isAircraft} from './public/js/aircraft-flight.js';
import {isWatercraft,harborWaterAt,watercraftOverlap} from './public/js/harbor-water.js';
import {airportRunways} from './public/js/airport-navigation.js';
const separation=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const routeCache=new WeakMap();
function routes(environment){if(routeCache.has(environment))return routeCache.get(environment);const result=buildRoutes(environment);routeCache.set(environment,result);return result;}
function buildRoutes(environment){
 const half=(environment.builderScene?.mapSize||1024)/2,harbor=environment.builderScene?.layoutMeta?.harbor;
 if(harbor){const extent=harbor.extent||256;return [.66,.84].map((factor,index)=>({kind:'boat',radius:extent*factor,y:0,speed:4+index,modelId:index?'harbor-sailboat':'harbor-skiff',callsign:index?'Palm Runner':'Beacon Tender',crew:index?'Captain Maya':'Captain Ellis'})).filter(route=>Array.from({length:96},(_,i)=>({x:Math.cos(i*Math.PI/48)*route.radius,z:Math.sin(i*Math.PI/48)*route.radius})).every(point=>harborWaterAt(environment,point,12)));}
 if(environment.airport?.enabled&&half>100&&(environment.airport.ceiling||80)>35)return [.48,.67].map((factor,index)=>({kind:'aircraft',radius:half*factor,y:Math.min(environment.airport.ceiling||80,80)-12-index*14,speed:index?13:18,modelId:index?'piper-cub':'diamond-da40',callsign:index?'Cub Two':'Diamond One',crew:index?'Pilot Sam':'Pilot Alex'}));
 return [];
}
export function stepTransportTraffic(sim,environment,now,dt,{collision,objects={}}={}){
 const choices=routes(environment);
 for(const [index,route]of choices.entries()){
  const id='transport-traffic-'+route.kind+'-'+index;let actor=sim.actors[id];
  if(!actor){const angle=index*Math.PI;const position={x:Math.cos(angle)*route.radius,y:route.y,z:Math.sin(angle)*route.radius};actor=sim.actors[id]={id,modelId:route.modelId,name:route.callsign+' · '+route.crew,active:true,spawned:true,spawnedAt:now,health:400,maxHealth:400,trafficAI:true,trafficAngle:angle,crew:{name:route.crew,callsign:route.callsign},position,rotation:{x:0,y:0,z:0},asset:{buildAssetId:route.modelId},definition:{objectId:id,modelId:route.modelId,name:route.callsign,position:{...position},rotation:{x:0,y:0,z:0},gameplay:{behavior:'vehicle',enabled:true,prompt:'AI crew · radio traffic'},movement:{speed:route.speed}}};}
  if(actor.active===false){actor.trafficDestroyedAt??=now;if(now-actor.trafficDestroyedAt<15000||Object.values(sim.players).some(player=>player.position&&separation(player.position,actor.position)<50))continue;actor.active=true;actor.health=400;actor.spawnedAt=now;delete actor.trafficDestroyedAt;delete actor.destroyedAt;}
  const angle=actor.trafficAngle+Math.max(0,Math.min(.25,dt))*route.speed*(actor.trafficHolding&&route.kind==='aircraft'?.7:1)/route.radius;
  const next={x:Math.cos(angle)*route.radius,y:route.y,z:Math.sin(angle)*route.radius};
  const blocked=(route.kind==='boat'&&collision&&boatMovementBlocked(environment,actor,sim.actors,collision,objects)(actor.position,next,Math.PI-angle))||Object.values(sim.actors).some(other=>other.id!==id&&other.active!==false&&other.position&&(route.kind==='boat'&&isWatercraft(other)?watercraftOverlap(next,Math.PI-angle,other.position,other.rotation?.y||0,8,actor,other):isAircraft(other)&&route.kind==='aircraft'&&separation(next,other.position)<35));
  if(!blocked||route.kind==='aircraft'){actor.position=next;actor.trafficAngle=angle;actor.rotation={x:0,y:Math.PI-angle,z:route.kind==='aircraft'?.045:0};}
  actor.trafficHolding=blocked;
  if(route.kind==='aircraft')actor.flight={airborne:true,altitude:route.y,airspeed:route.speed*(blocked?.7:1),speed:route.speed*(blocked?.7:1),throttle:.65,gear:true,bank:blocked?0:.045,phase:blocked?'traffic separation':'patrol'};
  else actor.boating={speed:blocked?0:route.speed,throttle:blocked?0:.45,phase:blocked?'yielding':'cruising',sailTrim:.65,anchor:false};
 }
 if(choices.length&&now>=(sim.transportNextRadioAt||0)){
  const index=sim.transportCallIndex||0;sim.transportCallIndex=index+1;const route=choices[Math.floor(index/2)%choices.length],actor=sim.actors['transport-traffic-'+route.kind+'-'+(Math.floor(index/2)%choices.length)];
  if(actor?.active!==false){const quadrant=(actor.position.x<0?'west':'east')+(actor.position.z<0?' north':' south');radio(sim,now,index%2?(route.kind==='boat'?'Harbor Control':'MUZIKAZ Tower'):route.crew+' / '+route.callsign,index%2?route.callsign+', traffic acknowledged. Maintain separation; player craft have priority.':actor.trafficHolding?'Holding for nearby traffic.':route.kind==='boat'?'Underway in the '+quadrant+' channel. All crew aboard.':'Patrolling '+quadrant+' airspace at '+Math.round(route.y)+' meters.');}
  sim.transportNextRadioAt=now+11000;
 }
}
export function vehicleMissionCommand(sim,player,environment,operation,now,options={}){
 if(operation==='interact')return expandedQuestAction(sim,player,now);
 if(operation==='cancel'){cancelExpandedQuest(sim,player,now);if(player.vehicleMission?.status==='active'){player.vehicleMission.status='cancelled';player.vehicleMission.message='Assignment cancelled.';}return 'Assignment cancelled.';}
 if(operation!=='start')throw new Error('Choose start or cancel.');
 if(player.vehicleMission?.status==='active')throw new Error('Finish or cancel the current assignment.');
 if(player.transportRewardAt!=null&&now<player.transportRewardAt+60000)throw new Error('Dispatch is preparing your next assignment. Try again shortly.');
 if(options.questId)return startExpandedQuest(sim,player,environment,options.questId,now,options);
 const craft=sim.actors[player.vehicleId];if(!craft||craft.trafficAI||craft.active===false||craft.holderId!==player.actorId||player.health<=0)throw new Error('Board your own boat or aircraft first.');
 let checkpoints,title;
 if(isAircraft(craft)&&environment.airport?.enabled){const runway=airportRunways(environment)[0];if(!runway)throw new Error('No runway is available.');title='Air courier circuit';checkpoints=[{name:'Departure beacon',x:runway.x,y:22,z:runway.z-runway.length/2-30,radius:40,airborne:true},{name:'Coastal survey beacon',x:Math.min((environment.builderScene?.mapSize||1024)*.28,300),y:35,z:-180,radius:45,airborne:true},{name:'Return and stop on the main runway',x:runway.x,y:.4,z:runway.z,radius:Math.max(15,runway.width),landed:true,runwayWidth:runway.width}];}
 else if(isWatercraft(craft)){const route=routes(environment).find(r=>r.kind==='boat');if(!route)throw new Error('This harbor has no safe survey circuit.');title='Harbor supply patrol';checkpoints=[{name:'East channel supplies',x:route.radius,y:0,z:0,radius:25},{name:'South channel survey',x:0,y:0,z:route.radius,radius:25},{name:'Return to your departure berth and stop',...craft.position,radius:22,stopped:true}];}
 else throw new Error('Dispatch supports boats and aircraft on their home maps.');
 player.vehicleMission={title,status:'active',vehicleId:craft.id,startedAt:now,deadline:now+600000,index:0,checkpoints,reward:500,message:'Follow the numbered beacons, then return safely.'};radio(sim,now,'Dispatch',title+' assigned. '+checkpoints[0].name+'.');return title+' started. Complete the circuit for 500 score points.';
}
export function stepVehicleMissions(sim,now){
 for(const player of Object.values(sim.players)){const mission=player.vehicleMission;if(mission?.status!=='active'||mission.questId)continue;const craft=sim.actors[mission.vehicleId];
  if(player.vehicleId!==mission.vehicleId||!craft||craft.active===false||craft.holderId!==player.actorId||player.health<=0||now-player.lastSeen>15000){mission.status='cancelled';mission.message='Assignment ended: you left the craft or disconnected.';continue;}
  if(now>mission.deadline){mission.status='expired';mission.message='Time expired. Ask dispatch for another assignment.';continue;}
  const point=mission.checkpoints[mission.index];mission.distance=Math.round(separation(craft.position,point));
  if(now-mission.startedAt<3000||now-(mission.checkpointAt||mission.startedAt)<1500||mission.distance>point.radius||point.airborne&&!craft.flight?.airborne||point.landed&&(craft.flight?.airborne||Math.abs(craft.flight?.speed||0)>2||Math.abs(craft.position.x-point.x)>point.runwayWidth/2)||point.stopped&&Math.abs(craft.boating?.speed||0)>.7)continue;
  mission.index++;mission.checkpointAt=now;
  if(mission.index===mission.checkpoints.length){mission.status='completed';mission.completedAt=now;mission.message='Safe return confirmed · +500 score';player.score=(player.score||0)+mission.reward;player.transportRewardAt=now;radio(sim,now,'Dispatch',player.username+', circuit complete. Five hundred score points awarded.');}
  else radio(sim,now,'Dispatch',player.username+', checkpoint confirmed. Next: '+mission.checkpoints[mission.index].name+'.');
 }
}
