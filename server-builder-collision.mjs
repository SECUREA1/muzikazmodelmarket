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
  const root=createBuilderLand(environment),walls=[];
  for(const item of environment.builderScene?.objects||[]){let object;try{object=createBuilderModel(item.asset?.buildAssetId||item.modelId);}catch{}if(!object)continue;object.position.set(Number(item.position?.x)||0,Number(item.position?.y)||0,Number(item.position?.z)||0);object.rotation.set(Number(item.rotation?.x)||0,Number(item.rotation?.y)||0,Number(item.rotation?.z)||0);object.scale.set(Number(item.scale?.x)||1,Number(item.scale?.y)||1,Number(item.scale?.z)||1);object.userData.builderObjectId=item.id;root.add(object);}
  root.updateMatrixWorld(true);const floors=[];
  root.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.streetVisual)return;floors.push(mesh);if(!mesh.userData.streetVisual&&!mesh.name.startsWith('BUILDER_WALKABLE_FLOOR')){let parent=mesh;while(parent&&!parent.userData.builderObjectId)parent=parent.parent;walls.push({box:new THREE.Box3().setFromObject(mesh),objectId:parent?.userData.builderObjectId});}});
  const world={root,walls,floors};this.cache.set(key,world);if(this.cache.size>20){const [oldKey,old]=this.cache.entries().next().value;old.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});this.cache.delete(oldKey);}return world;
 }
 meetingPosition(environment,point,actors={},objects={}){
  const world=this.world(environment),terrain=world.floors.filter(mesh=>mesh.name.startsWith('BUILDER_WALKABLE_FLOOR'));
  const edge=Math.max(40,Math.min(512,Number(environment.builderScene?.mapSize)||40))/2-1;
  for(let radius=0;radius<=12;radius+=2)for(let step=0;step<(radius?8:1);step++){const x=Math.max(-edge,Math.min(edge,point.x+Math.cos(step*Math.PI/4)*radius)),z=Math.max(-edge,Math.min(edge,point.z+Math.sin(step*Math.PI/4)*radius));const hit=new THREE.Raycaster(new THREE.Vector3(x,1000,z),new THREE.Vector3(0,-1,0)).intersectObjects(terrain,false)[0];if(!hit)continue;const y=hit.point.y;const dynamic=Object.values(objects).filter(object=>!object.deleted&&!object.open).map(object=>{const size=buildingDimensions(object.materialId).map((n,i)=>n*object.scale[i]);return {box:new THREE.Box3(new THREE.Vector3(...object.position.map((n,i)=>n-size[i]/2)),new THREE.Vector3(...object.position.map((n,i)=>n+size[i]/2)))};});const blocked=[...world.walls,...dynamic].some(({box,objectId})=>{const actor=objectId&&actors[objectId];return !(actor&&(actor.open||!actor.active))&&x>box.min.x-.35&&x<box.max.x+.35&&z>box.min.z-.35&&z<box.max.z+.35&&y<box.max.y-.05&&y+1.8>box.min.y;});if(!blocked)return {x,y,z};}
  throw Object.assign(new Error('This meeting location has no safe arrival point.'),{statusCode:409});
 }
 resolve(environment,previous,next,actors){
  if(!environment.builderScene&&!environment.proceduralLand)return next;
  const {walls,floors}=this.world(environment),ray=new THREE.Raycaster(new THREE.Vector3(next.x,Math.max(previous.y,next.y)+.36,next.z),new THREE.Vector3(0,-1,0),0,100);
  const floor=ray.intersectObjects(floors,false).find(hit=>!hit.object.name.includes('TARGET')&&hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y>.5);
  if(floor&&next.y<floor.point.y)next={...next,y:floor.point.y};
  for(const {box,objectId}of walls){const actor=objectId&&actors[objectId];if(actor&&(actor.open||!actor.active||actor.holderId))continue;if(next.x>box.min.x-.3&&next.x<box.max.x+.3&&next.z>box.min.z-.3&&next.z<box.max.z+.3&&next.y<box.max.y-.03&&next.y+1.7>box.min.y+.03){if(box.max.y-previous.y<=.35)next.y=Math.max(next.y,box.max.y);else return {...previous,y:next.y};}}
  const edge=Math.max(40,Math.min(512,Number(environment.builderScene?.mapSize)||40))/2-.5;
  if(!floor&&(Math.abs(next.x)>edge||Math.abs(next.z)>edge))return previous;
  return next;
 }
}
