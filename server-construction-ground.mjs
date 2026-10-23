import * as THREE from './public/vendor/three/three.module.min.js';
import {createConstructionEarthGeometry} from './public/js/construction-terrain.js';
import {accelerateStaticRaycast} from './server-mesh-raycast.mjs';

const cache=new WeakMap(),patchCache=new Map(),PATCH_CACHE_LIMIT=96,material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
// Transactions clone room state, so keep immutable physical patches in a
// bounded content cache as well as the fast per-object revision cache. The
// complete shape signature keeps different rooms' cuts isolated.
export function constructionGroundWorld(earthworks){
 if(!earthworks?.patches?.length)return null;
 let world=cache.get(earthworks);if(world?.revision===earthworks.revision)return world;
 const patches=new Map(),meshes=[],triangles=[],bounds=new THREE.Box3();
 for(const patch of earthworks.patches){
  const key=JSON.stringify([patch.id,patch.origin,patch.cellSize,patch.columns,patch.rows,patch.baseY,patch.heights]),cached=patchCache.get(key);
  if(cached){patchCache.delete(key);patchCache.set(key,cached);patches.set(patch.id,cached);meshes.push(cached.mesh);triangles.push(...cached.triangles);bounds.expandByObject(cached.mesh);continue;}
  const geometry=createConstructionEarthGeometry(THREE,patch),mesh=new THREE.Mesh(geometry,material),walls=[];mesh.name='CONSTRUCTION_EARTH_'+patch.id;mesh.userData.constructionEarth=true;mesh.updateMatrixWorld(true);accelerateStaticRaycast(mesh);meshes.push(mesh);bounds.expandByObject(mesh);
  const vertices=geometry.attributes.position;
  for(let i=0;i<vertices.count;i+=3){
   const a=new THREE.Vector3().fromBufferAttribute(vertices,i),b=new THREE.Vector3().fromBufferAttribute(vertices,i+1),c=new THREE.Vector3().fromBufferAttribute(vertices,i+2),normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a)).normalize();
   if(Math.abs(normal.y)>=.55)continue;
   walls.push({a,b,c,mesh,minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minY:Math.min(a.y,b.y,c.y),maxY:Math.max(a.y,b.y,c.y),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)});
  }
  const record={key,mesh,triangles:walls};patches.set(patch.id,record);patchCache.set(key,record);triangles.push(...walls);
  // Server-only geometry owns no GPU resources. Evicted immutable records are
  // reclaimed once no active room world references them.
  while(patchCache.size>PATCH_CACHE_LIMIT)patchCache.delete(patchCache.keys().next().value);
 }
 world={revision:earthworks.revision,patches,meshes,triangles,bounds,nearbyMeshes(minX,maxX,minZ,maxZ){return meshes.filter(mesh=>{const box=mesh.geometry.boundingBox;return box.max.x>=minX&&box.min.x<=maxX&&box.max.z>=minZ&&box.min.z<=maxZ;});}};cache.set(earthworks,world);return world;
}
