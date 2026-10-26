import {isRoadVehicle,roadVehicleType} from './road-vehicles.js';
import {Box3,Ray,Vector3} from '../vendor/three/three.module.min.js';
import {isAircraft} from './aircraft-flight.js';
import {isWatercraft,harborWaterAt,watercraftFootprint,watercraftOverlap,watercraftSize} from './harbor-water.js';
import {isShippingVessel} from './shipping-vessel-specs.js';
import {isConstructionMachine} from './construction-state.js';
import {earthworksCollisionBoxes} from './construction-earthworks.js';
import {constructionColliders,constructionBoxFromBounds,constructionMotionBlocked} from './construction-collision.js';

const normal=new Vector3(),point=new Vector3(),down=new Vector3(0,-1,0);
const value=source=>typeof source==='function'?source():source;
const owns=(group,id)=>id!=null&&(group.objectId===id||group.actorId===id||group.root?.userData?.builderObjectId===id||group.object?.userData?.builderObjectId===id);
const overlaps=(a,b)=>!a||a.min.x<=b.max.x&&a.max.x>=b.min.x&&a.min.y<=b.max.y&&a.max.y>=b.min.y&&a.min.z<=b.max.z&&a.max.z>=b.min.z;
const boundsOf=group=>group.broadphaseBox||group.bounds||group.box;
const active=group=>group.active!==false&&group.collisionDisabled!==true;
const constructionBoundsCache=new WeakMap();
// This only queries cached physical triangles and the map octree. It does not
// traverse a scene, rebuild model meshes, or decide shared gameplay outcomes.
export function createVehicleCollision({octree=null,triangleGroups=[],actors={},players={},crew=null,earthworks=null,ignoreId=null,environment=null}={}){
 const origin=new Vector3(),direction=new Vector3(),end=new Vector3(),reverseOrigin=new Vector3(),reverseDirection=new Vector3(),ray=new Ray(),reverseRay=new Ray(),broadphase=new Box3();
 function hitMap(start,aim,distance){
  const map=value(octree);if(!map?.rayIntersect)return false;
  ray.set(start,aim);const hit=map.rayIntersect(ray);if(hit&&hit.distance>=0&&hit.distance<distance-.0001)return true;
  // Octree rays cull backfaces. Query the same finite segment from its other
  // end so a thin authored wall cannot be crossed from its reverse side.
  reverseOrigin.copy(start).addScaledVector(aim,distance);reverseDirection.copy(aim).negate();reverseRay.set(reverseOrigin,reverseDirection);const back=map.rayIntersect(reverseRay);
  return !!(back&&back.distance>=0&&back.distance<distance-.0001);
 }
 function hitPlaced(start,aim,distance,id=value(ignoreId)){
  end.copy(start).addScaledVector(aim,distance);broadphase.min.copy(start).min(end);broadphase.max.copy(start).max(end);ray.set(start,aim);
  for(const group of value(triangleGroups)||[]){
   if(!active(group)||owns(group,id)||!overlaps(boundsOf(group),broadphase))continue;
   for(const triangle of group.triangles||[]){
    const hit=ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,point);
    if(hit&&hit.distanceTo(start)<distance-.0001)return true;
   }
  }
  return false;
 }
 function machineryBlocked(from,to,yaw,actor){
  const all=value(actors)||{},id=value(ignoreId)??actor.id,obstacles=[];
  for(const group of value(triangleGroups)||[]){
   if(!active(group)||owns(group,id)||group.constructionEarth)continue;
   const objectId=group.objectId??group.actorId??group.root?.userData?.builderObjectId,other=all[objectId];
   if(isConstructionMachine(other)||other?.constructionManaged)continue;
   const bounds=boundsOf(group);if(!bounds||!['x','y','z'].every(axis=>Number.isFinite(bounds.min[axis])&&Number.isFinite(bounds.max[axis])))continue;
   let box=constructionBoundsCache.get(group);if(!box){box=constructionBoxFromBounds(bounds,objectId);constructionBoundsCache.set(group,box);}obstacles.push(box);
  }
  for(const other of Object.values(all))if(other.id!==id&&other.active!==false){obstacles.push(...constructionColliders(other));if(other.resident){const p=other.position;obstacles.push(constructionBoxFromBounds({min:{x:p.x-.3,y:p.y,z:p.z-.3},max:{x:p.x+.3,y:p.y+(other.resident.ageGroup==='child'?1.3:1.75),z:p.z+.3}},other.id,'site-resident'));}}
  for(const [playerId,worker]of Object.entries(value(players)||{}))if(worker.health>0&&!worker.vehicleId&&!worker.replacedByRoom&&worker.position)obstacles.push(constructionBoxFromBounds({min:{x:worker.position.x-.3,y:worker.position.y,z:worker.position.z-.3},max:{x:worker.position.x+.3,y:worker.position.y+1.7,z:worker.position.z+.3}},playerId,'site-worker'));
  for(const worker of value(crew)?.workers||[])if(worker.position&&(!worker.machineId||!all[worker.machineId]?.construction?.crewOperator))obstacles.push(constructionBoxFromBounds({min:{x:worker.position.x-.3,y:worker.position.y,z:worker.position.z-.3},max:{x:worker.position.x+.3,y:worker.position.y+1.7,z:worker.position.z+.3}},worker.id,'crew-worker'));
  const span=12,bounds={min:{x:Math.min(from.x,to.x)-span,y:Math.min(from.y,to.y)-12,z:Math.min(from.z,to.z)-span},max:{x:Math.max(from.x,to.x)+span,y:Math.max(from.y,to.y)+12,z:Math.max(from.z,to.z)+span}};
  if(value(earthworks))obstacles.push(...earthworksCollisionBoxes(value(earthworks),bounds));
  const before={...actor,position:{...from}},after={...actor,position:{...to},rotation:{...actor.rotation,y:yaw}};
  if(constructionMotionBlocked(before,after,obstacles))return true;
  // Cached authored GLB terrain lives in the octree. Probe each mechanism's
  // corners as well as its centre so reverse and turning envelopes are covered.
  const oldParts=constructionColliders(before),newParts=constructionColliders(after);
  for(let index=0;index<oldParts.length;index++){
   const old=oldParts[index],next=newParts[index];if(!next)continue;
   for(const signs of [[0,0,0],...[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>[x,y,z])))]){
    const transform=(part,target)=>{const m=part.matrix,x=signs[0]*part.size.x/2,y=signs[1]*part.size.y/2,z=signs[2]*part.size.z/2;return target.set(m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]);};
    transform(old,origin);transform(next,end);direction.copy(end).sub(origin);const distance=direction.length();if(distance<.0001)continue;direction.multiplyScalar(1/distance);if(hitMap(origin,direction,distance+.01))return true;
   }
  }
  return false;
 }
 return {blocked(from,to,yaw=0,actor=null){
  if(!from||!to)return false;
  const road=isRoadVehicle(actor),config=roadVehicleType(actor),vessel=isWatercraft(actor),plane=isAircraft(actor),id=value(ignoreId)??actor?.id,all=value(actors)||{};
  if(isConstructionMachine(actor))return machineryBlocked(from,to,yaw,actor);
  if(road&&Object.values(all).some(other=>other.id!==id&&other.active!==false&&isRoadVehicle(other)&&Math.hypot(other.position.x-to.x,other.position.z-to.z)<(config.width+roadVehicleType(other).width)/2+.3))return true;
  if(vessel){
   if(Object.values(all).some(other=>other.id!==id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(to,yaw,other.position,other.rotation?.y||0,.12,actor,other)))return true;
   const map=value(environment);if(map&&!watercraftFootprint(to,yaw,actor).every(vertex=>harborWaterAt(map,vertex,.25)))return true;
  }
  direction.set(to.x-from.x,to.y-from.y,to.z-from.z);if(vessel)direction.y=0;const span=direction.length();if(span<.001)return false;direction.multiplyScalar(1/span);
  const largeHull=isShippingVessel(actor)||['harbor-yacht','harbor-fishing-boat'].includes(actor?.modelId||actor?.asset?.buildAssetId),[beam,length]=largeHull?watercraftSize(actor):[.85,2],nose=plane?2.8:vessel?length:road?config.length*.4:0,padding=plane?.1:vessel?.12:.05,sides=plane?[-4.8,0,4.8]:vessel?[-beam,0,beam]:road?[-config.width*.45,0,config.width*.45]:[0];
  for(const side of sides){
   origin.set(from.x+Math.cos(yaw)*side-Math.sin(yaw)*nose,vessel?.18:from.y+(plane?.9:.9),from.z-Math.sin(yaw)*side-Math.cos(yaw)*nose);
   if(hitMap(origin,direction,span+padding)||hitPlaced(origin,direction,span+padding,id))return true;
  }
  return false;
 },groundAt(position,actor=null){
  if(!position||![position.x,position.y,position.z].every(Number.isFinite))return null;
  origin.set(position.x,position.y+.4,position.z);ray.set(origin,down);let height=-Infinity;
  const map=value(octree),hit=map?.rayIntersect?.(ray);
  if(hit?.position&&hit.triangle&&hit.triangle.getNormal(normal).y>.55)height=hit.position.y;
  end.copy(origin).addScaledVector(down,2048);broadphase.min.copy(end);broadphase.max.copy(origin);
  for(const group of value(triangleGroups)||[]){
   if(!active(group)||owns(group,value(ignoreId)??actor?.id)||/ROOF|CEILING|CANOPY|AWNING/i.test(group.name||group.object?.name||'')||!overlaps(boundsOf(group),broadphase))continue;
   for(const triangle of group.triangles||[]){
    if(triangle.getNormal(normal).y<.55)continue;
    const hit=ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,point);
    if(hit&&hit.y<=origin.y&&hit.y>height)height=hit.y;
   }
  }
  return Number.isFinite(height)?{x:position.x,y:height+.02,z:position.z}:null;
 }};
}
