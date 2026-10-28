import {drawingCollisionModel} from './placed-item-collision.js';
import {extrudeArtwork} from './drawn-item-3d.js';
import {isApiModelAssetUrl,isModelUploadReference,resolveModelAssetUrl} from './model-asset-url.js';
// Use the caller's Three instance in both the editor and the published world.
export function createImageProp(THREE,url,settings={},options={}){
  const root=new THREE.Group(),collider=drawingCollisionModel(THREE,settings);collider.traverse(mesh=>{if(mesh.isMesh){mesh.visible=false;mesh.name='COLLIDER_DRAWN_ITEM';mesh.userData.collider=true;}});root.add(collider);
  const material=new THREE.MeshStandardMaterial({transparent:true,side:THREE.DoubleSide,roughness:.8});
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.5),material);
  panel.userData.collisionDisabled=true;panel.position.y=.75;root.add(panel);
  root.userData.imageStatus='loading';
  (async()=>{
   const api=globalThis.window?.MUZIKAZ_API;let objectUrl;
   try{
    if(isModelUploadReference(url)&&api?.ready)await api.ready.catch(()=>{});
    if(options.signal?.aborted)throw new DOMException('Image loading was cancelled.','AbortError');
    let source=resolveModelAssetUrl(url);
    if(isApiModelAssetUrl(source)&&api?.fetch){const response=await api.fetch(source,{signal:options.signal,cache:'no-store'});if(!response.ok)throw Error('The image request failed ('+response.status+').');if(/text\/html/i.test(response.headers.get('content-type')||''))throw Error('The image service returned a page instead of artwork.');objectUrl=URL.createObjectURL(await response.blob());source=objectUrl;}
    const texture=await new THREE.TextureLoader().loadAsync(source);
    if(options.signal?.aborted){texture.dispose();throw new DOMException('Image loading was cancelled.','AbortError');}
    if(settings.extruded){try{const shape=extrudeArtwork(THREE,texture.image,settings);root.remove(panel);panel.geometry.dispose();material.dispose();texture.dispose();shape.traverse(mesh=>{if(mesh.isMesh)mesh.userData.collisionDisabled=true;});root.add(shape);root.userData.imageStatus='ready';options.onLoad?.(root);return;}catch(error){console.warn('Drawing extrusion unavailable',error);}}
    texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.needsUpdate=true;root.userData.imageStatus='ready';options.onLoad?.(root);
   }catch(error){root.userData.imageStatus='error';root.userData.imageError=error.message;options.onError?.(error);}
   finally{if(objectUrl)URL.revokeObjectURL(objectUrl);}
  })();
  return root;
}

// The editor clones cached templates. Wait until textures and optional raster
// extrusion have finished so neither a preview nor a placed copy keeps a blank panel.
export function loadImageProp(THREE,url,settings={},timeout=20000){
 return new Promise((resolve,reject)=>{
  const controller=new AbortController();let settled=false,timer,root;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){controller.abort();const resources=new Set();root?.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const material of [].concat(node.material||[])){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose?.();reject(error);}else resolve(value);};
  root=createImageProp(THREE,url,settings,{signal:controller.signal,onLoad:value=>finish(null,value),onError:error=>finish(error)});
  timer=setTimeout(()=>finish(Error('Image loading timed out. Retry the item preview.')),timeout);
 });
}
