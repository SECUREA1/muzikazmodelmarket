// Shared metre coordinates and timing rules for direct, desktop and VR play.
export const FUNHOUSE_EXPERIENCE_RULES=Object.freeze({carMs:20000,spinnerMs:15000,ballPitMs:20000,jackBoxMs:30000,mazeMs:120000,windIntervalMs:400,windCount:3,jackDelayMs:500,jackCatchMs:1500,tossIntervalMs:350,hornIntervalMs:4000,hornWindowMs:1500,spinnerCueMs:3000});
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const vector=(value={},fallback=0)=>Array.isArray(value)?{x:finite(value[0],fallback),y:finite(value[1],fallback),z:finite(value[2],fallback)}:{x:finite(value?.x,fallback),y:finite(value?.y,fallback),z:finite(value?.z,fallback)};
const centers={car:{x:28,y:0,z:25},spinner:{x:28,y:0,z:-4},water:{x:-30,y:0,z:3},ballpit:{x:14,y:0,z:-23.5},jackbox:{x:16,y:0,z:-38},mirrors:{x:0,y:0,z:-28}};
export function funhouseEquipmentTransform(station={}){
 const transform=station.objectTransform||{},scale=transform.scale;
 return {position:vector(transform.position||station.equipmentPosition||(station.source!=='placed'?centers[station.kind]:null)||station.position),rotation:vector(transform.rotation),scale:typeof scale==='number'?{x:scale,y:scale,z:scale}:vector(scale,1)};
}
export function funhouseEquipmentPoint(station,local={}){
 const transform=funhouseEquipmentTransform(station),point=vector(local),p={x:point.x*transform.scale.x,y:point.y*transform.scale.y,z:point.z*transform.scale.z},r=transform.rotation;
 const c1=Math.cos(r.x/2),c2=Math.cos(r.y/2),c3=Math.cos(r.z/2),s1=Math.sin(r.x/2),s2=Math.sin(r.y/2),s3=Math.sin(r.z/2),qx=s1*c2*c3+c1*s2*s3,qy=c1*s2*c3-s1*c2*s3,qz=c1*c2*s3+s1*s2*c3,qw=c1*c2*c3-s1*s2*s3;
 const ix=qw*p.x+qy*p.z-qz*p.y,iy=qw*p.y+qz*p.x-qx*p.z,iz=qw*p.z+qx*p.y-qy*p.x,iw=-qx*p.x-qy*p.y-qz*p.z;
 return {x:transform.position.x+ix*qw-iw*qx-iy*qz+iz*qy,y:transform.position.y+iy*qw-iw*qy-iz*qx+ix*qz,z:transform.position.z+iz*qw-iw*qz-ix*qy+iy*qx};
}
export function funhouseGalleryTargets(station){return Array.from({length:6},(_,id)=>({id,...funhouseEquipmentPoint(station,{x:-7.5+id*3,y:2.55+(id%2)*.65,z:0}),radius:.95}));}
export function funhouseBallTargets(station){return Array.from({length:4},(_,id)=>({id,color:['red','yellow','cyan','purple'][id],...funhouseEquipmentPoint(station,{x:-2.4+id*1.6,y:id===0||id===3?1.1:1.4,z:-1.6}),radius:.65}));}
export function funhouseAimedTarget(station,origin,direction,{kind='water',maxDistance=30}={}){
 const start=vector(origin),ray=vector(direction),length=Math.hypot(ray.x,ray.y,ray.z);if(length<.1)return -1;
 ray.x/=length;ray.y/=length;ray.z/=length;
 let nearest=maxDistance,selected=-1;const size=funhouseEquipmentTransform(station).scale,scale=Math.max(Math.abs(size.x),Math.abs(size.y),Math.abs(size.z));
 for(const target of kind==='ballpit'?funhouseBallTargets(station):funhouseGalleryTargets(station)){
  const dx=target.x-start.x,dy=target.y-start.y,dz=target.z-start.z,along=dx*ray.x+dy*ray.y+dz*ray.z;
  if(along<0||along>nearest)continue;const offset=Math.max(0,dx*dx+dy*dy+dz*dz-along*along);
  if(offset<=(target.radius*scale)**2){nearest=along;selected=target.id;}
 }
 return selected;
}
export function funhouseMazeCheckpoints(station){
 const full=station.source!=='placed'||station.equipmentModelId==='funhouse-horror-house',points=full?[[-4.5,0],[-22.5,0],[-22.5,-10],[-18,-10]]:[[2,0],[2,-3],[-2,-3],[-2,-6]];
 return points.map(([x,z],index)=>({id:'maze-checkpoint-'+index,name:['Right passage','Left passage','Back passage','Exit bell approach'][index],...funhouseEquipmentPoint(station,{x,y:.02,z}),radius:1.8}));
}
export function funhouseRideActive(player,now=Date.now()){const ride=player?.funhouse?.ride;return Boolean(ride?.status==='active'&&now<ride.endsAt);}
export function funhouseRideCue(ride,now){
 if(!Number.isFinite(ride?.startedAt))return {};
 const elapsed=Math.max(0,now-ride.startedAt);
 if(ride.kind==='car'){
  let cueIndex=Math.min(3,Math.max(0,Math.floor(elapsed/FUNHOUSE_EXPERIENCE_RULES.hornIntervalMs)-1));
  if(now>ride.startedAt+(cueIndex+1)*FUNHOUSE_EXPERIENCE_RULES.hornIntervalMs+FUNHOUSE_EXPERIENCE_RULES.hornWindowMs&&cueIndex<3)cueIndex++;
  const nextCueAt=ride.startedAt+(cueIndex+1)*FUNHOUSE_EXPERIENCE_RULES.hornIntervalMs;
  return {cueIndex,nextCueAt,cueUntil:nextCueAt+FUNHOUSE_EXPERIENCE_RULES.hornWindowMs};
 }
 const cueIndex=Math.min(4,Math.floor(elapsed/FUNHOUSE_EXPERIENCE_RULES.spinnerCueMs)),nextCueAt=ride.startedAt+cueIndex*FUNHOUSE_EXPERIENCE_RULES.spinnerCueMs;
 return {cueIndex,targetId:cueIndex%2,nextCueAt,cueUntil:nextCueAt+FUNHOUSE_EXPERIENCE_RULES.spinnerCueMs};
}
export function funhouseRidePose(ride,station,now){
 const elapsed=Math.max(0,now-ride.startedAt),progress=Math.min(1,elapsed/ride.durationMs),transform=funhouseEquipmentTransform(station),angle=ride.kind==='spinner'?elapsed/1000*.4:0;
 const local=ride.kind==='spinner'?{x:Math.cos(angle)*4.8,y:.4,z:-Math.sin(angle)*4.8}:{x:-.65,y:.6,z:.55};
 return {position:funhouseEquipmentPoint(station,local),yaw:transform.rotation.y+(ride.kind==='spinner'?angle+Math.PI/2:0),eyeHeight:1.15,vehiclePosition:{...transform.position},vehicleYaw:transform.rotation.y,exitPosition:{...station.position},angle,progress};
}
