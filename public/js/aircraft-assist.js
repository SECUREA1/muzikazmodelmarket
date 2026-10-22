import {aircraftRunway} from './airport-navigation.js';
// Shared deterministic control assistance; never boards or teleports a player.
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
const wrap=value=>Math.atan2(Math.sin(value),Math.cos(value));
const runwayOf=(environment,aircraft)=>aircraftRunway(environment,aircraft);
const speedOf=aircraft=>Math.max(0,Number(aircraft.flight?.airspeed??aircraft.flight?.speed)||0);
const groundOf=aircraft=>Math.max(0,Number(aircraft.position?.y)||0)-Math.max(0,Number(aircraft.flight?.altitude)||0);
function clearAssist(aircraft){aircraft.flight ||= {};aircraft.flight.assist=null;for(const key of ['assistStage','assistSince','assistParkingPoint','assistTargetAltitude','navigationDestinationId','navigationName','navigationParkingPoint','navigationLeg'])delete aircraft.flight[key];}
const airborneOf=aircraft=>aircraft.flight?.airborne===true||aircraft.position.y>groundOf(aircraft)+.1;
function safeAltitude(aircraft,environment,wanted=24){
 const ceiling=Number(environment?.airport?.ceiling??environment?.ceiling)||80,maximum=Math.max(.2,ceiling-groundOf(aircraft)-2);
 return clamp(wanted,Math.min(14,maximum),maximum);
}
function airspaceTurn(aircraft,environment,speed){
 const edge=Math.max(12,(Number(environment?.builderScene?.mapSize)||256)/2-8),yaw=aircraft.rotation?.y||0;
 const x=aircraft.position.x,z=aircraft.position.z,predictedX=x-Math.sin(yaw)*speed*3,predictedZ=z-Math.cos(yaw)*speed*3;
 if(Math.max(Math.abs(x),Math.abs(z))<edge-44&&Math.max(Math.abs(predictedX),Math.abs(predictedZ))<edge-18)return {side:0,rudder:0,brake:false};
 const error=wrap(Math.atan2(x,z)-yaw),distance=edge-Math.max(Math.abs(x),Math.abs(z));
 return {side:clamp(-error*1.8,-1,1),rudder:clamp(error*.2,-.3,.3),brake:distance<Math.max(12,speed*1.2)&&Math.abs(error)>.8?.65:false};
}

export function aircraftAssistedInput(aircraft,input={},environment,now=0){
 const flight=aircraft?.flight;if(!flight?.assist)return input;
 if(Math.abs(Number(input.side)||0)>.18||Math.abs(Number(input.lift)||0)>.18||input.jump===true||input.sprint===true||Math.abs(Number(input.forward)||0)>.2||(Number(input.brake)||0)>0||(input.throttle!==undefined&&input.throttle!==null&&Number.isFinite(Number(input.throttle)))){clearAssist(aircraft);return input;}
 if(flight.assist!=='cruise'&&now&&flight.assistSince&&now-flight.assistSince>240000){clearAssist(aircraft);return {...input,throttle:.65,lift:0};}
 const altitude=Math.max(0,Number(flight.altitude)||0),speed=speedOf(aircraft),runway=runwayOf(environment,aircraft);
 const common={...input,forward:0,side:0,lift:0,jump:false,sprint:false,rudder:0,brake:false,gear:true,flaps:.25};
 if(['climb','recover','cruise'].includes(flight.assist)){
  const airborne=airborneOf(aircraft),target=safeAltitude(aircraft,environment,Number(flight.assistTargetAltitude)||24),stallSpeed=Number(flight.stallSpeed)||7;
  if(flight.assist!=='cruise'&&altitude>=target-.35&&speed>=stallSpeed+2&&(Number(flight.verticalSpeed)||0)>=-.75){clearAssist(aircraft);flight.throttleCommand=.7;return {...common,throttle:.7,gear:false,flaps:0};}
  flight.assistStage=airborne?flight.assist==='cruise'?'hold':'climb':'roll';
  const turn=airborne?airspaceTurn(aircraft,environment,speed):{side:0,rudder:0,brake:false};
  if(flight.assist==='cruise'){
   const vertical=clamp((target-altitude)*.7,-2.5,2.5),sink=Math.max(0,1-Math.cos(Number(flight.bank)||0))*.85;
   return {...common,...turn,throttle:clamp(.65+(16-speed)*.035,.4,.95),lift:clamp(Math.asin(clamp((vertical+sink)/Math.max(7,speed),-.5,.5))/.46,-.55,.65),gear:altitude<8,flaps:0};
  }
  return {...common,...turn,throttle:1,lift:speed>=stallSpeed?.65:0,gear:altitude<8,flaps:airborne?0:.25};
 }
 if(!runway){clearAssist(aircraft);return input;}
 if(flight.assist==='takeoff'){
  if(altitude>=14&&flight.navigationDestinationId){flight.assist='navigate';flight.assistStage='passage';flight.runwayId=flight.navigationDestinationId;flight.assistParkingPoint=flight.navigationParkingPoint;flight.clearance='landing';return aircraftAssistedInput(aircraft,input,environment,now);}
  if(altitude>=14){clearAssist(aircraft);flight.throttleCommand=.7;return {...common,throttle:.7,flaps:0};}
  flight.assistStage=altitude>.1?'climb':'roll';return {...common,throttle:1,lift:speed>=7?.65:0};
 }
 if(flight.assist==='navigate'){
  const joinZ=runway.z+runway.length/2+60,leg=flight.navigationLeg||0,target={x:runway.x,z:joinZ+(leg===0?60:0)},distance=Math.hypot(target.x-aircraft.position.x,target.z-aircraft.position.z),error=wrap(Math.atan2(aircraft.position.x-target.x,aircraft.position.z-target.z)-(aircraft.rotation?.y||0));
  flight.remainingDistance=distance+Math.max(0,joinZ-runway.z);
  if(distance<22&&leg===0)flight.navigationLeg=1;
  if(distance<45&&leg===1){flight.assist='land';flight.assistStage='join';return aircraftAssistedInput(aircraft,input,environment,now);}
  const targetAltitude=30,vertical=clamp((targetAltitude-altitude)*.6,-2.5,2.5),sink=Math.max(0,1-Math.cos(Number(flight.bank)||0))*.85;
  return {...common,throttle:clamp(.55+((distance<100?11:16)-speed)*.06,.3,.95),lift:clamp(Math.asin(clamp((vertical+sink)/Math.max(7,speed),-.5,.5))/.46,-.55,.65),side:clamp(-error*1.8,-1,1),rudder:clamp(error*.2,-.3,.3),gear:false,flaps:0};
 }
 const ground=groundOf(aircraft),airborne=flight.airborne===true||aircraft.position.y>ground+.1;
 if(!airborne){
  if(!flight.assistParkingPoint)flight.assistParkingPoint={x:runway.x-runway.width/2-11,z:aircraft.position.z-5};
  const point=flight.assistParkingPoint,dx=point.x-aircraft.position.x,dz=point.z-aircraft.position.z,distance=Math.hypot(dx,dz),desired=Math.atan2(-dx,-dz),error=wrap(desired-(aircraft.rotation?.y||0));
  if(distance<2&&speed<.5){flight.arrivalDestinationId=flight.navigationDestinationId||flight.runwayId;clearAssist(aircraft);flight.throttleCommand=0;return {...common,throttle:0,brake:true,flaps:0};}
  flight.assistStage='park';return {...common,throttle:distance<2?0:.10,brake:distance<2||speed>3,side:clamp(-error*1.4,-1,1),flaps:1};
 }
 if(flight.assistStage==='final'&&aircraft.position.z<runway.z-75&&altitude>4)flight.assistStage='join';
 const nearJoin=Math.hypot(aircraft.position.x-runway.x,aircraft.position.z-(runway.z+runway.length/2-36))<16;
 if(flight.assistStage==='join'&&nearJoin)flight.assistStage='final';
 const target=flight.assistStage==='join'?{x:runway.x,z:runway.z+runway.length/2-36}:{x:runway.x,z:aircraft.position.z-30};
 const desired=Math.atan2(-(target.x-aircraft.position.x),-(target.z-aircraft.position.z)),error=wrap(desired-(aircraft.rotation?.y||0));
 const final=flight.assistStage==='final',aligned=final&&Math.abs(error)<.22&&Math.abs(aircraft.position.x-runway.x)<5&&aircraft.position.z<runway.z+runway.length/2-15;
 let lift=altitude>16?-.6:altitude<12?.35:0;
 if(aligned&&aircraft.position.z>runway.z-runway.length/2-8)lift=-.85;
 const throttle=clamp(.4+(10-speed)*.055,.25,.85);
 return {...common,throttle,side:clamp(-error*1.8,-1,1),rudder:clamp(error*.25,-.35,.35),lift,flaps:1,brake:speed>13};
}
