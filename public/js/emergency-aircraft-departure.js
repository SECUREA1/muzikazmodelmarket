import {airportRunways,aircraftRunway,runwayClearance} from './airport-navigation.js';
import {aircraftType} from './aircraft-types.js';
import {DOOMSDAY_AIRCRAFT_IDS} from './doomsday-config.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
const point=value=>value&&['x','y','z'].every(axis=>Number.isFinite(value[axis]));
const speed=aircraft=>Math.max(0,Number(aircraft.flight?.airspeed??aircraft.flight?.speed)||0);
const airborne=aircraft=>aircraft.flight?.airborne===true||(Number(aircraft.flight?.altitude)||0)>.1;
const reject=message=>{throw Object.assign(Error(message),{statusCode:409});};
const departureFields=['departureTaxiRoute','departureTaxiIndex','departureLineupPoint','departureStageStartedAt','departureTargetAltitude'];
const airportOf=context=>context?.airport;
export const isEmergencyAircraft=aircraft=>DOOMSDAY_AIRCRAFT_IDS.some(id=>id===aircraft?.modelId||id===aircraft?.asset?.buildAssetId);

function record(aircraft,now,{stage,status='active',reason=null}={}){
 const flight=aircraft.flight,departure=flight.emergencyDeparture;
 if(stage&&stage!==flight.assistStage){flight.assistStage=stage;flight.departureStageStartedAt=now;}
 if(departure.stage!==flight.assistStage||departure.status!==status||departure.reason!==reason){
  departure.stage=flight.assistStage;departure.status=status;departure.reason=reason;departure.updatedAt=now;
 }
}
function releaseLease(aircraft,context){
 const departure=aircraft.flight?.emergencyDeparture;
 if(!departure||!airportOf(context))return;
 const lease=runwayClearance(airportOf(context),{id:departure.runwayId});
 if(lease?.runwayHolder===departure.ownerId){lease.runwayHolder=null;lease.expires=0;}
}
export function cancelEmergencyDeparture(aircraft,environment,context={}, {reason='Manual flight controls active.',status='cancelled',now=0}={}){
 const flight=aircraft?.flight;if(flight?.assist!=='emergency-departure')return false;
 flight.emergencyDeparture ||= {id:aircraft.id+':departure:recovered',ownerId:aircraft.holderId||context.holderId||null,runwayId:flight.runwayId||null,stage:flight.assistStage||'preflight'};
 releaseLease(aircraft,context);
 Object.assign(flight.emergencyDeparture,{status,reason,updatedAt:now,stage:status==='complete'?'complete':flight.assistStage});
 flight.assist=null;flight.clearance=null;
 for(const key of ['assistStage','assistSince','assistTimeoutMs',...departureFields])delete flight[key];
 if(!airborne(aircraft))Object.assign(flight,{throttleCommand:0,brake:1});
 return true;
}

function distanceToSegment(position,start,end){
 const dx=end.x-start.x,dz=end.z-start.z,t=clamp(((position.x-start.x)*dx+(position.z-start.z)*dz)/Math.max(.001,dx*dx+dz*dz),0,1);
 return Math.hypot(position.x-start.x-t*dx,position.z-start.z-t*dz);
}
function trafficOnRoute(aircraft,start,end,actors){
 return Object.values(actors||{}).some(other=>other.id!==aircraft.id&&aircraftType(other)&&other.active!==false&&point(other.position)&&!airborne(other)&&Math.abs(other.position.y-aircraft.position.y)<6&&distanceToSegment(other.position,start,end)<12);
}
function routeClear(aircraft,environment,start,end,collision,actors={},objects={}){
 if(trafficOnRoute(aircraft,start,end,actors))return false;
 const distance=Math.hypot(end.x-start.x,end.z-start.z),yaw=Math.atan2(start.x-end.x,start.z-end.z);
 if(collision?.groundAt){
  for(let step=0;step<=Math.max(1,Math.ceil(distance/5));step++){
   const t=step/Math.max(1,Math.ceil(distance/5)),sample={x:start.x+(end.x-start.x)*t,y:start.y,z:start.z+(end.z-start.z)*t};
   const floor=collision.groundAt(environment,sample,{entry:true,actors,objects});
   if(!floor||Math.abs(floor.y-(start.y-.4))>1.2)return false;
   if(collision.hasBodyClearance&&!collision.hasBodyClearance(environment,{...sample,y:floor.y+.4},.65,{actors,objects}))return false;
  }
 }
 if(collision?.blocksShot&&distance>.1){
  for(const side of [-5.2,0,5.2]){
   const origin={x:start.x+Math.cos(yaw)*side,y:start.y+.9,z:start.z-Math.sin(yaw)*side};
   if(collision.blocksShot(environment,origin,[(end.x-start.x)/distance,0,(end.z-start.z)/distance],distance,actors,objects))return false;
  }
 }
 return true;
}
function planTaxiRoute(aircraft,runway,environment,collision,actors,objects){
 const start={...aircraft.position},lineup={x:runway.x,y:start.y,z:runway.z+runway.length/2-22};
 const onRunway=Math.abs(start.x-runway.x)<runway.width/2-1&&Math.abs(start.z-runway.z)<runway.length/2;
 if(onRunway&&start.z>runway.z-runway.length/2+75){lineup.z=start.z;return {route:[],lineup};}
 const side=start.x<=runway.x?-1:1,laneX=runway.x+side*(runway.width/2+12),hold={x:laneX,y:start.y,z:lineup.z};
 const routes=[
  [hold],
  [{x:laneX,y:start.y,z:start.z},hold],
  [{x:start.x,y:start.y,z:runway.z+runway.length/2+24},{x:laneX,y:start.y,z:runway.z+runway.length/2+24},hold],
  [{x:start.x,y:start.y,z:start.z+18},{x:laneX,y:start.y,z:start.z+18},hold]
 ];
 const length=route=>route.reduce((sum,p,index)=>sum+Math.hypot(p.x-(index?route[index-1].x:start.x),p.z-(index?route[index-1].z:start.z)),0);
 const runwayActors=Object.fromEntries(Object.entries(actors||{}).map(([id,actor])=>[id,id!==aircraft.id&&aircraftType(actor)?{...actor,active:false}:actor]));
 for(const route of routes.sort((a,b)=>length(a)-length(b))){
  const points=route.filter((p,index)=>Math.hypot(p.x-(index?route[index-1].x:start.x),p.z-(index?route[index-1].z:start.z))>.5);
  // Runway traffic is handled at the hold-short line, rather than preventing
  // a pilot from beginning preflight at an otherwise clear stand.
  if(points.every((p,index,all)=>routeClear(aircraft,environment,index?all[index-1]:start,p,collision,actors,objects))&&routeClear(aircraft,environment,points.at(-1)||start,lineup,collision,runwayActors,objects))return {route:points,lineup};
 }
 return null;
}
export function beginEmergencyDeparture(sim,player,environment,now,collision,objects={}){
 const aircraft=sim.actors?.[player.vehicleId],ownerId=player.actorId||Object.entries(sim.players||{}).find(([,value])=>value===player)?.[0];
 if(!isEmergencyAircraft(aircraft)||aircraft.active===false)reject('Choose the Nightfall Command or Daybreak Evacuation aircraft first.');
 if(!ownerId||aircraft.holderId!==ownerId||aircraft.trafficAI)reject('Enter your own emergency aircraft cockpit before departure.');
 if(Number(player.health??100)<=0||Number(aircraft.health??400)<=0)reject('Respawn or repair the aircraft before departure.');
 if(Number(player.fuel??100)<=0)reject('Fuel is empty. Park and request ground service before departure.');
 if(aircraft.flight?.assist==='emergency-departure'&&aircraft.flight.emergencyDeparture?.ownerId===ownerId)return 'Emergency departure continues. '+(aircraft.flight.emergencyDeparture.reason||'Keep controls centered, or choose Manual to take control.');
 if(airborne(aircraft))reject('Already airborne. Choose Cruise, Recover or Land.');
 if(speed(aircraft)>2)reject('Brake to taxi speed before starting emergency departure.');
 if(!point(aircraft.position))reject('The aircraft position is unavailable. Choose another craft.');
 const currentFloor=collision?.groundAt?.(environment,aircraft.position,{entry:true,actors:sim.actors,objects});
 if(currentFloor&&aircraft.position.y-currentFloor.y>.65)reject('Already airborne. Choose Cruise, Recover or Land.');
 const runway=aircraftRunway(environment,aircraft);
 if(!runway||!sim.airport||!airportRunways(environment).length)reject('This map has no airport runway. Use manual flight controls, or choose an airport map for guided departure.');
 if(![runway.x,runway.z,runway.width,runway.length].every(Number.isFinite)||runway.width<6||runway.length<50)reject('This runway cannot support an emergency departure. Choose another airfield.');
 const plan=planTaxiRoute(aircraft,runway,environment,collision,sim.actors,objects);
 if(!plan)reject('The departure taxi route is blocked. Move to a clear apron or use manual taxi, then try again.');
 const flight=aircraft.flight ||= {},maximum=Math.max(.2,(Number(environment.airport?.ceiling)||80)-(aircraft.position.y-(Number(flight.altitude)||0))-2);
 for(const key of ['assistParkingPoint','assistTargetAltitude','navigationDestinationId','navigationName','navigationParkingPoint','navigationLeg','remainingDistance','arrivalDestinationId'])delete flight[key];
 Object.assign(flight,{assist:'emergency-departure',assistStage:'preflight',assistSince:now,assistTimeoutMs:240000,runwayId:runway.id,clearance:null,windowOpen:false,throttleCommand:0,brake:1,departureTaxiRoute:plan.route,departureTaxiIndex:0,departureLineupPoint:plan.lineup,departureStageStartedAt:now,departureTargetAltitude:Math.min(24,maximum),emergencyDeparture:{id:aircraft.id+':departure:'+now,ownerId,runwayId:runway.id,runwayName:runway.name||'departure runway',status:'active',stage:'preflight',startedAt:now,updatedAt:now,reason:null}});
 player.input={};
 return 'Emergency departure ready. Preflight checks, slow taxi, runway clearance and climb are automatic. Move the flight stick or choose Manual at any time.';
}

function occupiedRunway(aircraft,runway,actors){
 return Object.values(actors||{}).some(other=>other.id!==aircraft.id&&aircraftType(other)&&other.active!==false&&point(other.position)&&(Number(other.flight?.altitude??other.position.y)||0)<8&&Math.abs(other.position.x-runway.x)<runway.width/2+6&&Math.abs(other.position.z-runway.z)<runway.length/2+5);
}
function taxiInput(aircraft,target,common){
 const distance=Math.hypot(target.x-aircraft.position.x,target.z-aircraft.position.z),error=wrap(Math.atan2(aircraft.position.x-target.x,aircraft.position.z-target.z)-(aircraft.rotation?.y||0)),moving=speed(aircraft);
 if(distance<1.35)return {arrived:moving<.35,input:{...common,throttle:0,brake:true}};
 const turn=clamp(-error*1.9,-1,1),aligned=Math.abs(error)<.23,targetSpeed=Math.min(2.7,Math.max(.7,distance*.65));
 return {arrived:false,input:{...common,side:turn,throttle:aligned?clamp(.09+(targetSpeed-moving)*.055,.02,.22):0,brake:!aligned||moving>targetSpeed+.5}};
}
export function emergencyDepartureInput(aircraft,input,environment,now,context={}){
 const flight=aircraft.flight,departure=flight.emergencyDeparture,common={...input,forward:0,side:0,lift:0,rudder:0,jump:false,sprint:false,throttle:0,brake:true,gear:true,flaps:.25};
 const stop=(status,reason)=>{cancelEmergencyDeparture(aircraft,environment,context,{status,reason,now});return {...common,throttle:airborne(aircraft)?.65:0,brake:!airborne(aircraft)};};
 if(!departure||!Number.isFinite(departure.startedAt)||!Array.isArray(flight.departureTaxiRoute)||!point(flight.departureLineupPoint))return stop('blocked','Departure data is unavailable. Manual controls are active; choose departure again when parked.');
 if(context.holderId&&context.holderId!==departure.ownerId||aircraft.holderId!==departure.ownerId)return stop('cancelled','The cockpit is no longer controlled by this pilot.');
 if(context.fuel!==undefined&&Number(context.fuel)<=0)return stop('blocked','Fuel exhausted. Park and request ground service.');
 if(now-departure.startedAt>240000)return stop('timed-out','Departure assistance paused after waiting. Clear the route or choose Manual, then try again.');
 const runway=airportRunways(environment).find(value=>value.id===departure.runwayId);
 if(!runway||!airportOf(context))return stop('blocked','The airport tower is unavailable. Manual controls remain active.');
 const lease=runwayClearance(airportOf(context),runway),altitude=Number(flight.altitude)||0;
 if(lease.runwayHolder===departure.ownerId){if(altitude>5)releaseLease(aircraft,context);else lease.expires=now+45000;}
 const stage=flight.assistStage;
 if(stage==='preflight'){
  if(now-flight.departureStageStartedAt<1200)return {...common,throttle:.14};
  record(aircraft,now,{stage:flight.departureTaxiRoute.length?'taxi':'hold-short'});return common;
 }
 if(stage==='taxi'){
  const target=flight.departureTaxiRoute[flight.departureTaxiIndex];
  if(!target){record(aircraft,now,{stage:'hold-short'});return common;}
  const distance=Math.hypot(target.x-aircraft.position.x,target.z-aircraft.position.z),span=Math.min(distance,Math.max(8,speed(aircraft)*3)),ratio=span/Math.max(.001,distance),ahead={x:aircraft.position.x+(target.x-aircraft.position.x)*ratio,y:aircraft.position.y,z:aircraft.position.z+(target.z-aircraft.position.z)*ratio};
  if(!routeClear(aircraft,environment,aircraft.position,ahead,context.collision,context.actors,context.objects)){record(aircraft,now,{status:'waiting',reason:'Taxi route occupied. Holding position until the route clears.'});return common;}
  record(aircraft,now,{});const taxi=taxiInput(aircraft,target,common);if(taxi.arrived)flight.departureTaxiIndex++;return taxi.input;
 }
 if(stage==='hold-short'){
  if(lease.runwayHolder&&lease.runwayHolder!==departure.ownerId&&lease.expires>now){record(aircraft,now,{status:'waiting',reason:'Runway reserved by another pilot. Holding short until clearance is available.'});return common;}
  if(occupiedRunway(aircraft,runway,context.actors)){record(aircraft,now,{status:'waiting',reason:'Aircraft on the runway. Holding short until the runway clears.'});return common;}
  lease.runwayHolder=departure.ownerId;lease.expires=now+45000;flight.clearance='takeoff';record(aircraft,now,{stage:'lineup'});return common;
 }
 if(stage==='lineup'){
  if(lease.runwayHolder!==departure.ownerId||occupiedRunway(aircraft,runway,context.actors)){record(aircraft,now,{status:'waiting',reason:'Runway traffic changed. Holding position for clearance.'});return common;}
  record(aircraft,now,{});const taxi=taxiInput(aircraft,flight.departureLineupPoint,common);
  if(taxi.arrived){const error=wrap(-(aircraft.rotation?.y||0));if(Math.abs(error)<.075){record(aircraft,now,{stage:'roll'});return common;}return {...common,side:clamp(-error*1.9,-1,1)};}
  return taxi.input;
 }
 if(stage==='roll'&&!airborne(aircraft)){
  if(lease.runwayHolder!==departure.ownerId||occupiedRunway(aircraft,runway,context.actors)){record(aircraft,now,{status:'waiting',reason:'Runway traffic changed. Braking until the runway clears.'});return common;}
  record(aircraft,now,{});return {...common,throttle:1,brake:false,lift:speed(aircraft)>=(Number(flight.stallSpeed)||6)?.65:0};
 }
 if(stage==='roll')record(aircraft,now,{stage:'climb'});
 if(altitude>=flight.departureTargetAltitude-.35&&speed(aircraft)>=(Number(flight.stallSpeed)||6)+2){cancelEmergencyDeparture(aircraft,environment,context,{status:'complete',reason:'Departure complete. Safe climb reached; manual flight controls are active.',now});flight.throttleCommand=.7;return {...common,throttle:.7,brake:false,flaps:0};}
 return {...common,throttle:1,brake:false,lift:.65,flaps:0};
}
