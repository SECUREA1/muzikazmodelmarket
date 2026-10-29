import {createTrafficCollisionProxy} from './public/js/traffic-collision-proxy.js';
import * as THREE from './public/vendor/three/three.module.min.js';
import {isAircraft} from './public/js/aircraft-flight.js';
import {isWatercraft} from './public/js/harbor-water.js';
// NPC craft have no walkable interiors. Keep reusable hull proxies rather than
// rebuilding every native model whenever an AI moves a few centimeters.
export function syncTrafficCollision(cache,actors){
 cache||={root:new THREE.Group(),entries:new Map()};const keep=new Set(),boxes=[],meshes=[];
 const physical=Object.values(actors).filter(actor=>actor.trafficAI&&actor.active!==false&&(isAircraft(actor)||isWatercraft(actor)));
 const signature=JSON.stringify(physical.map(actor=>[actor.id,actor.modelId||actor.asset?.buildAssetId,actor.position,actor.rotation,actor.scale]));
 if(cache.signature===signature)return cache;
 for(const actor of physical){keep.add(actor.id);let entry=cache.entries.get(actor.id);const modelId=actor.modelId||actor.asset?.buildAssetId;
  if(entry&&entry.modelId!==modelId){dispose(entry.root);cache.entries.delete(actor.id);entry=null;}
  if(!entry){const root=createTrafficCollisionProxy(THREE,actor);entry={root,modelId};cache.entries.set(actor.id,entry);cache.root.add(root);}
  entry.root.position.copy(actor.position);entry.root.rotation.set(actor.rotation?.x||0,actor.rotation?.y||0,actor.rotation?.z||0,'YXZ');entry.root.scale.set(actor.scale?.x||1,actor.scale?.y||1,actor.scale?.z||1);entry.root.updateMatrixWorld(true);
  for(const mesh of entry.root.children){const box=new THREE.Box3().setFromObject(mesh);box.objectId=actor.id;boxes.push(box);meshes.push(mesh);}
 }
 for(const [id,entry]of cache.entries)if(!keep.has(id)){dispose(entry.root);cache.entries.delete(id);}
 return Object.assign(cache,{boxes,meshes,signature});
}
function dispose(root){root.removeFromParent();root.traverse(mesh=>{mesh.geometry?.dispose();mesh.material?.dispose();});}
