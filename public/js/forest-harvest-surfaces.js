import * as THREE from '../vendor/three/three.module.min.js';

export const FORESTRY_SURFACE_VERSION='forestry-realism-v2';
export const FORESTRY_SURFACE_KINDS=Object.freeze(['bark','wood','endgrain','soil','gravel','metal','rubber','foliage','pineFoliage']);
const cache=new Map(),foliage=kind=>kind==='foliage'||kind==='pineFoliage';
const small=()=>typeof matchMedia==='function'&&(matchMedia('(pointer: coarse)').matches||Number(globalThis.navigator?.deviceMemory||8)<=4);
const mark=(texture,kind,channel)=>{texture.name='FORESTRY_'+kind+'_'+channel;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.colorSpace=channel==='albedo'?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.userData={nativeSurfaceShared:true,forestrySurfaceShared:true,forestryKind:kind,forestryChannel:channel,forestryVersion:FORESTRY_SURFACE_VERSION};return texture;};
function texture(kind,channel,compact){
 const leaf=foliage(kind),resolution=channel==='albedo'?(compact?512:leaf?1024:2048):channel==='normal'?1024:512;
 // Geometry/collision compilation on the server never downloads browser textures.
 if(typeof document==='undefined'){
  const pixels=new Uint8Array(channel==='normal'?[128,128,255,255]:[255,255,255,255]),fallback=new THREE.DataTexture(pixels,1,1,THREE.RGBAFormat);fallback.userData.forestryResolution=resolution;mark(fallback,kind,channel);fallback.userData.forestryResolution=resolution;fallback.needsUpdate=true;return fallback;
 }
 const url=new URL('../images/forest-harvest/surfaces/'+kind+'-'+channel+(compact&&channel==='albedo'?'-small':'')+'.webp',import.meta.url).href;
 const result=mark(new THREE.TextureLoader().load(url),kind,channel);result.userData.forestryResolution=resolution;return result;
}
export function forestrySurfaceMaps(kind){
 if(!FORESTRY_SURFACE_KINDS.includes(kind))throw new RangeError('Unknown forestry surface: '+kind);
 const compact=small(),key=kind+':'+compact;
 if(!cache.has(key))cache.set(key,Object.freeze({map:texture(kind,'albedo',compact),...(foliage(kind)?{}:{normalMap:texture(kind,'normal',compact),roughnessMap:texture(kind,'roughness',compact)})}));
 return cache.get(key);
}
export function forestrySurface(kind,color=0xffffff,options={}){
 const leaf=foliage(kind),metal=kind==='metal',material=new THREE.MeshStandardMaterial({color,roughness:metal?.62:leaf?.92:.9,metalness:metal?.72:0,...forestrySurfaceMaps(kind),...(leaf?{side:THREE.DoubleSide,alphaTest:.3}:{}),...options});
 material.name='FORESTRY_PBR_'+kind;material.userData={nativeMaterialDesign:FORESTRY_SURFACE_VERSION,forestrySurface:kind,forestryVersion:FORESTRY_SURFACE_VERSION};return material;
}
