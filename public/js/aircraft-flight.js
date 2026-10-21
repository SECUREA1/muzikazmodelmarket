export const isAircraft=actor=>(actor?.modelId||actor?.asset?.buildAssetId)==='corsair-aircraft';
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const blend=(current,target,rate,dt)=>current+(target-current)*(1-Math.exp(-rate*dt));
// Compact, assisted flight model. The server owns every pose; the client only
// sends control positions and displays this flight/instrument state.
export function stepAircraftFlight(aircraft,input={},dt,{ground=.4,ceiling=80,half=128,cleared=true,blocked=()=>false}={}){
 input ||= {};
 const old=aircraft.flight||{},elapsed=clamp(finite(dt),0,.25),floor=finite(ground,.4),top=Math.max(floor,finite(ceiling,80)),edge=Math.max(8,finite(half,128))-8;
 const start={x:clamp(finite(aircraft.position?.x),-edge,edge),y:clamp(finite(aircraft.position?.y,floor),floor,top),z:clamp(finite(aircraft.position?.z),-edge,edge)};
 let position={...start},speed=clamp(finite(old.airspeed,finite(old.speed)),0,40),pitch=clamp(finite(old.pitch,finite(aircraft.rotation?.x)),-.6,.6),bank=clamp(finite(old.bank,finite(aircraft.rotation?.z)),-.85,.85),yaw=finite(aircraft.rotation?.y),throttle=clamp(finite(old.throttle),0,1),verticalSpeed=finite(old.verticalSpeed),impactDamage=0,touchdown=false,held=false;
 const forward=clamp(finite(input.forward),-1,1),side=clamp(finite(input.side),-1,1),rudder=clamp(finite(input.rudder),-1,1),lift=clamp(finite(input.lift)||((input.jump?1:0)-(input.sprint?1:0)),-1,1);
 const commandedThrottle=Number.isFinite(Number(input.throttle))&&input.throttle!==null?clamp(Number(input.throttle),0,1):forward>0?forward:forward<0?0:clamp(finite(old.throttleCommand,finite(old.throttle)),0,1);
 const brake=clamp(Math.max(forward<0?-forward:0,finite(input.brake)),0,1),flaps=clamp(input.flaps!==undefined?finite(input.flaps):finite(old.flaps),0,1),requestedGear=input.gear!==undefined?input.gear!==false:old.gear!==false,stallSpeed=7-flaps*1.6;
 let airborne=position.y>floor+.08,gear=airborne?requestedGear:true,stall=false;
 for(let remaining=elapsed;remaining>1e-8;){
  const step=Math.min(1/60,remaining);remaining-=step;const previous={...position};
  throttle=blend(throttle,commandedThrottle,2.8,step);
  const drag=(.025+flaps*.018+(gear?.003:0))*speed*speed+.15*speed;
  const acceleration=throttle*16-drag-Math.sin(pitch)*2.2-brake*(airborne?10:23)-(airborne?0:.35);
  speed=clamp(speed+acceleration*step,0,29);
  stall=airborne&&speed<stallSpeed;
  // Pitch remains responsive enough for touch controls, while bank and engine
  // spool retain inertia. Stall assistance lowers the nose to recover airspeed.
  const desiredPitch=airborne?(stall&&lift>=0?-.12:lift*.46):cleared&&speed>=stallSpeed?Math.max(0,lift)*.46:0;
  pitch=blend(pitch,desiredPitch,10,step);
  bank=blend(bank,airborne?-side*.62:0,3.4,step);
  const turnRate=airborne?9.81*Math.tan(bank)/Math.max(8,speed)+rudder*.24:-(side+rudder*.65)*Math.min(1.2,.18+speed*.085);
  yaw+=turnRate*step;
  if(airborne){
   const bankSink=Math.max(0,1-Math.cos(bank))*.85;
   verticalSpeed=stall?-2.5-Math.max(0,stallSpeed-speed)*.22:clamp(Math.sin(pitch)*speed-bankSink,-8.5,8.5);
   // Explicit Descend is an assisted approach command, including a controlled
   // descent after the player applies the airbrake at low airspeed.
   if(lift<-.1)verticalSpeed=Math.min(verticalSpeed,-Math.max(.6,-lift*4.5,-lift*speed*.36));
  }else verticalSpeed=cleared&&speed>=stallSpeed&&lift>0?Math.max(0,Math.sin(pitch)*speed):0;
  position.x-=Math.sin(yaw)*speed*step;
  position.z-=Math.cos(yaw)*speed*step;
  position.y=clamp(position.y+verticalSpeed*step,floor,top);
  if(position.y>=top&&verticalSpeed>0)verticalSpeed=0;
  if(airborne&&position.y<=floor+.08&&verticalSpeed<=0){
   position.y=floor;
   touchdown=true;const sink=Math.max(0,-verticalSpeed);impactDamage+=Math.round(Math.max(0,sink-4.6)*18+(gear?0:70)+Math.max(0,Math.abs(bank)-.45)*90+Math.max(0,speed-22)*4);verticalSpeed=0;pitch=0;bank=0;
  }
  airborne=position.y>floor+.08;gear=airborne?requestedGear:true;
  if(Math.abs(position.x)>edge||Math.abs(position.z)>edge||blocked(previous,position,yaw)){
   position=previous;impactDamage+=Math.round(Math.max(0,speed-9)*9);speed=0;verticalSpeed=0;held=true;break;
  }
 }
 airborne=position.y>floor+.08;stall=airborne&&speed<stallSpeed;
 const phase=held?'hold':airborne?stall?'stall':verticalSpeed>1?'climb':verticalSpeed<-.8?'approach':'cruise':speed>.5?'taxi':'parked';
 return {position,rotation:{x:pitch,y:yaw,z:bank},flight:{...old,speed,airspeed:speed,throttle,throttleCommand:commandedThrottle,rpm:Math.round(700+throttle*2300),pitch,bank,heading:((-yaw*180/Math.PI)%360+360)%360,verticalSpeed,altitude:Math.max(0,position.y-floor),airborne,stall,stallSpeed,overspeed:speed>26,loadFactor:airborne?1/Math.max(.5,Math.cos(bank)):1,gear,flaps,brake,phase,warning:stall?'STALL':speed>26?'OVERSPEED':airborne&&position.y-floor<8&&!gear?'GEAR UP':'',touchdown,impactDamage}};
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
