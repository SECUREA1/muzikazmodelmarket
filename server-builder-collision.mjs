import {isBasketball} from './public/js/basketball.js';
import {slideWalking} from './public/js/walking-collision.js';
import {PLAYER_FLOOR_CLEARANCE} from './public/js/player-floor.js';
import {builderBaseEnvironment,builderBaseSpawn,applyBuilderBaseTransform} from './public/js/environments/builder-base.js';
import {drawingCollisionModel,resolvePlacedSolids} from './public/js/placed-item-collision.js';
import {placedCollisionWorld,disposePlacedCollision} from './server-placed-collision.mjs';
import {environmentGeometry} from './server-glb-geometry.mjs';
import {buildingDimensions,buildingMaterial,createBuildingBlock} from './public/js/building-materials.js';
import * as THREE from './public/vendor/three/three.module.min.js';
import {createBuilderLand} from './public/js/environments/builder-land.js';
import {createBuilderModel} from './public/js/builder-models-3d.js';
import {sweepWalkingMotion} from './public/js/walking-sweep.js';
import {triangleWallSegments} from './public/js/walking-triangles.js';
const PLAYER_RADIUS=.3,PLAYER_HEIGHT=1.7,MAX_STEP_HEIGHT=.35,FLOOR_GAP=.02;
const WALL_GRID_SIZE=2;

function actorDisablesCollision(actor){return actor&&(actor.open||actor.active===false||actor.holderId);}
function builderObjectId(mesh){for(let parent=mesh;parent;parent=parent.parent)if(parent.userData.builderObjectId)return parent.userData.builderObjectId;}
function wallTriangles(mesh){
 const geometry=mesh.geometry,positions=geometry?.attributes?.position,index=geometry?.index,triangles=[];
 if(!positions)return triangles;
 const count=index?index.count:positions.count;
 for(let offset=0;offset+2<count;offset+=3){
  const vertices=[0,1,2].map(corner=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(offset+corner):offset+corner).applyMatrix4(mesh.matrixWorld));
  const [a,b,c]=vertices,normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
  if(Math.abs(normal.y)>=.55)continue;
  triangles.push({a,b,c,mesh,objectId:builderObjectId(mesh),minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minY:Math.min(a.y,b.y,c.y),maxY:Math.max(a.y,b.y,c.y),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)});
 }
 return triangles;
}
function boxSegments(box){const {min,max}=box;return [[min.x,min.z,max.x,min.z],[max.x,min.z,max.x,max.z],[max.x,max.z,min.x,max.z],[min.x,max.z,min.x,min.z]].map(([ax,az,bx,bz])=>({a:{x:ax,z:az},b:{x:bx,z:bz}}));}
function indexWalls(triangles){
 const cells=new Map(),large=[];
 for(const triangle of triangles){
  const minX=Math.floor(triangle.minX/WALL_GRID_SIZE),maxX=Math.floor(triangle.maxX/WALL_GRID_SIZE),minZ=Math.floor(triangle.minZ/WALL_GRID_SIZE),maxZ=Math.floor(triangle.maxZ/WALL_GRID_SIZE);
  if((maxX-minX+1)*(maxZ-minZ+1)>256){large.push(triangle);continue;}
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(triangle);}
 }
 return {cells,large};
}
function nearbyWalls(world,minX,maxX,minZ,maxZ){
 if(!world)return [];
 if(!world.wallIndex)return world.triangles||world.floors.flatMap(wallTriangles);
 const nearby=new Set(world.wallIndex.large);
 for(let x=Math.floor(minX/WALL_GRID_SIZE);x<=Math.floor(maxX/WALL_GRID_SIZE);x++)for(let z=Math.floor(minZ/WALL_GRID_SIZE);z<=Math.floor(maxZ/WALL_GRID_SIZE);z++)for(const triangle of world.wallIndex.cells.get(x+':'+z)||[])nearby.add(triangle);
 return nearby;
}
// Server and browser use the same procedural meshes. Collision results never
// depend on a client-provided floor height, hit point or claimed position.
export class ServerBuilderCollision {
 constructor(){this.cache=new Map();this.objectCache=new Map();}
 placedObjects(objects){
  const floors=[],triangles=[];
  for(const object of Object.values(objects)){
   if(object.deleted||object.open||buildingMaterial(object.materialId).solid===false)continue;
   const key=JSON.stringify([object.materialId,object.position,object.rotation,object.scale]);let cached=this.objectCache.get(key);
   if(!cached){
    const root=createBuildingBlock(THREE,object.materialId);root.userData.walkingPlacedPiece=true;root.position.fromArray(object.position);root.rotation.set(...object.rotation);root.scale.fromArray(object.scale);root.updateMatrixWorld(true);
    const meshes=[];root.traverse(mesh=>{if(mesh.isMesh){mesh.material.side=THREE.DoubleSide;meshes.push(mesh);}});
    cached={root,floors:meshes,triangles:meshes.flatMap(wallTriangles)};this.objectCache.set(key,cached);
    if(this.objectCache.size>512){const [oldKey,old]=this.objectCache.entries().next().value;old.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});this.objectCache.delete(oldKey);}
   }
   floors.push(...cached.floors);triangles.push(...cached.triangles);
  }
  return {floors:[...new Set(floors)],triangles:[...new Set(triangles)]};
 }
 world(environment){
  const key=environment.id+':'+(environment.contentUpdatedAt||environment.updatedAt||'')+':'+JSON.stringify(environment.builderScene?.baseTransform||{});if(this.cache.has(key))return this.cache.get(key);
  const definitions=new Map([...(environment.builderScene?.catalogModels||[]),...(environment.builderScene?.placedModels||[]),...(environment.builderScene?.customModels||[])].map(model=>[model.id,model]));
  const base=builderBaseEnvironment(environment);const glb=Boolean(base)||!environment.builderScene&&!environment.proceduralLand&&Boolean(environment.modelUrl||environment.modelUrls?.length);const root=new THREE.Group(),walls=[];if(!glb)root.add(createBuilderLand(environment));if(glb){const layer=environmentGeometry(base||environment);if(base)applyBuilderBaseTransform(layer,environment.builderScene.baseTransform);root.add(layer);}
  for(const item of environment.builderScene?.objects||[]){if(isBasketball(item))continue;if(['hostile','patrol'].includes(item.functionalSettings?.behavior))continue;let object;try{const definition=definitions.get(item.modelId);object=createBuilderModel(item.asset?.buildAssetId||definition?.buildAssetId||item.modelId);if(!object&&definition?.renderKind==='image'){object=new THREE.Group();object.add(drawingCollisionModel(THREE,definition.configuration));}if(!object&&definition?.modelUrl){object=environmentGeometry({modelUrl:definition.modelUrl});const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());if(definition.targetHeight&&size.y)object.scale.multiplyScalar(definition.targetHeight/size.y);object.updateMatrixWorld(true);object.position.y-=new THREE.Box3().setFromObject(object).min.y;}}catch{}if(!object)continue;object.position.set(Number(item.position?.x)||0,Number(item.position?.y)||0,Number(item.position?.z)||0);object.rotation.set(Number(item.rotation?.x)||0,Number(item.rotation?.y)||0,Number(item.rotation?.z)||0);object.scale.set(Number(item.scale?.x)||1,Number(item.scale?.y)||1,Number(item.scale?.z)||1);object.userData.builderObjectId=item.id;root.add(object);}
  root.updateMatrixWorld(true);const floors=[];
  root.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.streetVisual||/SKY|PARTICLE|VFX|WATER|HELPER/i.test(mesh.name))return;for(let parent=mesh;parent;parent=parent.parent)if(parent.userData.collisionDisabled||parent.userData.collider===false||parent.userData.collision===false)return;floors.push(mesh);if(!glb&&!mesh.userData.streetVisual&&!mesh.name.startsWith('BUILDER_WALKABLE_FLOOR')){let parent=mesh;while(parent&&!parent.userData.builderObjectId)parent=parent.parent;walls.push({box:new THREE.Box3().setFromObject(mesh),objectId:parent?.userData.builderObjectId});}});
  const triangles=floors.flatMap(wallTriangles),bounds=new THREE.Box3();for(const mesh of floors)bounds.expandByObject(mesh);
  const world={root,walls,floors,triangles,wallIndex:indexWalls(triangles),glb,bounds};this.cache.set(key,world);if(this.cache.size>20){const [oldKey,old]=this.cache.entries().next().value;old.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});this.cache.delete(oldKey);}return world;

 }
 placedWorld(actors={},objects={}){
  const key=JSON.stringify([Object.values(objects).map(object=>[object.id,object.revision,object.deleted,object.open,object.position,object.rotation,object.scale]),Object.values(actors).filter(actor=>actor.spawned&&actor.active!==false&&!actor.holderId&&!actor.loot&&!isBasketball(actor)).map(actor=>[actor.id,actor.asset?.id,actor.asset?.buildAssetId,actor.placementRevision,actor.active,actor.holderId,actor.position,actor.rotation,actor.scale])]);
  if(this.placedCache?.key===key)return this.placedCache.world;
  disposePlacedCollision(this.placedCache?.world);const world=placedCollisionWorld(actors,objects);this.placedCache={key,world};return world;
 }
 resolvePlaced(environment,previous,next,actors={},objects={}){return resolvePlacedSolids(previous,{...next,floorY:next.floorY??(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length?-100:0)},this.placedWorld(actors,objects).boxes);}
 paintPoint(environment,origin,direction,actors,objects){
  const meshes=[...this.world(environment).floors,...this.placedWorld(actors,objects).meshes];
  const start=new THREE.Vector3(origin.x,origin.y+1.5,origin.z),ray=new THREE.Raycaster(start,new THREE.Vector3(...direction),.2,8),hit=ray.intersectObjects(meshes,false)[0];
  return hit?hit.point.clone().addScaledVector(hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)||new THREE.Vector3(0,1,0),.18):start.addScaledVector(ray.ray.direction,4);
 }
 blocksShot(environment,origin,direction,distance,actors={}){
  if(!environment.builderScene&&!environment.proceduralLand&&!environment.modelUrl&&!environment.modelUrls?.length)return false;
  const world=this.world(environment),start=new THREE.Vector3(origin.x,origin.y,origin.z),aim=new THREE.Vector3(...direction),ray=new THREE.Ray(start,aim);
  if(world.glb)return new THREE.Raycaster(start,aim,.02,Math.max(.02,distance-.05)).intersectObjects(world.floors,false).length>0;
  return world.walls.some(({box,objectId})=>{const actor=actors[objectId];if(actor&&(actor.open||!actor.active||actor.holderId))return false;const point=ray.intersectBox(box,new THREE.Vector3());return point&&point.distanceTo(start)<distance-.05;});
 }
 groundAt(environment,point,{entry=false,maxRise=.4,actors={},objects}={}){
  const world=this.world(environment),bounds=world.bounds;
  const dynamic=actors||objects?this.placedWorld(actors,objects).meshes:[];
  const meshes=[...world.floors,...dynamic].filter(mesh=>!/ROOF|CEILING|CANOPY|AWNING/i.test(mesh.name)&&!actorDisablesCollision(actors[builderObjectId(mesh)]));
  const startY=entry?bounds.max.y+2:point.y+maxRise;
  const hits=new THREE.Raycaster(new THREE.Vector3(point.x,startY,point.z),new THREE.Vector3(0,-1,0),0,Math.max(2,startY-bounds.min.y+2)).intersectObjects(meshes,false).filter(hit=>hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y>.55);
  // Prefer a floor with overhead clearance and a ceiling above it. A roof may
  // share a mesh with the floor, so mesh names alone cannot protect the entry.
  const choices=hits.filter(hit=>!new THREE.Raycaster(hit.point.clone().add(new THREE.Vector3(0,.08,0)),new THREE.Vector3(0,1,0),0,1.7).intersectObjects([...world.floors,...dynamic],false).length);

  if(entry){choices.sort((a,b)=>a.point.y-b.point.y);} // Ground entrance, never highest roof.
  const hit=choices[0];return hit?{x:point.x,y:hit.point.y+PLAYER_FLOOR_CLEARANCE,z:point.z}:null;
 }
 teleportPosition(environment,origin,point,actors={},objects={}){
  const reject=()=>{throw Object.assign(Error('Choose a visible, clear floor spot.'),{statusCode:422});};
  if(!point||!['x','y','z'].every(axis=>Number.isFinite(point[axis]))||Math.hypot(point.x-origin.x,point.y-origin.y,point.z-origin.z)>256)reject();
  const floor=this.groundAt(environment,point,{actors,objects});if(!floor||Math.abs(floor.y-point.y)>.45)reject();
  const eye={x:origin.x,y:origin.y+1.6,z:origin.z},delta=[floor.x-eye.x,floor.y+.08-eye.y,floor.z-eye.z],length=Math.hypot(...delta);
  if(length>.1&&this.blocksShot(environment,eye,delta.map(n=>n/length),length,actors))reject();
  const world=this.world(environment);
  const dynamic=this.placedWorld(actors,objects).boxes.map(box=>({box,objectId:box.objectId}));
  if([...world.walls,...dynamic].some(({box,objectId})=>{const actor=actors[objectId];return !(actor&&(actor.open||!actor.active||actor.holderId))&&floor.x>box.min.x-.3&&floor.x<box.max.x+.3&&floor.z>box.min.z-.3&&floor.z<box.max.z+.3&&floor.y<box.max.y-.03&&floor.y+1.7>box.min.y+.03;}))reject();
  return floor;
 }
 hasBodyClearance(environment,point,radius=PLAYER_RADIUS+.08){
  const world=this.world(environment);
  const triangles=nearbyWalls(world,point.x-radius,point.x+radius,point.z-radius,point.z+radius);
  for(const triangle of triangles)for(const {a,b} of triangleWallSegments(triangle,point.y+.1,point.y+PLAYER_HEIGHT)){
   const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/Math.max(1e-12,dx*dx+dz*dz)));
   if(Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)<radius)return false;
  }
  return true;
 }
 safeSpawn(environment,point){
  if(!builderBaseEnvironment(environment)&&(environment.builderScene||environment.proceduralLand))return this.meetingPosition(environment,point);
  if(!builderBaseEnvironment(environment)&&!environment.modelUrl&&!environment.modelUrls?.length)return point;
  const world=this.world(environment),bounds=world.bounds,center=bounds.getCenter(new THREE.Vector3());
  const named=world.root.getObjectByName('SPAWN_PLAYER')||world.root.getObjectByName('SPAWN_DEFAULT');
  const finite=point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
  const anchor=named?named.getWorldPosition(new THREE.Vector3()):finite?point:builderBaseSpawn(environment)||center;
  const candidates=[anchor,builderBaseSpawn(environment),{x:center.x,y:anchor.y,z:center.z}].filter(Boolean);
  for(let r=1;r<=6;r++)for(let i=0;i<8;i++)candidates.push({x:anchor.x+Math.cos(i*Math.PI/4)*r,y:anchor.y,z:anchor.z+Math.sin(i*Math.PI/4)*r});
  const accept=candidate=>{const floor=this.groundAt(environment,candidate,{entry:true});return floor&&this.hasBodyClearance(environment,floor,PLAYER_RADIUS+.08)?floor:null;};
  for(const clearance of [.8,PLAYER_RADIUS+.08])for(const candidate of candidates){const floor=this.groundAt(environment,candidate,{entry:true});if(floor&&this.hasBodyClearance(environment,floor,clearance))return floor;}
  // A moved base, distant decoration or blocked centre must not strand a valid
  // floor outside the small entry search. Sample real mesh footprints first.
  const fallback=[];
  for(const mesh of world.floors.slice(0,256)){const box=new THREE.Box3().setFromObject(mesh);if(!box.isEmpty())fallback.push(box.getCenter(new THREE.Vector3()));}
  for(let x=0;x<11;x++)for(let z=0;z<11;z++)fallback.push({x:bounds.min.x+(x+.5)*(bounds.max.x-bounds.min.x)/11,y:anchor.y,z:bounds.min.z+(z+.5)*(bounds.max.z-bounds.min.z)/11});
  fallback.sort((a,b)=>Math.hypot(a.x-anchor.x,a.z-anchor.z)-Math.hypot(b.x-anchor.x,b.z-anchor.z));
  for(const candidate of fallback){const floor=accept(candidate);if(floor)return floor;}
  throw Object.assign(Error('This map has no safe ground-floor entry.'),{statusCode:409,code:'MAP_ENTRY_UNAVAILABLE'});
 }
 encounterSpawn(environment,point,center,occupied=[],{enemy=false,players=[center]}={}) {
  if(!enemy&&!builderBaseEnvironment(environment)&&!environment.modelUrl&&!environment.modelUrls?.length)return point;
  const candidates=[point];
  for(const radius of (enemy?[5,6,8,4,10,12,3,2.5]:[3,4,2,5,1.6,6]))for(let index=0;index<24;index++){
   const angle=index*Math.PI/12;candidates.push({x:center.x+Math.sin(angle)*radius,y:center.y,z:center.z+Math.cos(angle)*radius});
  }
  for(const minDistance of (enemy?[4,2.5]:[1]))for(const candidate of candidates){
   const floor=this.groundAt(environment,{...candidate,y:center.y});if(!floor)continue;
   if(enemy&&(players.some(player=>Math.hypot(player.x-floor.x,player.z-floor.z)<minDistance)||Math.abs(floor.y-center.y)>.6||!this.hasBodyClearance(environment,floor,.45)))continue;
   if(occupied.some(other=>Math.hypot(other.x-floor.x,other.z-floor.z)<.65))continue;
   const origin={x:floor.x,y:floor.y+.9,z:floor.z},delta=[center.x-origin.x,center.y+.9-origin.y,center.z-origin.z],length=Math.hypot(...delta);
   if(length<1||this.blocksShot(environment,origin,delta.map(value=>value/length),length))continue;
   return floor;
  }
  return enemy?null:{...center};
 }
 meetingPosition(environment,point,actors={},objects={}){
  if(builderBaseEnvironment(environment)||!environment.builderScene&&!environment.proceduralLand)return this.safeSpawn(environment,point);
  const world=this.world(environment),terrain=world.floors.filter(mesh=>mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'));
  const bounds=new THREE.Box3();terrain.forEach(mesh=>bounds.expandByObject(mesh));
  const candidates=[],entry={x:Number(point?.x)||0,z:Number(point?.z)||0};
  if(!bounds.isEmpty()){
   for(let radius=0;radius<=12;radius+=2)for(let step=0;step<(radius?8:1);step++)candidates.push({x:Math.max(bounds.min.x+.5,Math.min(bounds.max.x-.5,entry.x+Math.cos(step*Math.PI/4)*radius)),z:Math.max(bounds.min.z+.5,Math.min(bounds.max.z-.5,entry.z+Math.sin(step*Math.PI/4)*radius))});
   for(let x=0;x<11;x++)for(let z=0;z<11;z++)candidates.push({x:bounds.min.x+(x+.5)*(bounds.max.x-bounds.min.x)/11,z:bounds.min.z+(z+.5)*(bounds.max.z-bounds.min.z)/11});
  }
  const dynamic=Object.values(objects).filter(object=>!object.deleted&&!object.open).map(object=>{const size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]);return {box:new THREE.Box3(new THREE.Vector3(...object.position.map((n,i)=>n-size[i]/2)),new THREE.Vector3(...object.position.map((n,i)=>n+size[i]/2)))};});
  for(const {x,z}of candidates){
   const hit=new THREE.Raycaster(new THREE.Vector3(x,bounds.max.y+100,z),new THREE.Vector3(0,-1,0)).intersectObjects(terrain,false).find(hit=>hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y>.55);
   if(!hit)continue;const y=hit.point.y;
   const blocked=[...world.walls,...dynamic].some(({box,objectId})=>{const actor=objectId&&actors[objectId];return !(actor&&(actor.open||!actor.active))&&x>box.min.x-.35&&x<box.max.x+.35&&z>box.min.z-.35&&z<box.max.z+.35&&y<box.max.y-.05&&y+1.8>box.min.y;});
   if(!blocked)return {x,y:y+PLAYER_FLOOR_CLEARANCE,z};
  }
  throw Object.assign(new Error('This meeting location has no safe arrival point.'),{statusCode:409});
 }
 resolve(environment,previous,next,actors={},objects={}){
  const hasWorld=Boolean(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length);
  const world=hasWorld?this.world(environment):null,placed=this.placedObjects(objects),deployed=this.placedWorld(actors,{}).meshes;
  if(!world&&!placed.floors.length)return next;
  const meshes=[...(world?.floors||[]).filter(mesh=>!actorDisablesCollision(actors[builderObjectId(mesh)])),...placed.floors,...deployed];
  const supportMeshes=meshes.filter(mesh=>!/ROOF|CEILING|CANOPY|AWNING|TARGET/i.test(mesh.name));
  const moving=Math.hypot(next.x-previous.x,next.z-previous.z)>1e-7,descending=next.y<=previous.y+.01;
  const floorAt=point=>{
   const maxRise=moving&&descending?MAX_STEP_HEIGHT:.025;
   const startY=Math.max(previous.y,next.y)+maxRise-FLOOR_GAP;
   const hits=new THREE.Raycaster(new THREE.Vector3(point.x,startY,point.z),new THREE.Vector3(0,-1,0),0,Math.max(2,startY-(world?.bounds.min.y??-100)+2)).intersectObjects(supportMeshes,false);
   let blockedStep=false;
   const hit=hits.find(hit=>{
    if(!(hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y>.55))return false;
    const blocked=new THREE.Raycaster(hit.point.clone().add(new THREE.Vector3(0,.08,0)),new THREE.Vector3(0,1,0),0,PLAYER_HEIGHT).intersectObjects(meshes,false).length>0;
    if(blocked&&hit.point.y+FLOOR_GAP>previous.y+.04)blockedStep=true;
    return !blocked;
   });
   let floor=hit?{x:point.x,y:hit.point.y+FLOOR_GAP,z:point.z}:null;
   // Match the browser's fixed-map containment floor beneath missing triangles.
   // This supplies support without moving the player to another x/z location.
   const bounds=world?.bounds;
   if(!floor&&bounds&&!bounds.isEmpty()&&point.x>=bounds.min.x&&point.x<=bounds.max.x&&point.z>=bounds.min.z&&point.z<=bounds.max.z&&bounds.min.y+FLOOR_GAP<=previous.y+maxRise)floor={x:point.x,y:bounds.min.y+FLOOR_GAP,z:point.z};
   return floor?{...floor,blockedStep}:blockedStep?{blockedStep:true}:null;
  };
  // Low risers are traversable only from a grounded, intentional walk. Their
  // edges must not lift the capsule before its center has reached the top.
  const previousFloor=floorAt(previous),canStep=moving&&descending&&previousFloor&&Math.abs(previous.y-previousFloor.y)<=.04;
  const top=Math.max(previous.y,next.y)+PLAYER_HEIGHT-.025;
  const padding=PLAYER_RADIUS+.002,minX=Math.min(previous.x,next.x)-padding,maxX=Math.max(previous.x,next.x)+padding,minZ=Math.min(previous.z,next.z)-padding,maxZ=Math.max(previous.z,next.z)+padding;
  const embedded=new Map();
  const startsInside=mesh=>{
   // A piece placed through a player must permit a controlled exit. Checking
   // the center axis in the primitive's own frame avoids enlarged rotated
   // boxes and never relocates the player to resolve the existing overlap.
   let group=mesh;for(let parent=mesh?.parent;parent;parent=parent.parent)if(parent.userData.walkingPlacedPiece||parent.userData.builderObjectId){group=parent;break;}
   if(!embedded.has(group)){
    let inside=false;
    group?.traverse(part=>{
     if(inside||part.geometry?.type!=='BoxGeometry')return;
     part.geometry.computeBoundingBox();
     const bottom=part.worldToLocal(new THREE.Vector3(previous.x,previous.y+.025,previous.z)),top=part.worldToLocal(new THREE.Vector3(previous.x,previous.y+PLAYER_HEIGHT-.025,previous.z));
     const direction=top.clone().sub(bottom),length=direction.length(),point=new THREE.Ray(bottom,direction.normalize()).intersectBox(part.geometry.boundingBox,new THREE.Vector3());
     inside=part.geometry.boundingBox.containsPoint(bottom)||Boolean(point&&point.distanceTo(bottom)<=length);
    });
    embedded.set(group,inside);
   }
   return embedded.get(group);
  };
  const nearby=[...nearbyWalls(world,minX,maxX,minZ,maxZ),...placed.triangles,...deployed.flatMap(wallTriangles)];
  const sweep=step=>{
   // Gravity is applied before this sweep. While the previous pose has floor
   // support, that provisional downward endpoint must not expose buried floor
   // edges or turn an ordinary low stair into a full-height wall.
   const bottom=(canStep?previous.y:Math.min(previous.y,next.y))+step,segments=[];
   for(const triangle of nearby){
    if(triangle.maxX<minX||triangle.minX>maxX||triangle.maxZ<minZ||triangle.minZ>maxZ||triangle.maxY<bottom||triangle.minY>top||actorDisablesCollision(actors[triangle.objectId])||startsInside(triangle.mesh))continue;
    segments.push(...triangleWallSegments(triangle,bottom,top));
   }
   // Keep the fixed authored map footprint solid without relocating a player
   // who was explicitly spawned outside it. A sweep stops only attempted exits.
   const bounds=world?.bounds;
   if(bounds&&!bounds.isEmpty())segments.push(...boxSegments({
    min:{x:Math.min(bounds.min.x,previous.x-padding),z:Math.min(bounds.min.z,previous.z-padding)},
    max:{x:Math.max(bounds.max.x,previous.x+padding),z:Math.max(bounds.max.z,previous.z+padding)}
   }));
   return sweepWalkingMotion(previous,next,segments,{radius:PLAYER_RADIUS});
  };
  let resolved=sweep(canStep?MAX_STEP_HEIGHT:.025);
  let floor=floorAt(resolved);
  if(canStep&&floor?.blockedStep){resolved=sweep(.025);floor=floorAt(resolved);}
  // A present null floor explicitly means that this geometry query found no
  // support. Omission is reserved for legacy/custom resolvers which leave
  // vertical support to their caller.
  resolved.floorY=null;delete resolved.blockedCeiling;
  if(!Number.isFinite(floor?.y))floor=null;
  if(floor&&floor.y>previous.y+.04&&!canStep)floor=null;
  if(floor){
   resolved.floorY=floor.y;
   if(descending&&resolved.y<=floor.y+.025)resolved.y=Math.max(resolved.y,floor.y);
  }
  if(resolved.y>previous.y){
   let ceiling=Infinity;
   if(meshes.length){
    for(const [dx,dz] of [[0,0],[PLAYER_RADIUS,0],[-PLAYER_RADIUS,0],[0,PLAYER_RADIUS],[0,-PLAYER_RADIUS]]){
     const origin=new THREE.Vector3(resolved.x+dx,previous.y+PLAYER_HEIGHT+.001,resolved.z+dz);
     const hits=new THREE.Raycaster(origin,new THREE.Vector3(0,1,0),0,resolved.y-previous.y+.002).intersectObjects(meshes,false);
     if(hits.length)ceiling=Math.min(ceiling,hits[0].point.y-PLAYER_HEIGHT-.002);
    }
   }
   if(ceiling<resolved.y){resolved.y=Math.max(previous.y,ceiling);resolved.blockedCeiling=true;}
  }
  return resolved;

 }
}
