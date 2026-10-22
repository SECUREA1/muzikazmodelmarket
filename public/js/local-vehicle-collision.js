import {isRoadVehicle,roadVehicleType} from './road-vehicles.js';
import {Box3,Ray,Vector3} from '../vendor/three/three.module.min.js';
import {isAircraft} from './aircraft-flight.js';
import {isWatercraft,harborWaterAt,watercraftFootprint,watercraftOverlap,watercraftSize} from './harbor-water.js';

const normal=new Vector3(),point=new Vector3(),down=new Vector3(0,-1,0);
const value=source=>typeof source==='function'?source():source;
const owns=(group,id)=>id!=null&&(group.objectId===id||group.actorId===id||group.root?.userData?.builderObjectId===id||group.object?.userData?.builderObjectId===id);
const overlaps=(a,b)=>!a||a.min.x<=b.max.x&&a.max.x>=b.min.x&&a.min.y<=b.max.y&&a.max.y>=b.min.y&&a.min.z<=b.max.z&&a.max.z>=b.min.z;
const boundsOf=group=>group.broadphaseBox||group.bounds||group.box;
const active=group=>group.active!==false&&group.collisionDisabled!==true;
// This only queries cached physical triangles and the map octree. It does not
// traverse a scene, rebuild model meshes, or decide shared gameplay outcomes.
export function createVehicleCollision({octree=null,triangleGroups=[],actors={},ignoreId=null,environment=null}={}){
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
 return {blocked(from,to,yaw=0,actor=null){
  if(!from||!to)return false;
  const road=isRoadVehicle(actor),config=roadVehicleType(actor),vessel=isWatercraft(actor),plane=isAircraft(actor),id=value(ignoreId)??actor?.id,all=value(actors)||{};
  if(road&&Object.values(all).some(other=>other.id!==id&&other.active!==false&&isRoadVehicle(other)&&Math.hypot(other.position.x-to.x,other.position.z-to.z)<(config.width+roadVehicleType(other).width)/2+.3))return true;
  if(vessel){
   if(Object.values(all).some(other=>other.id!==id&&other.active!==false&&isWatercraft(other)&&watercraftOverlap(to,yaw,other.position,other.rotation?.y||0,.12,actor,other)))return true;
   const map=value(environment);if(map&&!watercraftFootprint(to,yaw,actor).every(vertex=>harborWaterAt(map,vertex,.25)))return true;
  }
  direction.set(to.x-from.x,to.y-from.y,to.z-from.z);if(vessel)direction.y=0;const span=direction.length();if(span<.001)return false;direction.multiplyScalar(1/span);
  const yacht=(actor?.modelId||actor?.asset?.buildAssetId)==='harbor-yacht',[beam,length]=yacht?watercraftSize(actor):[.85,2],nose=plane?2.8:vessel?length:road?config.length*.4:0,padding=plane?.1:vessel?.12:.05,sides=plane?[-4.8,0,4.8]:vessel?[-beam,0,beam]:road?[-config.width*.45,0,config.width*.45]:[0];
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
