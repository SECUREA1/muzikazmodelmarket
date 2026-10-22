import {isConstructionMachine,constructionTravelStatus} from './public/js/construction-state.js';
import {constructionMovementBlocked} from './server-construction-collision.mjs';
import {ROAD_VEHICLES,isRoadVehicle,roadVehicleType} from './public/js/road-vehicles.js';
import {roadFleetAnchors} from './public/js/road-network.js';
export {roadFleetAnchors} from './public/js/road-network.js';
export function ensureRoadFleet(sim,environment,collision,objects){
 const revision='road-v2:'+(sim.environmentUpdatedAt||environment.id);if(sim.roadFleetRevision===revision)return;sim.roadFleetRevision=revision;const roads=roadFleetAnchors(environment);if(!roads.length)return;
 for(const [index,[modelId,config]]of Object.entries(ROAD_VEHICLES).filter(([,config])=>!config.siteOnly).entries()){
  const id='public-road-'+modelId;if(sim.actors[id]?.roadFleetVersion===2||sim.actors[id]?.holderId)continue;let position=null,yaw=0;
  for(const road of roads){const dx=road.to.x-road.from.x,dz=road.to.z-road.from.z,length=Math.hypot(dx,dz);if(length<8)continue;
   for(const t of [.2+index*.2,.1,.9]){const point={x:road.from.x+dx*t-dz/length*((road.width||8)/2+config.width/2+.4),y:road.from.y||0,z:road.from.z+dz*t+dx/length*((road.width||8)/2+config.width/2+.4)},floor=collision.groundAt(environment,point,{actors:sim.actors,objects});if(!floor||!collision.hasBodyClearance(environment,floor,config.width/2,{actors:sim.actors,objects})||Object.values(sim.actors).some(a=>a.active!==false&&isRoadVehicle(a)&&Math.hypot(a.position.x-floor.x,a.position.z-floor.z)<5))continue;position=floor;yaw=Math.atan2(-dx,-dz);break;}if(position)break;
  }
  if(!position)continue;const asset={id:'builder-'+modelId,buildAssetId:modelId,name:config.name,type:'vehicles',behavior:'vehicle',format:'procedural-3d',thumbnailUrl:'/public/images/vehicles/'+modelId+'.svg'};
  sim.actors[id]={id,modelId,name:config.name,asset,position,rotation:{x:0,y:yaw,z:0},scale:{x:1,y:1,z:1},health:300,active:true,spawned:true,roadFleet:true,roadFleetVersion:2,driving:{speed:0,parked:true},definition:{objectId:id,modelId,name:config.name,asset,transform:{position:{...position},rotation:{x:0,y:yaw,z:0},scale:{x:1,y:1,z:1}},gameplay:{behavior:'vehicle',health:300,interactionKey:'f',interactionDistance:4,cooldown:0},vehicle:{mode:'drive',speed:config.speed,seat:config.seat}}};
 }
}
export function roadMovementBlocked(collision,environment,actors,objects,actor,from,to,yaw){
 if(isConstructionMachine(actor)){const status=constructionTravelStatus(actor);if(!status.allowed&&Math.hypot(to.x-from.x,to.z-from.z)>1e-6)return true;const hit=constructionMovementBlocked({actors,players:{}},actor,{...actor,position:{...to},rotation:{...actor.rotation,y:yaw}},{collision,environment,objects});actor.construction.blocked=hit;actor.driving||={};actor.driving.blockedReason=hit?.reason||'';actor.driving.blockedPart=hit?.part||null;if(hit)return true;}
 const config=roadVehicleType(actor),travel=Math.hypot(to.x-from.x,to.z-from.z),steps=Math.max(1,Math.ceil(travel/.3));
 // Retain the ID so authored map geometry is excluded as well as spawned meshes.
 const others={...actors,[actor.id]:{...actor,active:false}};
 for(let i=1;i<=steps;i++)for(const side of [-1,0,1])for(const end of [-1,1]){const point={x:from.x+(to.x-from.x)*i/steps+Math.cos(yaw)*side*config.width*.45-Math.sin(yaw)*end*config.length*.4,y:to.y,z:from.z+(to.z-from.z)*i/steps-Math.sin(yaw)*side*config.width*.45-Math.cos(yaw)*end*config.length*.4};const floor=collision.groundAt(environment,point,{actors:others,objects});if(!floor||Math.abs(floor.y-to.y)>.65||!collision.hasBodyClearance(environment,floor,.25,{actors:others,objects}))return true;}
 return Object.values(others).some(other=>isRoadVehicle(other)&&other.active!==false&&Math.hypot(other.position.x-to.x,other.position.z-to.z)<(config.width+roadVehicleType(other).width)/2+.3);
}
export function roadExitPosition(collision,environment,actor,actors,objects){const config=roadVehicleType(actor),yaw=actor.rotation?.y||0,others=Object.fromEntries(Object.entries(actors).filter(([id])=>id!==actor.id));for(const side of [1,-1])for(const gap of [config.width/2+1,config.width/2+2]){const point={x:actor.position.x+Math.cos(yaw)*side*gap,y:actor.position.y,z:actor.position.z-Math.sin(yaw)*side*gap},floor=collision.groundAt(environment,point,{actors:others,objects});if(floor&&collision.hasBodyClearance(environment,floor,.38,{actors:others,objects}))return floor;}throw Error('Clear space beside the vehicle before exiting.');}
