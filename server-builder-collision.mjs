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
  root.traverse(mesh=>{if(!mesh.isMesh)return;floors.push(mesh);if(!mesh.name.startsWith('BUILDER_WALKABLE_FLOOR')){let parent=mesh;while(parent&&!parent.userData.builderObjectId)parent=parent.parent;walls.push({box:new THREE.Box3().setFromObject(mesh),objectId:parent?.userData.builderObjectId});}});
  const world={root,walls,floors};this.cache.set(key,world);if(this.cache.size>20){const [oldKey,old]=this.cache.entries().next().value;old.root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose?.();});this.cache.delete(oldKey);}return world;
 }
 resolve(environment,previous,next,actors){
  if(!environment.builderScene&&!environment.proceduralLand)return next;
  const {walls,floors}=this.world(environment),ray=new THREE.Raycaster(new THREE.Vector3(next.x,Math.max(previous.y,next.y)+.36,next.z),new THREE.Vector3(0,-1,0),0,100);
  const floor=ray.intersectObjects(floors,false).find(hit=>!hit.object.name.includes('TARGET')&&hit.face?.normal.clone().transformDirection(hit.object.matrixWorld).y>.5);
  if(floor&&next.y<floor.point.y)next={...next,y:floor.point.y};
  for(const {box,objectId}of walls){const actor=objectId&&actors[objectId];if(actor&&(actor.open||!actor.active||actor.holderId))continue;if(next.x>box.min.x-.3&&next.x<box.max.x+.3&&next.z>box.min.z-.3&&next.z<box.max.z+.3&&next.y<box.max.y-.03&&next.y+1.7>box.min.y+.03){if(box.max.y-previous.y<=.35)next.y=Math.max(next.y,box.max.y);else return {...previous,y:next.y};}}
  if(!floor&&Math.abs(next.x)>19.5||!floor&&Math.abs(next.z)>19.5)return previous;
  return next;
 }
}
