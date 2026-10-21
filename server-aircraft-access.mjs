export {aircraftAssistedInput} from './public/js/aircraft-assist.js';
import {isAircraft} from './public/js/aircraft-flight.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
const fail=(message,statusCode=409)=>{throw Object.assign(Error(message),{statusCode});};
const runwayOf=environment=>environment?.airport?.runway;
const speedOf=aircraft=>Math.max(0,Number(aircraft.flight?.airspeed??aircraft.flight?.speed)||0);
const groundOf=aircraft=>Math.max(0,Number(aircraft.position?.y)||0)-Math.max(0,Number(aircraft.flight?.altitude)||0);
function clearAssist(aircraft){aircraft.flight ||= {};aircraft.flight.assist=null;for(const key of ['assistStage','assistSince','assistParkingPoint','assistTargetAltitude'])delete aircraft.flight[key];}
const airborneOf=aircraft=>aircraft.flight?.airborne===true||aircraft.position.y>groundOf(aircraft)+.1;
function safeAltitude(aircraft,environment,wanted=24){
 const ceiling=Number(environment?.airport?.ceiling??environment?.ceiling)||80,maximum=Math.max(.2,ceiling-groundOf(aircraft)-2);
 return clamp(wanted,Math.min(14,maximum),maximum);
}
function runwayBusy(sim,aircraft,runway){
 return Object.values(sim.actors||{}).some(other=>other.id!==aircraft.id&&isAircraft(other)&&other.active!==false&&Math.abs(other.position.x-runway.x)<runway.width/2+6&&Math.abs(other.position.z-runway.z)<runway.length/2+5&&((other.flight?.altitude??other.position.y)<8));
}
export function startAircraftAssist(sim,player,environment,operation,now,collision,objects={}){
 const aircraft=sim.actors?.[player.vehicleId];if(!isAircraft(aircraft)||aircraft.active===false)fail('Enter a free aircraft cockpit first.');
 if(!['takeoff','land','cancel','park','climb','cruise','recover','continue'].includes(operation))fail('Choose Take off, Climb, Cruise, Recover, Land, or manual flight.',422);
 if(operation==='cancel'){clearAssist(aircraft);return 'Manual flight controls active.';}
 const flight=aircraft.flight ||= {},airborne=airborneOf(aircraft);
 if(operation==='continue')return flight.assist?'Flight assistance continues. Keep the controls centered, or move the flight stick for manual control.':'Manual flight controls are active. Choose Auto for assistance.';
 if(operation==='park'){
  if(airborne)fail('Land before parking the aircraft.');
  Object.assign(flight,{throttleCommand:0,throttle:0,speed:0,airspeed:0,brake:1});clearAssist(aircraft);player.input={};return 'Aircraft parked. You can leave the cockpit.';
 }
 const runway=runwayOf(environment),airAssist=['climb','cruise','recover'].includes(operation);
 if(airAssist&&airborne){
  clearAssist(aircraft);Object.assign(flight,{assist:operation,assistStage:operation==='cruise'?'hold':'climb',assistSince:now,assistTargetAltitude:safeAltitude(aircraft,environment,operation==='cruise'?Number(flight.altitude)||0:24),brake:0});
  if(sim.airport?.runwayHolder===player.actorId&&(flight.clearance==='landing'||(Number(flight.altitude)||0)>5)){sim.airport.runwayHolder=null;sim.airport.expires=0;}
  if(flight.clearance==='landing')flight.clearance=null;
  player.input={};return operation==='cruise'?'Cruise assistance is holding a safe altitude. Move the flight stick to take manual control.':operation==='recover'?'Recovery assistance is adding power and stabilizing the aircraft before climbing to a safe altitude.':'Climb assistance is adding power and climbing to a safe altitude.';
 }
 if(airAssist&&operation!=='climb')fail('Take off before using airborne cruise or recovery assistance.');
 if(!runway||!sim.airport)fail('Use manual flight controls on this map; no airport runway is configured.');
 const holder=player.actorId||Object.entries(sim.players||{}).find(([,candidate])=>candidate===player)?.[0];if(!holder)fail('Join the shared airport before using flight assistance.');
 if(sim.airport.runwayHolder&&sim.airport.runwayHolder!==holder&&sim.airport.expires>now)fail('Tower: hold position. Another pilot is using the runway.');
 if(runwayBusy(sim,aircraft,runway))fail('Tower: the runway is occupied. Wait until the other aircraft is clear.');
 if(operation==='climb'){
  if(Math.abs(aircraft.position.x-runway.x)>=runway.width/2-1||Math.abs(aircraft.position.z-runway.z)>=runway.length/2)fail('Move onto the runway before continuing the takeoff roll.');
  clearAssist(aircraft);Object.assign(flight,{assist:'climb',assistStage:'roll',assistSince:now,assistTargetAltitude:safeAltitude(aircraft,environment),clearance:'takeoff',brake:0});
 }else if(operation==='takeoff'){
  if(airborne)fail('You are already airborne. Use manual flight or Land.');if(speedOf(aircraft)>2)fail('Brake to taxi speed before starting assisted takeoff.');
  const point={x:runway.x,y:.4,z:runway.z+runway.length/2-22};
  const floor=collision?.groundAt?.(environment,{...point,y:1},{entry:true,actors:sim.actors,objects});if(collision&&!floor)fail('The runway is unavailable. Choose a clear aircraft or try again.');
  point.y=(floor?.y||0)+.4;
  if(collision?.hasBodyClearance&&!collision.hasBodyClearance(environment,{...point,y:point.y+.3},.5))fail('The runway staging point is blocked.');
  clearAssist(aircraft);aircraft.position=point;aircraft.rotation={x:0,y:0,z:0};Object.assign(flight,{speed:0,airspeed:0,throttle:0,throttleCommand:1,pitch:0,bank:0,altitude:0,airborne:false,clearance:'takeoff',assist:'takeoff',assistStage:'roll',assistSince:now});
  player.position={...point};player.yaw=0;player.floor=point.y;player.velocityY=0;player.grounded=true;player.movementRevision=(player.movementRevision||0)+1;
 }else{
  if(!airborne){Object.assign(flight,{throttleCommand:0,throttle:0,speed:0,airspeed:0,brake:1});clearAssist(aircraft);player.input={};return 'Aircraft is already on the ground. You can leave the cockpit.';}
  const parkX=runway.x-runway.width/2-11,parking=[0,-30,30,-60,60].map(offset=>({x:parkX,z:runway.z+offset})).find(point=>!Object.values(sim.actors||{}).some(other=>other.id!==aircraft.id&&isAircraft(other)&&other.active!==false&&Math.hypot(other.position.x-point.x,other.position.z-point.z)<12));if(!parking)fail('Tower: the runway parking apron is full. Wait for a space to clear.');
  clearAssist(aircraft);Object.assign(flight,{assist:'land',assistStage:'join',assistSince:now,clearance:'landing',assistParkingPoint:parking});
 }
 sim.airport.runwayHolder=holder;sim.airport.expires=now+120000;player.input={};
 return operation==='takeoff'?'Tower: runway clear. Seated takeoff assistance is accelerating and climbing. Move the flight stick to take manual control.':operation==='climb'?'Tower: continue the takeoff roll. Climb assistance will lift the aircraft at safe airspeed.':'Tower: landing assistance active. Keep controls centered while the aircraft joins the runway and parks.';
}
export function aircraftExitPosition(environment,aircraft,collision,actors={},objects={}){
 if(aircraft.flight?.airborne)fail('Land the aircraft before leaving the cockpit.');
 const yaw=aircraft.rotation?.y||0,scale=aircraft.scale?.x||1;
 // Exit beyond the wingtip, rather than through the fuselage or under a wheel.
 for(const span of [6,7.5,9])for(const side of [1,-1]){
  const point={x:aircraft.position.x+Math.cos(yaw)*span*scale*side,y:aircraft.position.y+.5,z:aircraft.position.z-Math.sin(yaw)*span*scale*side};
  const floor=collision.groundAt(environment,point,{entry:true,actors,objects});if(!floor)continue;
  try{return collision.teleportPosition(environment,aircraft.position,floor,actors,objects,{localMap:true});}catch{}
 }
 fail('The wing exits are blocked. Move the aircraft to a clear parking space first.');
}
