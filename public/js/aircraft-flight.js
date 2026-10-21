export const isAircraft=actor=>(actor?.modelId||actor?.asset?.buildAssetId)==='corsair-aircraft';
export function stepAircraftFlight(aircraft,input,dt,{ground=.4,ceiling=80,half=128,cleared=true,blocked=()=>false}={}){
 const old=aircraft.flight||{},throttle=Math.max(0,Math.min(1,Number(input.forward)||0)),lift=Math.max(-1,Math.min(1,Number(input.lift)||((input.jump?1:0)-(input.sprint?1:0))));
 let speed=(old.speed||0)+(throttle*18-(old.speed||0))*Math.min(1,dt*1.8);
 if(input.forward<0)speed=Math.max(0,speed-dt*18);
 const yaw=(aircraft.rotation?.y||0)-(Number(input.side)||0)*dt*1.15;
 const next={x:aircraft.position.x-Math.sin(yaw)*speed*dt,y:aircraft.position.y,z:aircraft.position.z-Math.cos(yaw)*speed*dt};
 const airborne=aircraft.position.y>ground+.08;
 if(lift>0&&speed>=6&&(airborne||cleared))next.y+=lift*8*dt;
 else if(lift<0)next.y+=lift*8*dt;
 next.y=Math.max(ground,Math.min(ceiling,next.y));
 let phase=next.y>ground+.08?(lift<0?'approach':lift>0?'climb':'cruise'):speed>.5?'taxi':'parked';
 if(Math.abs(next.x)>half-8||Math.abs(next.z)>half-8||blocked(aircraft.position,next,yaw)){next.x=aircraft.position.x;next.z=aircraft.position.z;next.y=aircraft.position.y;speed=0;phase='hold';}
 return {position:next,rotation:{x:phase==='climb'?-.06:phase==='approach'?.06:0,y:yaw,z:-(Number(input.side)||0)*.12},flight:{...old,speed,phase,altitude:Math.max(0,next.y-ground),airborne:next.y>ground+.08}};
}
export function airportRadio(sim,player,actorId,operation,now){
 const airport=sim.airport,aircraft=sim.actors[player.vehicleId];if(!airport)throw Object.assign(Error('This room has no airport tower.'),{statusCode:409});
 if(!['takeoff','landing','service','status'].includes(operation))throw Object.assign(Error('Choose a tower radio operation.'),{statusCode:422});
 if(operation==='status')return 'MUZIKAZ Tower. Runway one eight, wind calm. Circuit ceiling eighty metres. Taxi clear of other aircraft and request clearance before takeoff.';
 if(!isAircraft(aircraft))throw Object.assign(Error('Board an aircraft before requesting flight services.'),{statusCode:409});
 if(operation==='service'){
  if(aircraft.flight?.airborne||(aircraft.flight?.speed||0)>.5)throw Object.assign(Error('Park the aircraft before requesting ground service.'),{statusCode:409});
  aircraft.health=400;player.fuel=100;player.ammo=120;return 'Ground crew. Aircraft inspected, repaired and refueled. Ready for taxi.';
 }
 if(airport.runwayHolder&&airport.runwayHolder!==actorId&&airport.expires>now)return 'Tower. Hold position. Another pilot has runway clearance. Request again when the runway is clear.';
 airport.runwayHolder=actorId;airport.expires=now+120000;aircraft.flight||={};aircraft.flight.clearance=operation;
 return operation==='takeoff'?'Tower. Cleared for takeoff, runway one eight. Taxi onto the runway, accelerate, then climb.':'Tower. Cleared to land, runway one eight. Line up with the runway, descend gently, then brake and taxi clear.';
}
