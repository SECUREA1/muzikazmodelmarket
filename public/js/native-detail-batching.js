import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';

export const NATIVE_DETAIL_BATCH_VERSION='native-detail-batches-v1';

// These flags describe static cosmetic ownership. Any other state can belong to
// an animator or live controller and makes the leaf ineligible for batching.
const passiveFlags=new Set(['nativeDesignDetail','vehicleDesignDetail','transportDesignDetail','collisionDisabled','collider','builderRoot']);

function referencedNodes(nodes){
 const references=new Set(),visited=new WeakSet();
 const inspect=value=>{
  if(value?.isObject3D){references.add(value);return;}
  if(!value||typeof value!=='object'||visited.has(value)||![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value)))return;
  visited.add(value);for(const item of Object.values(value))inspect(item);
 };
 for(const node of nodes)inspect(node.userData);
 return references;
}

function attributeSignature(geometry){
 return (geometry.index?'indexed:':'flat:')+Object.keys(geometry.attributes).sort().map(name=>{
  const attribute=geometry.attributes[name];
  return [name,attribute.itemSize,attribute.normalized,attribute.array.constructor.name].join(':');
 }).join('|');
}

function eligible(T,node,references){
 if(!node.isMesh||node.isInstancedMesh||node.isSkinnedMesh||node.children.length||!node.visible||references.has(node))return false;
 const flags=node.userData;
 // Vehicle bodywork contains named headlamps, treads, brakes and fitted livery
 // that inspection and gameplay code can address individually. Keep those
 // authored vehicle leaves available even when their materials are shared.
 if(flags.nativeDesignDetail!==true||flags.nativeDetailBatch||flags.vehicleDesignDetail||flags.collisionDisabled!==true||flags.collider===true||Object.keys(flags).some(key=>!passiveFlags.has(key)))return false;
 const material=node.material,geometry=node.geometry;
 if(!material||Array.isArray(material)||material.transparent||material.opacity<1||material.blending!==T.NormalBlending)return false;
 if(!geometry?.isBufferGeometry||!geometry.attributes.position||geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity||Object.keys(geometry.morphAttributes).length)return false;
 if(Object.values(geometry.attributes).some(attribute=>attribute.isInterleavedBufferAttribute||attribute.isInstancedBufferAttribute))return false;
 if(node.customDepthMaterial||node.customDistanceMaterial)return false;
 for(const key of ['onBeforeRender','onAfterRender','onBeforeShadow','onAfterShadow'])if(node[key]!==T.Object3D.prototype[key])return false;
 if(node.matrixAutoUpdate)node.updateMatrix();
 // Baking a reflected transform also requires reversing winding. Retain those
 // rare meshes intact, along with zero-scale and invalid authored transforms.
 return node.matrix.elements.every(Number.isFinite)&&node.matrix.determinant()>1e-12;
}

/** Merge static opaque cosmetic siblings without crossing their live rig parent. */
export function batchNativeDesignDetails(T,root){
 if(!root)return root;
 const nodes=[];root.traverse(node=>nodes.push(node));const references=referencedNodes(nodes);
 let batches=0,detailsMerged=0,drawCallsSaved=0;
 for(const parent of nodes){
  if(parent.children.length<2)continue;
  const materials=new Map();
  for(const node of parent.children){
   if(!eligible(T,node,references))continue;
   if(!materials.has(node.material))materials.set(node.material,new Map());
   const groups=materials.get(node.material),key=[attributeSignature(node.geometry),node.castShadow,node.receiveShadow,node.frustumCulled,node.renderOrder,node.layers.mask].join(';');
   if(!groups.has(key))groups.set(key,[]);groups.get(key).push(node);
  }
  for(const groups of materials.values())for(const sources of groups.values()){
   if(sources.length<2)continue;
   const geometries=sources.map(node=>{const geometry=node.geometry.clone();geometry.applyMatrix4(node.matrix);geometry.clearGroups();return geometry;});
   let geometry;
   try{geometry=mergeGeometries(geometries,false);}finally{for(const part of geometries)part.dispose();}
   if(!geometry)continue;
   geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.name='NATIVE_MERGED_COSMETIC_DETAILS';
   const first=sources[0],batch=new T.Mesh(geometry,first.material),count=sources.reduce((sum,node)=>sum+(node.userData.nativeDesignDetailCount||1),0);
   batch.name=first.name;batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.frustumCulled=first.frustumCulled;batch.renderOrder=first.renderOrder;batch.layers.mask=first.layers.mask;
   batch.userData={nativeDesignDetail:true,collisionDisabled:true,collider:false,builderRoot:first.userData.builderRoot||root,nativeDetailBatch:NATIVE_DETAIL_BATCH_VERSION,nativeDesignDetailCount:count,nativeDetailSourceNames:sources.map(node=>node.name)};
   if(sources.every(node=>node.userData.vehicleDesignDetail===true))batch.userData.vehicleDesignDetail=true;
   if(sources.every(node=>node.userData.transportDesignDetail===true))batch.userData.transportDesignDetail=true;
   // Only newly allocated transformed copies are disposed above. Source
   // geometries can also belong to another authored mesh or cached template.
   for(const source of sources)parent.remove(source);
   parent.add(batch);batches++;detailsMerged+=count;drawCallsSaved+=sources.length-1;
  }
 }
 if(batches){const previous=root.userData.nativeDetailBatching;root.userData.nativeDetailBatching={version:NATIVE_DETAIL_BATCH_VERSION,batches:(previous?.batches||0)+batches,detailsMerged:(previous?.detailsMerged||0)+detailsMerged,drawCallsSaved:(previous?.drawCallsSaved||0)+drawCallsSaved};}
 return root;
}
