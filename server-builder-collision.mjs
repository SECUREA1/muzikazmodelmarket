import {isBasketballEnvironment} from './public/js/basketball-rules.js';
import {environmentGeometry} from './server-glb-geometry.mjs';
import {isCollisionMesh} from './public/js/environments/collision-policy.js';
import {playerCollisionTree,playerCapsuleOverlaps,slidePlayerCapsule,PLAYER_RADIUS,PLAYER_HEIGHT,PLAYER_STEP} from './server-player-collision.mjs';
import {buildingDimensions,buildingMaterial,createBuildingBlock} from './public/js/building-materials.js';
import * as THREE from './public/vendor/three/three.module.min.js';
import {createBuilderLand} from './public/js/environments/builder-land.js';
import {createBuilderModel} from './public/js/builder-models-3d.js';
const FLOOR_SUPPORT_PROBES=[[-.18,0],[.18,0],[0,-.18],[0,.18]];
const FLOOR_RIM_PROBES=Array.from({length:8},(_,index)=>{const angle=index*Math.PI/4;return [Math.cos(angle)*PLAYER_RADIUS*.9,Math.sin(angle)*PLAYER_RADIUS*.9];});
// Server and browser use the same procedural meshes. Collision results never
// depend on a client-provided floor height, hit point or claimed position.
export class ServerBuilderCollision {
 constructor(){this.cache=new Map();this.dynamicCache=new Map();}
 world(environment){
  const key=environment.id+':'+(environment.updatedAt||''),signature=JSON.stringify([environment.modelUrl,environment.modelUrls,environment.scale,environment.spaceScale,environment.playableSize,environment.rotation,environment.contentUpdatedAt,environment.collisionMode]);
  const cached=this.cache.get(key);if(cached&&(!cached.signature||cached.signature===signature))return cached;
  if(cached){cached.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});this.cache.delete(key);}
  const glb=!environment.builderScene&&!environment.proceduralLand&&Boolean(environment.modelUrl||environment.modelUrls?.length);const root=glb?environmentGeometry(environment):createBuilderLand(environment),walls=[];
  for(const item of environment.builderScene?.objects||[]){let object;try{object=createBuilderModel(item.asset?.buildAssetId||item.modelId);}catch{}if(!object)continue;object.position.set(Number(item.position?.x)||0,Number(item.position?.y)||0,Number(item.position?.z)||0);object.rotation.set(Number(item.rotation?.x)||0,Number(item.rotation?.y)||0,Number(item.rotation?.z)||0);object.scale.set(Number(item.scale?.x)||1,Number(item.scale?.y)||1,Number(item.scale?.z)||1);object.userData.builderObjectId=item.id;root.add(object);}
  root.updateMatrixWorld(true);const floors=[];
  root.traverse(mesh=>{if(!mesh.isMesh||!isCollisionMesh(mesh)||mesh.userData.streetVisual)return;let parent=mesh;while(parent&&!parent.userData.builderObjectId)parent=parent.parent;mesh.userData.serverCollisionObjectId=parent?.userData.builderObjectId;floors.push(mesh);if(!glb&&!mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'))walls.push({box:new THREE.Box3().setFromObject(mesh),objectId:parent?.userData.builderObjectId});});
  const world={root,walls,floors,glb,signature,capsuleTree:playerCollisionTree(floors),bounds:new THREE.Box3().setFromObject(root)};this.cache.set(key,world);while(this.cache.size>20||this.cache.size>1&&[...this.cache.values()].reduce((sum,item)=>sum+(item.capsuleTree?.triangleCount||0),0)>350000){const [oldKey,old]=this.cache.entries().next().value;old.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});this.cache.delete(oldKey);}return world;
 }
 blocksShot(environment,origin,direction,distance,actors={}){
  if(!environment.builderScene&&!environment.proceduralLand&&!environment.modelUrl&&!environment.modelUrls?.length)return false;
  const world=this.world(environment),start=new THREE.Vector3(origin.x,origin.y,origin.z),aim=new THREE.Vector3(...direction),ray=new THREE.Ray(start,aim);
  if(world.glb)return new THREE.Raycaster(start,aim,.02,Math.max(.02,distance-.05)).intersectObjects(world.floors,false).length>0;
  return world.walls.some(({box,objectId})=>{const actor=actors[objectId];if(actor&&(actor.open||!actor.active||actor.holderId))return false;const point=ray.intersectBox(box,new THREE.Vector3());return point&&point.distanceTo(start)<distance-.05;});
 }
 activeFloors(world,actors={}){return world.floors.filter(mesh=>{const actor=actors[mesh.userData.serverCollisionObjectId];return !(actor&&(actor.open||actor.active===false||actor.holderId));});}
 dynamicWorld(objects={}){
  const entries=Object.entries(objects).filter(([,object])=>!object.deleted&&!object.open&&buildingMaterial(object.materialId).solid!==false);
  if(!entries.length)return null;
  const key=JSON.stringify(entries.map(([id,object])=>[id,object.materialId,object.position,object.rotation,object.scale]));if(this.dynamicCache.has(key))return this.dynamicCache.get(key);
  const root=new THREE.Group(),floors=[];
  for(const [,object]of entries){const model=createBuildingBlock(THREE,object.materialId);model.position.fromArray(object.position);model.rotation.fromArray([...(object.rotation||[0,0,0]),'XYZ']);model.scale.fromArray(object.scale||[1,1,1]);root.add(model);model.traverse(mesh=>{if(mesh.isMesh){for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.side=THREE.DoubleSide;floors.push(mesh);}});}
  root.updateMatrixWorld(true);const result={root,floors,capsuleTree:playerCollisionTree(floors)};this.dynamicCache.set(key,result);
  if(this.dynamicCache.size>12){const [oldKey,old]=this.dynamicCache.entries().next().value;const materials=new Set();old.root.traverse(mesh=>{mesh.geometry?.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material)materials.add(material);});for(const material of materials)material.dispose();this.dynamicCache.delete(oldKey);}return result;
 }
 headroom(meshes,point,y=point.y){
  return !new THREE.Raycaster(new THREE.Vector3(point.x,y+.06,point.z),new THREE.Vector3(0,1,0),0,PLAYER_HEIGHT-.06).intersectObjects(meshes,false).length;
 }
 ceilingAt(meshes,previous,next){
  if(next.y<=previous.y+1e-5)return null;
  let result=null;
  for(let index=0;index<9;index++){
   const angle=(index-1)*Math.PI/4,radius=index?PLAYER_RADIUS*.72:0,cap=PLAYER_HEIGHT-PLAYER_RADIUS+Math.sqrt(PLAYER_RADIUS*PLAYER_RADIUS-radius*radius);
   const origin=new THREE.Vector3(next.x+Math.cos(angle)*radius,previous.y+cap,next.z+Math.sin(angle)*radius);
   const hit=new THREE.Raycaster(origin,new THREE.Vector3(0,1,0),.001,next.y-previous.y+.005).intersectObjects(meshes,false).find(hit=>Math.abs(hit.face?.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).y||0)>.55);
   if(hit){const feet=hit.point.y-cap-.005;if(!result||feet<result.feet)result={feet,y:hit.point.y};}
  }
  return result;
 }
 groundAt(environment,point,{entry=false,actors={},objects={}}={}){
  const world=this.world(environment),bounds=world.bounds,dynamic=this.dynamicWorld(objects),all=[...this.activeFloors(world,actors),...(dynamic?.floors||[])];
  const meshes=all.filter(mesh=>!/ROOF|CEILING|CANOPY|AWNING/i.test(mesh.name));
  const startY=entry?bounds.max.y+2:point.y+.4;
  const hits=new THREE.Raycaster(new THREE.Vector3(point.x,startY,point.z),new THREE.Vector3(0,-1,0),0,Math.max(2,startY-bounds.min.y+2)).intersectObjects(meshes,false).filter(hit=>hit.face?.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).y>.55);
  // Prefer a floor with overhead clearance and a ceiling above it. A roof may
  // share a mesh with the floor, so mesh names alone cannot protect the entry.
  const choices=hits.filter(hit=>this.headroom(all,hit.point));
  if(entry){choices.sort((a,b)=>a.point.y-b.point.y);} // Ground entrance, never highest roof.
  const hit=choices[0];return hit?{x:point.x,y:hit.point.y+.02,z:point.z}:null;
 }
 safeSpawn(environment,point){
  if(environment.builderScene||environment.proceduralLand)return this.meetingPosition(environment,point);
  if(!environment.modelUrl&&!environment.modelUrls?.length)return point;
  const world=this.world(environment),bounds=world.bounds,center=bounds.getCenter(new THREE.Vector3());
  const named=world.root.getObjectByName('SPAWN_PLAYER')||world.root.getObjectByName('SPAWN_DEFAULT');
  const anchor=named?named.getWorldPosition(new THREE.Vector3()):point;
  const candidates=[anchor,{x:center.x,y:point.y,z:center.z}];for(let r=1;r<=6;r++)for(let i=0;i<8;i++)candidates.push({x:anchor.x+Math.cos(i*Math.PI/4)*r,y:anchor.y,z:anchor.z+Math.sin(i*Math.PI/4)*r});
  for(const candidate of candidates){const floor=this.groundAt(environment,candidate,{entry:true});if(!floor)continue;if(!playerCapsuleOverlaps(world.capsuleTree,floor))return floor;}
  throw Object.assign(Error('This map has no safe ground-floor entry.'),{statusCode:409});
 }
 encounterSpawn(environment,point,center,occupied=[]) {
  if(!environment.modelUrl&&!environment.modelUrls?.length)return point;
  const candidates=[point];
  for(const radius of [3,4,2,5,1.6,6])for(let index=0;index<24;index++){
   const angle=index*Math.PI/12;candidates.push({x:center.x+Math.sin(angle)*radius,y:center.y,z:center.z+Math.cos(angle)*radius});
  }
  for(const candidate of candidates){
   const floor=this.groundAt(environment,{...candidate,y:center.y});if(!floor)continue;
   if(occupied.some(other=>Math.hypot(other.x-floor.x,other.z-floor.z)<.65))continue;
   const origin={x:floor.x,y:floor.y+.9,z:floor.z},delta=[center.x-origin.x,center.y+.9-origin.y,center.z-origin.z],length=Math.hypot(...delta);
   if(length<1||this.blocksShot(environment,origin,delta.map(value=>value/length),length))continue;
   return floor;
  }
  return {...center};
 }
 meetingPosition(environment,point,actors={},objects={}){
  if(!environment.builderScene&&!environment.proceduralLand)return this.safeSpawn(environment,point);
  const world=this.world(environment),terrain=world.floors.filter(mesh=>mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'));
  const edge=Math.max(40,Math.min(512,Number(environment.builderScene?.mapSize)||40))/2-1;
  for(let radius=0;radius<=12;radius+=2)for(let step=0;step<(radius?8:1);step++){const x=Math.max(-edge,Math.min(edge,point.x+Math.cos(step*Math.PI/4)*radius)),z=Math.max(-edge,Math.min(edge,point.z+Math.sin(step*Math.PI/4)*radius));const hit=new THREE.Raycaster(new THREE.Vector3(x,1000,z),new THREE.Vector3(0,-1,0)).intersectObjects(terrain,false)[0];if(!hit)continue;const y=hit.point.y;const dynamic=Object.values(objects).filter(object=>!object.deleted&&!object.open).map(object=>{const size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]);return {box:new THREE.Box3(new THREE.Vector3(...object.position.map((n,i)=>n-size[i]/2)),new THREE.Vector3(...object.position.map((n,i)=>n+size[i]/2)))};});const blocked=[...world.walls,...dynamic].some(({box,objectId})=>{const actor=objectId&&actors[objectId];return !(actor&&(actor.open||!actor.active))&&x>box.min.x-.35&&x<box.max.x+.35&&z>box.min.z-.35&&z<box.max.z+.35&&y<box.max.y-.05&&y+1.8>box.min.y;});if(!blocked)return {x,y:y+(isBasketballEnvironment(environment)?.02:0),z};}
  throw Object.assign(new Error('This meeting location has no safe arrival point.'),{statusCode:409});
 }
 resolve(environment,previous,next,actors={},objects={}){
  const hasWorld=Boolean(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length),world=hasWorld?this.world(environment):null,dynamic=this.dynamicWorld(objects);
  if(!world&&!dynamic)return next;
  if(world&&!world.capsuleTree)world.capsuleTree=playerCollisionTree(world.floors);
  let tree=world?.capsuleTree||dynamic?.capsuleTree;
  if(world&&dynamic)tree={box:world.capsuleTree.box.clone().union(dynamic.capsuleTree.box),left:world.capsuleTree,right:dynamic.capsuleTree};
  const floors=[...(world?this.activeFloors(world,actors):[]),...(dynamic?.floors||[])];
  const resolved=slidePlayerCapsule(tree,previous,next,{actors,canStep:(point,top)=>this.headroom(floors,point,top+.02)});
  const ceiling=this.ceilingAt(floors,previous,resolved);if(ceiling&&resolved.y>ceiling.feet){resolved.y=ceiling.feet;resolved.ceilingY=ceiling.y;}
  let floor=world?this.groundAt(environment,{x:resolved.x,y:Math.max(previous.y,next.y),z:resolved.z},{actors,objects}):null;
  if(!world&&dynamic){const hit=new THREE.Raycaster(new THREE.Vector3(resolved.x,Math.max(previous.y,next.y)+.4,resolved.z),new THREE.Vector3(0,-1,0),0,1000).intersectObjects(dynamic.floors,false).find(hit=>hit.face?.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).y>.55&&this.headroom(floors,hit.point));if(hit)floor={y:hit.point.y+.02};}
  // Feet can straddle a mesh seam or the edge of a step. Keep support from a
  // nearby part of the capsule instead of freezing on a narrow floor crack.
  if(world&&(!floor||floor.y<previous.y-.02)){
   const probeSupport=probes=>{for(const [x,z]of probes){
    const candidate=this.groundAt(environment,{x:resolved.x+x,y:Math.max(previous.y,next.y),z:resolved.z+z},{actors,objects});
    if(candidate&&candidate.y<=previous.y+PLAYER_STEP+.02&&(!floor||candidate.y>floor.y)&&!playerCapsuleOverlaps(tree,{x:resolved.x,y:candidate.y,z:resolved.z},actors))floor=candidate;
   }};
   probeSupport(FLOOR_SUPPORT_PROBES);
   // Scanned doorways can contain a narrow floor crack. Probe the actual body
   // footprint only when center/seam probes found no support; larger holes
   // remain blocked, and a raised candidate must fit the complete capsule.
   if(!floor)probeSupport(FLOOR_RIM_PROBES);
  }
  if(world?.glb&&!floor){const span=Math.hypot(next.x-previous.x,next.z-previous.z),normal=span?{x:(previous.x-next.x)/span,z:(previous.z-next.z)/span}:null;return {...previous,y:Math.max(previous.y,next.y),collisionNormals:normal?[normal]:[]};}
  if(floor){
   const clearance=world?.glb||isBasketballEnvironment(environment)?.02:0,ground=floor.y-.02+clearance;
   resolved.floorY=ground;
   if(next.y<=ground+PLAYER_STEP&&next.y<=previous.y+.01)resolved.y=Math.max(resolved.y,ground);
  }
  if(world&&!world.glb&&!floor){const edge=Math.max(40,Math.min(512,Number(environment.builderScene?.mapSize)||40))/2-.5;if(Math.abs(resolved.x)>edge||Math.abs(resolved.z)>edge)return {...previous,collisionNormals:resolved.collisionNormals};}
  return resolved;
 }
}
