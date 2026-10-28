// Native and sports surface libraries outlive any single world or preview.
// Dispose model-owned GPU resources once, retaining those shared tile maps.
export function disposeModelResources(root){
 const resources=new Set();
 root?.traverse(node=>{
  if(node.geometry)resources.add(node.geometry);
  for(const material of [].concat(node.material||[])){
   resources.add(material);
   for(const value of Object.values(material))if(value?.isTexture&&!value.userData?.sportsSurfaceShared&&!value.userData?.nativeSurfaceShared)resources.add(value);
  }
 });
 for(const resource of resources)resource.dispose?.();
}
