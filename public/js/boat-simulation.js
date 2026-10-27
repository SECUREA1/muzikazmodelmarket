import {harborWaterAt,watercraftFootprint} from './harbor-water.js';
import {shippingVesselType} from './shipping-vessel-specs.js';
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const blend=(current,target,rate,dt)=>current+(target-current)*(1-Math.exp(-rate*dt));
const normalizeAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const degrees=angle=>((angle*180/Math.PI)%360+360)%360;
// Assisted launch/sailing dynamics. The shared server accepts control positions;
// heading, inertia, wind drive and shore contacts are calculated here.
export function stepBoatSimulation(boat,input={},dt,{environment,now=0,blocked=()=>false}={}){
 input ||= {};
 const modelId=boat.modelId||boat.asset?.buildAssetId,paddle=modelId==='resort-paddle-boat',pontoon=modelId==='resort-pontoon';
 const old=boat.boating||{},cargo=shippingVesselType(boat),loadRatio=cargo?clamp(finite(old.cargoMass)/cargo.capacity,0,1):0,inertia=1+loadRatio*.45,sailing=modelId==='harbor-sailboat',duration=clamp(finite(dt),0,.25),maximum=cargo?cargo.speed:paddle?3.4:pontoon?6:sailing?6.4:modelId==='harbor-patrol'?12:modelId==='harbor-fishing-boat'?8:9;
 const position={x:finite(boat.position?.x),y:0,z:finite(boat.position?.z)};
 let yaw=normalizeAngle(finite(boat.rotation?.y)),speed=clamp(finite(old.speed),-2,maximum),throttle=clamp(finite(old.throttle),-1,1),rudder=clamp(finite(old.rudder),-1,1),impactDamage=0,held=false;
 const forward=clamp(finite(input.forward),-1,1),absolute=input.throttle!==undefined&&input.throttle!==null&&Number.isFinite(Number(input.throttle)),throttleCommand=absolute?clamp(Number(input.throttle),-1,1):Math.abs(forward)>.02?forward:clamp(finite(old.throttleCommand,finite(old.throttle)),-1,1);
 const anchor=input.anchor===undefined?old.anchor===true:input.anchor===true,brake=input.brake===true||finite(input.brake)>0,rudderCommand=clamp(finite(input.side)+finite(input.rudder),-1,1),sailTrim=clamp(input.sailTrim===undefined?finite(old.sailTrim,.5):finite(input.sailTrim,.5),0,1);
 const harbor=environment?.builderScene?.layoutMeta?.harbor||{},weather=environment?.weather||{},windSpeed=clamp(finite(harbor.windSpeed,finite(weather.windSpeed,6.5)),0,20),windDirection=degrees(finite(harbor.windDirection,finite(weather.windDirection,35))*Math.PI/180),windYaw=-windDirection*Math.PI/180;
 let windEfficiency=0,trimEfficiency=1;
 if(anchor&&!old.anchor)impactDamage=Math.round(Math.max(0,Math.abs(speed)-4)*2);
 for(let remaining=duration;remaining>1e-8;){
  const step=Math.min(1/60,remaining);remaining-=step;
  const previous={...position},previousYaw=yaw;
  throttle=blend(throttle,anchor?0:throttleCommand,cargo?1.8:4.5,step);rudder=blend(rudder,rudderCommand,cargo?2.2:4,step);
  const windAngle=Math.abs(normalizeAngle(yaw-windYaw));
  const polar=windAngle<.45?.08:windAngle<1.4?.08+(windAngle-.45)/.95*.92:1-(windAngle-1.4)/(Math.PI-1.4)*.28;
  const bestTrim=clamp(windAngle/Math.PI,.12,.95);trimEfficiency=clamp(1-Math.abs(sailTrim-bestTrim)*1.3,.15,1);windEfficiency=polar*trimEfficiency;
  const thrust=sailing?throttle*3.8+Math.max(0,throttle)*windSpeed*1.1*windEfficiency:throttle*(cargo?.thrust||(paddle?7:pontoon?12:18));
  const drag=(sailing?1.55:1.8)*speed+.023*speed*Math.abs(speed),braking=anchor?9:brake?7:forward<0&&speed>0?4:0;
  speed=clamp(speed+(thrust-drag-Math.sign(speed)*braking)/inertia*step,-2,maximum);
  if((anchor||brake)&&Math.abs(speed)<.12)speed=0;
  if(anchor&&speed===0)throttle=0;
  const fishing=modelId==='harbor-fishing-boat',thruster=(modelId==='harbor-yacht'||(fishing||cargo)&&!anchor)&&input.bowThruster===true&&Math.abs(speed)<.2;
  yaw=normalizeAngle(yaw-rudder*(thruster?(fishing?.5:cargo?.32:.3):(cargo?cargo.turnRate/(1+loadRatio*.2):modelId==='harbor-yacht'?.14:paddle?1.15:pontoon?.6:sailing?.64:.8)*clamp(speed/(paddle?2:4),-.6,1))*step);
  position.x-=Math.sin(yaw)*speed*step;position.z-=Math.cos(yaw)*speed*step;
  const valid=watercraftFootprint(position,yaw,boat).every(point=>harborWaterAt(environment,point,.25));
  if(!valid||blocked(previous,position,yaw)){
   position.x=previous.x;position.z=previous.z;yaw=previousYaw;impactDamage+=Math.round(Math.max(0,Math.abs(speed)-2.5)*6);speed=0;held=true;break;
  }
 }
 const elapsed=finite(old.elapsed)+duration,time=finite(now)>0?finite(now)/1000:elapsed,moving=Math.min(1,Math.abs(speed)/maximum),pitch=(anchor&&speed===0?0:Math.sin(time*1.7+position.z*.03)*(.004+moving*.008))*(cargo?.3:1),roll=(anchor&&speed===0?0:Math.sin(time*1.3+position.x*.025)*.006-rudder*moving*.035)*(cargo?.3:1);
 const phase=held?'hold':anchor?'anchored':Math.abs(speed)<.12?'moored':speed<0?'astern':sailing?'sailing':Math.abs(speed)>5?'cruise':'maneuvering';
 return {position,rotation:{x:pitch,y:yaw,z:roll},boating:{...old,speed,speedKnots:Math.abs(speed)*1.94384,throttle,throttleCommand,rpm:Math.round(anchor?0:paddle?Math.abs(throttle)*75:650+Math.abs(throttle)*(sailing?1550:3850)),pedalDriven:paddle,rudder,rudderCommand,heading:degrees(-yaw),windSpeed,windDirection,windEfficiency,trimEfficiency,sailTrim,sailPower:sailing?windEfficiency*Math.max(0,throttle):0,wakeStrength:moving,anchor,brake,phase,warning:held?'WATERWAY OBSTRUCTION':anchor&&Math.abs(throttleCommand)>.05?'ANCHOR SET':sailing&&windEfficiency<.18&&throttleCommand>.1?'HEAD TO WIND — TURN TO FILL SAIL':'',impactDamage,elapsed,sailing}};
}
export function harborNavigation(environment,position){
 const meta=environment?.builderScene?.layoutMeta||{},locations=meta.locations||meta.harbor?.islands||[];
 return locations.filter(location=>Number.isFinite(location.x)&&Number.isFinite(location.z)).map(location=>{const dx=location.x-finite(position?.x),dz=location.z-finite(position?.z);return {id:location.id,name:location.name,distance:Math.hypot(dx,dz),bearing:degrees(Math.atan2(dx,-dz))};}).sort((a,b)=>a.distance-b.distance);
}
