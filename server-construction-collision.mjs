import * as THREE from './public/vendor/three/three.module.min.js';
import {constructionColliders,constructionBoxFromBounds,constructionColliderBounds,constructionMotionBlocked} from './public/js/construction-collision.js';
import {isConstructionMachine} from './public/js/construction-state.js';

export function syncConstructionCollision(previous,actors={}){
 const physical=Object.values(actors).filter(actor=>actor.active!==false&&(isConstructionMachine(actor)||actor.constructionManaged)),signature=JSON.stringify(physical.map(actor=>[actor.id,actor.position,actor.rotation,actor.scale,actor.construction&&['slew','trolley','hoist','boom','stick','bucket','swing','blade','bed','load','loadYaw'].map(key=>actor.construction[key]),actor.constructionBeam,actor.constructionStructure]));
 if(previous?.signature===signature)return previous;
 const world=previous||{root:new THREE.Group(),meshes:[],boxes:[],geometry:new THREE.BoxGeometry(1,1,1),material:new THREE.MeshBasicMaterial({side:THREE.DoubleSide})};
 world.root.name='CONSTRUCTION_COLLISION';world.signature=signature;world.boxes=[];const descriptors=physical.flatMap(constructionColliders);
 for(let index=0;index<descriptors.length;index++){
  const descriptor=descriptors[index],mesh=world.meshes[index]||new THREE.Mesh(world.geometry,world.material);mesh.name=descriptor.part;mesh.userData.builderObjectId=descriptor.objectId;mesh.userData.constructionCollider=true;mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(descriptor.matrix).multiply(new THREE.Matrix4().makeScale(descriptor.size.x,descriptor.size.y,descriptor.size.z));mesh.matrixWorld.copy(mesh.matrix);world.root.add(mesh);world.meshes[index]=mesh;
  const bounds=constructionColliderBounds(descriptor),box=new THREE.Box3(new THREE.Vector3(bounds.min.x,bounds.min.y,bounds.min.z),new THREE.Vector3(bounds.max.x,bounds.max.y,bounds.max.z));box.objectId=descriptor.objectId;box.part=descriptor.part;world.boxes.push(box);
 }
 for(const old of world.meshes.slice(descriptors.length))old.removeFromParent();world.meshes.length=descriptors.length;world.descriptors=descriptors;return world;
}
const staticCache=new WeakMap();
export function constructionObstacles(sim,{collision,environment,objects={}}={}){
 let obstacles=[];
 if(collision&&environment){
  const world=collision.world(environment);let cached=staticCache.get(world);
  if(!cached){cached=world.walls.map(({box,objectId})=>constructionBoxFromBounds(box,objectId));staticCache.set(world,cached);}
  obstacles.push(...cached.filter(box=>{const actor=sim.actors[box.objectId];return !actor||actor.active!==false&&!actor.open&&!isConstructionMachine(actor)&&!actor.constructionManaged;}));
  if(world.glb){for(const mesh of world.floors){const bounds=new THREE.Box3().setFromObject(mesh);obstacles.push(constructionBoxFromBounds(bounds,null,'world-geometry'));}}
  const placed=collision.placedWorld(sim.actors,objects);for(const box of placed.boxes)if(!isConstructionMachine(sim.actors[box.objectId])&&!sim.actors[box.objectId]?.constructionManaged)obstacles.push(constructionBoxFromBounds(box,box.objectId,'placed-solid'));
 }
 obstacles.push(...Object.values(sim.actors).filter(actor=>actor.active!==false).flatMap(constructionColliders));
 // Other operators are protected by their upright walking capsule envelope.
 for(const player of Object.values(sim.players||{}))if(player.health>0&&!player.vehicleId&&!player.replacedByRoom)obstacles.push(constructionBoxFromBounds({min:{x:player.position.x-.3,y:player.position.y,z:player.position.z-.3},max:{x:player.position.x+.3,y:player.position.y+1.7,z:player.position.z+.3}},player.actorId,'site-worker'));
 return obstacles;
}
export function constructionMovementBlocked(sim,actor,next,context={}){return constructionMotionBlocked(actor,next,constructionObstacles(sim,context));}
