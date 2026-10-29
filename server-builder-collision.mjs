import {constructionColliders,constructionBox,constructionBoxContact} from './public/js/construction-collision.js';
import {isConstructionMachine} from './public/js/construction-state.js';
import {earthworksSurfaceAt} from './public/js/construction-earthworks.js';
import {constructionGroundWorld} from './server-construction-ground.mjs';
import {syncConstructionCollision} from './server-construction-collision.mjs';
import {layoutCollisionGeometry} from './public/js/environments/layout-terrain.js';
import {syncTrafficCollision} from './server-traffic-collision.mjs';
import {isAircraft} from './public/js/aircraft-flight.js';
import {isWatercraft,hasWalkableInterior} from './public/js/harbor-water.js';
import {alignStackableObject} from './public/js/stack-placement.js';
import {isBasketball} from './public/js/basketball.js';
import {slideWalking} from './public/js/walking-collision.js';
import {PLAYER_FLOOR_CLEARANCE} from './public/js/player-floor.js';
import {builderBaseEnvironment,builderBaseSpawn,applyBuilderBaseTransform} from './public/js/environments/builder-base.js';
import {drawingCollisionModel,resolvePlacedSolids,placementFloorPoint,placementBounds,placementHitNormal,placementMeshes,placementMeshMatrices} from './public/js/placed-item-collision.js';
import {placedCollisionWorld,updatePlacedCollisionPoses,disposePlacedCollision} from './server-placed-collision.mjs';
import {environmentGeometry} from './server-glb-geometry.mjs';
import {prepareAuthoredBuilderModel} from './public/js/authored-builder-models.js';
import {accelerateStaticRaycast} from './server-mesh-raycast.mjs';
import {buildingDimensions,buildingMaterial,createBuildingBlock} from './public/js/building-materials.js';
import * as THREE from './public/vendor/three/three.module.min.js';
import {createBuilderLand} from './public/js/environments/builder-land.js';
import {createBuilderModel} from './public/js/builder-models-3d.js';
import {isCasinoEnvironment} from './public/js/casino-config.js';
import {sweepWalkingMotion} from './public/js/walking-sweep.js';
import {triangleWallSegments} from './public/js/walking-triangles.js';
const PLAYER_RADIUS=.3,PLAYER_HEIGHT=1.7,MAX_STEP_HEIGHT=.35,FLOOR_GAP=.02;
const WALL_GRID_SIZE=2;
const restrictedCasinoVault=(environment,point)=>isCasinoEnvironment(environment)&&Math.abs(point.x)<7.4&&point.z>=-37.5&&point.z<=-22.5;
const meshBoundsCache=new WeakMap();
function collisionMeshBounds(mesh){
 const matrix=mesh.matrixWorld.elements,version=mesh.geometry?.attributes?.position?.version,instances=mesh.instanceMatrix?.version;let cached=meshBoundsCache.get(mesh);
 if(!cached||cached.geometry!==mesh.geometry||cached.version!==version||cached.instances!==instances||matrix.some((n,i)=>n!==cached.matrix[i])){if(cached&&cached.version!==version)mesh.geometry.computeBoundingBox();if(mesh.isInstancedMesh&&(!cached||cached.instances!==instances||cached.version!==version))mesh.computeBoundingBox();cached={geometry:mesh.geometry,version,instances,matrix:[...matrix],box:new THREE.Box3().setFromObject(mesh)};meshBoundsCache.set(mesh,cached);}return cached.box;
}
function nearCollisionMeshes(meshes,minX,maxX,minZ,maxZ){return meshes.filter(mesh=>{const {min,max}=collisionMeshBounds(mesh);return max.x>=minX&&min.x<=maxX&&max.z>=minZ&&min.z<=maxZ;});}
function disposePlacedWorldEntry(entry){
 const resources=new Set();
 for(const root of [...entry.variants.values()].map(value=>value.world.root).concat(entry.traffic?.root||[],entry.construction?.root||[])){
  root.removeFromParent();root.traverse(mesh=>{if(mesh.geometry)resources.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material)resources.add(material);});
 }
 if(entry.construction){resources.add(entry.construction.geometry);resources.add(entry.construction.material);}
 for(const resource of resources)resource.dispose();entry.root.clear();
}
function disposeStaticWorld(world){
 const resources=new Set();
 world.root.traverse(mesh=>{if(mesh.geometry)resources.add(mesh.geometry);for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(material)resources.add(material);});
 for(const resource of resources)resource.dispose();
 world.root.clear();
}
function indexCollisionMeshes(meshes){
 const cells=new Map(),large=[];
 for(const mesh of meshes){const box=collisionMeshBounds(mesh),x1=Math.floor(box.min.x/8),x2=Math.floor(box.max.x/8),z1=Math.floor(box.min.z/8),z2=Math.floor(box.max.z/8);if((x2-x1+1)*(z2-z1+1)>1024){large.push(mesh);continue;}for(let x=x1;x<=x2;x++)for(let z=z1;z<=z2;z++){const key=x+':'+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(mesh);}}
 return {cells,large,order:new Map(meshes.map((mesh,index)=>[mesh,index]))};
}
function queryCollisionMeshes(index,minX,maxX,minZ,maxZ){const found=new Set(index.large);for(let x=Math.floor(minX/8);x<=Math.floor(maxX/8);x++)for(let z=Math.floor(minZ/8);z<=Math.floor(maxZ/8);z++)for(const mesh of index.cells.get(x+':'+z)||[])found.add(mesh);return nearCollisionMeshes([...found],minX,maxX,minZ,maxZ);}


// These predicates are shared by ordinary shot queries and the short-lived
// three-ray boat view. Keep range, open/held actor and GLB semantics identical.
function shotBlockedByView(world,placed,actors,origin,direction,distance){
 const start=new THREE.Vector3(origin.x,origin.y,origin.z),aim=new THREE.Vector3(...direction),ray=new THREE.Ray(start,aim);
 if(placed.boxes.some(box=>{const point=ray.intersectBox(box,new THREE.Vector3());return point&&point.distanceTo(start)<distance-.05;}))return true;
 if(world.glb)return new THREE.Raycaster(start,aim,.02,Math.max(.02,distance-.05)).intersectObjects(world.floors,false).length>0;
 return world.walls.some(({box,objectId})=>{const actor=actors[objectId];if(actor&&(actor.open||!actor.active||(actor.holderId&&!isConstructionMachine(actor)&&!actor.constructionManaged)))return false;const point=ray.intersectBox(box,new THREE.Vector3());return point&&point.distanceTo(start)<distance-.05;});
}
function actorDisablesCollision(actor){return actor&&(actor.open||actor.active===false||(actor.holderId&&!hasWalkableInterior(actor)&&!isConstructionMachine(actor)&&!actor.constructionManaged));}
function builderObjectId(mesh){for(let parent=mesh;parent;parent=parent.parent)if(parent.userData.builderObjectId)return parent.userData.builderObjectId;}
const wallTriangleCache=new WeakMap();
function triangleAttributeState(attribute){return attribute?[attribute,attribute.array,attribute.version,attribute.count,attribute.itemSize,attribute.normalized,attribute.offset,attribute.data,attribute.data?.array,attribute.data?.version,attribute.data?.stride]:null;}
function sameTriangleAttribute(state,attribute){return attribute?Boolean(state&&state[0]===attribute&&state[1]===attribute.array&&state[2]===attribute.version&&state[3]===attribute.count&&state[4]===attribute.itemSize&&state[5]===attribute.normalized&&state[6]===attribute.offset&&state[7]===attribute.data&&state[8]===attribute.data?.array&&state[9]===attribute.data?.version&&state[10]===attribute.data?.stride):state===null;}
function wallTriangles(mesh){
 const geometry=mesh.geometry,positions=geometry?.attributes?.position,index=geometry?.index;
 if(!positions)return [];
 const matrix=mesh.matrixWorld.elements,objectId=builderObjectId(mesh),cached=wallTriangleCache.get(mesh);
 // Spatially bounded queries often revisit the same nearby hull. Retain its
 // transformed triangles until any input read by this extraction changes.
 // Buffer/instance updates use Three.js's normal needsUpdate/version contract.
 if(cached&&cached.geometry===geometry&&cached.instanced===mesh.isInstancedMesh&&cached.count===mesh.count&&cached.objectId===objectId&&sameTriangleAttribute(cached.positions,positions)&&sameTriangleAttribute(cached.index,index)&&sameTriangleAttribute(cached.instances,mesh.instanceMatrix)&&matrix.every((value,i)=>value===cached.matrix[i]))return cached.triangles;
 const triangles=[],count=index?index.count:positions.count;
 for(const transform of placementMeshMatrices(THREE,mesh))for(let offset=0;offset+2<count;offset+=3){
  const vertices=[0,1,2].map(corner=>new THREE.Vector3().fromBufferAttribute(positions,index?index.getX(offset+corner):offset+corner).applyMatrix4(transform));
  const [a,b,c]=vertices,normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
  if(Math.abs(normal.y)>=.55)continue;
  triangles.push({a,b,c,mesh,objectId,minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minY:Math.min(a.y,b.y,c.y),maxY:Math.max(a.y,b.y,c.y),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)});
 }
 wallTriangleCache.set(mesh,{geometry,positions:triangleAttributeState(positions),index:triangleAttributeState(index),instances:triangleAttributeState(mesh.instanceMatrix),instanced:mesh.isInstancedMesh,count:mesh.count,objectId,matrix:[...matrix],triangles});
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
function queryIndex(index,minX,maxX,minZ,maxZ){
 const nearby=new Set(index.large);
 for(let x=Math.floor(minX/WALL_GRID_SIZE);x<=Math.floor(maxX/WALL_GRID_SIZE);x++)for(let z=Math.floor(minZ/WALL_GRID_SIZE);z<=Math.floor(maxZ/WALL_GRID_SIZE);z++)for(const triangle of index.cells.get(x+':'+z)||[])nearby.add(triangle);
 return nearby;
}
const wallGroupCache=new WeakMap(),combinedWallCache=new WeakMap(),wallTriangleIndexCache=new WeakMap();
function cachedGroupWalls(group){
 // Mesh face arrays change only when physical geometry or its world pose
 // changes. Reuse full diagnostic arrays while those exact faces stay valid.
 const sets=group.meshes.map(wallTriangles),cached=wallGroupCache.get(group);
 if(cached&&cached.sets.length===sets.length&&sets.every((set,i)=>set===cached.sets[i])){group.wallTriangles=cached.triangles;return cached;}
 const triangles=sets.flat(),entry={sets,triangles};
 group.wallTriangles=triangles;
 wallGroupCache.set(group,entry);return entry;
}
function combinedGroupWalls(entry,groups){
 const sets=groups.map(group=>cachedGroupWalls(group).triangles),cached=combinedWallCache.get(entry);
 if(cached&&sets.every((set,i)=>set===cached.sets[i]))return cached.triangles;
 const triangles=sets.flat();combinedWallCache.set(entry,{sets,triangles});return triangles;
}
function nearbyMeshWalls(meshes,minX,maxX,minZ,maxZ){
 const triangles=[];
 for(const mesh of meshes){
  const faces=wallTriangles(mesh);let indexed=wallTriangleIndexCache.get(faces);
  // Materialize and index only the meshes selected by current physical bounds.
  // A changed pose, membership or buffer produces a new exact face array, so
  // its old index cannot survive geometry invalidation. The weak key does not
  // retain evicted room resources merely to keep a route-planning index alive.
  if(!indexed){indexed={index:indexWalls(faces),order:new Map(faces.map((face,index)=>[face,index]))};wallTriangleIndexCache.set(faces,indexed);}
  const nearby=[...queryIndex(indexed.index,minX,maxX,minZ,maxZ)].filter(triangle=>triangle.maxX>=minX&&triangle.minX<=maxX&&triangle.maxZ>=minZ&&triangle.minZ<=maxZ);
  // Preserve the original full-scan face order for equal-time sweep contacts.
  nearby.sort((a,b)=>indexed.order.get(a)-indexed.order.get(b));triangles.push(...nearby);
 }
 return triangles;
}
function nearbyWalls(world,minX,maxX,minZ,maxZ){
 if(!world)return [];
 if(world.nearbyTriangles)return world.nearbyTriangles(minX,maxX,minZ,maxZ);
 if(!world.wallIndex)return world.triangles||world.floors.flatMap(wallTriangles);
 return queryIndex(world.wallIndex,minX,maxX,minZ,maxZ);
}
function staticWallQuery(floors,floorIndex){
 const order=new Map(floors.map((mesh,index)=>[mesh,index])),wide=[];
 for(const mesh of floors){const {min,max}=collisionMeshBounds(mesh);if((Math.floor(max.x/WALL_GRID_SIZE)-Math.floor(min.x/WALL_GRID_SIZE)+1)*(Math.floor(max.z/WALL_GRID_SIZE)-Math.floor(min.z/WALL_GRID_SIZE)+1)>256)wide.push(mesh);}
 return (minX,maxX,minZ,maxZ)=>{
  const x1=Math.floor(minX/WALL_GRID_SIZE),x2=Math.floor(maxX/WALL_GRID_SIZE),z1=Math.floor(minZ/WALL_GRID_SIZE),z2=Math.floor(maxZ/WALL_GRID_SIZE);
  // Match the original wall grid's candidates and order, but materialize
  // exact faces only for nearby meshes and possible large-grid faces.
  const meshes=[...new Set([...wide,...queryCollisionMeshes(floorIndex,x1*WALL_GRID_SIZE,(x2+1)*WALL_GRID_SIZE,z1*WALL_GRID_SIZE,(z2+1)*WALL_GRID_SIZE)])].sort((a,b)=>order.get(a)-order.get(b)),found=[];
  for(const mesh of meshes)for(const triangle of wallTriangles(mesh)){
   const ax=Math.floor(triangle.minX/WALL_GRID_SIZE),bx=Math.floor(triangle.maxX/WALL_GRID_SIZE),az=Math.floor(triangle.minZ/WALL_GRID_SIZE),bz=Math.floor(triangle.maxZ/WALL_GRID_SIZE),large=(bx-ax+1)*(bz-az+1)>256;
   if(!large&&(bx<x1||ax>x2||bz<z1||az>z2))continue;
   found.push({triangle,x:large?-Infinity:Math.max(x1,ax),z:large?-Infinity:Math.max(z1,az)});
  }
  found.sort((a,b)=>a.x-b.x||a.z-b.z);
  return found.map(value=>value.triangle);
 };
}
// Server and browser use the same procedural meshes. Collision results never
// depend on a client-provided floor height, hit point or claimed position.
export class ServerBuilderCollision {
 constructor({maxPlacedWorlds=20,maxPlacedVariants=8}={}){this.cache=new Map();this.objectCache=new Map();this.placedWorlds=new Map();this.maxPlacedWorlds=Math.min(20,Math.max(1,Math.floor(maxPlacedWorlds)||20));this.maxPlacedVariants=Math.min(8,Math.max(1,Math.floor(maxPlacedVariants)||8));this.activeWorldIds=new Set();}
 // A live room owns its collision resources. Evicting one live room to build
 // the next makes fleets larger than the idle cache rebuild every world on
 // every tick. Idle inspection queries still use the bounded LRU below.
 activateWorld(id){this.activeWorldIds.add(id);}
 setActiveWorlds(ids){
  const next=new Set(ids),previous=this.activeWorldIds;this.activeWorldIds=next;
  for(const id of previous)if(!next.has(id))this.releaseWorld(id);
  this.pruneWorlds();
 }
 releaseWorld(id){
  this.activeWorldIds.delete(id);
  for(const [key,world]of this.cache)if(world.environmentId===id){disposeStaticWorld(world);this.cache.delete(key);}
  const placed=this.placedWorlds.get(id);if(placed){disposePlacedWorldEntry(placed);this.placedWorlds.delete(id);if(this.placedCombinedRoot===placed.root)this.placedCache=this.trafficCollision=this.constructionCollision=this.placedCombinedRoot=null;}
 }
 pruneWorlds(){
  const idle=[...this.cache].filter(([,world])=>!this.activeWorldIds.has(world.environmentId));
  for(const [key,world]of idle.slice(0,Math.max(0,idle.length-20))){disposeStaticWorld(world);this.cache.delete(key);}
  const idlePlaced=[...this.placedWorlds].filter(([id])=>!this.activeWorldIds.has(id));
  for(const [id,entry]of idlePlaced.slice(0,Math.max(0,idlePlaced.length-this.maxPlacedWorlds))){disposePlacedWorldEntry(entry);this.placedWorlds.delete(id);}
 }
 clearWorlds(){for(const world of this.cache.values())disposeStaticWorld(world);this.cache.clear();this.clearPlacedWorlds();for(const world of this.objectCache.values())disposeStaticWorld(world);this.objectCache.clear();this.activeWorldIds.clear();}
 withActorCandidates(actors,callback){
  const previous=this.actorCandidateScope,scope={actors,stable:Object.create(null),traffic:Object.create(null),construction:Object.create(null)};
  // Resident movement issues many floor/clearance queries against the same
  // scene. Classify its physical candidates once for this synchronous phase;
  // live poses, activity and holders are still checked by every query below.
  for(const [id,actor]of Object.entries(actors)){
   const construction=isConstructionMachine(actor)||actor.constructionManaged,craft=isWatercraft(actor)||isAircraft(actor);
   if(construction)scope.construction[id]=actor;
   if(actor.trafficAI){if(craft)scope.traffic[id]=actor;}
   else if(!construction&&(actor.spawned||craft))scope.stable[id]=actor;
  }
  this.actorCandidateScope=scope;
  try{return callback();}finally{this.actorCandidateScope=previous;}
 }
 clearPlacedWorlds(){for(const entry of this.placedWorlds.values())disposePlacedWorldEntry(entry);this.placedWorlds.clear();this.placedCache=this.trafficCollision=this.constructionCollision=this.placedCombinedRoot=null;}
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
  const key=environment.id+':'+(environment.contentUpdatedAt||environment.updatedAt||'')+':'+JSON.stringify(environment.builderScene?.baseTransform||{});if(this.cache.has(key)){const world=this.cache.get(key);this.cache.delete(key);this.cache.set(key,world);return world;}
  // A revised room must not retain obsolete geometry merely because its ID
  // is active. Keep one static revision per room and dispose the old one.
  for(const [oldKey,old]of this.cache)if(old.environmentId===environment.id){disposeStaticWorld(old);this.cache.delete(oldKey);}
  const definitions=new Map([...(environment.builderScene?.catalogModels||[]),...(environment.builderScene?.placedModels||[]),...(environment.builderScene?.customModels||[])].map(model=>[model.id,model]));
  const base=builderBaseEnvironment(environment);const glb=Boolean(base)||!environment.builderScene&&!environment.proceduralLand&&Boolean(environment.modelUrl||environment.modelUrls?.length);const root=new THREE.Group(),walls=[];if(!glb)root.add(createBuilderLand(environment));if(glb){const layer=environmentGeometry(base||environment);if(base)applyBuilderBaseTransform(layer,environment.builderScene.baseTransform);root.add(layer);}
  for(const item of environment.builderScene?.objects||[]){if(item.casinoStation||isBasketball(item)||isWatercraft(item)||isAircraft(item)||isConstructionMachine(item)||item.constructionManaged)continue;if(['hostile','patrol'].includes(item.functionalSettings?.behavior))continue;let object;try{const definition=definitions.get(item.modelId);object=createBuilderModel(item.asset?.buildAssetId||definition?.buildAssetId||item.modelId);if(!object&&definition?.renderKind==='image'){object=new THREE.Group();object.add(drawingCollisionModel(THREE,definition.configuration));}if(!object&&definition?.modelUrl){const content=prepareAuthoredBuilderModel(environmentGeometry({modelUrl:definition.modelUrl}),definition);object=new THREE.Group();object.add(content);}}catch{}if(!object)continue;object.position.set(Number(item.position?.x)||0,Number(item.position?.y)||0,Number(item.position?.z)||0);object.rotation.set(Number(item.rotation?.x)||0,Number(item.rotation?.y)||0,Number(item.rotation?.z)||0);object.scale.set(Number(item.scale?.x)||1,Number(item.scale?.y)||1,Number(item.scale?.z)||1);if(item.placementAnchor==='collider-base'){object.updateMatrixWorld(true);const bounds=placementBounds(THREE,object);if(!bounds.isEmpty())object.position.y+=(Number(item.position?.y)||0)-bounds.min.y;}const physicalMeshes=new Set(placementMeshes(object));object.traverse(mesh=>{if(mesh.isMesh&&!physicalMeshes.has(mesh))mesh.userData.collisionDisabled=true;});object.userData.builderObjectId=item.id;root.add(object);}
  root.updateMatrixWorld(true);const floors=[];
  root.traverse(mesh=>{if(mesh.isMesh)mesh.geometry=layoutCollisionGeometry(mesh.geometry);if(!mesh.isMesh||mesh.userData.streetVisual||/SKY|PARTICLE|VFX|WATER|HELPER/i.test(mesh.name))return;for(let parent=mesh;parent;parent=parent.parent)if(parent.userData.collisionDisabled||parent.userData.collider===false||parent.userData.collision===false)return;floors.push(mesh);if(!glb&&!mesh.userData.streetVisual&&!mesh.name.startsWith('BUILDER_WALKABLE_FLOOR')){let parent=mesh;while(parent&&!parent.userData.builderObjectId)parent=parent.parent;walls.push({box:new THREE.Box3().setFromObject(mesh),objectId:parent?.userData.builderObjectId});}});
  if(!glb)for(const mesh of floors)if(mesh.name.startsWith('BUILDER_WALKABLE_FLOOR')&&!mesh.isInstancedMesh&&!Array.isArray(mesh.material))accelerateStaticRaycast(mesh,{respectMaterialSide:true});
  const bounds=new THREE.Box3();for(const mesh of floors)bounds.expandByObject(mesh);
  const floorIndex=indexCollisionMeshes(floors),world={environmentId:environment.id,root,walls,floors,get triangles(){return floors.flatMap(wallTriangles);},nearbyTriangles:staticWallQuery(floors,floorIndex),floorIndex,glb,bounds};this.cache.set(key,world);this.pruneWorlds();return world;

 }
 placedWorld(actors={},objects={},environment=null){
  const scope=environment?.id||'__unscoped__',version=JSON.stringify([environment?.contentUpdatedAt||environment?.updatedAt||'',environment?.builderScene?.baseTransform||{}]);let entry=this.placedWorlds.get(scope);
  if(entry&&entry.version!==version){disposePlacedWorldEntry(entry);entry=null;}
  const newEntry=!entry;if(!entry)entry={version,variants:new Map(),root:new THREE.Group()};
  // Collision probes alternate between saved pieces and actor-only views, and
  // each vehicle excludes its own body while checking a proposed movement.
  // Retain a bounded set of those physical memberships per room rather than
  // disposing and rebuilding every native vehicle on each footprint sample.
  this.placedWorlds.delete(scope);this.placedWorlds.set(scope,entry);
  if(newEntry)this.pruneWorlds();
  const candidates=this.actorCandidateScope?.actors===actors?this.actorCandidateScope:null;
  const stableActors=candidates?.stable||Object.fromEntries(Object.entries(actors).filter(([,actor])=>!actor.trafficAI&&!isConstructionMachine(actor)&&!actor.constructionManaged));
  const objectState=Object.values(objects).map(object=>[object.id,object.revision,object.deleted,object.open,object.position,object.rotation,object.scale]),actorState=Object.values(stableActors).filter(actor=>(actor.spawned||isWatercraft(actor)||isAircraft(actor))&&actor.active!==false&&(!actor.holderId||hasWalkableInterior(actor))&&!actor.loot&&!isBasketball(actor)).map(actor=>[[actor.id,actor.modelId,actor.asset?.id,actor.asset?.buildAssetId,actor.asset?.modelUrl,actor.asset?.renderKind,actor.asset?.configuration,actor.asset?.targetHeight,actor.placementRevision,actor.active,actor.holderId],actor.position,actor.rotation,actor.scale]);
  const key=JSON.stringify([objectState,actorState]),geometryKey=JSON.stringify([objectState,actorState.map(actor=>actor[0])]);
  const variant=(Object.keys(objects).length>0?'with-objects:':'actors:')+geometryKey;let cached=entry.variants.get(variant);
  if(!cached)cached={key,geometryKey,world:placedCollisionWorld(stableActors,objects)};
  else if(cached.key!==key){updatePlacedCollisionPoses(cached.world,stableActors);cached.key=key;}
  entry.variants.delete(variant);entry.variants.set(variant,cached);
  if(entry.variants.size>this.maxPlacedVariants){const [oldKey,old]=entry.variants.entries().next().value;old.world.root.removeFromParent();disposePlacedCollision(old.world);entry.variants.delete(oldKey);}
  const world=cached.world;
  entry.construction=syncConstructionCollision(entry.construction,candidates?.construction||actors);entry.traffic=syncTrafficCollision(entry.traffic,candidates?.traffic||actors);
  for(const child of [...entry.root.children])if(child!==world.root&&child!==entry.traffic.root&&child!==entry.construction.root)entry.root.remove(child);
  if(world.root.parent!==entry.root)entry.root.add(world.root);
  if(entry.traffic.root.parent!==entry.root)entry.root.add(entry.traffic.root);
  if(entry.construction.meshes.length){if(entry.construction.root.parent!==entry.root)entry.root.add(entry.construction.root);}else entry.construction.root.removeFromParent();
  const traffic=entry.traffic,construction=entry.construction;
  // Existing diagnostics inspect the most recently queried collision world.
  this.placedCache=cached;this.trafficCollision=traffic;this.constructionCollision=construction;this.placedCombinedRoot=entry.root;
  const nearbyMeshes=(minX,maxX,minZ,maxZ)=>[
   ...queryCollisionMeshes(world.meshIndex ||= indexCollisionMeshes(world.meshes),minX,maxX,minZ,maxZ),
   ...nearCollisionMeshes(traffic.meshes,minX,maxX,minZ,maxZ),
   ...nearCollisionMeshes(construction.meshes,minX,maxX,minZ,maxZ)
  ];
  return {
   root:entry.root,
   boxes:[...world.boxes,...traffic.boxes,...construction.boxes],
   meshes:[...world.meshes,...traffic.meshes,...construction.meshes],
   nearbyMeshes,
   nearbyTriangles(minX,maxX,minZ,maxZ){
    const meshes=nearbyMeshes(minX,maxX,minZ,maxZ),order=world.meshIndex.order;
    // Retain stable/traffic/construction order even when the spatial cells are
    // visited in a different order. Moving groups keep their existing order.
    meshes.sort((a,b)=>(order.get(a)??Infinity)-(order.get(b)??Infinity));
    return nearbyMeshWalls(meshes,minX,maxX,minZ,maxZ);
   },
   get triangles(){return combinedGroupWalls(entry,[world,traffic,construction]);}
  };
 }
 stackAsset(environment,asset,position,rotation,scale,actors={},objects={}){
  const preview=placedCollisionWorld({preview:{id:'preview',spawned:true,active:true,asset,position:{x:0,y:0,z:0},rotation,scale}});
  try{
   const root=preview.root.children[0];if(!root)return position;
   const world=this.world(environment),placed=this.placedWorld(actors,objects,environment);
   const point=placementFloorPoint(THREE,new THREE.Vector3(position.x,position.y+1.6,position.z),[...world.floors,...placed.meshes]);
   if(!point)return position;
   alignStackableObject(THREE,root,point,[...world.root.children,...placed.root.children]);
   return {x:root.position.x,y:root.position.y,z:root.position.z};
  }finally{disposePlacedCollision(preview);}
 }
 resolvePlaced(environment,previous,next,actors={},objects={}){return resolvePlacedSolids(previous,{...next,floorY:next.floorY??(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length?-100:0)},this.placedWorld(actors,objects,environment).boxes);}
 paintSurface(environment,origin,direction,actors,objects){
  const meshes=[...this.world(environment).floors,...this.placedWorld(actors,objects,environment).meshes];
  const start=new THREE.Vector3(origin.x,origin.y+1.5,origin.z),ray=new THREE.Raycaster(start,new THREE.Vector3(...direction),.02,8),hit=ray.intersectObjects(meshes,false)[0];
  if(!hit?.face)return null;
  const normal=hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize();
  return {point:hit.point,normal};
 }
 paintPoint(environment,origin,direction,actors,objects){
  const hit=this.paintSurface(environment,origin,direction,actors,objects);
  return hit?hit.point.clone().addScaledVector(hit.normal,.18):new THREE.Vector3(origin.x,origin.y+1.5,origin.z).addScaledVector(new THREE.Vector3(...direction),4);
 }
 destructibleHit(environment,origin,direction,range,actors={}){
  const world=this.world(environment),ray=new THREE.Raycaster(new THREE.Vector3(origin.x,origin.y,origin.z),new THREE.Vector3(...direction),.02,range);
  const hit=ray.intersectObjects([...world.floors,...this.placedWorld(actors,{},environment).meshes],false).find(hit=>!actorDisablesCollision(actors[builderObjectId(hit.object)]));
  const id=hit&&builderObjectId(hit.object),actor=actors[id];
  return actor?.destructible&&actor.active!==false?{entity:actor,along:hit.distance}:null;
 }
 withShotCollisionView(environment,actors={},objects={},callback){
  // Borrow one current view only during this synchronous callback. Never keep
  // it for a boat-assist closure: actors can join, leave or move between calls.
  // The caller must not mutate actors or geometry inside the borrowed callback.
  const hasGeometry=Boolean(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length);
  const nativeShot=this.blocksShot===ServerBuilderCollision.prototype.blocksShot;
  const world=nativeShot&&hasGeometry?this.world(environment):null,placed=nativeShot&&hasGeometry?this.placedWorld(actors,objects,environment):null;
  let active=true;
  try{return callback((origin,direction,distance)=>{
   if(!active)throw new Error('Shot collision views are synchronous and cannot escape their callback.');
   // Preserve instance/subclass overrides rather than bypassing custom logic.
   if(!nativeShot)return this.blocksShot(environment,origin,direction,distance,actors,objects);
   return hasGeometry?shotBlockedByView(world,placed,actors,origin,direction,distance):false;
  });}finally{active=false;}
 }
 blocksShot(environment,origin,direction,distance,actors={},objects={}){
  if(!environment.builderScene&&!environment.proceduralLand&&!environment.modelUrl&&!environment.modelUrls?.length)return false;
  return shotBlockedByView(this.world(environment),this.placedWorld(actors,objects,environment),actors,origin,direction,distance);
 }
 groundAt(environment,point,{entry=false,maxRise=.4,actors={},objects,earthworks}={}){
  const world=this.world(environment),bounds=world.bounds,earth=constructionGroundWorld(earthworks);
  const dynamic=actors||objects?this.placedWorld(actors,objects,environment).nearbyMeshes(point.x-.001,point.x+.001,point.z-.001,point.z+.001):[];
  const available=[...queryCollisionMeshes(world.floorIndex,point.x-.001,point.x+.001,point.z-.001,point.z+.001),...dynamic,...(earth?.nearbyMeshes(point.x-.001,point.x+.001,point.z-.001,point.z+.001)||[])].filter(mesh=>!actorDisablesCollision(actors[builderObjectId(mesh)]));
  const meshes=available.filter(mesh=>!/ROOF|CEILING|CANOPY|AWNING/i.test(mesh.name));
  const startY=entry?bounds.max.y+2:point.y+maxRise;
  const hits=new THREE.Raycaster(new THREE.Vector3(point.x,startY,point.z),new THREE.Vector3(0,-1,0),0,Math.max(2,startY-Math.min(bounds.min.y,earth?.bounds.min.y??bounds.min.y)+2)).intersectObjects(meshes,false).filter(hit=>placementHitNormal(THREE,hit)?.y>.55);
  // Prefer a floor with overhead clearance and a ceiling above it. A roof may
  // share a mesh with the floor, so mesh names alone cannot protect the entry.
  const choices=hits.filter(hit=>!new THREE.Raycaster(hit.point.clone().add(new THREE.Vector3(0,.08,0)),new THREE.Vector3(0,1,0),0,1.7).intersectObjects(available,false).length);

  if(entry){choices.sort((a,b)=>a.point.y-b.point.y);} // Ground entrance, never highest roof.
  const hit=choices[0];return hit?{x:point.x,y:hit.point.y+PLAYER_FLOOR_CLEARANCE,z:point.z}:null;
 }
 teleportPosition(environment,origin,point,actors={},objects={},{localMap=false,earthworks}={}){
  const reject=()=>{throw Object.assign(Error('Choose a visible, clear floor spot.'),{statusCode:422});};
  if(!point||!['x','y','z'].every(axis=>Number.isFinite(point[axis]))||(!localMap&&Math.hypot(point.x-origin.x,point.y-origin.y,point.z-origin.z)>256))reject();
  if(restrictedCasinoVault(environment,point))throw Object.assign(Error('The bank vault is locked. Choose a public casino floor spot.'),{statusCode:403,code:'CASINO_VAULT_LOCKED'});
  const floor=this.groundAt(environment,point,{actors,objects,earthworks});if(!floor||Math.abs(floor.y-point.y)>.45)reject();
  if(!this.hasBodyClearance(environment,floor,PLAYER_RADIUS+.08,{actors,objects,earthworks}))reject();
  const eye={x:origin.x,y:origin.y+1.6,z:origin.z},delta=[floor.x-eye.x,floor.y+.08-eye.y,floor.z-eye.z],length=Math.hypot(...delta);
  if(!localMap&&length>.1&&this.blocksShot(environment,eye,delta.map(n=>n/length),length,actors))reject();
  const world=this.world(environment);
  const dynamic=this.placedWorld(actors,objects,environment).boxes.map(box=>({box,objectId:box.objectId}));
  if([...world.walls,...dynamic].some(({box,objectId})=>{const actor=actors[objectId];return !(actor&&(actor.open||!actor.active||(actor.holderId&&!isConstructionMachine(actor)&&!actor.constructionManaged)))&&floor.x>box.min.x-.3&&floor.x<box.max.x+.3&&floor.z>box.min.z-.3&&floor.z<box.max.z+.3&&floor.y<box.max.y-.03&&floor.y+1.7>box.min.y+.03;}))reject();
  return floor;
 }
 hasBodyClearance(environment,point,radius=PLAYER_RADIUS+.08,placed=null){
  const world=this.world(environment),dynamic=placed?this.placedWorld(placed.actors,placed.objects,environment):null;
  // Surface distance alone misses a capsule entirely enclosed by a saved solid.
  // World AABBs are only a broad phase: a rotated yacht wall's enclosing box
  // can cover its empty central aisle. Test the body axis in each mesh's
  // authored frame, leaving capsule-to-surface distance to the triangles below.
  if(placed){
   const candidates=new Set(dynamic.boxes.filter(box=>point.x>box.min.x-radius&&point.x<box.max.x+radius&&point.z>box.min.z-radius&&point.z<box.max.z+radius&&point.y<box.max.y-.03&&point.y+PLAYER_HEIGHT>box.min.y+.03).map(box=>box.objectId));
   for(const mesh of dynamic.meshes){
    if(!candidates.has(builderObjectId(mesh)))continue;
    if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
    for(const matrix of placementMeshMatrices(THREE,mesh)){
     const inverse=matrix.clone().invert(),bottom=new THREE.Vector3(point.x,point.y+.03,point.z).applyMatrix4(inverse),top=new THREE.Vector3(point.x,point.y+PLAYER_HEIGHT-.03,point.z).applyMatrix4(inverse),direction=top.clone().sub(bottom),length=direction.length(),hit=new THREE.Ray(bottom,direction.normalize()).intersectBox(mesh.geometry.boundingBox,new THREE.Vector3());
     if(mesh.geometry.boundingBox.containsPoint(bottom)||(hit&&hit.distanceTo(bottom)<length))return false;
    }
   }
  }
  if(placed){const body=constructionBox('walking-clearance',{x:point.x,y:point.y+PLAYER_HEIGHT/2,z:point.z},{x:radius*2,y:PLAYER_HEIGHT-.06,z:radius*2});for(const actor of Object.values(placed.actors||{}))for(const part of constructionColliders(actor))if(constructionBoxContact(body,part))return false;}
  const triangles=[...nearbyWalls(world,point.x-radius,point.x+radius,point.z-radius,point.z+radius)];
  if(placed?.earthworks)triangles.push(...(constructionGroundWorld(placed.earthworks)?.triangles||[]).filter(t=>t.maxX>=point.x-radius&&t.minX<=point.x+radius&&t.maxZ>=point.z-radius&&t.minZ<=point.z+radius));
  if(dynamic)triangles.push(...dynamic.nearbyTriangles(point.x-radius,point.x+radius,point.z-radius,point.z+radius));
  for(const triangle of triangles.filter(triangle=>!actorDisablesCollision(placed?.actors?.[triangle.objectId])))for(const {a,b} of triangleWallSegments(triangle,point.y+.1,point.y+PLAYER_HEIGHT)){
   const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/Math.max(1e-12,dx*dx+dz*dz)));
   if(Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)<radius)return false;
  }
  return true;
 }
 hasWalkingExit(environment,point,actors={},objects={},{earthworks}={}){
  if(!environment.builderScene&&!environment.proceduralLand&&!environment.modelUrl&&!environment.modelUrls?.length)return true;
  // Entry search uses extra clearance, but a saved pose only needs the
  // actual capsule radius. A valid small room must not require a long exit.
  if(this.hasBodyClearance(environment,point,PLAYER_RADIUS,{actors,objects,earthworks}))return true;
  // A saved position close to a wall is valid when there is room to reverse
  // or slide. Only an entry trapped in every direction needs relocation.
  for(let direction=0;direction<8;direction++){
   const angle=direction*Math.PI/4,next={x:point.x+Math.cos(angle)*.3,y:point.y-.01,z:point.z+Math.sin(angle)*.3};
   const resolved=this.resolve(environment,point,next,actors,objects,{earthworks});
   // Moving within a solid volume is not a valid escape from it.
   if(Math.hypot(resolved.x-point.x,resolved.z-point.z)>.15&&this.hasBodyClearance(environment,resolved,PLAYER_RADIUS,{actors,objects,earthworks}))return true;
  }
  return false;
 }
 safeSpawn(environment,point,{actors={},objects={},earthworks}={}){
  const placed={actors,objects,earthworks};
  if(!builderBaseEnvironment(environment)&&(environment.builderScene||environment.proceduralLand))return this.meetingPosition(environment,point,actors,objects,{earthworks});
  if(!builderBaseEnvironment(environment)&&!environment.modelUrl&&!environment.modelUrls?.length)return point;
  const world=this.world(environment),bounds=world.bounds,center=bounds.getCenter(new THREE.Vector3());
  const named=world.root.getObjectByName('SPAWN_PLAYER')||world.root.getObjectByName('SPAWN_DEFAULT');
  const finite=point&&['x','y','z'].every(axis=>Number.isFinite(point[axis]));
  const anchor=named?named.getWorldPosition(new THREE.Vector3()):finite?point:builderBaseSpawn(environment)||center;
  const candidates=[anchor,builderBaseSpawn(environment),{x:center.x,y:anchor.y,z:center.z}].filter(Boolean);
  for(let r=1;r<=6;r++)for(let i=0;i<8;i++)candidates.push({x:anchor.x+Math.cos(i*Math.PI/4)*r,y:anchor.y,z:anchor.z+Math.sin(i*Math.PI/4)*r});
  const accept=candidate=>{const floor=this.groundAt(environment,candidate,{entry:true,...placed});return floor&&this.hasBodyClearance(environment,floor,PLAYER_RADIUS+.08,placed)?floor:null;};
  for(const clearance of [.8,PLAYER_RADIUS+.08])for(const candidate of candidates){const floor=this.groundAt(environment,candidate,{entry:true,...placed});if(floor&&this.hasBodyClearance(environment,floor,clearance,placed))return floor;}
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
 meetingPosition(environment,point,actors={},objects={},{earthworks}={}){
  if(builderBaseEnvironment(environment)||!environment.builderScene&&!environment.proceduralLand)return this.safeSpawn(environment,point,{actors,objects,earthworks});
  const world=this.world(environment),terrain=world.floors.filter(mesh=>mesh.name.startsWith('BUILDER_WALKABLE_FLOOR')||mesh.userData.walkableFloor===true);
  const bounds=new THREE.Box3();terrain.forEach(mesh=>bounds.expandByObject(mesh));
  const candidates=[],entry={x:Number(point?.x)||0,z:Number(point?.z)||0};
  if(!bounds.isEmpty()){
   for(let radius=0;radius<=12;radius+=2)for(let step=0;step<(radius?8:1);step++)candidates.push({x:Math.max(bounds.min.x+.5,Math.min(bounds.max.x-.5,entry.x+Math.cos(step*Math.PI/4)*radius)),z:Math.max(bounds.min.z+.5,Math.min(bounds.max.z-.5,entry.z+Math.sin(step*Math.PI/4)*radius))});
   for(let x=0;x<11;x++)for(let z=0;z<11;z++)candidates.push({x:bounds.min.x+(x+.5)*(bounds.max.x-bounds.min.x)/11,z:bounds.min.z+(z+.5)*(bounds.max.z-bounds.min.z)/11});
  }
  const dynamic=Object.values(objects).filter(object=>!object.deleted&&!object.open).map(object=>{const size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]);return {box:new THREE.Box3(new THREE.Vector3(...object.position.map((n,i)=>n-size[i]/2)),new THREE.Vector3(...object.position.map((n,i)=>n+size[i]/2)))};});
  for(const {x,z}of candidates){
   if(restrictedCasinoVault(environment,{x,z}))continue;
   const hit=new THREE.Raycaster(new THREE.Vector3(x,bounds.max.y+100,z),new THREE.Vector3(0,-1,0)).intersectObjects(terrain,false).find(hit=>placementHitNormal(THREE,hit)?.y>.55);
   if(!hit)continue;const y=hit.point.y;
   const blocked=[...world.walls,...dynamic].some(({box,objectId})=>{const actor=objectId&&actors[objectId];return !(actor&&(actor.open||!actor.active))&&x>box.min.x-.35&&x<box.max.x+.35&&z>box.min.z-.35&&z<box.max.z+.35&&y<box.max.y-.05&&y+1.8>box.min.y;});
   if(!blocked){const floor=earthworks?this.groundAt(environment,{x,y,z},{entry:true,actors,objects,earthworks}):{x,y:y+PLAYER_FLOOR_CLEARANCE,z};if(floor&&(!environment.builderScene?.layoutMeta?.harbor||floor.y>=-.05)&&this.hasBodyClearance(environment,floor,PLAYER_RADIUS+.08,{actors,objects,earthworks}))return floor;}
  }
  throw Object.assign(new Error('This meeting location has no safe arrival point.'),{statusCode:409});
 }
 resolve(environment,previous,next,actors={},objects={},{earthworks}={}){
  const hasWorld=Boolean(environment.builderScene||environment.proceduralLand||environment.modelUrl||environment.modelUrls?.length);
  const world=hasWorld?this.world(environment):null,placed=this.placedObjects(objects),deployedWorld=this.placedWorld(actors,{},environment),earth=constructionGroundWorld(earthworks);
  if(!world&&!placed.floors.length)return next;
  const padding=PLAYER_RADIUS+.002,minX=Math.min(previous.x,next.x)-padding,maxX=Math.max(previous.x,next.x)+padding,minZ=Math.min(previous.z,next.z)-padding,maxZ=Math.max(previous.z,next.z)+padding;
  // A wall slide can reach outside the original input rectangle.
  const floorReach=Math.hypot(next.x-previous.x,next.z-previous.z)+PLAYER_RADIUS+.01,area=[previous.x-floorReach,previous.x+floorReach,previous.z-floorReach,previous.z+floorReach];
  const meshes=[...(world?(world.floorIndex?queryCollisionMeshes(world.floorIndex,...area):nearCollisionMeshes(world.floors,...area)):[]).filter(mesh=>!actorDisablesCollision(actors[builderObjectId(mesh)])),...nearCollisionMeshes(placed.floors,...area),...deployedWorld.nearbyMeshes(...area),...(earth?.nearbyMeshes(...area)||[])];
  const supportMeshes=meshes.filter(mesh=>!/ROOF|CEILING|CANOPY|AWNING|TARGET/i.test(mesh.name));
  const moving=Math.hypot(next.x-previous.x,next.z-previous.z)>1e-7,descending=next.y<=previous.y+.01;
  const floorAt=(point,maxRise=moving&&descending?MAX_STEP_HEIGHT:.025)=>{
   const startY=Math.max(previous.y,next.y)+maxRise-FLOOR_GAP;
   let blockedStep=false;
   const sample=(dx=0,dz=0)=>{
    const hits=new THREE.Raycaster(new THREE.Vector3(point.x+dx,startY,point.z+dz),new THREE.Vector3(0,-1,0),0,Math.max(2,startY-Math.min(world?.bounds.min.y??-100,earth?.bounds.min.y??Infinity)+2)).intersectObjects(supportMeshes,false);
    const hit=hits.find(hit=>{
     if(!(placementHitNormal(THREE,hit)?.y>.55))return false;
     const blocked=new THREE.Raycaster(hit.point.clone().add(new THREE.Vector3(0,.08,0)),new THREE.Vector3(0,1,0),0,PLAYER_HEIGHT).intersectObjects(meshes,false).length>0;
     if(blocked&&hit.point.y+FLOOR_GAP>previous.y+.04)blockedStep=true;
     return !blocked;
    });
    return hit?{x:point.x,y:hit.point.y+FLOOR_GAP,z:point.z}:null;
   };
   let floor=sample();
   // Float32 top faces can leave sub-millimetre cracks at shared boundaries.
   // Probe only when the centre loses nearby support. Real gaps wider than
   // the numerical tolerance remain gaps.
   if(!floor||floor.y<previous.y-.04){
    for(const [dx,dz]of [[1e-4,0],[-1e-4,0],[0,1e-4],[0,-1e-4]]){
     const candidate=sample(dx,dz);
     if(candidate&&(!floor||candidate.y>floor.y))floor=candidate;
    }
   }
   // Match browser containment beneath missing triangles without relocating x/z.
   const bounds=world?.bounds;
   if(!floor&&!earthworksSurfaceAt(earthworks,point)&&bounds&&!bounds.isEmpty()&&point.x>=bounds.min.x&&point.x<=bounds.max.x&&point.z>=bounds.min.z&&point.z<=bounds.max.z&&bounds.min.y+FLOOR_GAP<=previous.y+maxRise)floor={x:point.x,y:bounds.min.y+FLOOR_GAP,z:point.z};
   return floor?{...floor,blockedStep}:blockedStep?{blockedStep:true}:null;
  };
  // Low risers are traversable only from a grounded, intentional walk. Their
  // edges must not lift the capsule before its center has reached the top.
  // At a stair seam the taller tread can share the same x/z as the old one.
  // Check existing support near the feet before looking for the next step.
  const previousFloor=floorAt(previous,.025),canStep=moving&&descending&&previousFloor&&Math.abs(previous.y-previousFloor.y)<=.04;
  const top=Math.max(previous.y,next.y)+PLAYER_HEIGHT-.025;
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
  const nearby=[...nearbyWalls(world,minX,maxX,minZ,maxZ),...placed.triangles,...deployedWorld.nearbyTriangles(minX,maxX,minZ,maxZ),...(earth?.triangles||[]).filter(t=>t.maxX>=minX&&t.minX<=maxX&&t.maxZ>=minZ&&t.minZ<=maxZ)];
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
