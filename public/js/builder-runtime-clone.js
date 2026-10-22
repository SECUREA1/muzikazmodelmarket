// Rebind animated rig references to cloned meshes instead of JSON copies.
export function cloneBuilderRuntime(source,clone=object=>object.clone(true)){
 const original=[],copies=[],rigs=[];source.traverse(node=>original.push(node));
 for(const node of original){const keys=['boatRig','aircraftRig','constructionParts','builderRoot'].filter(key=>node.userData[key]);if(!keys.length)continue;rigs.push({node,data:node.userData,keys});node.userData={...node.userData};for(const key of keys)delete node.userData[key];}
 let root;try{root=clone(source);}finally{for(const {node,data}of rigs)node.userData=data;}
 root.traverse(node=>copies.push(node));const nodes=new Map(original.map((node,index)=>[node,copies[index]]));
 const rebind=value=>{
  if(value?.isObject3D)return nodes.get(value);
  if(Array.isArray(value))return value.map(rebind);
  // Rig descriptors are plain records. Materials, textures, vectors and browser
  // resources keep their native prototypes rather than becoming JSON-shaped data.
  if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value)))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,rebind(item)]));
  return value;
 };
 for(const {node,data,keys}of rigs)for(const key of keys)nodes.get(node).userData[key]=rebind(data[key]);return root;
}
