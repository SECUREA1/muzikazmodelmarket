// Rebind animated rig references to cloned meshes instead of JSON copies.
export function cloneBuilderRuntime(source,clone=object=>object.clone(true)){
 const original=[],copies=[],rigs=[];source.traverse(node=>original.push(node));
 for(const node of original){const keys=['boatRig','fishingRig','tip','aircraftRig','constructionParts','residentMaterials','residentParts','residentLimbs','residentProp','fitnessEquipment','builderRoot'].filter(key=>node.userData[key]);if(!keys.length)continue;rigs.push({node,data:node.userData,keys});node.userData={...node.userData};for(const key of keys)delete node.userData[key];}
 let root;try{root=clone(source);}finally{for(const {node,data}of rigs)node.userData=data;}
 root.traverse(node=>copies.push(node));const nodes=new Map(original.map((node,index)=>[node,copies[index]]));
 // Object3D.clone copies a SkinnedMesh's Skeleton reference. Each placement
 // needs its own bone palette, while immutable geometry remains shareable.
 const skeletons=new Map();
 for(const node of original)if(node.isSkinnedMesh&&node.skeleton){
  if(!skeletons.has(node.skeleton)){const skeleton=node.skeleton.clone();skeleton.bones=node.skeleton.bones.map(bone=>nodes.get(bone)||bone);skeletons.set(node.skeleton,skeleton);}
  nodes.get(node).skeleton=skeletons.get(node.skeleton);
 }
 const rebind=value=>{
  if(value?.isObject3D)return nodes.get(value);
  if(Array.isArray(value))return value.map(rebind);
  // Rig descriptors are plain records. Materials, textures, vectors and browser
  // resources keep their native prototypes rather than becoming JSON-shaped data.
  if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value)))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rebind(item)]));
  return value;
 };
 for(const {node,data,keys}of rigs)for(const key of keys)nodes.get(node).userData[key]=rebind(data[key]);
 // Authored item effects own their shader clocks and material pulses. Sharing
 // these between editor copies would make one item's speed affect its siblings.
 if(original.some(node=>node.userData.nativeDesign||node.userData.nativeSurfaceFinish||node.userData.portalModel||node.userData.commonPropModel||node.userData.equipmentPropModel||node.userData.craftedLandscapeModel||node.userData.craftedCharacterModel||node.userData.residentModel||node.userData.craftedBuildingModel||node.userData.craftedFurnitureModel)){
  const materials=new Map(),copyMaterial=material=>{if(!materials.has(material))materials.set(material,material.clone());return materials.get(material);};
  root.traverse(node=>{if(node.isMesh&&node.material)node.material=Array.isArray(node.material)?node.material.map(copyMaterial):copyMaterial(node.material);});
  const visited=new WeakSet(),bind=value=>{
   if(value?.isMaterial)return materials.get(value)||value;
   if(!value||typeof value!=='object'||value.isObject3D||Object.isFrozen(value)||![Object.prototype,Array.prototype,null].includes(Object.getPrototypeOf(value))||visited.has(value))return value;
   visited.add(value);for(const key of Object.keys(value))value[key]=bind(value[key]);return value;
  };
  root.traverse(node=>bind(node.userData));
 }
 return root;
}
