import {isAircraft} from './aircraft-flight.js';
import {isWatercraft,harborWaterAt,watercraftFootprint,watercraftOverlap} from './harbor-water.js';

const choice=(action,label,reason,enabled=true)=>({action,label,reason,enabled});
export function boatBerthDistance(environment,boat){
 const points=(environment?.builderScene?.objects||[]).filter(isWatercraft);
 return Math.min(Infinity,...points.map(point=>Math.hypot(point.position.x-boat.position.x,point.position.z-boat.position.z)));
}
// Forecast the whole hull along its stopping distance, including other boats.
export function boatWaterwayClear(environment,boat,actors={},distance=6){
 const yaw=boat.rotation?.y||0,direction=(boat.boating?.speed||0)<-.1?-1:1,steps=Math.max(1,Math.ceil(distance));
 for(let index=0;index<=steps;index++){
  const travel=distance*index/steps;
  const point={x:boat.position.x-Math.sin(yaw)*travel*direction,z:boat.position.z-Math.cos(yaw)*travel*direction};
  if(!watercraftFootprint(point,yaw,boat).every(vertex=>harborWaterAt(environment,vertex,.5)))return false;
  if(Object.values(actors).some(other=>other.id!==boat.id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(point,yaw,other.position,other.rotation?.y||0,.4,boat,other)))return false;
 }
 return true;
}
export function resolveVehicleAction({vehicle,environment={},actors={}}={}){
 if(!vehicle||vehicle.active===false||vehicle.health<=0)return choice(null,'Vehicle unavailable','Enter an available vehicle first.',false);
 if(isAircraft(vehicle)){
  const flight=vehicle.flight||{},speed=Math.max(flight.speed||0,flight.airspeed||0),altitude=Number(flight.altitude)||0;
  if(flight.stall||flight.airborne&&speed<(flight.stallSpeed||7))return choice('recover','Recover airspeed','Add power and lower the nose to recover safe flying speed.');
  if(flight.assist){
   if(flight.assist==='emergency-departure'){
    const stage=flight.assistStage,departure=flight.emergencyDeparture;
    const label=departure?.status==='waiting'||departure?.status==='blocked'?'Hold for clearance':stage==='preflight'?'Run preflight checks':stage==='taxi'?'Continue taxi':stage==='hold-short'?'Wait for runway clearance':stage==='lineup'?'Line up for departure':stage==='roll'?'Continue takeoff roll':'Continue emergency climb';
    return choice('continue',label,departure?.reason||'Emergency departure is active. Move the stick or choose Manual to take control.');
   }
   const label=flight.assist==='land'?(flight.assistStage==='park'?'Finish parking':'Continue landing'):flight.assist==='cruise'?'Hold level flight':flight.airborne?'Continue climbing':'Continue takeoff';
   return choice('continue',label,'Assistance is active. Move the stick or use a manual function to take control.');
  }
  if(!flight.airborne){
   const runway=environment.airport?.runway,onRunway=runway&&Math.abs(vehicle.position.x-runway.x)<runway.width/2-1&&Math.abs(vehicle.position.z-runway.z)<runway.length/2;
   if(onRunway&&speed>.5)return choice('climb','Accelerate and climb','Build airspeed, then lift off from the runway.');
   if(speed>2)return choice('park','Stop and park','Stop before leaving the cockpit or lining up for departure.');
   return choice('takeoff','Take off and climb','Request a clear runway and depart with climb assistance.',!!environment.airport?.runway);
  }
  if(flight.phase==='approach'&&flight.verticalSpeed<-.8&&altitude<18&&environment.airport?.runway)return choice('land','Land and park','Join the runway, descend, and park clear of other pilots.');
  if(altitude<Math.min(24,(environment.airport?.ceiling||80)*.5))return choice('climb','Climb to safe altitude','Add power and climb before settling into level flight.');
  return choice('cruise','Hold level flight','Maintain altitude and airspeed. Manual steering takes control.');
 }
 if(isWatercraft(vehicle)){
  const state=vehicle.boating||{},speed=Math.abs(state.speed||0),distance=boatBerthDistance(environment,vehicle);
  const clear=boatWaterwayClear(environment,vehicle,actors,Math.max(6,speed*speed/10+3));
  if(state.assist&&state.assistRoute?.length)return choice('continue',state.assistStage==='waiting'?'Wait for clear water':state.navigationName?'Sail to '+state.navigationName:'Follow the water passage','A water-safe route is active. Steer or use power to take manual control.');
  if(speed>.2&&!clear)return choice('slow','Slow for the waterway','Reduce power before shore, traffic, or the edge of the harbor.');
  if(state.assist)return choice('continue',state.assist==='slow'?'Continue slowing':state.assist==='launch'?'Leave the berth':'Cruise the waterway','Assistance is active. Steer or choose a manual function to take control.');
  if(state.anchor||distance<.5&&speed<.15)return choice('launch','Weigh anchor and depart','Release the anchor and follow the marked departure passage.',clear||(environment?.builderScene?.layoutMeta?.harbor?.islands||[]).length>0);
  if(distance<=12&&speed<=2)return choice('moor','Moor at the landing','Secure the boat at an available nearby berth.');
  if(distance<=12&&speed>2)return choice('slow','Slow for mooring','Approach the landing below two metres per second.');
  if(!clear)return choice(null,'Turn toward open water','Use the rudder to face a clear waterway before applying power.',false);
  return choice('cruise','Cruise the waterway','Set a steady pace and slow before shore or traffic.');
 }
 return choice(null,'Manual vehicle','Use the controls for this vehicle.',false);
}
