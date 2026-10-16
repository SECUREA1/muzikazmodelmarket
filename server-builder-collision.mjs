import {PLAYER_FLOOR_CLEARANCE} from './public/js/player-floor.js';
import {builderBaseEnvironment,applyBuilderBaseTransform} from './public/js/environments/builder-base.js';
import {drawingCollisionModel} from './public/js/placed-item-collision.js';
import {placedCollisionWorld,disposePlacedCollision} from './server-placed-collision.mjs';
import {resolvePlacedSolids} from './public/js/placed-item-collision.js';
import {environmentGeometry} from './server-glb-geometry.mjs';
import {buildingDimensions} from './public/js/building-materials.js';
import * as THREE from './public/vendor/three/three.module.min.js';
import {createBuilderLand} from './public/js/environments/builder-land.js';
import {createBuilderModel} from './public/js/builder-models-3d.js';
// Server and browser use the same procedural meshes. Collision results never
// depend on a client-provided floor height, hit point or claimed position.
export class ServerBuilderCollision {
 constructor(){this.cache=new Map();}
 world(environment){
  const key=environment.id+':'+(environment.updatedAt||'');if(this.cache.has(key))return this.cache.get(key);
  const definitions=new Map([...(environment.builderScene?.catalogModels||[]),...(environment.builderScene?.placedModels||[]),...(environment.builderScene?.customModels||[])].map(model=>[model.id,model]));
  const base=builderBaseEnvironment(environment);const glb=Boolean(base)||!environment.builderScene&&!environment.proceduralLand&&Boolean(environment.modelUrl||environment.modelUrls?.length);const root=glb?new THREE.Group():createBuilderLand(environment),walls=[];if(glb){const layer=environmentGeometry(base||environment);if(base)applyBuilderBaseTransform(layer,environment.builderScene.baseTransform);root.add(layer);}
  for(const item of environment.builderScene?.objects||[]){if(['hostile','patrol'].includes(item.functionalSettings?.behavior))continue;let object;try{const definition=definitions.get(item.modelId);object=createBuilderModel(item.asset?.buildAssetId||definition?.buildAssetId||item.modelId);if(!object&&definition?.renderKind==='image'){object=new THREE.Group();object.add(drawingCollisionModel(THREE,definition.configuration));}if(!object&&definition?.modelUrl){object=environmentGeometry({modelUrl:definition.modelUrl});const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3());if(definition.targetHeight&&size.y)object.scale.multiplyScalar(definition.targetHeight/size.y);object.updateMatrixWorld(true);object.position.y-=new THREE.Box3().setFromObject(object).min.y;}}catch{}if(!object)continue;object.position.set(Number(item.position?.x)||0,Number(item.position?.y)||0,Number(item.position?.z)||0);object.rotation.set(Number(item.rotation?.x)||0,Number(item.rotation?.y)||0,Number(item.rotation?.z)||0);object.scale.set(Number(item.scale?.x)||1,Number(item.scale?.y)||1,Number(item.scale?.z)||1);object.userData.builderObjectId=item.id;root.add(object);}
  root.updateMatrixWorld(true);const floors=[];
  root.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.streetVisual||/SKY|PARTICLE|VFX|WATER|HELPER/i.test(mesh.name))return;floors.push(mesh);if(!glb&&!mesh.userData.streetVisual&&!mesh.name.startsWith('BUILDER_WALKABLE_FLOOR')){let parent=mesh;while(parent&&!parent.userData.builderObjectId)parent=parent.parent;walls.push({box:new THREE.Box3().setFromObject(mesh),objectId:parent?.userData.builderObjectId});}});
  const world={root,walls,floors,glb,bounds:new THREE.Box3().setFromObject(root)};this.cache.set(key,world);if(this.cache.size>20){const [oldKey,old]=this.cache.entries().next().value;old.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});this.cache.delete(oldKey);}return world;
 }
 placedWorld(actors={},objects={}){
  const key=JSON.stringify([Object.values(objects).map(object=>[object.id,object.revision,object.deleted,object.open,object.position,object.rotation,object.scale]),Object.values(actors).filter(actor=>actor.spawned&&actor.active!==false&&!actor.holderId&&!actor.loot).map(actor=>[actor.id,actor.asset?.id,actor.asset?.buildAssetId,actor.placementRevision,actor.active,actor.holderId,actor.position,actor.rotation,actor.scale])]);
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
 groundAt(environment,point,{entry=false,actors,objects}={}){
  const world=this.world(environment),bounds=world.bounds;
  const dynamic=actors||objects?this.placedWorld(actors,objects).meshes:[];
  const meshes=[...world.floors,...dynamic].filter(mesh=>!/ROOF|CEILING|CANOPY|AWNING/i.test(mesh.name));
  const startY=entry?bounds.max.y+2:point.y+.4;
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
 safeSpawn(environment,point){
  if(!builderBaseEnvironment(environment)&&(environment.builderScene||environment.proceduralLand))return this.meetingPosition(environment,point);
  if(!builderBaseEnvironment(environment)&&!environment.modelUrl&&!environment.modelUrls?.length)return point;
  const world=this.world(environment),bounds=world.bounds,center=bounds.getCenter(new THREE.Vector3());
  const named=world.root.getObjectByName('SPAWN_PLAYER')||world.root.getObjectByName('SPAWN_DEFAULT');
  const anchor=named?named.getWorldPosition(new THREE.Vector3()):point;
  const candidates=[anchor,{x:center.x,y:point.y,z:center.z}];for(let r=1;r<=6;r++)for(let i=0;i<8;i++)candidates.push({x:anchor.x+Math.cos(i*Math.PI/4)*r,y:anchor.y,z:anchor.z+Math.sin(i*Math.PI/4)*r});
  for(const candidate of candidates){const floor=this.groundAt(environment,candidate,{entry:true});if(floor)return floor;}
  throw Object.assign(Error('This map has no safe ground-floor entry.'),{statusCode:409});
 }
 encounterSpawn(environment,point,center,occupied=[]) {
  if(!builderBaseEnvironment(environment)&&!environment.modelUrl&&!environment.modelUrls?.length)return point;
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
  if(builderBaseEnvironment(environment)||!environment.builderScene&&!environment.proceduralLand)return this.safeSpawn(environment,point);
  const world=this.world(environment),terrain=world.floors.filter(mesh=>mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'));
  const edge=Math.max(40,Math.min(512,Number(environment.builderScene?.mapSize)||40))/2-1;
  for(let radius=0;radius<=12;radius+=2)for(let step=0;step<(radius?8:1);step++){const x=Math.max(-edge,Math.min(edge,point.x+Math.cos(step*Math.PI/4)*radius)),z=Math.max(-edge,Math.min(edge,point.z+Math.sin(step*Math.PI/4)*radius));const hit=new THREE.Raycaster(new THREE.Vector3(x,1000,z),new THREE.Vector3(0,-1,0)).intersectObjects(terrain,false)[0];if(!hit)continue;const y=hit.point.y;const dynamic=Object.values(objects).filter(object=>!object.deleted&&!object.open).map(object=>{const size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]);return {box:new THREE.Box3(new THREE.Vector3(...object.position.map((n,i)=>n-size[i]/2)),new THREE.Vector3(...object.position.map((n,i)=>n+size[i]/2)))};});const blocked=[...world.walls,...dynamic].some(({box,objectId})=>{const actor=objectId&&actors[objectId];return !(actor&&(actor.open||!actor.active))&&x>box.min.x-.35&&x<box.max.x+.35&&z>box.min.z-.35&&z<box.max.z+.35&&y<box.max.y-.05&&y+1.8>box.min.y;});if(!blocked)return {x,y:y+PLAYER_FLOOR_CLEARANCE,z};}
  throw Object.assign(new Error('This meeting location has no safe arrival point.'),{statusCode:409});
 }
 resolve(environment,previous,next,actors){
  if(builderBaseEnvironment(environment)||!environment.builderScene&&!environment.proceduralLand){
   if(!builderBaseEnvironment(environment)&&!environment.modelUrl&&!environment.modelUrls?.length)return next;
   if(Math.abs(next.x-previous.x)+Math.abs(next.y-previous.y)+Math.abs(next.z-previous.z)<1e-7)return next;
   const world=this.world(environment),delta=new THREE.Vector3(next.x-previous.x,0,next.z-previous.z),length=delta.length();
   if(length>.0001){const hits=new THREE.Raycaster(new THREE.Vector3(previous.x,previous.y+.85,previous.z),delta.normalize(),0,length+.32).intersectObjects(world.floors,false);if(hits.some(hit=>Math.abs(hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y||0)<.55))return {...previous,y:next.y};}
   const floor=this.groundAt(environment,{x:next.x,y:Math.max(previous.y,next.y),z:next.z});
   if(!floor)return {...previous,y:Math.max(previous.y,next.y)};
   if(next.y<=floor.y+.35&&next.y<=previous.y+.01)return {...next,y:floor.y,floorY:floor.y};return {...next,floorY:floor.y};
  }
  const {walls,floors}=this.world(environment),ray=new THREE.Raycaster(new THREE.Vector3(next.x,Math.max(previous.y,next.y)+.36,next.z),new THREE.Vector3(0,-1,0),0,100);
  const floor=ray.intersectObjects(floors,false).find(hit=>!hit.object.name.includes('TARGET')&&hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y>.5);
  if(floor&&next.y<floor.point.y+PLAYER_FLOOR_CLEARANCE)next={...next,y:floor.point.y+PLAYER_FLOOR_CLEARANCE};
  for(const {box,objectId}of walls){const actor=objectId&&actors[objectId];if(actor&&(actor.open||!actor.active||actor.holderId))continue;if(next.x>box.min.x-.3&&next.x<box.max.x+.3&&next.z>box.min.z-.3&&next.z<box.max.z+.3&&next.y<box.max.y-.03&&next.y+1.7>box.min.y+.03){if(box.max.y-previous.y<=.35)next.y=Math.max(next.y,box.max.y);else return {...previous,y:next.y};}}
  const edge=Math.max(40,Math.min(512,Number(environment.builderScene?.mapSize)||40))/2-.5;
  if(!floor&&(Math.abs(next.x)>edge||Math.abs(next.z)>edge))return previous;
  return {...next,floorY:floor?floor.point.y+PLAYER_FLOOR_CLEARANCE:-100};
 }
}
