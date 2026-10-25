import * as THREE from '../vendor/three/three.module.min.js';
import {Capsule} from '../vendor/three/addons/math/Capsule.js';
import {localMapLocations} from './local-map-locations.js';
import {FLOOR_ENTRY_OFFSET} from './environments/environment-collision.js';
import {placementBounds,placementTriangles,placementHitNormal} from './placed-item-collision.js';

function closedMeshBounds(triangles){
 const groups=new Map(),vertex=point=>[point.x,point.y,point.z].map(value=>Math.round(value*1e5)).join(',');
 for(const triangle of triangles){
  if(!triangle.solidBounds)continue;
  if(!groups.has(triangle.solidBounds))groups.set(triangle.solidBounds,new Map());
  const edges=groups.get(triangle.solidBounds),points=[triangle.a,triangle.b,triangle.c].map(vertex);
  if(new Set(points).size!==3)continue;
  for(let index=0;index<3;index++){const pair=[points[index],points[(index+1)%3]].sort(),key=pair.join('|');edges.set(key,(edges.get(key)||0)+1);}
 }
 // Open walls and thin shells enclose no solid volume, even when a ray crosses
 // an odd number of their faces. Only watertight meshes support this check.
 return new Set([...groups].filter(([,edges])=>edges.size>=6&&[...edges.values()].every(count=>count===2)).map(([bounds])=>bounds));
}

// Prepare a complete arrival before releasing the player's current seat or ride.
export function resolveSoloMapAccess({environment,fields={},loader,roots=[],vehicles=[],activeVehicle=null,position={},height=1.65,radius=.34}) {
 if(!loader?.world||loader.localCollisionReady===false||!loader.floorMeshes?.length)throw Error('Wait for this map’s floor and collision geometry to finish loading.');
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0),solidBounds=new Map(),solidTriangles=new Map();
 const solids=[...new Set([...roots,...(loader.collisionMeshes||[])])];
 const clear=feet=>{
  const capsule=new Capsule(feet.clone().add(new THREE.Vector3(0,radius,0)),feet.clone().add(new THREE.Vector3(0,height-radius,0)),radius);
  const contact=loader.octree.capsuleIntersect(capsule);if(contact&&contact.depth>.01)return false;
  const bounds=new THREE.Box3().setFromPoints([capsule.start,capsule.end]).expandByScalar(radius);
  const center=feet.clone().add(new THREE.Vector3(0,height/2,0));
  for(const root of solids){
   if(!solidBounds.has(root))solidBounds.set(root,placementBounds(THREE,root));
   if(!solidBounds.get(root).intersectsBox(bounds))continue;
   if(!solidTriangles.has(root)){const triangles=placementTriangles(THREE,[root]);solidTriangles.set(root,{triangles,closed:closedMeshBounds(triangles)});}
   const {triangles,closed}=solidTriangles.get(root);
   if(triangles.some(triangle=>{const hit=loader.octree.triangleCapsuleIntersect(capsule,triangle);return hit&&hit.depth>.01;}))return false;
   // A capsule wholly inside a thick closed solid never touches its faces.
   // Check containment per physical mesh too, retaining hollow room interiors.
   const crossings=new Map(),insideRay=new THREE.Ray(center,new THREE.Vector3(1,.173,.319).normalize()),hitPoint=new THREE.Vector3();
   for(const triangle of triangles){
    if(!closed.has(triangle.solidBounds)||!triangle.solidBounds.containsPoint(center))continue;
    if(!crossings.has(triangle.solidBounds))crossings.set(triangle.solidBounds,[]);
    if(insideRay.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hitPoint))crossings.get(triangle.solidBounds).push(hitPoint.distanceTo(center));
   }
   for(const values of crossings.values()){const distinct=values.sort((a,b)=>a-b).filter((value,index,list)=>!index||value-list[index-1]>1e-5);if(distinct.length%2)return false;}
  }
  return true;
 };
 const landing=(base,reach=0)=>{
  const candidates=[base];
  for(let distance=2;distance<=reach+1e-6;distance=Math.min(reach,distance+2)){
   for(let index=0;index<8;index++)candidates.push({...base,x:base.x+Math.cos(index*Math.PI/4)*distance,z:base.z+Math.sin(index*Math.PI/4)*distance});
   if(distance===reach)break;
  }
  for(const candidate of candidates){
   const top=Number.isFinite(loader.bounds?.max?.y)?loader.bounds.max.y+height+8:(Number(candidate.y)||0)+height+8;
   ray.set(new THREE.Vector3(candidate.x,top,candidate.z),down);
   const hits=ray.intersectObjects(loader.floorMeshes,true).filter(hit=>!hit.object.userData.collisionDisabled&&placementHitNormal(THREE,hit)?.y>=.55);
   hits.sort((a,b)=>Math.abs(a.point.y-(Number(candidate.y)||0))-Math.abs(b.point.y-(Number(candidate.y)||0)));
   for(const hit of hits){
    if(place&&Math.abs(hit.point.y-base.y)>2)continue;
    if(vehicle){let ownSurface=false;for(let node=hit.object;node;node=node.parent)if(node===vehicle){ownSurface=true;break;}if(ownSurface)continue;}
    if(environment?.builderScene?.layoutMeta?.harbor&&hit.point.y<-.05)continue;
    const feet=hit.point.clone().add(new THREE.Vector3(0,FLOOR_ENTRY_OFFSET,0));if(clear(feet))return feet;
   }
  }
  return null;
 };
 let vehicle=null,place=null,base,reach=0;
 if(fields.entityId){
  vehicle=vehicles.find(root=>root.userData.builderObjectId===fields.entityId);
  const source=environment?.builderScene?.objects?.find(object=>object.id===fields.entityId);
  if(!vehicle?.userData.vehicle||vehicle.visible===false||source?.active===false||source?.trafficAI||source?.holderId||source?.flight?.airborne)throw Error('This craft is unavailable. Choose a parked player vehicle.');
  if(!Array.isArray(vehicle.userData.vehicle.seat)||vehicle.userData.vehicle.seat.length!==3||!vehicle.userData.vehicle.seat.every(Number.isFinite))throw Error('This vehicle’s seat is still unavailable.');
  if(activeVehicle===vehicle)return {vehicle,reopening:true,message:'Vehicle controls are ready.'};
  base=vehicle.getWorldPosition(new THREE.Vector3());
  if(![base.x,base.y,base.z].every(Number.isFinite))throw Error('This vehicle has no valid boarding position.');
  const bounds=placementBounds(THREE,vehicle),size=bounds.getSize(new THREE.Vector3());reach=Math.max(12,Math.min(128,Math.hypot(size.x,size.z)/2+2));
 }else if(fields.position){
  if(!['x','z'].every(axis=>Number.isFinite(fields.position[axis])))throw Error('Choose a valid point on this map.');
  base={...fields.position,y:Number.isFinite(fields.position.y)?fields.position.y:Number(position.y)||0};
 }else{
  place=localMapLocations(environment).find(item=>item.id===fields.locationId);
  if(!place)throw Error('Choose a listed map location.');
  base={x:place.arrival?.x??place.x,y:place.arrival?.y??place.y??0,z:place.arrival?.z??place.z};
  if(!['x','y','z'].every(axis=>Number.isFinite(base[axis])))throw Error('This map location has invalid coordinates.');
  reach=Math.max(12,Math.min(128,Math.hypot(Number(place.width)||0,Number(place.depth)||0)/2+2));
 }
 const arrival=landing(base,reach);
 if(!arrival)throw Error('This location has no clear landing. Choose another location.');
 if(vehicle&&base.y>arrival.y+2.5)throw Error('Wait until this vehicle has landed before boarding.');
 return {position:arrival,vehicle,message:vehicle?'Boarded '+(vehicle.userData.label||vehicle.name||'vehicle')+'. Controls are ready.':place?'Arrived at '+place.name+'.':'Moved to the selected floor.'};
}

export function travelSoloMap(options,{release,move,board}={}) {
 const arrival=resolveSoloMapAccess(options);
 if(!arrival.reopening){release();move(arrival.position);if(arrival.vehicle)board(arrival.vehicle);}
 return arrival;
}
