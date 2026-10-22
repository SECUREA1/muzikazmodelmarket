import * as THREE from './public/vendor/three/three.module.min.js';
import {isAircraft} from './public/js/aircraft-flight.js';
import {isWatercraft} from './public/js/harbor-water.js';
// NPC craft have no walkable interiors. Keep reusable hull proxies rather than
// rebuilding every native model whenever an AI moves a few centimeters.
export function syncTrafficCollision(cache,actors){
 cache||={root:new THREE.Group(),entries:new Map()};const keep=new Set(),boxes=[],meshes=[];
 for(const actor of Object.values(actors)){if(!actor.trafficAI||actor.active===false||(!isAircraft(actor)&&!isWatercraft(actor)))continue;keep.add(actor.id);let entry=cache.entries.get(actor.id);
  if(entry&&entry.modelId!==actor.modelId){dispose(entry.root);cache.entries.delete(actor.id);entry=null;}
  if(!entry){const root=new THREE.Group();root.userData.builderObjectId=actor.id;const parts=isAircraft(actor)?[[1.6,2.7,7.6,0,.95,0],[10.5,.8,2.5,0,.5,-.45],[4.2,.9,1.6,0,.95,3.3]]:actor.modelId==='harbor-yacht'?[[12,5,42,0,2.5,0]]:[[2,1.5,4.8,0,.5,0],...(actor.modelId==='harbor-sailboat'?[[.18,5.2,.18,0,2.6,.15]]:[])];
   for(const [w,h,d,x,y,z]of parts){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial());mesh.position.set(x,y,z);root.add(mesh);}entry={root,modelId:actor.modelId};cache.entries.set(actor.id,entry);cache.root.add(root);}
  entry.root.position.copy(actor.position);entry.root.rotation.set(actor.rotation?.x||0,actor.rotation?.y||0,actor.rotation?.z||0,'YXZ');entry.root.scale.set(actor.scale?.x||1,actor.scale?.y||1,actor.scale?.z||1);entry.root.updateMatrixWorld(true);
  for(const mesh of entry.root.children){const box=new THREE.Box3().setFromObject(mesh);box.objectId=actor.id;boxes.push(box);meshes.push(mesh);}
 }
 for(const [id,entry]of cache.entries)if(!keep.has(id)){dispose(entry.root);cache.entries.delete(id);}
 return Object.assign(cache,{boxes,meshes});
}
function dispose(root){root.removeFromParent();root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});}
