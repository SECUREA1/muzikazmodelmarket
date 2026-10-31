import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import {bevelledBoxGeometry} from './game-item-finish.js';

export const FORGE_MODEL_QUALITY_VERSION='forge-crafted-3d-v2';

/** Flat planes meet small, explicit bevels; no normal smoothing across an edge. */
export function forgeBoxGeometry(T,size){
 const minimum=Math.min(...size),radius=Math.min(.025,minimum*.15);
 return minimum>.018?bevelledBoxGeometry(T,...size,radius):new T.BoxGeometry(...size);
}

const live=node=>node.userData.forgeAnimated||node.userData.forgeArm||node.userData.forgeLeg||node.userData.forgeBellSwing||node.userData.forgeGrindingWheel||node.userData.forgeLanternFlame;
const protectedName=/WORKPIECE|WATER|DIAL_NEEDLE|MOVING_BOARD|GOGGLE|SMITH_(?:EYE|HEAD|MOUTH|NOSE|BROW)|FLAME/;

/** Batch static surfaces by material and collision role. Named live pieces stay
 * addressable and each animation keeps its own pivot and original transform. */
export function batchForgeStaticMeshes(T,root){
 const parents=[];root.traverse(node=>{if(node.children.length&&!live(node))parents.push(node);});
 let saved=0,batches=0;
 for(const parent of parents){
  const materials=new Map();
  for(const node of parent.children){
   if(!node.isMesh||node.isInstancedMesh||node.children.length||live(node)||protectedName.test(node.name)||Array.isArray(node.material)||node.material.transparent)continue;
   const key=node.userData.collisionDisabled===true?'detail':'solid';
   if(!materials.has(node.material))materials.set(node.material,new Map());
   const roles=materials.get(node.material);if(!roles.has(key))roles.set(key,[]);roles.get(key).push(node);
  }
  for(const roles of materials.values())for(const [role,nodes]of roles){
   if(nodes.length<2)continue;
   const parts=nodes.map(node=>{node.updateMatrix();const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(node.matrix);geometry.clearGroups();return geometry;});
   const geometry=mergeGeometries(parts,false);for(const part of parts)part.dispose();
   if(!geometry)continue;
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const mesh=new T.Mesh(geometry,nodes[0].material);mesh.name='FORGE_CRAFTED_'+(nodes[0].material.name||'SURFACE')+'_'+role.toUpperCase();
   mesh.castShadow=role==='solid';mesh.receiveShadow=true;mesh.userData={collisionDisabled:role==='detail',forgeStaticBatch:true,forgeSourceParts:nodes.map(node=>node.name)};
   parent.add(mesh);for(const node of nodes){node.removeFromParent();node.geometry.dispose();}saved+=nodes.length-1;batches++;
  }
 }
 root.userData.forgeModelQuality={version:FORGE_MODEL_QUALITY_VERSION,staticBatches:batches,drawCallsSaved:saved};
 return root;
}
