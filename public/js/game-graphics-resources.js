// Native and sports surface libraries outlive any single world or preview.
// Dispose model-owned GPU resources once, retaining those shared tile maps.
export const isSharedGraphicsTexture=texture=>Boolean(texture?.userData?.sportsSurfaceShared||texture?.userData?.nativeSurfaceShared||texture?.userData?.groundLandscapeShared);
export function disposeModelResources(root){
 const resources=new Set();
 root?.traverse(node=>{
  if(node.geometry)resources.add(node.geometry);
  if(node.skeleton)resources.add(node.skeleton);
  if(node.isInstancedMesh)resources.add(node);
  for(const material of [].concat(node.material||[])){
   resources.add(material);
   for(const value of Object.values(material))if(value?.isTexture&&!isSharedGraphicsTexture(value))resources.add(value);
  }
 });
 for(const resource of resources)resource.dispose?.();
}
