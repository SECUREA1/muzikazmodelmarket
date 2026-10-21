import * as THREE from '../vendor/three/three.module.min.js';
import {Capsule} from '../vendor/three/addons/math/Capsule.js';
import {localMapBounds} from './local-map-locations.js';
import {harborWaterAt} from './harbor-water.js';
import {placementHitNormal} from './placed-item-collision.js';
import {PLAYER_FLOOR_CLEARANCE,WALKABLE_NORMAL_Y} from './player-floor.js';

const NON_FLOOR=/(CEILING|ROOF|CANOPY|AWNING|SKY|WALL|WINDOW|DOOR|RAIL|FENCE|LIGHT|LAMP|WATER|SWIM|HELPER|AVATAR)/i;
const NON_FLOOR_PARENT=/(^|[_ .-])(CEILING|ROOF|CANOPY|AWNING|SKY|WALL|WINDOW|DOOR|RAIL|FENCE|LIGHT|LAMP|WATER|SWIM|HELPER|AVATAR)([_ .-]|$)/i;
const SAFETY_FLOOR=/(MAP_CONTAINMENT|MAP_SAFETY_FLOOR|MAP_BOUNDARY)/i;
const DIRECTIONS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

function usableFloor(mesh){
 if(!mesh?.isMesh||NON_FLOOR.test(mesh.name||''))return false;
 for(let node=mesh;node;node=node.parent){
  if(node.userData?.collisionDisabled||node.userData?.collider===false||node.userData?.collision===false||SAFETY_FLOOR.test(node.name||''))return false;
  if(node!==mesh&&NON_FLOOR_PARENT.test(node.name||''))return false;
 }
 return true;
}

// A capsule completely enclosed by a large solid can miss every surface in a
// contact-only query. All six nearest exits must face out of the solid before
// this is considered containment; an open floor or wall cannot pass that test.
function enclosedBySolid(octree,point,extraTriangles,support){
 const ray=new THREE.Ray(),intersection=new THREE.Vector3(),normal=new THREE.Vector3(),plane=new THREE.Plane();ray.origin.copy(point);
 for(const components of DIRECTIONS){
  ray.direction.set(...components);const triangles=[];octree.getRayTriangles(ray,triangles);triangles.push(...extraTriangles);let nearest=Infinity,backFace=false;
  for(const triangle of triangles){
   if(!ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,intersection))continue;
   const distance=intersection.distanceToSquared(point);if(distance<1e-8)continue;
   triangle.getNormal(normal);triangle.getPlane(plane);if(normal.y>=WALKABLE_NORMAL_Y&&Math.abs(plane.distanceToPoint(support))<1e-4)continue;const back=normal.dot(ray.direction)>1e-6;
   if(distance<nearest-1e-8){nearest=distance;backFace=back;}else if(Math.abs(distance-nearest)<1e-8&&!back)backFace=false;
  }
  if(!Number.isFinite(nearest)||!backFace)return false;
 }
 return true;
}

function standingClear(octree,triangleGroups,feet,support,height,radius){
 const capsule=new Capsule(new THREE.Vector3(feet.x,feet.y+radius,feet.z),new THREE.Vector3(feet.x,feet.y+height-radius,feet.z),radius),triangles=[];
 octree.getCapsuleTriangles(capsule,triangles);
 const extraTriangles=[],capsuleBounds=new THREE.Box3().setFromPoints([capsule.start,capsule.end]).expandByScalar(radius);
 for(const group of triangleGroups){
  const box=group?.bounds,valid=box&&['min','max'].every(side=>['x','y','z'].every(axis=>Number.isFinite(box[side]?.[axis])))&&['x','y','z'].every(axis=>box.min[axis]<=box.max[axis]);
  if(valid&&(box.min.x>capsuleBounds.max.x||box.max.x<capsuleBounds.min.x||box.min.y>capsuleBounds.max.y||box.max.y<capsuleBounds.min.y||box.min.z>capsuleBounds.max.z||box.max.z<capsuleBounds.min.z))continue;
  for(const triangle of group?.triangles||[]){triangles.push(triangle);extraTriangles.push(triangle);}
 }

 const normal=new THREE.Vector3(),plane=new THREE.Plane(),reversed=new THREE.Triangle();
 for(const triangle of triangles){
  const contact=octree.triangleCapsuleIntersect(capsule,triangle)||octree.triangleCapsuleIntersect(capsule,reversed.set(triangle.c,triangle.b,triangle.a));
  if(!contact||contact.depth<=1e-4)continue;
  triangle.getNormal(normal);triangle.getPlane(plane);
  // Feet are vertically aligned to the authored surface, as in resetPlayer.
  // A walkable incline may touch the bottom sphere without obstructing a
  // standing player; only its exact support plane receives this exception.
  if(normal.y>=WALKABLE_NORMAL_Y&&Math.abs(plane.distanceToPoint(support))<1e-4)continue;
  return false;
 }
 return !enclosedBySolid(octree,capsule.getCenter(new THREE.Vector3()),extraTriangles,support);
}

// Called on map travel, never each render frame. No support means no landing:
// the map containment slab and a supplied Y value cannot create a fake floor.
export function findLocalMapLanding({environment,bounds,floorMeshes,octree,triangleGroups=[],position,playerHeight=1.65,playerRadius=.34,nearby=false,scale=1}={}){
 if(!position||!Number.isFinite(position.x)||!Number.isFinite(position.z)||(position.y!==undefined&&!Number.isFinite(position.y)))return null;
 if(!octree?.getCapsuleTriangles||!octree?.triangleCapsuleIntersect||!octree?.getRayTriangles)return null;
 const footprint=localMapBounds(environment,bounds,{scale}),radius=Number.isFinite(playerRadius)&&playerRadius>0?playerRadius:.34,height=Math.max(radius*2,Number.isFinite(playerHeight)&&playerHeight>0?playerHeight:1.65);
 const inside=point=>point.x>=footprint.minX+radius&&point.x<=footprint.maxX-radius&&point.z>=footprint.minZ+radius&&point.z<=footprint.maxZ-radius;
 if(!inside(position))return null;
 const meshes=[...new Set((floorMeshes||[]).filter(usableFloor))];if(!meshes.length)return null;
 const geometryBounds=new THREE.Box3();for(const mesh of meshes){mesh.updateWorldMatrix(true,false);geometryBounds.expandByObject(mesh);}if(geometryBounds.isEmpty())return null;
 const top=Math.max(footprint.maxY,geometryBounds.max.y,position.y??footprint.maxY)+height+4,bottom=Math.min(footprint.minY,geometryBounds.min.y)-4;
 const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,top-bottom),candidates=[{x:position.x,z:position.z}];
 if(nearby)for(const distance of [1,2,4,6,8,10,12])for(let step=0;step<16;step++)candidates.push({x:position.x+Math.cos(step*Math.PI/8)*distance,z:position.z+Math.sin(step*Math.PI/8)*distance});
 for(const candidate of candidates){
  if(!inside(candidate))continue;ray.ray.origin.set(candidate.x,top,candidate.z);
  const hit=ray.intersectObjects(meshes,false).find(item=>placementHitNormal(THREE,item)?.y>=WALKABLE_NORMAL_Y);if(!hit)continue;
  // Choose the highest eligible support rather than silently dropping the
  // player to a hidden lower storey when the selected surface is obstructed.
  if(harborWaterAt(environment,candidate)&&hit.point.y<-.05)continue;
  const feet=new THREE.Vector3(candidate.x,hit.point.y+PLAYER_FLOOR_CLEARANCE,candidate.z);
  if(standingClear(octree,triangleGroups,feet,hit.point,height,radius))return feet;
 }
 return null;
}
